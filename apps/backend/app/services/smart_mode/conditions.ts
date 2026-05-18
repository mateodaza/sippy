/**
 * SMART MODE — intent conditions table
 *
 * Single source of truth for the intents SMART MODE knows about. The prompt
 * builder enumerates this table when constructing the classifier prompt,
 * so adding a new intent = appending an entry here (no prompt edits).
 *
 * Scope is intentionally limited to intents with a safe slot shape — see
 * `SMART_INTENT_SLUGS` in types.ts for the gate. Intents like language /
 * privacy / save_contact / delete_contact / list_contacts / withdraw /
 * start / settings / about stay regex-only in Phase 1 because the slot
 * schema can't safely carry their required fields (detectedLanguage,
 * privacyAction, alias, phone). Add them back to SMART by extending the
 * slot schema AND the conditions entry AND golden cases all at once.
 *
 * Pattern lifted from Camello `intent-profiles.ts` + hive-mind
 * `intent-conditions.ts`. Each entry carries:
 *   - `slug`: a `SmartIntent` — strict subset of ParsedCommand.command
 *   - `description`: 1-sentence "what user means" — included in prompt
 *   - `requiresSlots`: slots that MUST be present for category='action'.
 *                     Enforced at runtime by `validateSmartAction()`.
 *                     For 'amount', either `slots.amount` (USDC) OR
 *                     `slots.localAmount` (+ `localCurrency`) satisfies it.
 *   - `examples`: 2-5 short phrases in ES/EN/PT — few-shot anchors.
 *   - `notRoutedHere`: phrases that LOOK like this intent but aren't —
 *                     prevents the classifier from over-routing.
 */

import type { SmartIntent } from './types.js'

export interface IntentCondition {
  slug: SmartIntent
  description: string
  /** Slots required for category='action'. Missing → 'ambiguous'. */
  requiresSlots: Array<'amount' | 'recipientRaw'>
  /** Short example utterances — fed as few-shot anchors. */
  examples: string[]
  /** Phrases that look like this intent but should route elsewhere. */
  notRoutedHere?: string[]
}

export const INTENT_CONDITIONS: IntentCondition[] = [
  {
    slug: 'send',
    description:
      'User wants to send value to a person (by alias, phone, or contact name). ' +
      'USDC by default ("5", "$5", "5 dollars"). If the user names a local currency ' +
      '(pesos, reais, soles, lempiras, quetzales, colones, bolivares, guaraníes), ' +
      'extract `slots.localAmount` + `slots.localCurrency` instead of `slots.amount` — ' +
      'FX conversion happens downstream and the wrong slot ships the wrong-currency send.',
    requiresSlots: ['amount', 'recipientRaw'],
    examples: [
      'envía 5 a mateo',
      'mándale 10 a +573001234567',
      'send 5 to carolina',
      'paga 3 a @cafe-norte',
      'pásale 2 a mi mamá',
      // Local-currency send — must extract localAmount + localCurrency, NOT amount.
      'enviar 10 pesos a mi mamá',
    ],
    notRoutedHere: [
      'paga aquí con sippy', // brand copy, not a send command
      'envía mi qr', // → pay_qr
    ],
  },
  {
    slug: 'balance',
    description: 'User wants to know their current USDC balance.',
    requiresSlots: [],
    examples: ['saldo', 'mi saldo', 'cuánto tengo', 'balance', 'what is my balance'],
  },
  {
    slug: 'pay_qr',
    description: 'User wants their personal pay-QR (the URL to /wallet/pay-qr).',
    requiresSlots: [],
    examples: ['mi qr', 'mi código de pago', 'pay link', 'cómo me pagan', 'pay qr'],
    notRoutedHere: [
      'escanea un qr', // generic, not their own
    ],
  },
  {
    slug: 'invite',
    description: 'User wants to invite a friend by phone number.',
    requiresSlots: ['recipientRaw'],
    examples: ['invita a +573001234567', 'invite +1555...', 'convidar +5511...'],
  },
  {
    slug: 'fund',
    description: 'User wants to add money / fund their wallet.',
    requiresSlots: [],
    examples: ['agregar saldo', 'recargar', 'fund', 'agregar fondos', 'top up'],
  },
  {
    slug: 'history',
    description: 'User wants to see their transaction history.',
    requiresSlots: [],
    examples: ['historial', 'transactions', 'mis transacciones', 'history'],
  },
  {
    slug: 'help',
    description: 'User wants to know what Sippy can do.',
    requiresSlots: [],
    examples: ['ayuda', 'help', 'qué puedes hacer', 'ajuda'],
  },
  {
    slug: 'greeting',
    description: 'Pure greeting with no follow-on intent ("hola", "buenas").',
    requiresSlots: [],
    examples: ['hola', 'buenas', 'hey', 'oi', 'qué tal'],
    notRoutedHere: [
      'hola, envíame mi saldo', // mixed — route to balance, not greeting
    ],
  },
  {
    slug: 'social',
    description: 'Politeness / acknowledgment ("gracias", "ok", "dale").',
    requiresSlots: [],
    examples: ['gracias', 'ok', 'dale', 'thanks', 'perfecto'],
  },
  {
    slug: 'dashboard',
    description:
      'User wants to access the web dashboard / account hub at /wallet. Covers "do you have a dashboard?", "how do I access my account?", "is there a panel?". DO NOT route here for `mi cuenta de banco` (bank account) or any non-Sippy account reference.',
    requiresSlots: [],
    examples: [
      'mi cuenta',
      'panel',
      'dashboard',
      'como entro a mi cuenta',
      'no hay un dashboard?',
      'meu painel',
      'how do I access my account',
    ],
    notRoutedHere: [
      'mi cuenta de banco', // bank account, not Sippy
      'mi cuenta de gmail', // external account
    ],
  },
]

/** Lookup helper. */
export function getCondition(slug: SmartIntent): IntentCondition | undefined {
  return INTENT_CONDITIONS.find((c) => c.slug === slug)
}
