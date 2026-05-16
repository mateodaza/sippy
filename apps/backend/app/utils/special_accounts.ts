/**
 * Special account identification — vendor / exchange phones.
 *
 * Reads `PIZZA_DAY_VENDOR_PHONES` and `PIZZA_DAY_EXCHANGE_PHONES` from env
 * (comma-separated E.164) and exposes:
 *
 *   isVendorPhone(phone)       — true if `phone` is in PIZZA_DAY_VENDOR_PHONES
 *   isExchangePhone(phone)     — true if `phone` is in PIZZA_DAY_EXCHANGE_PHONES
 *   getQuestExcludedPhones()   — union, for SQL `recipient NOT IN (...)` style filters
 *
 * Why env vars instead of a DB column: at Pizza Day scale (4–5 known phones)
 * the originally-spec'd `user_preferences.account_type` migration is overkill.
 * Revisit when we have multiple events. Spec: QR_SYSTEM_SPEC.md "Locked
 * decision #1 — Vendor/exchange identification by env-supplied phone list".
 *
 * Phones are canonicalized to E.164 on both sides of the comparison so a
 * caller passing bare digits or whitespace still matches an env entry written
 * as `+57 300 ...`. Malformed env entries are silently dropped (never throw —
 * a typo in an env var should not crash the bot).
 */

import logger from '@adonisjs/core/services/logger'
import { canonicalizePhone } from '#utils/phone'

const VENDOR_ENV = 'PIZZA_DAY_VENDOR_PHONES'
const EXCHANGE_ENV = 'PIZZA_DAY_EXCHANGE_PHONES'

/**
 * Parse a comma-separated phone list from env. Drops entries that don't
 * canonicalize. Logger.warn fires when entries are rejected so a typo in
 * Railway settings is visible at boot time without crashing the service.
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
 * True when `phone` matches an entry in `PIZZA_DAY_VENDOR_PHONES`.
 * Returns false for null/empty/unparseable input — never throws.
 */
export function isVendorPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const c = canonicalizePhone(phone)
  if (!c) return false
  return parsePhoneList(VENDOR_ENV).has(c)
}

/**
 * True when `phone` matches an entry in `PIZZA_DAY_EXCHANGE_PHONES`.
 * Returns false for null/empty/unparseable input — never throws.
 */
export function isExchangePhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const c = canonicalizePhone(phone)
  if (!c) return false
  return parsePhoneList(EXCHANGE_ENV).has(c)
}

/**
 * Union of vendor + exchange phones, canonical E.164, deduped.
 * Fed into Quest SQL via a TEXT[] bind: `WHERE recipient_phone <> ALL(:excl)`.
 * Returns an empty array when both env vars are unset — Quest still runs,
 * just doesn't exclude anyone.
 */
export function getQuestExcludedPhones(): string[] {
  const merged = new Set<string>([...parsePhoneList(VENDOR_ENV), ...parsePhoneList(EXCHANGE_ENV)])
  return Array.from(merged)
}
