// ── Phone-to-language mapping ──────────────────────────────────────────────────

/**
 * Ordered longest-prefix-first. Exported for structural testing.
 * Keep in sync with apps/backend/app/utils/phone.ts:PHONE_LANGUAGE_PREFIX_MAP.
 */
export const PHONE_LANGUAGE_PREFIX_MAP: readonly [string, 'en' | 'es' | 'pt'][] = [
  ['+55', 'pt'],  // Brazil
  ['+1',  'en'],  // USA / Canada (NANP catch-all)
]

/**
 * Map a phone number (E.164 format expected) to a website language code.
 * Fallback: 'es'.
 */
export function getLanguageForPhone(phone: string): 'en' | 'es' | 'pt' {
  for (const [prefix, lang] of PHONE_LANGUAGE_PREFIX_MAP) {
    if (phone.startsWith(prefix)) return lang
  }
  return 'es'
}
