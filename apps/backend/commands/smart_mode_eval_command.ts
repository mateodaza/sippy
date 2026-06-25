/**
 * SMART MODE Eval Command
 *
 * Runs the SMART MODE classifier against the golden dataset and prints a
 * comparison table. Real Groq calls — burns ~$0.001/case (29 cases =
 * ~$0.03 per run, trivial).
 *
 * Usage:
 *   node ace smart:eval                           # run primary preset
 *   node ace smart:eval --preset=fallback         # benchmark fallback
 *   node ace smart:eval --preset=scout            # benchmark Llama 4 Scout
 *   node ace smart:eval --preset=qwen             # benchmark Qwen 3 32B
 *   node ace smart:eval --case-ids=send-01,send-02
 *   node ace smart:eval --update-baseline         # seed/refresh baseline
 *
 * The baseline (`.smart-mode-baseline.json`, gitignored) is per-engineer.
 * Each run prints pass-rate delta vs baseline so regressions are visible.
 *
 * Direct import — no HTTP round-trip. Same `runEval` + `classifyWithConfig`
 * the HTTP endpoint uses, so they can't drift.
 */

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyWithConfig, MODEL_PRESETS } from '#services/smart_mode/classifier'
import type { ModelPresetName } from '#services/smart_mode/classifier'
import { runEval, UnknownCaseIdsError } from '#services/smart_mode/eval/runner'
import type { EvalSummary } from '#services/smart_mode/eval/runner'
import { GOLDEN_DATASET } from '#services/smart_mode/eval/golden'

const BASELINE_PATH = resolve(process.cwd(), '.smart-mode-baseline.json')

interface Baseline {
  preset: ModelPresetName
  model: string
  capturedAt: string
  summary: EvalSummary
}

export default class SmartModeEvalCommand extends BaseCommand {
  static commandName = 'smart:eval'
  static description = 'Run the SMART MODE classifier eval against the golden dataset'
  static options: CommandOptions = { startApp: true }

  @flags.string({
    description: 'Model preset to test (primary|fallback|scout|qwen)',
    default: 'primary',
  })
  declare preset: string

  @flags.string({
    description: 'Comma-separated case IDs to run (default: all)',
  })
  declare caseIds: string | undefined

  @flags.boolean({
    description: 'Write the current run as the new baseline',
    default: false,
  })
  declare updateBaseline: boolean

  async run() {
    const presetName = this.preset as ModelPresetName
    const config = MODEL_PRESETS[presetName]
    if (!config) {
      this.logger.error(
        `Unknown preset: ${this.preset}. Valid: ${Object.keys(MODEL_PRESETS).join(', ')}`
      )
      return
    }

    const caseIds = this.caseIds
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const caseCount = caseIds?.length ?? GOLDEN_DATASET.length

    this.logger.info(`Running ${caseCount} cases against ${config.model} (preset=${presetName})`)
    this.logger.info(`Estimated cost: ~$${(caseCount * 0.001).toFixed(3)}`)

    const t0 = Date.now()
    let report
    try {
      report = await runEval((args) => classifyWithConfig(args, config), GOLDEN_DATASET, {
        caseIds,
      })
    } catch (err) {
      // Loud failure on typo'd IDs — silent zero-case runs were the issue
      // (`--update-baseline` would snapshot nothing and mask future regressions).
      if (err instanceof UnknownCaseIdsError) {
        this.logger.error(`Unknown case IDs: ${err.unknownIds.join(', ')}`)
        this.logger.info(`Valid IDs: ${GOLDEN_DATASET.map((c) => c.id).join(', ')}`)
        this.exitCode = 1
        return
      }
      throw err
    }
    const totalMs = Date.now() - t0

    // ── Print summary ──────────────────────────────────────────────────
    this.logger.info('')
    this.logger.info(
      `── Results (${totalMs}ms total, avg ${Math.round(report.summary.avgLlmMs)}ms/case) ──`
    )
    this.logger.info(
      `Pass rate: ${report.summary.passed}/${report.summary.total} ` +
        `(${(report.summary.passRate * 100).toFixed(1)}%)`
    )

    this.logger.info('')
    this.logger.info('By category:')
    for (const [cat, stats] of Object.entries(report.summary.byCategory)) {
      this.logger.info(
        `  ${cat.padEnd(15)} ${stats.passed}/${stats.total}` +
          ` (${(stats.passRate * 100).toFixed(1)}%)`
      )
    }

    this.logger.info('')
    this.logger.info('By failure mode:')
    for (const [mode, count] of Object.entries(report.summary.byFailure)) {
      if (count > 0) this.logger.info(`  ${mode.padEnd(20)} ${count}`)
    }

    // ── Per-case failures (helpful for prompt tuning) ─────────────────
    const failed = report.cases.filter((c) => !c.pass)
    if (failed.length > 0) {
      this.logger.info('')
      this.logger.info(`── Failed cases (${failed.length}) ──`)
      for (const f of failed) {
        this.logger.info(
          `  ${f.id.padEnd(18)} ${f.failures.join(', ')}` +
            (f.actual
              ? ` | got category=${f.actual.category} intent=${f.actual.intent} conf=${f.actual.confidence.toFixed(2)}`
              : '')
        )
        // Surface the raw classifier reasoning — for `gibberish/null/0.00`
        // sentinels this exposes the underlying tryOnce failure mode
        // (empty_response / json_parse / schema / timeout / network).
        if (f.actual?.reasoning) {
          this.logger.info(`     ↳ reasoning: ${f.actual.reasoning.slice(0, 200)}`)
        }
      }
    }

    // ── Baseline comparison + optional update ─────────────────────────
    await this.compareBaseline(presetName, config.model, report.summary)
  }

  private async compareBaseline(
    presetName: ModelPresetName,
    model: string,
    summary: EvalSummary
  ): Promise<void> {
    if (this.updateBaseline) {
      const baseline: Baseline = {
        preset: presetName,
        model,
        capturedAt: new Date().toISOString(),
        summary,
      }
      await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2))
      this.logger.success(`Baseline updated → ${BASELINE_PATH}`)
      return
    }

    if (!existsSync(BASELINE_PATH)) {
      this.logger.info('')
      this.logger.info(`No baseline yet. Run with --update-baseline to seed: ${BASELINE_PATH}`)
      return
    }

    let baseline: Baseline
    try {
      baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf-8')) as Baseline
    } catch (err) {
      // ace Logger doesn't expose .warn; info+ERROR-prefix is the existing pattern.
      this.logger.info(`WARN: could not parse baseline at ${BASELINE_PATH}: ${err}`)
      return
    }

    if (baseline.preset !== presetName) {
      this.logger.info('')
      this.logger.info(
        `Baseline is preset=${baseline.preset} (current: ${presetName}) — skipping diff.`
      )
      return
    }

    const delta = summary.passRate - baseline.summary.passRate
    const sign = delta >= 0 ? '+' : ''
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'

    this.logger.info('')
    this.logger.info(`── vs baseline (${baseline.capturedAt}) ──`)
    this.logger.info(
      `Pass rate: ${arrow} ${sign}${(delta * 100).toFixed(1)}pp ` +
        `(${(baseline.summary.passRate * 100).toFixed(1)}% → ${(summary.passRate * 100).toFixed(1)}%)`
    )

    // Per-category deltas — surface where the regression lives
    this.logger.info('')
    this.logger.info('Per-category delta:')
    for (const cat of Object.keys(summary.byCategory)) {
      const cur = summary.byCategory[cat]
      const base = baseline.summary.byCategory[cat]
      if (!base) {
        this.logger.info(`  ${cat.padEnd(15)} (new)`)
        continue
      }
      const d = cur.passRate - base.passRate
      const s = d >= 0 ? '+' : ''
      const a = d > 0 ? '↑' : d < 0 ? '↓' : '→'
      this.logger.info(
        `  ${cat.padEnd(15)} ${a} ${s}${(d * 100).toFixed(1)}pp ` +
          `(${(base.passRate * 100).toFixed(1)}% → ${(cur.passRate * 100).toFixed(1)}%)`
      )
    }

    // Regression gate — hive-mind's 5pp tolerance
    if (delta < -0.05) {
      this.logger.error(`REGRESSION: pass rate dropped > 5pp vs baseline`)
      this.exitCode = 1
    }
  }
}
