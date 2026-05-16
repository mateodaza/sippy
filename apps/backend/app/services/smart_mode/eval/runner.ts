/**
 * SMART MODE — eval runner
 *
 * Pure function: takes a classifier impl + a dataset, returns per-case
 * results + summary metrics. No HTTP, no DB, no globals — so it's trivial
 * to test and to A/B against different classifier configs.
 *
 * Pass criteria per case:
 *   1. `category` matches `expectedCategory`
 *   2. `intent` matches `expectedIntent`
 *      (deliberately strict — wrong intent on right category is still a fail)
 *   3. `confidence >= minConfidence`
 *   4. Expected slots are present with the expected values (subset check —
 *      classifier may return extras; we only assert what the case calls for)
 *
 * Each failed sub-check is recorded separately so failure summaries point
 * at the actual gap (wrong category vs right category-wrong intent vs
 * correct-but-low-confidence vs missing slot).
 */

import type { ClassifyArgs } from '../classifier.js'
import type { SmartClassification } from '../types.js'
import type { GoldenCase } from './golden.js'
import { GOLDEN_DATASET } from './golden.js'

export type FailReason =
  | 'wrong_category'
  | 'wrong_intent'
  | 'low_confidence'
  | 'missing_slot'
  | 'wrong_slot_value'
  | 'classifier_threw'

export interface CaseResult {
  id: string
  pass: boolean
  failures: FailReason[]
  /** Full classifier output (for debugging). */
  actual?: SmartClassification
  /** Latency of the classifier call in ms. */
  llmMs: number
}

export interface EvalSummary {
  total: number
  passed: number
  passRate: number
  /** Per-category pass rate, useful when one category drags the overall down. */
  byCategory: Record<string, { total: number; passed: number; passRate: number }>
  /** Per-failure-mode counts. */
  byFailure: Record<FailReason, number>
  /** Avg classifier latency in ms. */
  avgLlmMs: number
}

export interface EvalReport {
  cases: CaseResult[]
  summary: EvalSummary
}

/** Classifier function signature — matches `classifyMessage`. */
export type ClassifierFn = (args: ClassifyArgs) => Promise<SmartClassification>

export interface RunEvalOptions {
  /** Subset of case IDs to run. Empty = all. */
  caseIds?: string[]
  /** Optional preferredLang to pass through to classifier (mimics
   *  user.preferred_language). Defaults to the case's own `lang` so each
   *  case is tested in the language it was authored in. */
  preferredLangOverride?: 'en' | 'es' | 'pt'
}

/**
 * Thrown when `runEval` is called with `caseIds` that don't exist in the
 * dataset. Silently filtering would let a typo (`--case-ids=sned-01`)
 * produce a zero-case run + a junk baseline if `--update-baseline` was
 * set. Loud failure forces the caller to fix the typo.
 */
export class UnknownCaseIdsError extends Error {
  readonly unknownIds: string[]
  constructor(unknownIds: string[]) {
    super(`Unknown caseIds: ${unknownIds.join(', ')}`)
    this.name = 'UnknownCaseIdsError'
    this.unknownIds = unknownIds
  }
}

/**
 * Run the eval. Pure with respect to (classifier, dataset, options) — no
 * implicit dependencies. Latency is wall-clock per classifier call.
 *
 * Throws `UnknownCaseIdsError` if any requested ID isn't in the dataset.
 * Callers should surface this as a 422 (HTTP) or non-zero exit (CLI).
 */
export async function runEval(
  classifier: ClassifierFn,
  dataset: GoldenCase[] = GOLDEN_DATASET,
  options: RunEvalOptions = {}
): Promise<EvalReport> {
  let cases: GoldenCase[]
  if (options.caseIds?.length) {
    const datasetIds = new Set(dataset.map((c) => c.id))
    const unknown = options.caseIds.filter((id) => !datasetIds.has(id))
    if (unknown.length) throw new UnknownCaseIdsError(unknown)
    const requested = new Set(options.caseIds)
    cases = dataset.filter((c) => requested.has(c.id))
  } else {
    cases = dataset
  }

  const results: CaseResult[] = []
  for (const tc of cases) {
    results.push(await runOneCase(classifier, tc, options.preferredLangOverride))
  }

  return {
    cases: results,
    summary: summarize(results, cases),
  }
}

async function runOneCase(
  classifier: ClassifierFn,
  tc: GoldenCase,
  preferredLangOverride?: 'en' | 'es' | 'pt'
): Promise<CaseResult> {
  const t0 = Date.now()
  let actual: SmartClassification | undefined
  try {
    actual = await classifier({
      text: tc.text,
      context: [],
      preferredLang: preferredLangOverride ?? tc.lang,
    })
  } catch (err) {
    // Classifier is supposed to never throw — if it does, that's a real bug
    // worth surfacing as a distinct failure mode. We don't let it crash the
    // whole eval run though.
    return {
      id: tc.id,
      pass: false,
      failures: ['classifier_threw'],
      llmMs: Date.now() - t0,
    }
  }

  const failures: FailReason[] = []

  if (actual.category !== tc.expectedCategory) {
    failures.push('wrong_category')
  }
  if (actual.intent !== tc.expectedIntent) {
    failures.push('wrong_intent')
  }
  if (actual.confidence < tc.minConfidence) {
    failures.push('low_confidence')
  }

  // Slot checks — subset semantics. Only assert what the case declares.
  // Each slot is checked independently; missing vs wrong-value are
  // distinct failure modes so the summary points at the real gap.
  if (tc.expectedSlots) {
    for (const key of Object.keys(tc.expectedSlots) as Array<
      keyof NonNullable<GoldenCase['expectedSlots']>
    >) {
      const expected = tc.expectedSlots[key]
      if (expected === undefined) continue
      const got = actual.slots?.[key]
      if (got === undefined) {
        failures.push('missing_slot')
      } else if (got !== expected) {
        failures.push('wrong_slot_value')
      }
    }
  }

  return {
    id: tc.id,
    pass: failures.length === 0,
    failures,
    actual,
    llmMs: Date.now() - t0,
  }
}

function summarize(results: CaseResult[], cases: GoldenCase[]): EvalSummary {
  const passed = results.filter((r) => r.pass).length

  // Group by expected category so we can see if one category drags the rest down
  const byCategory: EvalSummary['byCategory'] = {}
  for (const tc of cases) {
    const r = results.find((x) => x.id === tc.id)!
    const cat = tc.expectedCategory
    if (!byCategory[cat]) byCategory[cat] = { total: 0, passed: 0, passRate: 0 }
    byCategory[cat].total++
    if (r.pass) byCategory[cat].passed++
  }
  for (const c of Object.values(byCategory)) {
    c.passRate = c.total > 0 ? c.passed / c.total : 0
  }

  // Failure-mode counts
  const byFailure: EvalSummary['byFailure'] = {
    wrong_category: 0,
    wrong_intent: 0,
    low_confidence: 0,
    missing_slot: 0,
    wrong_slot_value: 0,
    classifier_threw: 0,
  }
  for (const r of results) {
    for (const f of r.failures) {
      byFailure[f]++
    }
  }

  const avgLlmMs =
    results.length > 0 ? results.reduce((sum, r) => sum + r.llmMs, 0) / results.length : 0

  return {
    total: results.length,
    passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    byCategory,
    byFailure,
    avgLlmMs,
  }
}
