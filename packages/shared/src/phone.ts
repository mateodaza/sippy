// ── FATF blacklist + Twilio-blocked countries ────────────────────────────────
// FATF "Call for Action" (Feb 2026): North Korea, Iran, Myanmar
// Twilio SMS blocked: Syria, Cuba, Sudan

/** ISO 3166-1 alpha-2 — used by react-international-phone to filter the picker */
export const BLOCKED_COUNTRY_ISO2 = [
  'kp', // North Korea
  'ir', // Iran
  'mm', // Myanmar
  'sy', // Syria
  'cu', // Cuba
  'sd', // Sudan
] as const

/** E.164 dial prefixes — used by backend to reject at validation time */
export const BLOCKED_DIAL_PREFIXES = [
  '+850', // North Korea
  '+98',  // Iran
  '+95',  // Myanmar
  '+963', // Syria
  '+53',  // Cuba
  '+249', // Sudan
] as const

export function isBlockedPrefix(e164Phone: string): boolean {
  return BLOCKED_DIAL_PREFIXES.some((prefix) => e164Phone.startsWith(prefix))
}

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
