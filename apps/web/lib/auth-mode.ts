import { isNANP } from '@sippy/shared'

const isTwilioEnabled = process.env.NEXT_PUBLIC_TWILIO_ENABLED === 'true'

export type AuthMode = 'twilio' | 'cdp-sms'

/**
 * Returns true only when Twilio is explicitly enabled AND the phone is non-NANP.
 * When Twilio is disabled (the default), ALL numbers use CDP native SMS.
 */
export function shouldUseTwilio(phone: string): boolean {
  return isTwilioEnabled && !isNANP(phone)
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
 * at mount time. CDPProviderNative when Twilio is off, CDPProviderCustomAuth
 * when Twilio is on (existing users may have JWTs from the Twilio flow).
 */
export function getDefaultProviderType(): 'native' | 'custom' {
  return isTwilioEnabled ? 'custom' : 'native'
}
