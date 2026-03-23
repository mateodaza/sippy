import { describe, it, expect, vi, beforeEach } from 'vitest'

// Helper: build a minimal JWT with the given sub (phone)
function makeJwt(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const body = btoa(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.fakesig`
}

const authMocks = vi.hoisted(() => ({
  getStoredToken: vi.fn(() => null as string | null),
}))

vi.mock('./auth', () => ({
  getStoredToken: authMocks.getStoredToken,
}))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  authMocks.getStoredToken.mockReturnValue(null)
})

async function importFresh() {
  return import('./auth-mode')
}

describe('auth-mode (Twilio disabled — default)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TWILIO_ENABLED', '')
  })

  it('shouldUseTwilio returns false for non-NANP number', async () => {
    const { shouldUseTwilio } = await importFresh()
    expect(shouldUseTwilio('+573001234567')).toBe(false)
  })

  it('shouldUseTwilio returns false for NANP number', async () => {
    const { shouldUseTwilio } = await importFresh()
    expect(shouldUseTwilio('+15550001234')).toBe(false)
  })

  it('getAuthMode returns cdp-sms for all numbers', async () => {
    const { getAuthMode } = await importFresh()
    expect(getAuthMode('+573001234567')).toBe('cdp-sms')
    expect(getAuthMode('+15550001234')).toBe('cdp-sms')
  })

  it('getProviderType returns native for all numbers', async () => {
    const { getProviderType } = await importFresh()
    expect(getProviderType('+573001234567')).toBe('native')
    expect(getProviderType('+15550001234')).toBe('native')
  })

  it('getDefaultProviderType returns native (no token)', async () => {
    const { getDefaultProviderType } = await importFresh()
    expect(getDefaultProviderType()).toBe('native')
  })

  it('getDefaultProviderType returns native even with NANP token', async () => {
    authMocks.getStoredToken.mockReturnValue(makeJwt('+15550001234'))
    const { getDefaultProviderType } = await importFresh()
    expect(getDefaultProviderType()).toBe('native')
  })
})

describe('auth-mode (Twilio enabled)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TWILIO_ENABLED', 'true')
  })

  it('shouldUseTwilio returns true for non-NANP number', async () => {
    const { shouldUseTwilio } = await importFresh()
    expect(shouldUseTwilio('+573001234567')).toBe(true)
  })

  it('shouldUseTwilio returns false for NANP number', async () => {
    const { shouldUseTwilio } = await importFresh()
    expect(shouldUseTwilio('+15550001234')).toBe(false)
  })

  it('getAuthMode returns twilio for non-NANP, cdp-sms for NANP', async () => {
    const { getAuthMode } = await importFresh()
    expect(getAuthMode('+573001234567')).toBe('twilio')
    expect(getAuthMode('+15550001234')).toBe('cdp-sms')
  })

  it('getProviderType returns custom for non-NANP, native for NANP', async () => {
    const { getProviderType } = await importFresh()
    expect(getProviderType('+573001234567')).toBe('custom')
    expect(getProviderType('+15550001234')).toBe('native')
  })

  it('getDefaultProviderType returns custom with non-NANP token', async () => {
    authMocks.getStoredToken.mockReturnValue(makeJwt('+573001234567'))
    const { getDefaultProviderType } = await importFresh()
    expect(getDefaultProviderType()).toBe('custom')
  })

  it('getDefaultProviderType returns native with NANP token', async () => {
    authMocks.getStoredToken.mockReturnValue(makeJwt('+15550001234'))
    const { getDefaultProviderType } = await importFresh()
    expect(getDefaultProviderType()).toBe('native')
  })

  it('getDefaultProviderType falls back to custom when no token', async () => {
    const { getDefaultProviderType } = await importFresh()
    expect(getDefaultProviderType()).toBe('custom')
  })
})
