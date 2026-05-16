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
 * Spanish dialect (co/mx/ar/ve) layers extra dialect-flavored entries on
 * top of the neutral pool, matching the pattern already in
 * `formatUnknownCommandMessage`. Other languages get a single pool.
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

const OOS_BASE: Record<Lang, string[]> = {
  en: [
    `Not my area — I handle money. You can check your balance, send, or see your history.`,
    `That's outside what I do. Try "balance" or "send 5 to ..." to get started.`,
    `I don't handle that one. But I can show your balance, send money, or list your transfers.`,
    `Outside my scope. Say "help" to see what I actually do.`,
  ],
  es: [
    `No es lo mio — yo manejo plata. Puedes ver tu saldo, enviar, o ver tu historial.`,
    `Eso esta fuera de lo que hago. Prueba "saldo" o "envia 5 a ..." para empezar.`,
    `No manejo eso. Pero te puedo mostrar el saldo, enviar, o listar tus transferencias.`,
    `Fuera de mi area. Di "ayuda" para ver lo que si hago.`,
  ],
  pt: [
    `Nao e minha area — eu cuido de dinheiro. Pode ver seu saldo, enviar, ou ver seu historico.`,
    `Isso esta fora do que faco. Tenta "saldo" ou "envia 5 pra ..." pra comecar.`,
    `Nao lido com isso. Mas posso mostrar seu saldo, enviar, ou listar suas transferencias.`,
    `Fora do meu escopo. Diz "ajuda" pra ver o que eu faco.`,
  ],
}

const GIBBERISH_BASE: Record<Lang, string[]> = {
  en: [
    `Hmm, didn't catch that. You can say "balance", "send", or "help".`,
    `Not sure I follow — try "balance" or "help" to see what I do.`,
    `Couldn't parse that one. "help" shows what I can do for you.`,
    `Not sure what you mean. Try "balance" or "send 5 to <name>".`,
  ],
  es: [
    `Hmm, no te entendi. Puedes decir "saldo", "enviar", o "ayuda".`,
    `No te sigo — prueba "saldo" o "ayuda" para ver lo que hago.`,
    `No pude leer eso. "ayuda" te muestra lo que puedo hacer.`,
    `No estoy seguro de lo que dices. Prueba "saldo" o "envia 5 a <nombre>".`,
  ],
  pt: [
    `Hmm, nao entendi. Pode dizer "saldo", "enviar", ou "ajuda".`,
    `Nao te sigo — tenta "saldo" ou "ajuda" pra ver o que faco.`,
    `Nao consegui ler isso. "ajuda" mostra o que posso fazer.`,
    `Nao tenho certeza do que dizes. Tenta "saldo" ou "envia 5 pra <nome>".`,
  ],
}

// Spanish dialect extras — appended to the neutral pool to widen variety
// AND give regional users phrasing that feels native (plata vs dinero,
// vos vs tu, etc.). Mirrors the dialect logic in
// `formatUnknownCommandMessage` (messages.ts:863-871).
const OOS_ES_DIALECT: Partial<Record<Dialect, string[]>> = {
  co: [
    `No es lo mio, parce — pero te puedo mostrar el saldo o enviar plata.`,
    `Eso no lo manejo. Probemos con "saldo" o "envia 5 a ...".`,
  ],
  mx: [
    `No es lo mio — pero te puedo mostrar el saldo o enviar dinero.`,
    `Eso no lo hago. Probemos con "saldo" o "envia 5 a ...".`,
  ],
  ar: [
    `No es lo mio — pero te puedo mostrar el saldo o enviar plata.`,
    `Eso no lo manejo. Probemos con "saldo" o "envia 5 a ...".`,
  ],
  ve: [
    `No es lo mio — pero te puedo mostrar el saldo o enviar plata.`,
    `Eso no lo manejo. Probemos con "saldo" o "envia 5 a ...".`,
  ],
}

const GIBBERISH_ES_DIALECT: Partial<Record<Dialect, string[]>> = {
  co: [
    `No te entendi, parce. Di "saldo" para ver cuanta plata tienes.`,
    `No pille la idea. Probemos: "saldo", "enviar", o "ayuda".`,
  ],
  mx: [
    `No te entendi. Di "saldo" para ver cuanto dinero tienes.`,
    `No me cuadra. Probemos: "saldo", "enviar", o "ayuda".`,
  ],
  ar: [
    `No te entendi. Deci "saldo" para ver cuanta plata tenes.`,
    `No me cierra. Probemos: "saldo", "enviar", o "ayuda".`,
  ],
  ve: [
    `No te entendi. Di "saldo" para ver cuanta plata tienes.`,
    `No me cuadra. Probemos: "saldo", "enviar", o "ayuda".`,
  ],
}

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
