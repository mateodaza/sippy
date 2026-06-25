/**
 * Special account identification — Quest exclusion list.
 *
 * Quest leaderboard scoring excludes exchange-staff phones (cash-for-USDC
 * booth operators at the venue) so their tx volume doesn't dominate the
 * social leaderboard. Read from `PIZZA_DAY_EXCHANGE_PHONES` env, comma-
 * separated E.164.
 *
 * **Merchant exclusion is intentionally NOT derived from `qr_links` anymore.**
 * Earlier we shipped a `kind='pay'` → merchant inference, but pay-QRs are
 * now universal — any user (vendor OR individual) can mint one for receiving
 * payments. Treating every pay-QR owner as a merchant would silently exclude
 * personal-pay-QR users from the Quest leaderboard.
 *
 * When real vendor mode lands (a `user_preferences.is_merchant` toggle, or
 * a `qr_links.is_merchant` per-link flag), wire that signal into the union
 * here. Until then, exchange-only exclusion is correct.
 *
 * Phones are canonicalized to E.164 on both sides of the comparison so an
 * env entry written as `+57 300 ...` still matches a canonical-form lookup.
 * Malformed env entries are silently dropped (with logger.warn) — never
 * throw on a typo in Railway settings.
 */

import logger from '@adonisjs/core/services/logger'
import { canonicalizePhone } from '#utils/phone'

const EXCHANGE_ENV = 'PIZZA_DAY_EXCHANGE_PHONES'

/**
 * Parse a comma-separated phone list from env. Drops entries that don't
 * canonicalize. logger.warn fires when entries are rejected so a typo in
 * Railway settings shows up in logs.
 */
function parsePhoneList(envVarName: string): Set<string> {
  const raw = process.env[envVarName]
  if (!raw) return new Set()

  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const canonical = new Set<string>()
  const rejected: string[] = []

  for (const entry of entries) {
    const c = canonicalizePhone(entry)
    if (c) canonical.add(c)
    else rejected.push(entry)
  }

  if (rejected.length > 0) {
    logger.warn(
      `${envVarName}: dropped ${rejected.length} unparseable entr${rejected.length === 1 ? 'y' : 'ies'}: ${rejected.join(', ')}`
    )
  }

  return canonical
}

/**
 * True when `phone` matches an entry in `PIZZA_DAY_EXCHANGE_PHONES`.
 * Returns false for null/empty/unparseable input — never throws.
 *
 * TODO(quest-leaderboard): no production callers yet — wired up when the
 * Quest scoring code ships. Delete if the leaderboard ends up consuming
 * `getQuestExcludedPhones` directly and never needs the per-phone check.
 */
export function isExchangePhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const c = canonicalizePhone(phone)
  if (!c) return false
  return parsePhoneList(EXCHANGE_ENV).has(c)
}

/**
 * Returns the canonical phones to exclude from Quest scoring.
 *
 * Currently exchange-only. When vendor mode lands, UNION a merchant-phone
 * source here (`user_preferences.is_merchant` or similar) so businesses
 * don't show up as top "connectors" on the social leaderboard.
 */
export async function getQuestExcludedPhones(): Promise<string[]> {
  return Array.from(parsePhoneList(EXCHANGE_ENV))
}
