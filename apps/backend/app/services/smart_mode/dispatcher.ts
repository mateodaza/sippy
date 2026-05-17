/**
 * SMART MODE — dispatcher orchestrator
 *
 * The bridge between the classifier (pure intent triage) and the existing
 * webhook send pipeline. Owns the pipeline:
 *
 *   classify → validateSmartAction → sanitize → dispatch
 *
 * Returns one of three outcomes the webhook caller acts on:
 *
 *   • `execute`      — synthesized ParsedCommand ready for `routeCommand`.
 *                      Action paths only. Goes through the SAME chokepoint
 *                      as regex-routed messages — every existing guard
 *                      (force-confirm, threshold, self-send, balance) applies.
 *   • `reply`        — text to send and stop. Ambiguous path only. Text is
 *                      sanitizer-cleared or a deterministic fallback when
 *                      sanitizer rejected the LLM's question.
 *   • `fall_through` — let `parseMessage(text, ctx, history, { skipSmart: true })`
 *                      have a shot. Out-of-scope / gibberish from SMART
 *                      isn't authoritative — existing regex + Llama Scout
 *                      may still handle the intent (withdraw, settings,
 *                      etc.) that SMART deliberately doesn't classify.
 *                      `oosRedirect` is passed through so the webhook can
 *                      use it as a hint AFTER the existing parser also says
 *                      unknown.
 *
 * Pure module — no DB, no Adonis HTTP, no in-memory caches. The webhook
 * controller orchestrates the side effects (sendTextMessage, partialSends).
 */

import logger from '@adonisjs/core/services/logger'
import { canonicalizePhone, maskPhone } from '#utils/phone'
import type { ContextMessage } from '#services/db'
import type { ParsedCommand, PartialSend } from '#types/index'
import { classifyMessage, type ClassifierGroqClient } from './classifier.js'
import { validateSmartAction, shouldFallThroughToExistingParser } from './validators.js'
import { sanitizeClarification, sanitizeOosRedirect } from './sanitizer.js'
import type { SmartClassification, SmartIntent } from './types.js'

// ── Outcome shape ────────────────────────────────────────────────────────

export type DispatcherOutcome =
  | { kind: 'execute'; command: ParsedCommand; classification: SmartClassification }
  | {
      kind: 'reply'
      text: string
      classification: SmartClassification
      pending?: SmartPendingState
    }
  | {
      kind: 'fall_through'
      /** OPTIONAL hint the webhook may use AFTER `parseMessage(skipSmart:true)`
       *  also returns unknown. Caller-owned policy whether to use vs template. */
      oosRedirect: string | null
      classification: SmartClassification
    }

export type SmartPendingState =
  | { kind: 'send'; partial: Omit<PartialSend, 'timestamp' | 'lang'> }
  | { kind: 'invite' }

export interface DispatchArgs {
  /** Inbound text (already bracket-stripped). */
  text: string
  /** Sender phone — for logging only; cohort gate runs BEFORE dispatcher. */
  phoneNumber: string
  /** Last N turns; threaded into the classifier prompt. */
  context: ContextMessage[]
  /** User's preferred language hint for the classifier. */
  preferredLang?: 'en' | 'es' | 'pt'
  /** Test seam — injects a mock Groq client into `classifyMessage`. */
  clientFactory?: () => ClassifierGroqClient | null
}

/** Default Spanish ambiguous fallback when the LLM's clarifying_question
 *  trips the sanitizer. Webhook can override per intent later via the
 *  conditions table; here we just need a non-null safety net. */
const FALLBACK_AMBIGUOUS_QUESTION = '¿Puedes darme más detalle?'

/**
 * Orchestrate the SMART MODE pipeline for one inbound message.
 *
 * Never throws. Every outcome includes the underlying `classification`
 * so the webhook can log a uniform structured line regardless of which
 * branch fired.
 */
export async function dispatchSmartMode(args: DispatchArgs): Promise<DispatcherOutcome> {
  const t0 = Date.now()

  // 1. Classify (primary → fallback → typed gibberish).
  const raw = await classifyMessage({
    text: args.text,
    context: args.context,
    preferredLang: args.preferredLang,
    clientFactory: args.clientFactory,
  })

  // 2. Validate the action shape — downgrade to ambiguous if required slots
  //    aren't satisfied (e.g., classifier said 'send' with no recipient).
  const classification = validateSmartAction(raw)

  const classifyMs = Date.now() - t0

  // 3. Branch on the final category.
  if (classification.category === 'action') {
    const command = synthesizeParsedCommand(classification, args.text)
    if (!command) {
      // Belt-and-suspenders: validator should have caught missing intent
      // already, but a defensive log keeps the failure visible.
      logger.warn(
        { phone: maskPhone(args.phoneNumber), classification },
        'smart_mode.dispatch: action with no synthesizable command — falling through'
      )
      return {
        kind: 'fall_through',
        oosRedirect: null,
        classification,
      }
    }

    logger.info(
      {
        phone: maskPhone(args.phoneNumber),
        category: 'action',
        intent: classification.intent,
        confidence: classification.confidence,
        classifyMs,
      },
      'smart_mode.dispatch: execute'
    )
    return { kind: 'execute', command, classification }
  }

  if (classification.category === 'ambiguous') {
    const deterministic = deterministicAmbiguousReply(classification, args.preferredLang ?? 'es')
    const sanitized = deterministic ?? sanitizeClarification(classification.clarifying_question)
    const text = sanitized ?? FALLBACK_AMBIGUOUS_QUESTION
    const pending = pendingStateForAmbiguous(classification)
    logger.info(
      {
        phone: maskPhone(args.phoneNumber),
        category: 'ambiguous',
        intent: classification.intent,
        confidence: classification.confidence,
        usedFallback: sanitized === null,
        pendingKind: pending?.kind ?? null,
        classifyMs,
      },
      'smart_mode.dispatch: reply (ambiguous)'
    )
    return { kind: 'reply', text, classification, pending }
  }

  // out_of_scope OR gibberish — fall through to existing parser.
  // `shouldFallThroughToExistingParser` already returns true for both; we
  // keep using it so any future tweak to the rule has a single source.
  if (shouldFallThroughToExistingParser(classification)) {
    // Use the OOS-specific sanitizer (currently shares rules with the
    // clarification one, but the module split exists so the rule sets can
    // diverge later without touching this call site).
    const oosRedirect =
      classification.category === 'out_of_scope'
        ? sanitizeOosRedirect(classification.oos_redirect)
        : null
    logger.info(
      {
        phone: maskPhone(args.phoneNumber),
        category: classification.category,
        confidence: classification.confidence,
        hasOosHint: !!oosRedirect,
        classifyMs,
      },
      'smart_mode.dispatch: fall_through'
    )
    return { kind: 'fall_through', oosRedirect, classification }
  }

  // Defensive: every category should be handled above. Treat unknown as
  // fall_through so the existing parser stays the last word.
  logger.error(
    { phone: maskPhone(args.phoneNumber), classification },
    'smart_mode.dispatch: unhandled category — falling through'
  )
  return { kind: 'fall_through', oosRedirect: null, classification }
}

/**
 * Map of FX currency codes to the human word users typed. Mirrors the
 * map in `messages.ts` so the SMART deterministic echo agrees with
 * `formatAskForRecipient` on the legacy partial-send progress path —
 * both must show "1000 pesos a quien?" (not "1000 a quien?" or
 * "$1000.00 a quien?") when a local currency is in play, otherwise
 * the user can't tell whether Sippy is about to send USDC at face value.
 */
const CURRENCY_WORD_BY_CODE: Record<string, string> = {
  LOCAL: 'pesos',
  BRL: 'reais',
  PEN: 'soles',
  HNL: 'lempiras',
  GTQ: 'quetzales',
  CRC: 'colones',
  VES: 'bolivares',
  PYG: 'guaranies',
}

function deterministicAmbiguousReply(
  c: SmartClassification,
  lang: 'en' | 'es' | 'pt'
): string | null {
  if (c.intent === 'send') {
    const slots = c.slots ?? undefined
    const hasAmount = slots?.amount != null || (slots?.localAmount != null && !!slots.localCurrency)
    const hasRecipient = !!slots?.recipientRaw

    if (hasAmount && !hasRecipient) {
      const amount = slots?.amount ?? slots?.localAmount
      const currencyWord = slots?.localCurrency
        ? CURRENCY_WORD_BY_CODE[slots.localCurrency]
        : undefined
      const formatted =
        amount != null ? (currencyWord ? `${amount} ${currencyWord}` : `${amount}`) : ''
      const m = {
        en: () => `${formatted} to whom? Send me the phone number or contact name.`,
        es: () => `${formatted} a quien? Mandame el numero o el nombre del contacto.`,
        pt: () => `${formatted} pra quem? Me manda o numero ou nome do contato.`,
      }
      return m[lang]()
    }

    if (hasRecipient && !hasAmount) {
      const m = {
        en: () => `How much do you want to send?`,
        es: () => `Cuanto quieres enviar?`,
        pt: () => `Quanto voce quer enviar?`,
      }
      return m[lang]()
    }

    const m = {
      en: () => `How much do you want to send?`,
      es: () => `Cuanto quieres enviar?`,
      pt: () => `Quanto voce quer enviar?`,
    }
    return m[lang]()
  }

  if (c.intent === 'invite') {
    const m = {
      en: () => `Send me the phone number you want to invite.`,
      es: () => `Mandame el numero de telefono que quieres invitar.`,
      pt: () => `Me manda o numero de telefone que voce quer convidar.`,
    }
    return m[lang]()
  }

  return null
}

function pendingStateForAmbiguous(c: SmartClassification): SmartPendingState | undefined {
  if (c.intent === 'send') {
    const partial: Omit<PartialSend, 'timestamp' | 'lang'> = { sendIntent: true }
    const slots = c.slots ?? undefined
    if (slots?.amount != null) {
      partial.amount = slots.amount
    } else if (slots?.localAmount != null && slots.localCurrency) {
      // MUST also seed `localCurrency` — otherwise the next-turn resolver
      // has no FX signal and the synthesized command sends face value as
      // USDC (the May-17 "ok 1000 pesos → $1000.00 USDC" bug). Mirrors
      // the action-path synthesizer at line 304-308 which sets both
      // amount and localCurrency for the same reason.
      partial.amount = slots.localAmount
      partial.localCurrency = slots.localCurrency
    }
    if (slots?.recipientRaw) {
      const canon = canonicalizePhone(slots.recipientRaw)
      if (canon) {
        partial.recipient = canon
      } else {
        partial.recipientRaw = slots.recipientRaw
      }
    }
    return { kind: 'send', partial }
  }

  if (c.intent === 'invite') {
    return { kind: 'invite' }
  }

  return undefined
}

// ── ParsedCommand synthesizer ────────────────────────────────────────────

/**
 * Project a SMART MODE `action` classification into the shape `routeCommand`
 * expects. Mirrors how the existing regex parser populates ParsedCommand
 * so downstream handlers can't tell the difference between a regex hit and
 * a SMART hit — invariants apply identically.
 *
 * `originalText` is the user's inbound message; passed through so:
 *   - greeting / social handlers can generate a conversational reply from
 *     the actual input instead of falling to static copy
 *   - parse logs preserve the input
 *
 * Returns null only if the intent is unexpectedly missing (validator
 * should have prevented this; defensive log path catches the drift).
 */
function synthesizeParsedCommand(
  c: SmartClassification,
  originalText: string
): ParsedCommand | null {
  if (c.category !== 'action' || !c.intent) return null

  // The dispatcher's intent is a strict subset of ParsedCommand.command,
  // so this cast is safe by construction (SMART_INTENT_SLUGS ⊂ command).
  const command: ParsedCommand = {
    command: c.intent as SmartIntent & ParsedCommand['command'],
    originalText,
  }

  const slots = c.slots ?? undefined
  if (slots) {
    // Currency-amount semantics MUST mirror the existing regex parser
    // (`parseSendMatch` in message_parser.ts:639-645): when the message
    // carries a local currency word, BOTH `amount` and `localAmount` get
    // the same raw pre-conversion value. The downstream FX step replaces
    // `amount` with the USDC equivalent using `localCurrency` as the
    // signal. Setting only `localAmount` would skip conversion entirely.
    //
    // Slot schema invariant (mutex on `amount` vs `localAmount`) only
    // governs what the LLM may emit; the synthesizer freely duplicates
    // the value into ParsedCommand to match the downstream contract.
    if (slots.localAmount != null && slots.localCurrency) {
      command.amount = slots.localAmount
      command.localAmount = slots.localAmount
      command.localCurrency = slots.localCurrency
      command.isLargeAmount = slots.localAmount > 500
    } else if (slots.amount != null) {
      command.amount = slots.amount
      command.isLargeAmount = slots.amount > 500
    }
    if (slots.recipientRaw) {
      // If it canonicalizes cleanly to a phone, set `recipient`; otherwise
      // pass through as `recipientRaw` so the existing alias-resolver runs.
      // Mirrors `parseSendMatch`'s logic in message_parser.ts.
      const canon = canonicalizePhone(slots.recipientRaw)
      if (canon) {
        command.recipient = canon
      } else {
        command.recipientRaw = slots.recipientRaw
      }
    }
  }

  if (c.detectedLang) {
    command.detectedLanguage = c.detectedLang
  }

  // Tag so downstream + tests can identify SMART-synthesized commands.
  command.usedLLM = true
  command.llmStatus = 'success'

  return command
}
