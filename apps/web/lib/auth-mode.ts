import { isNANP } from '@sippy/shared'

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
 * For returning-user pages (settings, wallet) that don't have a phone
 * at mount time. Returns 'native' when Twilio is off (CDP handles its
 * own session via SMS), 'custom' when Twilio is on (needs customAuth.getJwt).
 */
export function getDefaultProviderType(): 'native' | 'custom' {
  return isTwilioEnabled() ? 'custom' : 'native'
}

/** Whether Twilio is currently enabled (exposed for session guard logic). */
export function isTwilioActive(): boolean {
  return isTwilioEnabled()
}
