/**
 * Special account identification — Quest exclusion list.
 *
 * Quest leaderboard scoring excludes transactions where the recipient is a
 * known merchant (so vendors don't show up as top "connectors") or an
 * exchange staff phone (cash-for-USDC at the venue would otherwise top the
 * leaderboard).
 *
 * Two sources, two semantics:
 *
 *   - **Merchant exclusion** derives from `qr_links` — anyone with an active
 *     `kind='pay'` link is a merchant. Issuance IS the declaration; no env
 *     list to keep in sync. Aligns with the rest of the payment path
 *     (bracket dispatcher, webhook send branch) which already treats
 *     pay-QR scans as merchant payments.
 *
 *   - **Exchange exclusion** stays env-based (`PIZZA_DAY_EXCHANGE_PHONES`).
 *     Exchanges are a Pizza Day operational concept (staffed cash booths),
 *     not a Sippy product surface — they don't get pay-QRs, so there's no
 *     onchain artifact to derive from.
 *
 * Phones are canonicalized to E.164 on both sides of the comparison so a
 * caller passing bare digits or whitespace still matches an env entry
 * written as `+57 300 ...`. Malformed env entries are silently dropped
 * (with logger.warn) — never throw on a typo in Railway settings.
 */

import logger from '@adonisjs/core/services/logger'
import { canonicalizePhone } from '#utils/phone'
import { query } from '#services/db'

const EXCHANGE_ENV = 'PIZZA_DAY_EXCHANGE_PHONES'

/**
 * Parse a comma-separated phone list from env. Drops entries that don't
 * canonicalize. logger.warn fires when entries are rejected so a typo in
 * Railway settings shows up in logs (not at boot — these are read lazily
 * per call; boot-time visibility is a follow-up).
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
 * Kept env-based because exchanges have no pay-QR (operator staffing only).
 *
 * TODO(quest-leaderboard): no production callers yet — wired up by the Quest
 * scoring code when it ships. Delete if leaderboard ends up consuming
 * getQuestExcludedPhones directly and never needs the per-phone check.
 */
export function isExchangePhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const c = canonicalizePhone(phone)
  if (!c) return false
  return parsePhoneList(EXCHANGE_ENV).has(c)
}

/**
 * Return the canonical phones for all active merchants — anyone who owns an
 * active `kind='pay'` QR link.
 *
 * Pure DB read; on failure returns an empty set and logs (the caller is
 * Quest scoring — observability, not a critical write path).
 */
async function getMerchantPhones(): Promise<Set<string>> {
  try {
    const result = await query<{ owner_phone_number: string }>(
      `SELECT DISTINCT owner_phone_number
         FROM qr_links
        WHERE kind = 'pay' AND status = 'active'`
    )
    const canonical = new Set<string>()
    for (const row of result.rows) {
      const c = canonicalizePhone(row.owner_phone_number)
      if (c) canonical.add(c)
    }
    return canonical
  } catch (err) {
    // logger.error (not warn) because this is an event-day-visible failure:
    // when the merchant query fails, Quest exclusion silently becomes
    // exchange-only and vendors show up at the top of the leaderboard.
    // Show up in default log filters so ops sees the spike.
    logger.error({ err }, 'getMerchantPhones failed — Quest exclusion degraded to exchange-only')
    return new Set()
  }
}

/**
 * Union of active merchant phones (from `qr_links` issuance) + exchange env.
 * Fed into Quest SQL via a TEXT[] bind: `WHERE recipient_phone <> ALL(:excl)`.
 *
 * Async because the merchant set is a DB read. Returns canonical E.164,
 * deduped. Returns an empty array if neither source has anything — Quest
 * still runs, just doesn't exclude anyone.
 */
export async function getQuestExcludedPhones(): Promise<string[]> {
  const [merchants, exchange] = await Promise.all([
    getMerchantPhones(),
    Promise.resolve(parsePhoneList(EXCHANGE_ENV)),
  ])
  const merged = new Set<string>([...merchants, ...exchange])
  return Array.from(merged)
}
