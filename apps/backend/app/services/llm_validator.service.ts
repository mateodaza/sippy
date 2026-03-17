/**
 * LLM Response Validator
 *
 * Validates LLM-generated outgoing messages before they're sent to users.
 * Checks for: scope violations, forbidden terms, tone, safety, language match.
 *
 * Primary: GPT-OSS-Safeguard-20B (purpose-built for safety classification, 1K RPD).
 * Fallback: llama-3.1-8b-instant (14.4K RPD) when primary is rate-limited.
 *
 * Feature-gated via LLM_VALIDATOR env var (exact === 'true' check).
 * On any failure (rate limit, timeout, parse error): passes through silently.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { getGroqClient, getLimiter } from '#services/llm.service'
import type { ContextMessage } from '#services/db'
import type { SetupStatus } from '#services/embedded_wallet.service'

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  passed: boolean
  correctedText: string | null
  reason: string | null
}

const PASS_THROUGH: ValidationResult = { passed: true, correctedText: null, reason: null }

// ============================================================================
// Model config
// ============================================================================

const PRIMARY_MODEL = 'openai/gpt-oss-safeguard-20b'
const FALLBACK_MODEL = 'llama-3.1-8b-instant'

// ============================================================================
// Validator System Prompt
// ============================================================================

const VALIDATOR_PROMPT = `You are a quality checker for Sippy, a WhatsApp money app for Latin America.

You will receive a proposed outgoing message and the user's original message.
Evaluate whether the proposed reply is safe and on-brand.

CHECK THESE:
1. SCOPE: Does the reply only reference things Sippy can actually do? (send money, check balance, see history, add funds, manage settings, get help). If the reply mentions features Sippy doesn't have (investments, loans, cards, exchange rates, savings, interest, staking), FAIL.
2. FORBIDDEN TERMS: Does the reply contain any of these words? crypto, cryptocurrency, blockchain, web3, defi, smart contract, token, private key, seed phrase, mnemonic, gas fee, wallet address, nft. If yes, FAIL.
3. TONE: Does the reply sound like a friend on WhatsApp? Short, natural, no corporate talk. If it sounds like a support bot or has phrases like "I'm here to assist you", "How can I help you today?", "Is there anything else I can help with?", FAIL.
4. SAFETY: Does the reply leak internal details (JSON, error codes, model names, raw phone numbers, internal URLs)? If yes, FAIL.
5. LANGUAGE: Does the reply match the expected language? If the expected language is Spanish but reply is in English (or vice versa), FAIL.

If the reply passes all checks, return: {"pass": true, "corrected": null, "reason": null}
If the reply fails, return: {"pass": false, "corrected": "<fixed version in 1-2 sentences, same language>", "reason": "<which check failed and why>"}

Return ONLY the JSON object.`

// ============================================================================
// Core Validator
// ============================================================================

export async function validateLLMResponse(
  proposedMessage: string,
  userMessage: string,
  lang: string,
  _context: ContextMessage[] = [],
  setupStatus?: SetupStatus,
  dialectHint?: string | null
): Promise<ValidationResult> {
  // Feature flag — disabled only when explicitly set to 'false'
  if (env.get('LLM_VALIDATOR') === 'false') return PASS_THROUGH

  const client = getGroqClient()
  if (!client) return PASS_THROUGH

  // Pick model: primary (Safeguard) if available, fallback (8B) if rate-limited
  const primaryLimiter = getLimiter(PRIMARY_MODEL)
  const fallbackLimiter = getLimiter(FALLBACK_MODEL)

  let modelId: string
  if (primaryLimiter.canMakeRequest()) {
    modelId = PRIMARY_MODEL
    primaryLimiter.recordRequest()
  } else if (fallbackLimiter.canMakeRequest()) {
    modelId = FALLBACK_MODEL
    fallbackLimiter.recordRequest()
    logger.debug('validator: primary rate-limited, using fallback %s', FALLBACK_MODEL)
  } else {
    logger.debug('validator: all models rate-limited, pass-through')
    return PASS_THROUGH
  }

  // Build system prompt with context signals
  let systemContent = VALIDATOR_PROMPT
  systemContent += `\n\nExpected language: ${lang === 'es' ? 'Spanish' : lang === 'pt' ? 'Portuguese' : 'English'}`

  if (setupStatus === 'new_user') {
    systemContent += `\nThis user is NEW and hasn't set up their wallet yet. The reply should NOT suggest financial actions (send money, check balance). It's OK if the reply encourages wallet setup.`
  } else if (setupStatus === 'embedded_incomplete') {
    systemContent += `\nThis user started setup but didn't finish. The reply should encourage completing wallet setup.`
  }

  if (dialectHint) {
    systemContent += `\nThe reply may use regional dialect: ${dialectHint}. This is intentional and should NOT be flagged.`
  }

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: `User message: "${userMessage}"\n\nProposed reply: "${proposedMessage}"` },
        ],
        model: modelId,
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500)),
    ])

    const raw = completion.choices?.[0]?.message?.content?.trim()
    if (!raw) {
      logger.debug('validator: empty response, pass-through')
      return PASS_THROUGH
    }

    const parsed = JSON.parse(raw)

    // Metadata-only logging — never log raw user text or proposed replies
    logger.info('validator: %o', {
      passed: !!parsed.pass,
      reason: parsed.reason ?? null,
      model: modelId,
      setupStatus: setupStatus ?? 'onboarded',
      lang,
      messageLength: proposedMessage.length,
    })

    if (parsed.pass) return PASS_THROUGH

    const corrected = typeof parsed.corrected === 'string' && parsed.corrected.length > 0
      ? parsed.corrected
      : null

    return {
      passed: false,
      correctedText: corrected,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'unknown',
    }
  } catch (error) {
    // Timeout, malformed JSON, network error — all pass-through
    logger.debug('validator: error (%s), pass-through', (error as Error).message)
    return PASS_THROUGH
  }
}
