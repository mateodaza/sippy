/**
 * Dialect — country-specific flavor for Spanish responses.
 *
 * Maps phone prefix → dialect key. Used by message templates and LLM prompts
 * to sound natural per country. Non-Spanish users and unmapped countries
 * get 'neutral' (standard, no slang).
 */

export type Dialect = 'co' | 'mx' | 'ar' | 've' | 'neutral'

// Ordered longest-prefix-first (same convention as exchange_rate_service.ts)
const PREFIX_TO_DIALECT: [string, Dialect][] = [
  ['+57', 'co'], // Colombia
  ['+52', 'mx'], // Mexico
  ['+54', 'ar'], // Argentina
  ['+58', 've'], // Venezuela
]

/**
 * Resolve dialect from E.164 phone number.
 * Returns 'neutral' for non-mapped countries (safe default).
 */
export function getDialect(phone: string): Dialect {
  for (const [prefix, dialect] of PREFIX_TO_DIALECT) {
    if (phone.startsWith(prefix)) return dialect
  }
  return 'neutral'
}

/**
 * LLM hint string for generateResponse — tells the model which regional
 * flavor to use. Returns null for 'neutral' (no special instruction needed).
 */
export function dialectHint(dialect: Dialect): string | null {
  switch (dialect) {
    case 'co':
      return "Reply in natural Colombian Spanish. Keep it casual but don't force slang."
    case 'mx':
      return "Reply in natural Mexican Spanish. Keep it casual but don't force slang."
    case 'ar':
      return 'Reply in natural Argentine Spanish. Use voseo ("vos" instead of "tu"). Keep it casual but don\'t force slang.'
    case 've':
      return "Reply in natural Venezuelan Spanish. Keep it casual but don't force slang."
    case 'neutral':
      return null
  }
}
