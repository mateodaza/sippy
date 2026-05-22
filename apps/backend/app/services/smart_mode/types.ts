/**
 * SMART MODE — shared types
 *
 * The classifier returns a structured `SmartClassification`. The dispatcher
 * then either:
 *   • synthesizes a `ParsedCommand` and hands it to `routeCommand` (action)
 *   • sends the `clarifying_question` (ambiguous)
 *   • sends a deterministic capability hint (out_of_scope)
 *   • sends a soft "no te entendí" (gibberish)
 *
 * Invariants enforced here:
 *
 *   1. `intent` is REQUIRED when category ∈ {action, ambiguous} and FORBIDDEN
 *      (must be null) otherwise. Forcing an intent on gibberish/OOS would
 *      fabricate certainty the classifier doesn't actually have.
 *
 *   2. `intent` is a SUBSET of `ParsedCommand.command` — only intents with a
 *      safe slot shape live here. Adding an intent requires:
 *        a) adding the slug to `SMART_INTENT_SLUGS`
 *        b) adding a conditions entry with declared `requiresSlots`
 *        c) ensuring the slot schema can carry every field the existing
 *           ParsedCommand handler reads
 *        d) at least one golden case (clear + missing-slot)
 *
 *   3. SMART MODE never bypasses existing send/confirm guards — the
 *      dispatcher must funnel action outputs through the existing
 *      `routeCommand` chokepoint. Slots are carried via the synthesized
 *      ParsedCommand so force-confirm, threshold checks, self-send guards,
 *      partial-send TTL, and balance checks all apply identically to a
 *      regex-routed message.
 *
 *   4. Slot semantics mirror the existing parser exactly:
 *        • `amount` ⇒ USDC dollars (when user typed "5", "$5", "5 dollars")
 *        • `localAmount` + `localCurrency` ⇒ local-currency amount that
 *          needs FX conversion downstream (when user typed "10 pesos")
 *        • `amount` and `localAmount` are mutually exclusive
 *        • `recipientRaw` is the user-typed recipient (alias resolution
 *          + canonicalization happens downstream)
 */

import { z } from 'zod'

// ── Intent slugs the SMART classifier may return ──────────────────────────
// STRICT SUBSET of ParsedCommand.command. Intents like language/privacy/
// save_contact/delete_contact/list_contacts/withdraw/start/settings/about
// have slot shapes the classifier can't safely produce today, so they stay
// regex-only. Add to this list ONLY after meeting all four conditions in the
// header comment.
export const SMART_INTENT_SLUGS = [
  'send',
  'balance',
  'pay_qr',
  'invite',
  'fund',
  'history',
  'help',
  'greeting',
  'social',
  // dashboard — the web hub at /wallet. Added after the May-17 transcript
  // where users asked "no hay un dashboard?" / "como accedo a mi cuenta?"
  // and got told "no, just check balance here" (the LLM-generated reply
  // had no `dashboard` intent to classify into). No slots needed — just
  // a deep-link action.
  'dashboard',
  // referral_code — Sippy Quest invite code. Added after 2026-05-18
  // transcript where "Mi código de referido ?" classified as settings
  // and "Mi código ?" as about — semantically reasonable LLM guesses
  // because Quest wasn't in the intent vocabulary. Principle: SMART
  // must know about every bot capability or it will keep producing
  // confident-wrong classifications. No slots needed.
  'referral_code',
  // quest_status — user asking about their Sippy Quest standing (entries,
  // rank). Distinct from `referral_code`: status asks "how am I doing",
  // referral_code asks "what's my code". Same no-slots shape.
  'quest_status',
  // ── Phase 2 no-slot intent expansion (2026-05-18) ─────────────────
  // Audit theme: "the bot knows the feature exists but the classifier
  // doesn't know about it, so conversational forms get mis-routed to
  // greeting/about/settings". Adding the regex-only no-slot intents to
  // SMART closes that gap without expanding the slot schema. Intents
  // with required slots (language, privacy, save_contact, delete_contact,
  // confirm, cancel) stay out — they need slot plumbing first.
  'start',
  'settings',
  'about',
  'list_contacts',
  'withdraw',
  // pizza_day — direct question about the Pizza Day Cartagena 2026 event.
  // Added after a real user asked "¿Qué es el pizza day?" and the bot
  // routed to out_of_scope ("no sé de pizza day"). The event is something
  // Sippy *does* know about; we have a dedicated /pizza-day guide.
  // No slots needed — just return the deep-link + a one-line description.
  'pizza_day',
  // poap_code — user asking the bot to re-send the POAP claim link
  // already assigned to their phone (poap_codes.assigned_to_phone). The
  // original DM is the operator-initiated template; this is the
  // user-initiated lookup so they can recover the link if they lost it.
  // No slots needed — handler looks up by phone.
  'poap_code',
] as const

export type SmartIntent = (typeof SMART_INTENT_SLUGS)[number]

const intentEnum = z.enum(SMART_INTENT_SLUGS)

// ── Classification categories ─────────────────────────────────────────────
export const CATEGORIES = ['action', 'ambiguous', 'out_of_scope', 'gibberish'] as const
export type SmartCategory = (typeof CATEGORIES)[number]

const categoryEnum = z.enum(CATEGORIES)

// ── Local-currency code enum — mirrors CURRENTLY supported codes in the
// existing parser's CURRENCY_WORD_MAP. Extending it requires also extending
// the downstream FX path so the new code doesn't fail mid-send.
export const LOCAL_CURRENCY_CODES = [
  'LOCAL', // "pesos" — resolved against sender's country at runtime
  'BRL',
  'PEN',
  'HNL',
  'GTQ',
  'CRC',
  'VES',
  'PYG',
] as const

export type LocalCurrencyCode = (typeof LOCAL_CURRENCY_CODES)[number]

// ── Extracted slots ───────────────────────────────────────────────────────
// Carried into the synthesized ParsedCommand. Field names match what the
// existing `routeCommand` reads so the dispatcher can copy verbatim.
// LLMs commonly emit `null` for absent fields rather than omitting them.
// Treat null and undefined as equivalent for every optional field below,
// so a structured-output model that types `slots: null` doesn't trip the
// schema and force a needless fallback.
const slotsSchema = z
  .object({
    /** USDC amount. Set when user typed "5", "$5", "5 dollars". */
    amount: z.number().positive().nullish(),
    /** Local-currency amount needing downstream FX. Set when user typed
     *  "10 pesos", "20 reais", etc. Mutually exclusive with `amount`. */
    localAmount: z.number().positive().nullish(),
    /** Currency code paired with `localAmount`. Required when `localAmount`
     *  is set, forbidden otherwise. */
    localCurrency: z.enum(LOCAL_CURRENCY_CODES).nullish(),
    /** User-typed recipient (alias, name, phone). Canonicalization happens
     *  downstream — same path as regex sends. */
    recipientRaw: z.string().min(1).nullish(),
  })
  .nullish()
  .superRefine((s, ctx) => {
    if (!s) return
    // Mutually exclusive — amount is USDC, localAmount is the original
    // local-currency number. Both set means the LLM was confused.
    // `.nullish()` allows both null and undefined, so presence checks
    // must cover both — comparing to `null` only would miss `undefined`,
    // and lint's `eqeqeq` rule blocks the `!= null` shorthand.
    if (
      s.amount !== null &&
      s.amount !== undefined &&
      s.localAmount !== null &&
      s.localAmount !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'amount (USDC) and localAmount are mutually exclusive',
        path: ['localAmount'],
      })
    }
    // localAmount requires localCurrency — without the code, downstream FX
    // can't run, and we'd ship a wrong-currency send.
    if (s.localAmount !== null && s.localAmount !== undefined && !s.localCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'localAmount requires localCurrency',
        path: ['localCurrency'],
      })
    }
    // Inverse: localCurrency without localAmount is meaningless
    if (s.localCurrency && (s.localAmount === null || s.localAmount === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'localCurrency requires localAmount',
        path: ['localAmount'],
      })
    }
  })

// ── Detected language (lets the dispatcher pick variant + composer prompt) ─
const detectedLangEnum = z.enum(['en', 'es', 'pt']).nullish()

// ── The full classifier output ────────────────────────────────────────────
export const SmartClassification = z
  .object({
    category: categoryEnum,
    /** Required for action + ambiguous; must be null for out_of_scope/gibberish. */
    intent: intentEnum.nullable(),
    /** LLM-reported confidence. Calibrated post-hoc via evals. */
    confidence: z.number().min(0).max(1),
    /** Free-text reasoning — for logs/debugging only, never user-facing. */
    reasoning: z.string().min(1).max(500),
    /** Populated by the classifier when category === 'ambiguous'. Sanitized
     *  by the dispatcher before sending to the user (no URLs, no money
     *  amounts, no YES/SI tokens). */
    clarifying_question: z.string().min(1).max(160).nullable(),
    /** Populated when category === 'out_of_scope'. Suggest one concrete
     *  capability — dispatcher may override with a hand-picked variant. */
    oos_redirect: z.string().min(1).max(160).nullable(),
    slots: slotsSchema,
    detectedLang: detectedLangEnum,
  })
  .superRefine((data, ctx) => {
    // Invariant 1: intent required for action + ambiguous
    if (['action', 'ambiguous'].includes(data.category) && data.intent === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intent'],
        message: `intent required when category=${data.category}`,
      })
    }
    // Invariant 1 (inverse): intent forbidden for gibberish/OOS
    if (['gibberish', 'out_of_scope'].includes(data.category) && data.intent !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['intent'],
        message: `intent must be null when category=${data.category}`,
      })
    }
    // Ambiguous must include a question to ask
    if (data.category === 'ambiguous' && !data.clarifying_question) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clarifying_question'],
        message: 'clarifying_question required when category=ambiguous',
      })
    }
  })

export type SmartClassification = z.infer<typeof SmartClassification>

// ── Typed fallback ────────────────────────────────────────────────────────
/**
 * Always-same-shape fallback for classifier errors. Treating "classifier
 * failed" identically to "user sent gibberish" means the dispatcher never
 * needs a special error path. The reasoning field tags this so logs can
 * distinguish real low-confidence from a transport failure.
 *
 * Truncates `reason` so a long error string can't trip the 500-char Zod
 * cap and recursively re-fallback.
 */
export function classifierErrorFallback(reason: string): SmartClassification {
  const prefix = 'classifier_error: '
  const maxReasonLen = 500 - prefix.length
  const truncated = reason.length > maxReasonLen ? reason.slice(0, maxReasonLen - 1) + '…' : reason
  return {
    category: 'gibberish',
    intent: null,
    confidence: 0,
    reasoning: `${prefix}${truncated}`,
    clarifying_question: null,
    oos_redirect: null,
    slots: undefined,
    detectedLang: undefined,
  }
}
