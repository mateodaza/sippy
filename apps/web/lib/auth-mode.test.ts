import { describe, it, expect } from 'vitest'
import {
  getAuthMode,
  getProviderType,
  getDefaultProviderType,
  getDefaultChannel,
  canSwitchChannel,
} from './auth-mode'

describe('auth-mode (Sippy OTP model)', () => {
  it('getAuthMode returns sippy-otp for all numbers', () => {
    expect(getAuthMode('+573001234567')).toBe('sippy-otp')
    expect(getAuthMode('+15550001234')).toBe('sippy-otp')
  })

  it('getProviderType returns custom for all numbers', () => {
    expect(getProviderType('+573001234567')).toBe('custom')
    expect(getProviderType('+15550001234')).toBe('custom')
  })

  it('getDefaultProviderType returns custom', () => {
    expect(getDefaultProviderType()).toBe('custom')
  })
})

describe('channel selection', () => {
  it('getDefaultChannel returns whatsapp for NANP (+1) numbers', () => {
    expect(getDefaultChannel('+15550001234')).toBe('whatsapp')
    expect(getDefaultChannel('+12125551234')).toBe('whatsapp')
  })

  it('getDefaultChannel returns sms for non-NANP numbers', () => {
    expect(getDefaultChannel('+573001234567')).toBe('sms')
    expect(getDefaultChannel('+5511999990001')).toBe('sms')
    expect(getDefaultChannel('+447700900001')).toBe('sms')
  })

  it('canSwitchChannel returns false for NANP (whatsapp-only)', () => {
    expect(canSwitchChannel('+15550001234')).toBe(false)
  })

  it('canSwitchChannel returns true for non-NANP', () => {
    expect(canSwitchChannel('+573001234567')).toBe(true)
    expect(canSwitchChannel('+5511999990001')).toBe(true)
  })
})
