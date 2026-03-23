import { isNANP } from '@sippy/shared'
import { getStoredToken } from './auth'

export type AuthMode = 'twilio' | 'cdp-sms'

function isTwilioEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TWILIO_ENABLED === 'true'
}

/**
 * Returns true only when Twilio is explicitly enabled AND the phone is non-NANP.
 * When Twilio is disabled (the default), ALL numbers use CDP native SMS.
 */
export function shouldUseTwilio(phone: string): boolean {
  return isTwilioEnabled() && !isNANP(phone)
}

/** Determine the auth mode for a given phone number. */
export function getAuthMode(phone: string): AuthMode {
  return shouldUseTwilio(phone) ? 'twilio' : 'cdp-sms'
}

/** Determine the correct CDP provider type for a given phone. */
export function getProviderType(phone: string): 'native' | 'custom' {
  return shouldUseTwilio(phone) ? 'custom' : 'native'
}

/**
 * Extract the phone (JWT sub) from the stored token, if available.
 * Returns null when there is no token or the payload cannot be read.
 */
function getPhoneFromToken(): string | null {
  try {
    const token = getStoredToken()
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) base64 += '='
    const payload = JSON.parse(atob(base64))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/**
 * For returning-user pages (settings, wallet) that don't have a phone
 * at mount time. Reads the phone from the stored JWT so the provider
 * matches the one used during setup (e.g. NANP users stay on native
 * even when Twilio is enabled for international numbers).
 * Falls back to env-only check when no token is available.
 */
export function getDefaultProviderType(): 'native' | 'custom' {
  const phone = getPhoneFromToken()
  if (phone) return getProviderType(phone)
  return isTwilioEnabled() ? 'custom' : 'native'
}
