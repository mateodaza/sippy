/**
 * Contact Service — Address Book
 *
 * Manages user contacts (aliases for phone numbers).
 * All operations are scoped to the owner's phone number.
 * No data is ever passed to the LLM — this is a pure DB service.
 */

import { query } from '#services/db'
import { canonicalizePhone } from '#utils/phone'
import { sanitizeAlias, normalizeAlias } from '#utils/contact_sanitizer'

export type ContactSource = 'command' | 'vcard'

export type SaveContactError =
  | 'invalid_alias'
  | 'invalid_phone'
  | 'self_contact'
  | 'overwrite_conflict'
  | 'limit_reached'
  | 'not_found'

export interface SavedContact {
  alias: string
  aliasDisplay: string
  targetPhone: string
  source: ContactSource
}

export async function saveContact(
  ownerPhone: string,
  rawAlias: string,
  rawTargetPhone: string,
  source: ContactSource = 'command'
): Promise<
  | { success: true; alias: string; phone: string }
  | { success: false; error: 'overwrite_conflict'; existingPhone: string }
  | { success: false; error: Exclude<SaveContactError, 'overwrite_conflict' | 'not_found'> }
> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return { success: false, error: 'invalid_alias' }

  const targetPhone = canonicalizePhone(rawTargetPhone)
  if (!targetPhone) return { success: false, error: 'invalid_phone' }

  // Self-save protection
  const ownerDigits = ownerPhone.replace(/\D/g, '')
  const targetDigits = targetPhone.replace(/\D/g, '')
  if (ownerDigits === targetDigits) return { success: false, error: 'self_contact' }

  const normalized = normalizeAlias(alias)

  // Check if alias already exists (update vs create)
  const existing = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalized]
  )

  if (existing.rows.length > 0) {
    const oldPhone = existing.rows[0].target_phone
    const newDigits = targetPhone.replace(/\D/g, '')
    const oldDigits = oldPhone.replace(/\D/g, '')

    if (oldDigits === newDigits) {
      // Same phone — no-op, treat as success
      return { success: true, alias, phone: targetPhone }
    }

    // Different phone — require confirmation (caller must handle this)
    return { success: false, error: 'overwrite_conflict', existingPhone: oldPhone }
  }

  // Insert new contact. The DB trigger `trg_contact_limit` enforces the
  // 50-contact cap with row locking. Not perfectly race-proof for the first
  // insert (no rows to lock), but WhatsApp rate limiting (10 msgs/min)
  // makes concurrent first-contact races unrealistic in practice.
  // UNIQUE(owner_phone, alias) prevents duplicate aliases.
  try {
    await query(
      `INSERT INTO user_contacts (owner_phone, alias, alias_display, target_phone, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (owner_phone, alias) DO NOTHING`,
      [ownerPhone, normalized, alias, targetPhone, source]
    )
  } catch (err: unknown) {
    // The DB trigger raises 'contact_limit_exceeded' when at cap
    if (err instanceof Error && err.message.includes('contact_limit_exceeded')) {
      return { success: false, error: 'limit_reached' }
    }
    throw err
  }

  // Read back the actual DB state to handle concurrent races correctly.
  // If another request won the alias with a different phone, we return
  // what's actually stored — never lie about what the alias points to.
  const actual = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalized]
  )

  if (actual.rows.length === 0) {
    // ON CONFLICT DO NOTHING + no row = shouldn't happen, but defensive
    return { success: false, error: 'limit_reached' }
  }

  // Verify the stored phone matches what the caller intended.
  // If a concurrent request won the alias with a different phone, surface a conflict
  // instead of silently returning the wrong phone.
  const actualPhone = actual.rows[0].target_phone
  const actualDigits = actualPhone.replace(/\D/g, '')
  if (actualDigits !== targetDigits) {
    return { success: false, error: 'overwrite_conflict', existingPhone: actualPhone }
  }

  return { success: true, alias, phone: actualPhone }
}

/**
 * Force-update an existing alias to a new phone (after user confirms overwrite).
 */
export async function updateContact(
  ownerPhone: string,
  rawAlias: string,
  rawTargetPhone: string,
  source: ContactSource = 'command'
): Promise<
  { success: true; alias: string; phone: string } | { success: false; error: SaveContactError }
> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return { success: false, error: 'invalid_alias' }

  const targetPhone = canonicalizePhone(rawTargetPhone)
  if (!targetPhone) return { success: false, error: 'invalid_phone' }

  // Self-save protection (same guard as saveContact)
  const ownerDigits = ownerPhone.replace(/\D/g, '')
  const targetDigits = targetPhone.replace(/\D/g, '')
  if (ownerDigits === targetDigits) return { success: false, error: 'self_contact' }

  const result = await query(
    `UPDATE user_contacts SET target_phone = $3, alias_display = $4, source = $5
     WHERE owner_phone = $1 AND alias = $2`,
    [ownerPhone, normalizeAlias(alias), targetPhone, alias, source]
  )

  if ((result.rowCount ?? 0) === 0) {
    return { success: false, error: 'not_found' }
  }

  return { success: true, alias, phone: targetPhone }
}

export async function deleteContact(ownerPhone: string, rawAlias: string): Promise<boolean> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return false

  const result = await query('DELETE FROM user_contacts WHERE owner_phone = $1 AND alias = $2', [
    ownerPhone,
    normalizeAlias(alias),
  ])
  return (result.rowCount ?? 0) > 0
}

export async function listContacts(ownerPhone: string): Promise<SavedContact[]> {
  const result = await query<SavedContact>(
    `SELECT alias, alias_display AS "aliasDisplay", target_phone AS "targetPhone", source
     FROM user_contacts
     WHERE owner_phone = $1
     ORDER BY alias
     LIMIT 50`,
    [ownerPhone]
  )
  return result.rows
}

export async function resolveAlias(ownerPhone: string, rawAlias: string): Promise<string | null> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return null

  const result = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalizeAlias(alias)]
  )
  return result.rows[0]?.target_phone ?? null
}

/**
 * Fuzzy match: returns ALL contacts within Levenshtein distance <= 2.
 * If exactly one match -> suggest with confirmation.
 * If multiple matches at same distance -> force disambiguation (list all).
 * Returns empty array if no close matches.
 */
export async function fuzzyResolveAlias(
  ownerPhone: string,
  rawAlias: string
): Promise<Array<{ aliasDisplay: string; targetPhone: string; distance: number }>> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return []

  const contacts = await listContacts(ownerPhone)
  const normalized = normalizeAlias(alias)

  // Scale max distance by alias length: short aliases (<=3 chars) get distance 1 only
  // to prevent dangerously broad matches in a financial app (e.g. "ana" matching "ali")
  const maxDistance = normalized.length <= 3 ? 1 : 2

  const matches: Array<{ aliasDisplay: string; targetPhone: string; distance: number }> = []
  for (const contact of contacts) {
    const d = levenshtein(normalized, contact.alias)
    if (d > 0 && d <= maxDistance) {
      matches.push({
        aliasDisplay: contact.aliasDisplay,
        targetPhone: contact.targetPhone,
        distance: d,
      })
    }
  }

  // Sort by distance, then alphabetically for determinism
  matches.sort((a, b) => a.distance - b.distance || a.aliasDisplay.localeCompare(b.aliasDisplay))

  // If best distance has multiple ties, return all ties (force disambiguation)
  if (matches.length <= 1) return matches
  const bestDist = matches[0].distance
  const ties = matches.filter((m) => m.distance === bestDist)
  return ties.length > 1 ? ties : [matches[0]]
}

/**
 * Levenshtein distance — simple, no dependencies.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_row, i) =>
    Array.from({ length: n + 1 }, (_col, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
