import { type ParsedCommand } from '../types/index.js'
import { isBlockedPrefix } from '@sippy/shared'

function extractDigitsFromPlus(source?: string): string | null {
  if (!source) return null

  const match = source.match(/\+([\d\s\-().]+)/)
  if (!match) {
    return null
  }

  const digits = match[1].replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

function extractDigitsFromDoubleZero(source?: string): string | null {
  if (!source) return null

  const match = source.match(/(?:^|\s)00([\d\s\-().]+)/)
  if (!match) {
    return null
  }

  const digits = match[1].replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/**
 * Privacy map: Convert names to phone numbers (case-insensitive)
 * Add name-to-phone mappings here for quick lookup
 */
const NAME_TO_PHONE_MAP: Record<string, string> = {
  // Add mappings here: 'name': 'phonenumber'
}

export function normalizePhoneNumber(rawPhone: string, originalText?: string): string | null {
  if (!rawPhone) {
    return null
  }

  // Check if rawPhone is a recognized name (case-insensitive)
  const normalizedName = rawPhone.trim().toLowerCase()
  if (NAME_TO_PHONE_MAP[normalizedName]) {
    return NAME_TO_PHONE_MAP[normalizedName]
  }

  const digitsOnly = rawPhone.replace(/\D/g, '')
  if (!digitsOnly) {
    return null
  }

  // International formats with "+" prefix (LLM output or user input)
  const explicitInternational =
    extractDigitsFromPlus(rawPhone) ||
    extractDigitsFromPlus(originalText) ||
    extractDigitsFromDoubleZero(rawPhone) ||
    extractDigitsFromDoubleZero(originalText)

  if (explicitInternational) {
    if (explicitInternational.endsWith(digitsOnly)) {
      return explicitInternational
    }

    if (digitsOnly.startsWith(explicitInternational)) {
      return digitsOnly
    }

    return explicitInternational
  }

  // Allow configurable default for local numbers without country code
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '').replace(/\D/g, '')

  if (defaultCountryCode && digitsOnly.length === 10) {
    return `${defaultCountryCode}${digitsOnly}`
  }

  return digitsOnly
}

export function canonicalizePhone(input: string): string | null {
  if (!input) return null

  const stripped = input.replace(/[\s\-().]/g, '')

  let rawDigits: string
  if (stripped.startsWith('+')) {
    rawDigits = stripped.slice(1)
  } else if (stripped.startsWith('00')) {
    rawDigits = stripped.slice(2)
  } else {
    rawDigits = stripped
  }

  if (!/^\d+$/.test(rawDigits)) return null
  if (rawDigits.length < 7) return null
  if (rawDigits.length > 15) return null

  if (rawDigits.length === 10) {
    const cc = (process.env.DEFAULT_COUNTRY_CODE ?? '').replace(/\D/g, '')
    if (!cc) return null
    rawDigits = cc + rawDigits
  }

  if (rawDigits.length > 15) return null
  if (rawDigits[0] === '0') return null

  // Mexico legacy mobile prefix: +521XXXXXXXXXX → +52XXXXXXXXXX
  // Eliminated in 2019; CDP and some carriers still return the old format.
  if (rawDigits.length === 13 && rawDigits.startsWith('521')) {
    const withoutPrefix = '52' + rawDigits.slice(3)
    if (withoutPrefix.length === 12) rawDigits = withoutPrefix
  }

  const e164 = '+' + rawDigits
  if (isBlockedPrefix(e164)) return null

  return e164
}

export type SendVerificationMismatch = 'amount' | 'recipient' | 'invalid'

export interface SendVerificationResult {
  match: boolean
  mismatchReason?: SendVerificationMismatch
}

/**
 * Simple validation for LLM-parsed send commands
 * We validate basic format and let the send service handle the rest
 */
export function verifySendAgreement(
  llmResult: ParsedCommand,
  regexVerification: ParsedCommand,
  _originalText: string
): SendVerificationResult {
  // Validate amount is present and reasonable
  if (typeof llmResult.amount !== 'number' || llmResult.amount <= 0) {
    return { match: false, mismatchReason: 'invalid' }
  }

  // Validate amount is not absurdly large (consistent with LLM validation)
  if (llmResult.amount > 100000) {
    return { match: false, mismatchReason: 'amount' }
  }

  // Validate phone number format: must have at least 10 digits
  if (!llmResult.recipient) {
    return { match: false, mismatchReason: 'recipient' }
  }

  const canonicalRecipient = canonicalizePhone(llmResult.recipient)
  if (!canonicalRecipient) {
    return { match: false, mismatchReason: 'recipient' }
  }

  // If regex also parsed it successfully, compare amounts as a sanity check
  if (regexVerification.command === 'send' && typeof regexVerification.amount === 'number') {
    const amountsMatch = Math.abs(llmResult.amount - regexVerification.amount) < 0.01
    if (!amountsMatch) {
      return { match: false, mismatchReason: 'amount' }
    }
  }

  // Valid format - trust the LLM and let the send service validate existence
  return { match: true }
}

// ── Phone-to-language mapping ──────────────────────────────────────────────────

/**
 * Ordered longest-prefix-first to prevent shorter prefixes from shadowing longer ones.
 * Exported so tests can assert the ordering invariant.
 *
 * Current entries:
 *   +55 (Brazil → pt) must appear before any future +5X entry.
 *   +1  (USA/Canada → en) catch-all for NANP — comes after any future +1XXX entries.
 *
 * Rule when adding entries: always insert a longer prefix BEFORE any shorter
 * prefix it would shadow (same convention as exchange_rate_service.ts).
 */
export const PHONE_LANGUAGE_PREFIX_MAP: readonly [string, 'en' | 'es' | 'pt'][] = [
  ['+55', 'pt'],  // Brazil
  ['+1',  'en'],  // USA / Canada (NANP catch-all)
]

/**
 * Map a phone number (E.164 format expected) to a website language code.
 * Uses longest-prefix match via ordered iteration.
 * Fallback: 'es' (covers all LATAM prefixes not explicitly listed).
 */
export function getLanguageForPhone(phone: string): 'en' | 'es' | 'pt' {
  for (const [prefix, lang] of PHONE_LANGUAGE_PREFIX_MAP) {
    if (phone.startsWith(prefix)) return lang
  }
  return 'es'
}
