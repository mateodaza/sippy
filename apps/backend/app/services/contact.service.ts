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

/**
 * Exact alias match (DB lookup). Used for delete, partial-send follow-ups,
 * and as the first step before smart resolution.
 */
export async function resolveAlias(ownerPhone: string, rawAlias: string): Promise<string | null> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return null

  const result = await query<{ target_phone: string }>(
    'SELECT target_phone FROM user_contacts WHERE owner_phone = $1 AND alias = $2',
    [ownerPhone, normalizeAlias(alias)]
  )
  return result.rows[0]?.target_phone ?? null
}

export interface AliasMatch {
  aliasDisplay: string
  targetPhone: string
  /** Lower = better. 0 = exact, 1 = prefix/word, 2 = contains, 3 = typo (Levenshtein) */
  confidence: number
}

/**
 * Multi-strategy alias resolver — tries strategies in priority order:
 *
 * 1. Exact match (confidence 0): "carlos quintero" === "carlos quintero"
 * 2. Prefix match (confidence 1): "carlos" is prefix of "carlos quintero"
 * 3. Any-word exact (confidence 1): "quintero" matches a word in "carlos quintero"
 * 4. Contains (confidence 2): "carl" is substring of "carlos quintero"
 * 5. Word-level Levenshtein (confidence 3): "cralos" is distance 1 from "carlos"
 *
 * Returns matches grouped by best confidence level.
 * Single match at any level → caller should confirm with user.
 * Multiple matches at same level → caller should disambiguate.
 * Empty → no match found.
 *
 * All strategies run against at most 50 contacts in memory — zero LLM cost.
 * Accent stripping ensures "mamá" matches alias stored as "mama" and vice versa.
 */
export async function smartResolveAlias(
  ownerPhone: string,
  rawAlias: string
): Promise<AliasMatch[]> {
  const alias = sanitizeAlias(rawAlias)
  if (!alias) return []

  const contacts = await listContacts(ownerPhone)
  if (contacts.length === 0) return []

  const input = stripAccents(normalizeAlias(alias))

  // Strategy 1: exact match
  const exact = contacts.filter((c) => stripAccents(c.alias) === input)
  if (exact.length > 0) {
    return exact.map((c) => ({
      aliasDisplay: c.aliasDisplay,
      targetPhone: c.targetPhone,
      confidence: 0,
    }))
  }

  // Strategy 2: prefix match — "carlos" matches "carlos quintero"
  const prefixMatches = contacts.filter((c) => stripAccents(c.alias).startsWith(input))

  // Strategy 3: any-word exact — "quintero" matches a word in "carlos quintero"
  const wordMatches = contacts.filter((c) => {
    if (prefixMatches.includes(c)) return false // avoid duplicates
    const words = stripAccents(c.alias).split(/\s+/)
    return words.some((w) => w === input)
  })

  const level1 = [...prefixMatches, ...wordMatches]
  if (level1.length > 0) {
    return dedup(level1).map((c) => ({
      aliasDisplay: c.aliasDisplay,
      targetPhone: c.targetPhone,
      confidence: 1,
    }))
  }

  // Strategy 4: contains — "carl" is substring of "carlos quintero"
  // Only for inputs >= 3 chars to avoid matching everything
  if (input.length >= 3) {
    const containsMatches = contacts.filter((c) => stripAccents(c.alias).includes(input))
    if (containsMatches.length > 0) {
      return containsMatches.map((c) => ({
        aliasDisplay: c.aliasDisplay,
        targetPhone: c.targetPhone,
        confidence: 2,
      }))
    }
  }

  // Strategy 5: word-level Levenshtein — "cralos" is distance 1 from "carlos"
  // Check input against each individual word in the stored alias
  const maxDist = input.length <= 3 ? 1 : 2
  const typoMatches: Array<AliasMatch & { dist: number }> = []
  for (const contact of contacts) {
    const words = stripAccents(contact.alias).split(/\s+/)
    let bestWordDist = Infinity
    for (const word of words) {
      const d = levenshtein(input, word)
      if (d > 0 && d <= maxDist && d < bestWordDist) {
        bestWordDist = d
      }
    }
    // Also check full alias for short stored names
    const fullDist = levenshtein(input, stripAccents(contact.alias))
    if (fullDist > 0 && fullDist <= maxDist && fullDist < bestWordDist) {
      bestWordDist = fullDist
    }
    if (bestWordDist <= maxDist) {
      typoMatches.push({
        aliasDisplay: contact.aliasDisplay,
        targetPhone: contact.targetPhone,
        confidence: 3,
        dist: bestWordDist,
      })
    }
  }

  // Sort by distance, then alphabetically
  typoMatches.sort((a, b) => a.dist - b.dist || a.aliasDisplay.localeCompare(b.aliasDisplay))

  // Return best tier only
  if (typoMatches.length === 0) return []
  const bestDist = typoMatches[0].dist
  const best = typoMatches.filter((m) => m.dist === bestDist)
  return best.map(({ aliasDisplay, targetPhone, confidence }) => ({
    aliasDisplay,
    targetPhone,
    confidence,
  }))
}

/** Strip accents for matching: "mamá" → "mama", "María" → "maria" */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Deduplicate contacts by targetPhone */
function dedup(contacts: SavedContact[]): SavedContact[] {
  const seen = new Set<string>()
  return contacts.filter((c) => {
    if (seen.has(c.targetPhone)) return false
    seen.add(c.targetPhone)
    return true
  })
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
