/**
 * SMART MODE — golden eval dataset
 *
 * Hand-curated cases the classifier MUST pass. Adding/removing cases changes
 * the bar; the eval runner compares classifier output against `expected*`
 * fields and reports per-case + summary pass rate.
 *
 * Curation rule (lifted from Camello + hive-mind):
 *   "Only add unambiguous items — if a domain expert might hesitate, it
 *   doesn't belong in this cut." Hard cases live in a separate dataset
 *   that's expected to fail until tuned.
 *
 * Each case has a `notes` field explaining what regression it catches.
 * When a case fails in prod, add the failing utterance here (and the
 * correct expected output) so it never regresses again.
 *
 * Priority for Phase 1: Spanish only. EN + PT in Phase 2 once ES is dialed.
 */

import type { LocalCurrencyCode, SmartCategory, SmartIntent } from '../types.js'

export interface GoldenCase {
  id: string
  text: string
  lang: 'en' | 'es' | 'pt'
  expectedCategory: SmartCategory
  /** Required when expectedCategory ∈ {action, ambiguous}. */
  expectedIntent: SmartIntent | null
  /** Minimum confidence we'd accept for a pass on this case. Lower for
   *  ambiguous-by-design (the classifier shouldn't claim certainty when
   *  the case itself is uncertain). */
  minConfidence: number
  /** Expected slots when category=action. Partial — only fields we care
   *  to assert. The classifier may return extras. Currency-amount semantics
   *  mirror the slot schema:
   *    • `amount` ⇒ USDC (e.g. "5 dollars" → amount=5)
   *    • `localAmount` + `localCurrency` ⇒ local currency (e.g. "10 pesos"
   *      → localAmount=10, localCurrency='LOCAL')
   */
  expectedSlots?: {
    amount?: number
    localAmount?: number
    localCurrency?: LocalCurrencyCode
    recipientRaw?: string
  }
  /** Why this case is in the set. Names the regression it catches. */
  notes: string
}

// ──────────────────────────────────────────────────────────────────────────
// action_clear — the happy path. High confidence required.
// ──────────────────────────────────────────────────────────────────────────

const ACTION_CASES: GoldenCase[] = [
  {
    id: 'send-01',
    text: 'envía 5 a mateo',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'send',
    minConfidence: 0.85,
    expectedSlots: { amount: 5, recipientRaw: 'mateo' },
    notes: 'baseline send — verb + amount + alias',
  },
  {
    id: 'send-02',
    text: 'mándale 3 dólares a carolina',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'send',
    minConfidence: 0.85,
    expectedSlots: { amount: 3, recipientRaw: 'carolina' },
    notes: 'imperative dative ("mándale") + currency word — must not invent localCurrency=USD',
  },
  {
    id: 'send-03',
    text: 'paga 5 a +573001234567',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'send',
    minConfidence: 0.85,
    expectedSlots: { amount: 5, recipientRaw: '+573001234567' },
    notes: 'phone-number recipient — should preserve "+" prefix in recipientRaw',
  },
  {
    id: 'send-04',
    text: 'enviar 10 pesos a mi mamá',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'send',
    minConfidence: 0.85,
    // Local-currency send: `localAmount` + `localCurrency`, NOT `amount`.
    // Mirrors the existing parser shape; the FX step runs downstream and
    // populates `amount` (USDC) before the send executes. Mixing the two
    // (amount=10 + localCurrency='LOCAL') would ship a 10-USDC send to
    // someone who asked for 10 pesos.
    expectedSlots: { localAmount: 10, localCurrency: 'LOCAL', recipientRaw: 'mi mamá' },
    notes: 'local-currency send — classifier surfaces localAmount+localCurrency for downstream FX',
  },
  {
    id: 'balance-01',
    text: 'mi saldo',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'balance',
    minConfidence: 0.9,
    notes: 'baseline balance — no slots needed',
  },
  {
    id: 'balance-02',
    text: 'cuánto tengo en sippy?',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'balance',
    minConfidence: 0.85,
    notes: 'natural-language balance ask — regex misses this',
  },
  {
    id: 'pay_qr-01',
    text: 'mi qr',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'pay_qr',
    minConfidence: 0.85,
    notes: 'shortest pay-QR ask — must NOT classify as greeting',
  },
  {
    id: 'pay_qr-02',
    text: 'cómo me pagan?',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'pay_qr',
    minConfidence: 0.8,
    notes: 'pay-QR by user-intent phrasing — common Pizza Day vendor question',
  },
  {
    id: 'invite-01',
    text: 'invita a +573009998888',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'invite',
    minConfidence: 0.85,
    expectedSlots: { recipientRaw: '+573009998888' },
    notes: 'baseline invite',
  },
  {
    id: 'fund-01',
    text: 'cómo agrego saldo?',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'fund',
    minConfidence: 0.8,
    notes: 'fund — must NOT route to balance (the word saldo is misleading)',
  },
  {
    id: 'history-01',
    text: 'enséñame mis transacciones',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'history',
    minConfidence: 0.85,
    notes: 'history — natural language form',
  },
  {
    id: 'help-01',
    text: 'qué puedes hacer?',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'help',
    minConfidence: 0.85,
    notes: 'capability inquiry — help vs about distinction',
  },
  {
    id: 'greeting-01',
    text: 'hola',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'greeting',
    minConfidence: 0.9,
    notes: 'bare greeting — should NOT be classified as gibberish',
  },
  {
    id: 'social-01',
    text: 'gracias',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'social',
    minConfidence: 0.9,
    notes: 'baseline thanks',
  },
]

// ──────────────────────────────────────────────────────────────────────────
// ambiguous — missing slots / multiple plausible intents.
// `intent` IS required here (we know what they want, just not enough to act).
// Lower confidence is OK; we're scoring on the right category + clarifier.
// ──────────────────────────────────────────────────────────────────────────

const AMBIGUOUS_CASES: GoldenCase[] = [
  {
    id: 'send-ambig-01',
    text: 'enviar a mateo',
    lang: 'es',
    expectedCategory: 'ambiguous',
    expectedIntent: 'send',
    minConfidence: 0.5,
    expectedSlots: { recipientRaw: 'mateo' },
    notes: 'send with recipient but no amount — must ask "¿cuánto?", not invent an amount',
  },
  {
    id: 'send-ambig-02',
    text: '5 a mateo',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'send',
    minConfidence: 0.7,
    expectedSlots: { amount: 5, recipientRaw: 'mateo' },
    notes:
      'verb dropped — deliberate global behavior: "<number> a <recipient>" parses as send ' +
      'regardless of prior turns. Runner passes no context; classifier should handle this from ' +
      'the message alone.',
  },
  {
    id: 'send-ambig-03',
    text: 'pásame 10',
    lang: 'es',
    expectedCategory: 'ambiguous',
    expectedIntent: 'send',
    minConfidence: 0.5,
    expectedSlots: { amount: 10 },
    notes: 'send with amount but no recipient — must ask "¿a quién?"',
  },
  {
    id: 'send-ambig-04',
    text: 'quiero mandar plata',
    lang: 'es',
    expectedCategory: 'ambiguous',
    expectedIntent: 'send',
    minConfidence: 0.5,
    notes: 'send intent with no slots — must ask amount AND recipient (or one then the other)',
  },
  {
    id: 'fund-vs-balance-01',
    text: 'saldo',
    lang: 'es',
    expectedCategory: 'action',
    expectedIntent: 'balance',
    minConfidence: 0.9,
    notes: 'classic ambiguity to AVOID — "saldo" alone is balance, NOT fund',
  },
  {
    id: 'invite-ambig-01',
    text: 'quiero invitar a alguien',
    lang: 'es',
    expectedCategory: 'ambiguous',
    expectedIntent: 'invite',
    minConfidence: 0.5,
    notes:
      'invite intent with no recipient — must ask for the number, NOT execute an empty invite. ' +
      'Validator should downgrade to ambiguous when recipientRaw missing.',
  },
]

// ──────────────────────────────────────────────────────────────────────────
// out_of_scope — user asked something Sippy can't do. Intent must be null.
// ──────────────────────────────────────────────────────────────────────────

const OUT_OF_SCOPE_CASES: GoldenCase[] = [
  {
    id: 'oos-01',
    text: 'qué es bitcoin?',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.6,
    notes: 'crypto-101 question — must redirect, NOT try to send 1 BTC',
  },
  {
    id: 'oos-02',
    text: 'puedes pedirme un uber?',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'unrelated service request — common LATAM bot-user assumption',
  },
  {
    id: 'oos-03',
    text: 'cuál es el clima hoy?',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'weather — must NOT route to anything financial',
  },
  {
    id: 'oos-04',
    text: 'recomienda un restaurante',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'recommendation request — generic LLM-bait',
  },
  {
    id: 'oos-05',
    text: 'cuándo es el próximo evento de cartagena onchain?',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.6,
    notes: "Pizza-Day-adjacent question — Sippy isn't the event organizer",
  },
  {
    // Shadow guard for the `dashboard` intent. The loose regex in
    // `message_parser.ts` is end-anchored to avoid matching "mi cuenta"
    // mid-sentence; this golden case ensures the SMART classifier also
    // doesn't fall for it. If a future prompt tweak starts routing this
    // to dashboard (because of the "cuenta" keyword overlap), the eval
    // catches it before users see "Tu dashboard: ..." for a question
    // about their bank account.
    id: 'oos-06',
    text: 'cuál es mi cuenta de banco',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.6,
    notes: 'shadow guard for dashboard intent — bank account is not the Sippy hub',
  },
  {
    id: 'oos-07',
    text: 'cuál es mi cuenta de gmail',
    lang: 'es',
    expectedCategory: 'out_of_scope',
    expectedIntent: null,
    minConfidence: 0.6,
    notes: 'shadow guard for dashboard intent — external account, not Sippy',
  },
]

// ──────────────────────────────────────────────────────────────────────────
// gibberish — typos, accidents, random text. Intent must be null.
// ──────────────────────────────────────────────────────────────────────────

const GIBBERISH_CASES: GoldenCase[] = [
  {
    id: 'gib-01',
    text: 'asdfgh',
    lang: 'es',
    expectedCategory: 'gibberish',
    expectedIntent: null,
    minConfidence: 0.8,
    notes: 'keyboard mash',
  },
  {
    id: 'gib-02',
    text: 'aaaaaaaaaa',
    lang: 'es',
    expectedCategory: 'gibberish',
    expectedIntent: null,
    minConfidence: 0.8,
    notes: 'repeat-key accident — autocorrect or stuck key',
  },
  {
    id: 'gib-03',
    text: '🤔🤔🤔',
    lang: 'es',
    expectedCategory: 'gibberish',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'emoji-only message',
  },
  {
    id: 'gib-04',
    text: '...',
    lang: 'es',
    expectedCategory: 'gibberish',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'punctuation-only',
  },
  {
    id: 'gib-05',
    text: 'lkjhg qwerty',
    lang: 'es',
    expectedCategory: 'gibberish',
    expectedIntent: null,
    minConfidence: 0.7,
    notes: 'two keyboard mashes — should not be fooled into action',
  },
]

export const GOLDEN_DATASET: GoldenCase[] = [
  ...ACTION_CASES,
  ...AMBIGUOUS_CASES,
  ...OUT_OF_SCOPE_CASES,
  ...GIBBERISH_CASES,
]

/** Lookup by id for the eval runner. */
export function getGoldenCase(id: string): GoldenCase | undefined {
  return GOLDEN_DATASET.find((c) => c.id === id)
}
