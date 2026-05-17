/**
 * SMART MODE — unknown-command variant selector
 *
 * Phase 1 of "don't sound robotic": the deterministic floor under the
 * existing LLM-driven reply path. When `routeCommand`'s unknown handler
 * reaches its static fallback (no helpfulMessage, no validated LLM reply),
 * this module picks one of N curated variants instead of the single
 * canned `formatUnknownCommandMessage`.
 *
 * Two categories — matching SMART's verdict shape:
 *   • out_of_scope — input is intelligible but outside Sippy's product
 *                    surface (e.g., weather, news). Variants redirect
 *                    toward what Sippy DOES handle.
 *   • gibberish    — input is unparseable/typo. Variants nudge the user
 *                    toward `help` / a canonical phrasing.
 *
 * When SMART provides an `oosRedirect` (sanitizer-cleared, OOS only), it
 * wins over the static table — the LLM tailored it to the input, so it's
 * almost always more useful than a generic redirect. Gibberish never
 * carries oosRedirect (classifier schema invariant).
 *
 * State-aware selection uses a stable djb2 hash of the user's text so:
 *   • Different inputs see different variants (variety in real use).
 *   • The same exact retry sees the same variant (no flicker on resend).
 *   • Selection is deterministic — testable without seeding randomness.
 *
 * Spanish stays neutral across LATAM dialects on purpose: regional slang
 * particles (parce, pille, etc.) felt off in field testing on 2026-05-17,
 * so the dialect-widening pools were removed. `dialect` is still accepted
 * in the API so callers don't break, but it's currently ignored. If a
 * future revisit adds back regional flavor, mirror the SUBTLE pattern in
 * `formatUnknownCommandMessage` (vocab swaps like plata/dinero, not slang).
 *
 * Pure module: no DB, no clock, no I/O.
 */

import type { Lang } from '#utils/messages'
import type { Dialect } from '#utils/dialect'

export type UnknownCategory = 'out_of_scope' | 'gibberish'

// ── Variant tables ──────────────────────────────────────────────────────
// Phrasing rules (mirror the existing static copy in messages.ts):
//   • No emojis.
//   • Conversational, lowercase-leaning, no AI-sounding patterns.
//   • Each variant should redirect to a Sippy capability (balance / send /
//     help) so users always know what to try next.

// Tone rules (mirror prompt.ts OOS guidance so static fallbacks don't
// regress when the LLM redirect can't be sanitized):
//   • Acknowledge briefly, then offer 1–2 capabilities.
//   • Conversational, lowercase-leaning, no em-dashes (the LLM tends to
//     copy them from examples; consistency across paths matters).
//   • End with a soft question or offer when natural.
//   • No emojis, no slang particles, no AI cliches.

const OOS_BASE: Record<Lang, string[]> = {
  en: [
    `Hmm, that's not really my thing. I can show your balance or help you send. Which one?`,
    `Not my area, but I can help with money stuff. Want to check your balance or send?`,
    `That one's outside what I do. Want to see your balance, or maybe send some money?`,
    `Can't help with that, but money I can do. Try "balance" or tell me who you want to send to.`,
  ],
  es: [
    `Hmm, eso no es lo mio. Puedo mostrarte tu saldo o ayudarte a enviar. ¿Cual prefieres?`,
    `No es lo mio, pero con plata si te ayudo. ¿Quieres ver tu saldo o enviarle a alguien?`,
    `Eso esta fuera de lo mio. Pero te puedo mostrar el saldo o ayudarte a mandar plata.`,
    `No manejo eso, pero si quieres revisar tu saldo o mandar algo, ahi te ayudo.`,
  ],
  pt: [
    `Hmm, isso nao e bem o que eu faco. Posso mostrar seu saldo ou te ajudar a enviar. Qual prefere?`,
    `Nao e minha area, mas com dinheiro eu ajudo. Quer ver seu saldo ou enviar pra alguem?`,
    `Isso esta fora do que eu faco. Mas posso mostrar seu saldo ou te ajudar a mandar dinheiro.`,
    `Nao lido com isso, mas se quiser ver seu saldo ou enviar algo, te ajudo.`,
  ],
}

const GIBBERISH_BASE: Record<Lang, string[]> = {
  en: [
    `Hmm, didn't quite catch that. Want to check your balance or send to someone?`,
    `Not sure what you mean. Try "balance" or tell me who you want to pay.`,
    `Couldn't parse that one. If you want a hand, say "help" or just tell me what you need.`,
    `That one threw me off. Want to see your balance, or send some money?`,
  ],
  es: [
    `Hmm, no te capto. ¿Quieres ver tu saldo o enviarle a alguien?`,
    `No estoy seguro de lo que dices. Prueba "saldo" o cuentame que necesitas.`,
    `No te entendi bien. Si quieres, te muestro el saldo o te ayudo a mandar plata.`,
    `Eso no lo descifro. Dime "ayuda" o cuentame que quieres hacer.`,
  ],
  pt: [
    `Hmm, nao captei. Quer ver seu saldo ou enviar pra alguem?`,
    `Nao tenho certeza do que voce disse. Tenta "saldo" ou me conta o que precisa.`,
    `Nao entendi direito. Se quiser, te mostro o saldo ou te ajudo a mandar dinheiro.`,
    `Isso eu nao decifrei. Diz "ajuda" ou me conta o que voce quer fazer.`,
  ],
}

// Dialect-flavored pools intentionally empty — see module header for the
// rationale. Kept as named exports so the `getVariantPool` shape (and the
// `__testing` export the spec uses) stays stable for any future revisit.
const OOS_ES_DIALECT: Partial<Record<Dialect, string[]>> = {}
const GIBBERISH_ES_DIALECT: Partial<Record<Dialect, string[]>> = {}

// ── Selector ────────────────────────────────────────────────────────────

export interface SelectVariantArgs {
  lang: Lang
  category: UnknownCategory
  /** User's inbound text — drives stable variant selection via hash. */
  text: string
  /** Regional dialect — widens the ES pool with native-flavored entries. */
  dialect?: Dialect
  /** Sanitizer-cleared OOS hint from SMART. Wins over static table when
   *  present AND category is out_of_scope. Ignored for gibberish (the
   *  classifier schema forbids oosRedirect on gibberish). */
  oosRedirect?: string | null
}

/**
 * Pick a variant deterministically from the lang/category/dialect pool.
 * Returns a non-empty string — pools are guaranteed non-empty at module
 * load (constant tables above).
 */
export function selectUnknownVariant(args: SelectVariantArgs): string {
  // SMART's tailored hint wins for OOS. The dispatcher already ran
  // `sanitizeOosRedirect` so we don't re-check length/format here.
  if (args.category === 'out_of_scope' && args.oosRedirect) {
    return args.oosRedirect
  }

  const pool = getVariantPool(args.category, args.lang, args.dialect)
  // Pools are constant-time, never empty by construction. Defensive
  // fall-back kept off the hot path: any future edit that empties a row
  // would surface in tests before reaching this branch.
  if (pool.length === 0) {
    return args.category === 'out_of_scope' ? OOS_BASE[args.lang][0] : GIBBERISH_BASE[args.lang][0]
  }
  const idx = hashIndex(args.text, pool.length)
  return pool[idx]
}

/**
 * Build the variant pool for a given (category, lang, dialect). Neutral
 * pool always present; dialect-flavored entries appended for ES + known
 * dialect so regional users see both styles. Other langs ignore dialect.
 */
function getVariantPool(
  category: UnknownCategory,
  lang: Lang,
  dialect: Dialect | undefined
): string[] {
  const base = category === 'out_of_scope' ? OOS_BASE[lang] : GIBBERISH_BASE[lang]
  if (lang !== 'es' || !dialect || dialect === 'neutral') return base
  const extras =
    (category === 'out_of_scope' ? OOS_ES_DIALECT : GIBBERISH_ES_DIALECT)[dialect] ?? []
  return extras.length > 0 ? [...base, ...extras] : base
}

/**
 * djb2 hash → bounded index. Deterministic, distribution-flat enough for
 * 4–6 buckets, and dependency-free. Negation handled because XOR can
 * overflow into the sign bit on V8.
 */
function hashIndex(text: string, n: number): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i)
  }
  return Math.abs(h | 0) % n
}

/** Exposed for tests — assert variant pool invariants without re-deriving. */
export const __testing = {
  OOS_BASE,
  GIBBERISH_BASE,
  OOS_ES_DIALECT,
  GIBBERISH_ES_DIALECT,
  getVariantPool,
  hashIndex,
}
