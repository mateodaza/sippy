import { isNANP } from '@sippy/shared'
import type { OtpChannel } from './auth'

export type AuthMode = 'sippy-otp'

/** All users use Sippy custom auth (JWT + authenticateWithJWT). */
export function getAuthMode(_phone: string): AuthMode {
  return 'sippy-otp'
}

/** All users use customAuth provider (JWT-based). */
export function getProviderType(_phone: string): 'custom' {
  return 'custom'
}

/** Returning-user pages always use customAuth. */
export function getDefaultProviderType(): 'custom' {
  return 'custom'
}

/**
 * Determine the OTP delivery channel for a given phone number.
 * +1 (NANP): WhatsApp only — no SMS option.
 * Everyone else: SMS default, WhatsApp as fallback.
 */
export function getDefaultChannel(phone: string): OtpChannel {
  return isNANP(phone) ? 'whatsapp' : 'sms'
}

/** Whether the user can switch channels (non-NANP only). */
export function canSwitchChannel(phone: string): boolean {
  return !isNANP(phone)
}
