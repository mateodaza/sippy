/**
 * SMART MODE — classifier service
 *
 * Pure intent triage. Returns a `SmartClassification`. The dispatcher owns
 * validate / sanitize / dispatch — keep this file free of those concerns
 * so the contract stays "give me text, I give you typed JSON."
 *
 * Behavior:
 *   1. Try PRIMARY model. JSON mode, `temperature: 0`, AbortSignal 10s.
 *   2. On any failure (network/parse/Zod-schema), retry once on FALLBACK.
 *   3. On second failure, return `classifierErrorFallback(reason)` — typed
 *      gibberish so the dispatcher never branches on success vs error.
 *
 * Model params live in `ModelConfig` objects so a future fallback swap to
 * Scout/Qwen doesn't inherit `reasoning_effort` (only GPT-OSS supports it).
 */

import logger from '@adonisjs/core/services/logger'
import type { ContextMessage } from '#services/db'
import { getGroqClient } from '#services/llm.service'
import { SmartClassification, SMART_INTENT_SLUGS, classifierErrorFallback } from './types.js'

// LLMs occasionally collapse the category/intent distinction and put an
// intent name (e.g. "social", "greeting") directly into `category`. This
// is structurally invalid (only the 4 categories are allowed) but is the
// model trying to do the right thing — it correctly identified the intent.
// Rather than fall back to the gibberish sentinel and lose the signal,
// rewrite this shape into the equivalent `{category: 'action', intent: X}`
// before Zod sees it. Idempotent on already-valid shapes.
//
// Also coerces numeric slot values that arrive as strings ("5" → 5).
// JSON-mode models sometimes typecast numbers to strings; Zod rejects
// them as Expected number / received string and we lose the slot. Coerce
// before Zod sees the payload — safe because the schema's number
// validators (positive, etc.) still run on the coerced value.
function normalizeClassifierOutput(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed
  const obj = { ...(parsed as Record<string, unknown>) }

  // Category/intent confusion fix
  const cat = obj.category
  if (typeof cat === 'string') {
    const isValidCat =
      cat === 'action' || cat === 'ambiguous' || cat === 'out_of_scope' || cat === 'gibberish'
    if (!isValidCat && (SMART_INTENT_SLUGS as readonly string[]).includes(cat)) {
      obj.category = 'action'
      obj.intent = obj.intent ?? cat
    }
  }

  // Slot type coercion (string number → number) for amount/localAmount.
  // Only coerces digit-only strings; anything weirder falls through to
  // schema validation as-is.
  if (obj.slots && typeof obj.slots === 'object') {
    const slots = { ...(obj.slots as Record<string, unknown>) }
    for (const k of ['amount', 'localAmount']) {
      const v = slots[k]
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
        const n = Number(v)
        if (!Number.isNaN(n)) slots[k] = n
      }
    }
    obj.slots = slots
  }

  return obj
}
import type { SmartClassification as SmartClassificationType } from './types.js'
import { buildContextMessages, buildSystemPrompt, buildUserMessage } from './prompt.js'

// Local message-shape type — the Groq SDK accepts any object matching the
// OpenAI-style chat-completions API, so we use a structural type rather
// than chasing the SDK's deeply nested namespace exports across versions.
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionParams {
  model: string
  messages: ChatMessage[]
  response_format?: { type: 'json_object' }
  temperature?: number
  reasoning_effort?: 'low' | 'medium' | 'high'
}

/** Subset of Groq SDK RequestOptions we use. The SDK accepts `signal` for
 *  real upstream abort — without it, awaiting Promise.race only stops our
 *  local await while the upstream request keeps running and burning tokens. */
interface ChatCompletionRequestOptions {
  signal?: AbortSignal
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>
}

// ── Model configuration ──────────────────────────────────────────────────
// Each config carries only the params VALID for that specific model.
// A future swap to Scout/Qwen just removes `reasoning_effort` from the
// config — no `reasoning_effort: undefined` getting sent and rejected.
export interface ModelConfig {
  model: string
  /** GPT-OSS-only param. Omit for models that reject it. */
  reasoning_effort?: 'low' | 'medium' | 'high'
}

export const PRIMARY_CONFIG: ModelConfig = {
  model: 'openai/gpt-oss-120b',
  reasoning_effort: 'low',
}

export const FALLBACK_CONFIG: ModelConfig = {
  model: 'openai/gpt-oss-20b',
  reasoning_effort: 'low',
}

/**
 * Eval-only presets. Used by `classifyWithConfig` to benchmark candidates
 * against the golden set deterministically (no fallback chain mixing
 * results — one model, one prompt, one outcome per case).
 *
 * Per-model rule: only set params the model actually accepts. Per Groq's
 * model capability table:
 *   - GPT OSS 120B / 20B: REASONING + FUNCTION CALLING + MULTILINGUAL
 *     → set reasoning_effort: 'low'
 *   - Qwen 3 32B: REASONING + FUNCTION CALLING (Spanish coverage thinner)
 *     → set reasoning_effort: 'low'
 *   - Llama 4 Scout: FUNCTION CALLING + MULTILINGUAL only (not in the
 *     reasoning category) → OMIT reasoning_effort; sending it as 'low'
 *     would either be ignored silently or 400 depending on the API path.
 */
export const MODEL_PRESETS: Record<string, ModelConfig> = {
  primary: PRIMARY_CONFIG,
  fallback: FALLBACK_CONFIG,
  scout: {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    // No reasoning_effort — Scout isn't in Groq's reasoning category.
  },
  qwen: {
    model: 'qwen/qwen3-32b',
    // Groq updated their Qwen API: `reasoning_effort` now only accepts
    // `none` | `default` (returns 400 on `low`). Use `default` to keep
    // reasoning on without picking a level that may not exist.
    reasoning_effort: undefined,
  },
}

export type ModelPresetName = keyof typeof MODEL_PRESETS

const TIMEOUT_MS = 10_000

// ── Injectable Groq client (real default, mock-friendly for tests) ───────

export interface ClassifierGroqClient {
  chat: {
    completions: {
      /** Mirrors the Groq SDK signature: `create(body, options?)`. The
       *  options bag is where we pass the AbortSignal so the real upstream
       *  fetch is cancelled, not just our local await. */
      create: (
        args: ChatCompletionParams,
        options?: ChatCompletionRequestOptions
      ) => Promise<ChatCompletionResponse>
    }
  }
}

/** Default factory — uses the shared Groq client from llm.service. */
function defaultClientFactory(): ClassifierGroqClient | null {
  return getGroqClient() as unknown as ClassifierGroqClient | null
}

// ── Public API ───────────────────────────────────────────────────────────

export interface ClassifyArgs {
  /** User's message (already stripped of any bracket token). */
  text: string
  /** Last N turns of conversation, oldest first. */
  context: ContextMessage[]
  /** User's persisted preferred language, if known. */
  preferredLang?: 'en' | 'es' | 'pt'
  /** Injection seam for tests. Defaults to the shared Groq client. */
  clientFactory?: () => ClassifierGroqClient | null
}

/**
 * Classify an inbound message. Never throws — always returns a valid
 * `SmartClassification` (real or fallback). Logs the outcome of each
 * model attempt so primary/fallback behavior is observable.
 */
export async function classifyMessage(args: ClassifyArgs): Promise<SmartClassificationType> {
  const factory = args.clientFactory ?? defaultClientFactory
  const client = factory()

  if (!client) {
    logger.warn('smart_mode: no Groq client available — returning typed fallback')
    return classifierErrorFallback('no_client')
  }

  // Try primary first.
  const primary = await tryOnce(client, PRIMARY_CONFIG, args)
  if (primary.ok) {
    logger.info(
      {
        model: PRIMARY_CONFIG.model,
        category: primary.value.category,
        intent: primary.value.intent,
      },
      'smart_mode: primary classification succeeded'
    )
    return primary.value
  }

  logger.warn(
    { model: PRIMARY_CONFIG.model, reason: primary.reason },
    'smart_mode: primary failed — trying fallback'
  )

  // Retry once on fallback.
  const fallback = await tryOnce(client, FALLBACK_CONFIG, args)
  if (fallback.ok) {
    logger.info(
      {
        model: FALLBACK_CONFIG.model,
        category: fallback.value.category,
        intent: fallback.value.intent,
      },
      'smart_mode: fallback classification succeeded'
    )
    return fallback.value
  }

  logger.error(
    {
      primaryModel: PRIMARY_CONFIG.model,
      primaryReason: primary.reason,
      fallbackModel: FALLBACK_CONFIG.model,
      fallbackReason: fallback.reason,
    },
    'smart_mode: both primary and fallback failed — returning typed fallback'
  )
  return classifierErrorFallback(`primary=${primary.reason} fallback=${fallback.reason}`)
}

// ── Eval API: single-model attempt, no fallback chain ────────────────────
/**
 * Run ONE classifier call against a specific `ModelConfig`. No primary→
 * fallback chain — that's intentional. Eval needs to attribute every
 * outcome to the model under test, not to "well, primary failed but
 * fallback saved it." Production uses `classifyMessage`; eval uses this.
 *
 * On any failure (network, parse, schema), returns `classifierErrorFallback`
 * so callers (including the eval runner) never need to branch on success
 * vs error.
 */
export async function classifyWithConfig(
  args: ClassifyArgs,
  config: ModelConfig
): Promise<SmartClassificationType> {
  const factory = args.clientFactory ?? defaultClientFactory
  const client = factory()
  if (!client) return classifierErrorFallback('no_client')

  const attempt = await tryOnce(client, config, args)
  if (attempt.ok) return attempt.value
  return classifierErrorFallback(`${config.model}: ${attempt.reason}`)
}

// ── Internal: single-attempt call + parse + validate ─────────────────────

type AttemptOutcome = { ok: true; value: SmartClassificationType } | { ok: false; reason: string }

async function tryOnce(
  client: ClassifierGroqClient,
  config: ModelConfig,
  args: ClassifyArgs
): Promise<AttemptOutcome> {
  // Build messages once per attempt (system prompt is pure, so this is cheap
  // and keeps each retry independent).
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...buildContextMessages(args.context),
    { role: 'user', content: buildUserMessage(args.text, args.preferredLang) },
  ]

  const createParams: ChatCompletionParams = {
    model: config.model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
  }
  if (config.reasoning_effort) {
    createParams.reasoning_effort = config.reasoning_effort
  }

  // Real upstream abort — Groq SDK accepts `signal` on the second arg.
  // Without it, a hung primary request keeps burning tokens while we
  // race off to the fallback. AbortSignal.timeout() returns a signal
  // pre-wired to fire after TIMEOUT_MS, so no manual timer cleanup.
  const abortSignal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    const completion = await client.chat.completions.create(createParams, {
      signal: abortSignal,
    })

    const raw = completion.choices?.[0]?.message?.content
    if (!raw) return { ok: false, reason: 'empty_response' }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return {
        ok: false,
        reason: `json_parse: ${err instanceof Error ? err.message : 'unknown'}`,
      }
    }

    const normalized = normalizeClassifierOutput(parsed)
    const validated = SmartClassification.safeParse(normalized)
    if (!validated.success) {
      return {
        ok: false,
        reason: `schema: ${validated.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}=${i.message}`)
          .join('; ')}`,
      }
    }

    return { ok: true, value: validated.data }
  } catch (err) {
    // The SDK throws an AbortError when our signal fires past TIMEOUT_MS.
    // Normalize to a concise reason string for logs.
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      return { ok: false, reason: 'timeout' }
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'unknown_error',
    }
  }
}
