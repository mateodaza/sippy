/**
 * SMART MODE — runtime validators
 *
 * The Zod schema enforces *shape* invariants (category/intent compatibility,
 * slot mutual-exclusion). This file enforces *semantic* invariants that
 * depend on the conditions table — specifically, that an `action` outcome
 * carries every slot the intent's handler will need.
 *
 * Without this guard, eval can pass on the cases we wrote but prod can
 * still hand a slot-less `send` to `routeCommand`, which would then either
 * crash or fall back into the partial-send flow with no clarifying signal.
 * Downgrading missing-slot actions to `ambiguous` keeps the dispatcher
 * uniform: ambiguous always asks; ambiguous never executes.
 */

import logger from '@adonisjs/core/services/logger'
import { INTENT_CONDITIONS } from './conditions.js'
import type { SmartClassification, SmartIntent } from './types.js'

// Re-exported for dispatcher callers — kept on this barrel so import paths stay flat.
export type { SmartClassification, SmartIntent } from './types.js'

/**
 * True if the slot is satisfied. `amount` is special — either the USDC
 * `amount` slot OR the local-currency `localAmount` (with `localCurrency`)
 * pair satisfies it. Mirrors the existing send pipeline, which accepts
 * both shapes upstream of FX.
 */
function isSlotSatisfied(
  slots: SmartClassification['slots'],
  slot: 'amount' | 'recipientRaw'
): boolean {
  if (!slots) return false
  if (slot === 'amount') {
    return slots.amount !== undefined || slots.localAmount !== undefined
  }
  if (slot === 'recipientRaw') {
    return typeof slots.recipientRaw === 'string' && slots.recipientRaw.trim().length > 0
  }
  return false
}

/**
 * Default Spanish clarifying questions per missing slot. Used when the
 * classifier downgrades to ambiguous via this validator and didn't have
 * its own `clarifying_question` already populated.
 *
 * Keep these deterministic + short — they're the safety-net copy, the
 * classifier-generated ones are preferred when present.
 */
const DEFAULT_CLARIFICATIONS: Record<SmartIntent, Record<'amount' | 'recipientRaw', string>> = {
  send: {
    amount: '¿Cuánto?',
    recipientRaw: '¿A quién?',
  },
  invite: {
    amount: '', // not required for invite
    recipientRaw: '¿A quién invitas? Mándame el número.',
  },
  // No slots required; empty placeholders so the type compiles
  balance: { amount: '', recipientRaw: '' },
  pay_qr: { amount: '', recipientRaw: '' },
  fund: { amount: '', recipientRaw: '' },
  history: { amount: '', recipientRaw: '' },
  help: { amount: '', recipientRaw: '' },
  greeting: { amount: '', recipientRaw: '' },
  social: { amount: '', recipientRaw: '' },
  dashboard: { amount: '', recipientRaw: '' },
  referral_code: { amount: '', recipientRaw: '' },
  quest_status: { amount: '', recipientRaw: '' },
  start: { amount: '', recipientRaw: '' },
  settings: { amount: '', recipientRaw: '' },
  about: { amount: '', recipientRaw: '' },
  list_contacts: { amount: '', recipientRaw: '' },
  withdraw: { amount: '', recipientRaw: '' },
}

/**
 * Enforce intent-specific slot requirements on an `action` classification.
 *
 * Returns the input untouched when:
 *   - category !== 'action' (no slots to check)
 *   - all required slots are present
 *
 * Otherwise downgrades to `ambiguous` with a clarifying_question targeted
 * at the FIRST missing slot. Preserves the original reasoning + appends a
 * downgrade tag for log/eval visibility.
 *
 * Never throws — defensive return on unknown intent (shouldn't happen,
 * Zod enum prevents it, but the dispatcher shouldn't crash even if it does).
 */
export function validateSmartAction(c: SmartClassification): SmartClassification {
  if (c.category !== 'action') return c

  const condition = c.intent ? INTENT_CONDITIONS.find((x) => x.slug === c.intent) : undefined
  if (!condition) {
    // Should be unreachable — Zod enforces intent ∈ SMART_INTENT_SLUGS and
    // every slug has a conditions entry. Defensive downgrade to gibberish
    // (not ambiguous — we don't know what to ask) if it ever fires.
    logger.warn({ intent: c.intent }, 'smart_mode.validate: no condition for intent — downgrading')
    return {
      ...c,
      category: 'gibberish',
      intent: null,
      clarifying_question: null,
      reasoning: truncateReason(`${c.reasoning} | downgraded: no condition`),
    }
  }

  for (const slot of condition.requiresSlots) {
    if (!isSlotSatisfied(c.slots, slot)) {
      const fallback =
        DEFAULT_CLARIFICATIONS[condition.slug]?.[slot] ?? '¿Puedes darme más detalle?'
      return {
        ...c,
        category: 'ambiguous',
        // Prefer the LLM's own clarifying_question if it already wrote one;
        // otherwise use the deterministic per-slot fallback.
        clarifying_question: c.clarifying_question || fallback,
        reasoning: truncateReason(`${c.reasoning} | downgraded: missing ${slot}`),
      }
    }
  }

  return c
}

/** Same 500-char cap the Zod schema enforces. */
function truncateReason(reason: string): string {
  return reason.length > 500 ? reason.slice(0, 499) + '…' : reason
}

/**
 * Dispatcher rule: should this SMART result fall through to the existing
 * parseMessage() pipeline before we reply to the user?
 *
 * SMART MODE knows a strict subset of intents (see `SMART_INTENT_SLUGS`).
 * The existing parser still handles withdraw / settings / about / language /
 * privacy / save_contact / delete_contact / list_contacts / start via
 * regex + Llama Scout + loose patterns. If SMART says "out_of_scope" or
 * "gibberish", that may just mean SMART doesn't recognize the intent —
 * not that the user input is actually meaningless.
 *
 * Rule:
 *   - action          → execute via routeCommand (SMART is authoritative)
 *   - ambiguous       → send clarifying_question (SMART is authoritative)
 *   - out_of_scope    → fall through to existing parser; only reply with
 *                       SMART's oos_redirect if parser ALSO says 'unknown'
 *   - gibberish       → fall through (same logic — parser may catch a typo
 *                       or a regional phrasing SMART missed)
 *
 * Codified here so the integration step has a single source of truth, and
 * unit tests can pin the rule independent of webhook wiring.
 */
export function shouldFallThroughToExistingParser(c: SmartClassification): boolean {
  return c.category === 'out_of_scope' || c.category === 'gibberish'
}
