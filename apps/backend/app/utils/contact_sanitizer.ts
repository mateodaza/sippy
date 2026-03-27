/**
 * Sanitize contact alias to prevent prompt injection and DB abuse.
 * - Strips everything except letters, numbers, spaces, accented chars
 * - Trims, collapses whitespace
 * - Max 30 chars
 * - Returns null if empty after sanitization
 */
export function sanitizeAlias(raw: string): string | null {
  // Allow: letters (including accented), numbers, spaces
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Unicode-aware: keeps letters + digits + spaces
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)

  return cleaned.length > 0 ? cleaned : null
}

/**
 * Normalize alias for DB lookup (lowercase, trimmed).
 */
export function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim()
}
