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
  'qwen/qwen3-32b': { id: 'qwen/qwen3-32b', rpm: 30, rpd: 1000, timeout: 5000, maxTokens: 512 },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    rpm: 30,
    rpd: 14400,
    timeout: 3000,
    maxTokens: 150,
  },
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    rpm: 30,
    rpd: 1000,
    timeout: 5000,
    maxTokens: 200,
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    rpm: 30,
    rpd: 1000,
    timeout: 4000,
    maxTokens: 200,
  },
}

function getModelConfig(modelId: string): ModelConfig {
  return MODEL_CATALOG[modelId] || { id: modelId, rpm: 25, rpd: 900, timeout: 5000, maxTokens: 200 }
}

const PRIMARY_MODEL = env.get('PRIMARY_LLM_MODEL', 'llama-3.3-70b-versatile')
const FALLBACK_MODEL = env.get('FALLBACK_LLM_MODEL', 'llama-3.1-8b-instant')
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

function getLimiter(modelId: string): ModelRateLimiter {
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

function getGroqClient(): Groq | null {
  if (!isLLMEnabled()) return null

  if (!groqClient) {
    const apiKey = env.get('GROQ_API_KEY', '')
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
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

const SYSTEM_PROMPT = `You are Sippy, a friendly WhatsApp wallet assistant.

Your job: parse the user's message into a structured command AND provide a helpful response when needed.

Available commands: balance, start, history, settings, about, help, unknown.
NOTE: "send" is NOT a valid command for you. Send commands are handled separately by regex.

ABOUT SIPPY (use these facts when answering questions — never guess):
- Sippy is a WhatsApp wallet for sending digital dollars (USDC) via phone number
- Zero fees on transfers between Sippy users
- Transfers arrive in seconds
- Available in 3 languages: English, Spanish, Portuguese
- Sippy works on Arbitrum network (but never say "blockchain" or "crypto" to users)
- Money is held in USDC (digital dollars pegged 1:1 to USD)

COMMAND NAMES BY LANGUAGE (always use the correct language when suggesting commands):
- EN: "send 10 to +57...", "balance", "start", "help", "history", "settings"
- ES: "enviar 10 a +57...", "saldo", "comenzar", "ayuda", "historial", "ajustes"
- PT: "enviar 10 para +55...", "saldo", "começar", "ajuda", "historico", "ajustes"

PERSONALITY:
- Warm, concise, helpful — like a knowledgeable friend, not a robot
- Match the user's energy: casual greetings get casual replies, serious questions get clear answers
- Always guide toward action: after answering, suggest what they can do next
- No emojis. No exclamation marks. Keep it clean and natural.
- Use the facts above to give specific, accurate answers. Never make up features.

GREETINGS (hola, hi, hey, oi, que tal, etc.):
- command: "unknown", helpfulMessage: greet warmly, say what Sippy does in one line, suggest an action
- Keep it to 2 sentences max.

EDGE CASES:
- Insults, profanity, trolling: command "unknown", stay calm, don't engage, redirect to wallet features
- Random gibberish: command "unknown", say you didn't understand, suggest "ayuda"/"ajuda"/"help"
- Off-topic questions (weather, math, jokes): command "unknown", brief friendly deflection + redirect
- If you don't know the answer: say so honestly, suggest the help command in the user's language

RULES:
- Detect the user's language (en, es, pt, or ambiguous)
- When responding, ALWAYS use command names in the detected language (e.g. Spanish response must say "comenzar" not "start", "saldo" not "balance")
- Never mention: crypto, cryptocurrency, blockchain, Web3, DeFi, smart contract, token
- helpfulMessage: max 2-3 sentences, always in the detected language
- Do NOT include any reasoning, thinking, or explanation. Output ONLY the JSON object.

Return ONLY valid JSON (no text before or after):
{"command": "balance"|"start"|"history"|"settings"|"about"|"help"|"unknown", "amount": null, "recipient": null, "confidence": 0.0-1.0, "helpfulMessage": string|null, "detectedLanguage": "en"|"es"|"pt"|"ambiguous"}`

// ============================================================================
// Core LLM Call (single model)
// ============================================================================

async function callModel(client: Groq, modelId: string, text: string): Promise<LLMCallResult> {
  const config = getModelConfig(modelId)
  const limiter = getLimiter(modelId)

  if (!limiter.canMakeRequest()) {
    return { parsed: null, model: modelId }
  }

  limiter.recordRequest()

  const completion = await Promise.race([
    client.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      model: config.id,
      temperature: 0.1,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), config.timeout)
    ),
  ])

  const content = completion.choices[0]?.message?.content
  if (!content) return { parsed: null, model: modelId }

  const raw = JSON.parse(content)

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
export async function parseMessageWithLLM(text: string): Promise<LLMParseResult | null> {
  const client = getGroqClient()
  if (!client) return null

  // Try primary model
  const primaryLimiter = getLimiter(PRIMARY_MODEL)
  if (primaryLimiter.canMakeRequest()) {
    try {
      const result = await callModel(client, PRIMARY_MODEL, text)
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
    const result = await callModel(client, FALLBACK_MODEL, text)
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
