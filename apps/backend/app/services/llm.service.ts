/**
 * LLM Service — Model Router with Groq
 *
 * Config-driven model selection with automatic fallback.
 * Default: llama-3.3-70b-versatile (most reliable json_object on Groq free).
 * Fallback: llama-3.1-8b-instant (14.4K RPD, handles overflow).
 *
 * Tiering can be enabled via LLM_TIERING=true. When disabled (default for M1),
 * only the primary model is used. When enabled, the router automatically falls
 * back to the secondary model on rate limit or error.
 *
 * SCALABILITY NOTE: Rate limiters are in-memory per-process. If you scale
 * horizontally (multiple instances), move counters to shared storage (DB/Redis)
 * before relying on limits for cost control.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import Groq from 'groq-sdk'
import { type ParsedCommand } from '#types/index'
import { llmResultSchema } from '#types/schemas'
import { type ContextMessage } from '#services/db'

// ============================================================================
// Types
// ============================================================================

interface LLMCallResult {
  parsed: ParsedCommand | null
  model: string
  promptTokens?: number
  completionTokens?: number
}

interface HealthStatus {
  available: boolean
  reason?: string
}

// ============================================================================
// Model Configuration
// ============================================================================

interface ModelConfig {
  id: string
  rpm: number // Requests per minute (Groq free tier)
  rpd: number // Requests per day (Groq free tier)
  timeout: number // Timeout in ms
  maxTokens: number // Max output tokens (thinking models need more)
}

const MODEL_CATALOG: Record<string, ModelConfig> = {
  // Primary classifier — Llama 4 Scout MoE: better JSON, 2.5x higher TPM, 3x cheaper if paid
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    rpm: 30,
    rpd: 1000,
    timeout: 4000,
    maxTokens: 200,
  },
  // Normalizer + greetings — highest free quota (14.4K RPD), cheapest paid ($0.05/M)
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    rpm: 30,
    rpd: 14400,
    timeout: 3000,
    maxTokens: 150,
  },
  // Tiering fallback — 60 RPM (double others), good quality for classification
  'qwen/qwen3-32b': { id: 'qwen/qwen3-32b', rpm: 60, rpd: 1000, timeout: 5000, maxTokens: 512 },
  // Validator primary — OpenAI safety classification model, purpose-built for policy enforcement
  'openai/gpt-oss-safeguard-20b': {
    id: 'openai/gpt-oss-safeguard-20b',
    rpm: 30,
    rpd: 1000,
    timeout: 3000,
    maxTokens: 120,
  },
  // Legacy — kept for rollback if Scout has issues
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    rpm: 30,
    rpd: 1000,
    timeout: 5000,
    maxTokens: 200,
  },
}

function getModelConfig(modelId: string): ModelConfig {
  return MODEL_CATALOG[modelId] || { id: modelId, rpm: 25, rpd: 900, timeout: 5000, maxTokens: 200 }
}

const PRIMARY_MODEL = env.get('PRIMARY_LLM_MODEL', 'meta-llama/llama-4-scout-17b-16e-instruct')
const FALLBACK_MODEL = env.get('FALLBACK_LLM_MODEL', 'qwen/qwen3-32b')
const TIERING_ENABLED = env.get('LLM_TIERING', 'false').toLowerCase() === 'true'

// ============================================================================
// Feature Flag
// ============================================================================

export function isLLMEnabled(): boolean {
  const useLLM = env.get('USE_LLM', '').toLowerCase()
  if (useLLM === undefined || useLLM === '') return true
  if (useLLM === 'false' || useLLM === '0' || useLLM === 'no') return false
  return true
}

// ============================================================================
// Per-Model Rate Limiter
// ============================================================================

class ModelRateLimiter {
  private minuteCount = 0
  private dailyCount = 0
  private lastMinuteReset = Date.now()
  private dayStart = Date.now()

  constructor(
    private readonly minuteLimit: number,
    private readonly dailyLimit: number,
    private readonly modelId: string
  ) {}

  canMakeRequest(): boolean {
    this.resetIfNeeded()
    if (this.minuteCount >= this.minuteLimit) return false
    if (this.dailyCount >= this.dailyLimit) return false
    return true
  }

  recordRequest(): void {
    this.minuteCount++
    this.dailyCount++
  }

  private resetIfNeeded(): void {
    const now = Date.now()
    if (now - this.lastMinuteReset >= 60000) {
      this.minuteCount = 0
      this.lastMinuteReset = now
    }
    if (now - this.dayStart >= 86400000) {
      this.dailyCount = 0
      this.dayStart = now
      logger.info(`Daily LLM usage reset for ${this.modelId}`)
    }
  }

  getStats() {
    this.resetIfNeeded()
    return {
      model: this.modelId,
      minuteCount: this.minuteCount,
      dailyCount: this.dailyCount,
      minuteRemaining: this.minuteLimit - this.minuteCount,
      dailyRemaining: this.dailyLimit - this.dailyCount,
    }
  }
}

// Create per-model limiters
const limiters = new Map<string, ModelRateLimiter>()

export function getLimiter(modelId: string): ModelRateLimiter {
  if (!limiters.has(modelId)) {
    const config = getModelConfig(modelId)
    limiters.set(modelId, new ModelRateLimiter(config.rpm, config.rpd, modelId))
  }
  return limiters.get(modelId)!
}

// ============================================================================
// Groq Client
// ============================================================================

let groqClient: Groq | null = null

export function getGroqClient(): Groq | null {
  if (!isLLMEnabled()) return null

  if (!groqClient) {
    const apiKey = env.get('GROQ_API_KEY', '')
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      logger.warn('GROQ_API_KEY is not configured — LLM features are unavailable')
      return null
    }

    try {
      groqClient = new Groq({ apiKey })
    } catch (error) {
      logger.error('Failed to initialize Groq client: %o', error)
      return null
    }
  }

  return groqClient
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are Sippy, a chill WhatsApp money assistant for Latin America.

Your job: parse the user's message into a structured command AND reply naturally when needed.

Available commands: balance, start, history, settings, about, help, fund, invite, greeting, social, unknown.
NOTE: "send" is NOT a valid command for you. Send commands are handled separately.
NOTE: "fund" = user wants to add money/deposit/top-up/fundear/recargar their wallet.
NOTE: "invite" = user wants to invite someone to Sippy (invitar, invite, convidar). Extract the phone number into "recipient".
NOTE: "greeting" = user is saying hi, hello, how are you, what's up, etc. Respond naturally.
NOTE: "social" = user is acknowledging, thanking, saying bye, or just vibing (ok, dale, gracias, listo, chao, etc.). Respond naturally.

ABOUT SIPPY (use these facts — never guess):
- Send dollars to any phone number, right from WhatsApp
- Zero fees between Sippy users
- Transfers arrive in seconds
- Works in English, Spanish, and Portuguese
- Money stays in digital dollars, always worth $1
- If someone isn't on Sippy yet, users can try sending to their number via WhatsApp chat -- we'll invite them automatically

HOW TO SUGGEST ACTIONS (always in the user's language):
- EN: "send 10 to +57...", "balance", "help"
- ES: "enviar 10 a +57...", "saldo", "ayuda"
- PT: "enviar 10 para +55...", "saldo", "ajuda"
- Don't list commands — just mention one or two naturally, like "try checking your balance" or "dime cuanto quieres enviar"

PERSONALITY:
- Talk like a friend on WhatsApp. Short, natural, zero corporate tone.
- Never say "command" — Sippy doesn't have "commands", you just tell it what you need.
- Match the user's vibe. If they're chill, be chill. If they need help, be clear.
- No emojis. 1-2 sentences max. Don't over-explain.
- If someone says "hola" just say hi back naturally and mention one thing they can do.
- If someone asks something off-topic, keep it brief and steer back. No lectures.

COMMON QUESTIONS (map to "about" with a helpfulMessage):
- "Quién eres?" / "Who are you?" → about, reply with Sippy's identity
- "Qué idiomas hablas?" / "What languages?" → about, reply: English, Spanish, Portuguese
- "De dónde tiene que ser mi número?" → about, reply: works with any phone number
- "Cuál es mi wallet?" / "My wallet?" → balance (they want their wallet info)
- "Agregar saldo" / "Quiero recargar" / "Add funds" → fund
- "Enviar/mandar a alguien" (without amount/recipient) → help, hint the format
- "Can I send to someone not on Sippy?" / "Mi mama no tiene Sippy" -> help, reply: just try sending to their number here in WhatsApp, we'll invite them automatically
- "Invitar a +573001234567" / "Invite +573001234567" / "Convidar +55..." → invite, put the phone in "recipient"
- "Quiero invitar a alguien" / "I want to invite someone" (no phone) → help, hint: just tell me "invitar +number"

IMPORTANT — settings vs help:
- "settings" is ONLY for when users explicitly want to manage their account settings (change limits, export keys, revoke permissions).
- "Y ahora?" / "Que puedo hacer?" / "What can I do?" / "What else?" / "Que otras cosas puedo hacer?" → help (NOT settings). These users want to see their options.
- When in doubt between help and settings, choose help.

EDGE CASES:
- Insults/trolling: stay calm, don't engage, redirect
- Gibberish: say you didn't catch that, suggest trying "ayuda"/"help"
- Off-topic (random questions, trivia, jokes): have fun with it! Answer briefly or joke around, then casually steer back to what Sippy does. Example: "2+2? 4, obviously... unless you're sending 4 dollars to someone, then I'm your guy" — be witty, not robotic. Never just dump the help menu.

RULES:
- Detect the user's language (en, es, pt, or ambiguous)
- Always respond in the detected language
- Never mention: crypto, cryptocurrency, blockchain, Web3, DeFi, smart contract, token
- helpfulMessage: 1-2 sentences max, always in detected language
- Output ONLY the JSON object, nothing else.

Return ONLY valid JSON:
{"command": "balance"|"start"|"history"|"settings"|"about"|"help"|"fund"|"invite"|"greeting"|"social"|"unknown", "amount": null, "recipient": null, "confidence": 0.0-1.0, "helpfulMessage": string|null, "detectedLanguage": "en"|"es"|"pt"|"ambiguous"}`

// ============================================================================
// Core LLM Call (single model)
// ============================================================================

async function callModel(
  client: Groq,
  modelId: string,
  text: string,
  context: ContextMessage[] = []
): Promise<LLMCallResult> {
  const config = getModelConfig(modelId)
  const limiter = getLimiter(modelId)

  if (!limiter.canMakeRequest()) {
    logger.warn('LLM rate limit reached for model %s, skipping call', modelId)
    return { parsed: null, model: modelId }
  }

  limiter.recordRequest()

  const completion = await Promise.race([
    client.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...context.map((m) => ({ role: m.role as 'user', content: m.content })),
        { role: 'user', content: text },
      ],
      model: config.id,
      temperature: 0.3,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), config.timeout)
    ),
  ])

  const content = completion.choices[0]?.message?.content
  if (!content) {
    logger.warn(
      'LLM returned empty content (%s), finish_reason: %s',
      modelId,
      completion.choices[0]?.finish_reason
    )
    return { parsed: null, model: modelId }
  }

  // Strip <think>…</think> blocks that some models (e.g. Qwen) prepend
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  let raw: unknown
  try {
    raw = JSON.parse(cleaned)
  } catch {
    logger.warn('LLM returned invalid JSON (%s): %s', modelId, content.slice(0, 200))
    return { parsed: null, model: modelId }
  }

  const zodResult = llmResultSchema.safeParse(raw)
  if (!zodResult.success) {
    logger.warn(`LLM output failed Zod validation (${modelId}): %o`, zodResult.error.issues)
    return { parsed: null, model: modelId }
  }

  const result = zodResult.data

  // Confidence checks
  if (result.command === 'unknown' && result.confidence < 0.7) {
    if (!result.helpfulMessage || result.helpfulMessage.length < 10) {
      return { parsed: null, model: modelId }
    }
  }
  if (result.command !== 'unknown' && result.confidence < 0.7) {
    return { parsed: null, model: modelId }
  }

  return {
    parsed: {
      command: result.command,
      amount: result.amount ?? undefined,
      recipient: result.recipient ?? undefined,
      helpfulMessage: result.helpfulMessage ?? undefined,
      detectedLanguage: result.detectedLanguage,
    },
    model: modelId,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
  }
}

// ============================================================================
// Public API: parseMessageWithLLM (with automatic fallback)
// ============================================================================

export interface LLMParseResult {
  parsed: ParsedCommand | null
  meta: CallMeta
}

/**
 * Parse a message with the LLM. Routes to primary model, falls back to
 * secondary on rate limit or error (only when tiering is enabled).
 *
 * Returns the parsed command + model metadata (concurrency-safe, no global state).
 */
export async function parseMessageWithLLM(
  text: string,
  context: ContextMessage[] = []
): Promise<LLMParseResult | null> {
  const client = getGroqClient()
  if (!client) return null

  // Try primary model
  const primaryLimiter = getLimiter(PRIMARY_MODEL)
  if (primaryLimiter.canMakeRequest()) {
    try {
      const result = await callModel(client, PRIMARY_MODEL, text, context)
      if (result.parsed) {
        return {
          parsed: result.parsed,
          meta: {
            model: result.model,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
          },
        }
      }
      // Primary returned null (low confidence / validation fail) — don't fallback for quality issues
      if (!TIERING_ENABLED) return null
    } catch (error) {
      if (error instanceof Error && error.message === 'Timeout') {
        logger.warn(`LLM timeout on ${PRIMARY_MODEL}`)
      } else {
        logger.error(`LLM error on ${PRIMARY_MODEL}: %o`, error)
      }
      // Fall through to fallback if tiering is enabled
      if (!TIERING_ENABLED) throw error
    }
  }

  // Fallback model (only when tiering is enabled)
  if (!TIERING_ENABLED) return null

  if (FALLBACK_MODEL === PRIMARY_MODEL) return null

  const fallbackLimiter = getLimiter(FALLBACK_MODEL)
  if (!fallbackLimiter.canMakeRequest()) return null

  try {
    logger.info(`Falling back to ${FALLBACK_MODEL}`)
    const result = await callModel(client, FALLBACK_MODEL, text, context)
    return {
      parsed: result.parsed,
      meta: {
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      logger.warn(`LLM timeout on fallback ${FALLBACK_MODEL}`)
    } else {
      logger.error(`LLM fallback error on ${FALLBACK_MODEL}: %o`, error)
    }
    throw error
  }
}

// ============================================================================
// Model metadata type (returned alongside parse results)
// ============================================================================

export interface CallMeta {
  model: string
  promptTokens?: number
  completionTokens?: number
}

// ============================================================================
// Personality Response Generator (greeting / social intents)
// ============================================================================

const RESPONSE_SYSTEM_PROMPT = `You are Sippy, a chill WhatsApp money assistant for Latin America.

The user sent a greeting or casual message. Reply like a friend would on WhatsApp.
Match their language. 1-2 sentences max. No emojis.
Don't say "command" — just naturally mention what they can do (check balance, send money, etc).
Return only the response text, nothing else.`

/**
 * Generate a short conversational reply for greeting and social intents.
 *
 * Uses llama-3.1-8b-instant via the shared per-model limiter (14.4K RPD).
 * Returns null on rate-limit, timeout, or any error — callers must fall back
 * to the static template in that case.
 *
 * Never called for financial intents (balance, send, history, settings).
 */
export async function generateResponse(
  text: string,
  lang: string,
  context: ContextMessage[] = [],
  setupStatus?: import('#services/embedded_wallet.service').SetupStatus,
  dialectInstruction?: string | null
): Promise<string | null> {
  const client = getGroqClient()
  if (!client) return null

  const modelId = 'llama-3.1-8b-instant'
  const limiter = getLimiter(modelId) // shared limiter — same quota as classification fallback

  if (!limiter.canMakeRequest()) {
    logger.warn('generateResponse: rate limit reached for %s', modelId)
    return null
  }

  limiter.recordRequest()

  let systemContent =
    lang === 'es' || lang === 'pt'
      ? `${RESPONSE_SYSTEM_PROMPT}\nRespond in ${lang === 'es' ? 'Spanish' : 'Portuguese'}.`
      : RESPONSE_SYSTEM_PROMPT

  if (dialectInstruction) {
    systemContent += `\n${dialectInstruction}`
  }

  if (setupStatus === 'new_user') {
    systemContent += `\nThis user hasn't set up their wallet yet. Don't suggest sending money or checking balance. Naturally encourage them to get started by setting up their wallet.`
  } else if (setupStatus === 'embedded_incomplete') {
    systemContent += `\nThis user started setting up but didn't finish. Encourage them to complete their wallet setup.`
  }

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        messages: [
          { role: 'system', content: systemContent },
          ...context.map((m) => ({ role: m.role as 'user', content: m.content })),
          { role: 'user', content: text },
        ],
        model: modelId,
        temperature: 0.5,
        max_tokens: 80,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ])

    return completion.choices[0]?.message?.content?.trim() || null
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      logger.warn('generateResponse: timeout on %s', modelId)
    } else {
      logger.error('generateResponse: error on %s: %o', modelId, error)
    }
    return null
  }
}

// ============================================================================
// Send Normalizer — turns slang/casual text into standard send format
// ============================================================================

const NORMALIZER_PROMPT = `You normalize casual WhatsApp messages into a standard send command format.

The user tried to send money but used slang, typos, or informal language that the system didn't understand.

Your ONLY job: rewrite their message into this exact format:
  enviar <amount> a <phone>

Rules:
- Extract the amount (number) and recipient (phone number or name)
- Output ONLY the normalized command, nothing else
- If the message has a phone number, keep it exactly as written
- If the message has a name instead of a phone number, keep the name exactly as written
- If you can't figure out the amount or recipient, output exactly: UNCLEAR
- Never add information that wasn't in the original message
- Never guess amounts or recipients

Examples:
  "pasale 10 lucas al 3116613414" → "enviar 10 a 3116613414"
  "dale 5 dolares a mama +573001234567" → "enviar 5 a +573001234567"
  "mete 20 a la cuenta de +573109876543" → "enviar 20 a +573109876543"
  "echale 15 al numero 3116613414" → "enviar 15 a 3116613414"
  "quiero mandarle plata a mi hermano" → UNCLEAR
  "hola como estas" → UNCLEAR`

/**
 * Normalize a casual/slang send attempt into standard "enviar <amount> a <recipient>" format.
 *
 * Called when regex can't parse a message but isAttemptedSend() detected send intent.
 * Returns the normalized string or null if the LLM can't extract amount + recipient.
 *
 * Uses llama-3.1-8b-instant (fast, cheap, 14.4K RPD) since the task is simple extraction.
 */
export async function normalizeSendCommand(text: string): Promise<string | null> {
  const client = getGroqClient()
  if (!client) return null

  const modelId = 'llama-3.1-8b-instant'
  const limiter = getLimiter(modelId)

  if (!limiter.canMakeRequest()) {
    logger.warn('normalizeSendCommand: rate limit reached for %s', modelId)
    return null
  }

  limiter.recordRequest()

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        messages: [
          { role: 'system', content: NORMALIZER_PROMPT },
          { role: 'user', content: text },
        ],
        model: modelId,
        temperature: 0.1,
        max_tokens: 60,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ])

    const result = completion.choices[0]?.message?.content?.trim()
    if (!result || result === 'UNCLEAR' || result.length > 100) return null

    logger.info('normalizeSendCommand: "%s" → "%s"', text, result)
    return result
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      logger.warn('normalizeSendCommand: timeout')
    } else {
      logger.error('normalizeSendCommand: error: %o', error)
    }
    return null
  }
}

// ============================================================================
// Rate limit check (used by messageParser)
// ============================================================================

export function isRateLimited(): boolean {
  const primaryLimiter = getLimiter(PRIMARY_MODEL)
  if (primaryLimiter.canMakeRequest()) return false

  // If tiering is enabled, check fallback too
  if (TIERING_ENABLED && FALLBACK_MODEL !== PRIMARY_MODEL) {
    const fallbackLimiter = getLimiter(FALLBACK_MODEL)
    return !fallbackLimiter.canMakeRequest()
  }

  return true
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkLLMHealth(): Promise<HealthStatus> {
  if (!isLLMEnabled()) {
    return { available: false, reason: 'LLM disabled via USE_LLM flag' }
  }

  const apiKey = env.get('GROQ_API_KEY', '')
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return { available: false, reason: 'GROQ_API_KEY not configured' }
  }

  const client = getGroqClient()
  if (!client) {
    return { available: false, reason: 'Failed to initialize Groq client' }
  }

  return { available: true }
}

// ============================================================================
// Utilities
// ============================================================================

export function getRateLimitStats() {
  return {
    primary: getLimiter(PRIMARY_MODEL).getStats(),
    ...(TIERING_ENABLED ? { fallback: getLimiter(FALLBACK_MODEL).getStats() } : {}),
    tieringEnabled: TIERING_ENABLED,
  }
}

export function getModelConfig_public() {
  return {
    primary: PRIMARY_MODEL,
    fallback: FALLBACK_MODEL,
    tieringEnabled: TIERING_ENABLED,
  }
}
