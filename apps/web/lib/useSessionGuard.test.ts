import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { useSessionGuard, type SessionGuardResult } from './useSessionGuard'

// Helper: build a minimal JWT with the given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.fakesig`
}

// --- Hoisted mock state ---
const mocks = vi.hoisted(() => ({
  getStoredToken: vi.fn(() => null as string | null),
  storeToken: vi.fn(),
  clearToken: vi.fn(),
  getFreshToken: vi.fn(() => null as string | null),
  isTokenExpired: vi.fn(() => false),
  getTokenSecondsRemaining: vi.fn(() => 3600),
  sendOtp: vi.fn(() => Promise.resolve()),
  verifyOtp: vi.fn(() => Promise.resolve('new-token')),
  authenticateWithJWT: vi.fn(() => Promise.resolve({ user: {} })),
  signOut: vi.fn(() => Promise.resolve()),
  state: {
    isSignedIn: false as boolean | undefined,
    currentUser: null as unknown,
  },
}))

vi.mock('./auth', () => ({
  getStoredToken: () => mocks.getStoredToken(),
  storeToken: mocks.storeToken,
  clearToken: mocks.clearToken,
  getFreshToken: () => mocks.getFreshToken(),
  isTokenExpired: mocks.isTokenExpired,
  getTokenSecondsRemaining: mocks.getTokenSecondsRemaining,
  sendOtp: mocks.sendOtp,
  verifyOtp: mocks.verifyOtp,
}))

const cdpSmsMocks = vi.hoisted(() => ({
  signInWithSms: vi.fn(() => Promise.resolve({ flowId: 'test-flow-id' })),
  verifySmsOTP: vi.fn(() => Promise.resolve()),
  getAccessToken: vi.fn(() => Promise.resolve('cdp-test-token')),
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useSignOut: () => ({ signOut: mocks.signOut }),
  useSignInWithSms: () => ({ signInWithSms: cdpSmsMocks.signInWithSms }),
  useVerifySmsOTP: () => ({ verifySmsOTP: cdpSmsMocks.verifySmsOTP }),
  useGetAccessToken: () => ({ getAccessToken: cdpSmsMocks.getAccessToken }),
}))

// --- getTokenSecondsRemaining unit tests (real implementation) ---
describe('getTokenSecondsRemaining', () => {
  let getTokenSecondsRemaining: (token: string) => number

  beforeAll(async () => {
    const real = await vi.importActual<typeof import('./auth')>('./auth')
    getTokenSecondsRemaining = real.getTokenSecondsRemaining
  })

  it('valid future token returns positive number', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    const remaining = getTokenSecondsRemaining(token)
    expect(remaining).toBeGreaterThan(3500)
    expect(remaining).toBeLessThanOrEqual(3600)
  })

  it('expired token returns 0', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })
    expect(getTokenSecondsRemaining(token)).toBe(0)
  })

  it('malformed token returns 0', () => {
    expect(getTokenSecondsRemaining('not-a-jwt')).toBe(0)
    expect(getTokenSecondsRemaining('!!!.!!!.!!!')).toBe(0)
  })
})

// --- Hook tests ---

let container: HTMLDivElement | null = null
let root: Root | null = null
let hookResult: SessionGuardResult | null = null

function HookWrapper() {
  hookResult = useSessionGuard()
  return null
}

async function renderHook() {
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container!)
    root.render(React.createElement(HookWrapper))
  })
}

async function cleanupHook() {
  if (root && container) {
    await act(async () => {
      root!.unmount()
    })
    container.remove()
  }
  root = null
  container = null
  hookResult = null
}

beforeEach(() => {
  vi.clearAllMocks()
  // Pin Twilio off so CDP SMS is the default path.
  // Tests that need Twilio override this explicitly (see test 9b).
  vi.stubEnv('NEXT_PUBLIC_TWILIO_ENABLED', '')
  mocks.state.isSignedIn = false
  mocks.state.currentUser = null
  mocks.getStoredToken.mockReturnValue(null)
  mocks.getFreshToken.mockReturnValue(null)
  mocks.isTokenExpired.mockReturnValue(false)
  mocks.getTokenSecondsRemaining.mockReturnValue(3600)
  localStorage.clear()
})

afterEach(async () => {
  await cleanupHook()
})

it('4 — hook with valid token and CDP session → isAuthenticated: true', async () => {
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
  mocks.state.isSignedIn = true
  mocks.state.currentUser = { evmSmartAccounts: ['0xabc'], evmAccounts: [] }
  mocks.getFreshToken.mockReturnValue(token)
  mocks.getTokenSecondsRemaining.mockReturnValue(3600)

  await renderHook()

  expect(hookResult!.isAuthenticated).toBe(true)
  expect(hookResult!.token).toBe(token)
  expect(hookResult!.isCheckingSession).toBe(false)
})

it('5 — hook with expired token → isAuthenticated: false, re-auth not auto-triggered', async () => {
  mocks.state.isSignedIn = true
  mocks.state.currentUser = { evmSmartAccounts: ['0xabc'], evmAccounts: [] }
  mocks.getFreshToken.mockReturnValue(null) // expired → getFreshToken returns null

  await renderHook()

  expect(hookResult!.isAuthenticated).toBe(false)
  expect(hookResult!.reAuthVisible).toBe(false) // not auto-triggered until polled
})

it('6 — token < 3 min remaining → expiryWarning: true', async () => {
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 120 })
  mocks.state.isSignedIn = true
  mocks.state.currentUser = { evmSmartAccounts: ['0xabc'], evmAccounts: [] }
  mocks.getFreshToken.mockReturnValue(token)
  mocks.getTokenSecondsRemaining.mockReturnValue(120)

  await renderHook()

  expect(hookResult!.isAuthenticated).toBe(true)
  expect(hookResult!.expiryWarning).toBe(true)
})

it('7 — no stored token → isAuthenticated: false', async () => {
  mocks.state.isSignedIn = false
  mocks.getFreshToken.mockReturnValue(null)

  await renderHook()

  expect(hookResult!.isAuthenticated).toBe(false)
  expect(hookResult!.isCheckingSession).toBe(false)
})

it('8 — requireReauth() sets reAuthVisible: true and reAuthStep: phone', async () => {
  mocks.state.isSignedIn = false

  await renderHook()

  await act(async () => {
    hookResult!.requireReauth()
  })

  expect(hookResult!.reAuthVisible).toBe(true)
  expect(hookResult!.reAuthStep).toBe('phone')
})

it('9 — handleReAuthSendOtp (CDP SMS, default) → calls signInWithSms, step: otp', async () => {
  mocks.state.isSignedIn = false

  await renderHook()

  await act(async () => {
    hookResult!.setReAuthPhone('+573001234567')
  })

  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  expect(cdpSmsMocks.signInWithSms).toHaveBeenCalledWith({ phoneNumber: '+573001234567' })
  expect(mocks.sendOtp).not.toHaveBeenCalled()
  expect(hookResult!.reAuthStep).toBe('otp')
  expect(hookResult!.reAuthError).toBeNull()
})

it('9b — handleReAuthSendOtp (Twilio enabled, non-NANP) → calls sendOtp', async () => {
  vi.stubEnv('NEXT_PUBLIC_TWILIO_ENABLED', 'true')
  mocks.state.isSignedIn = false
  mocks.sendOtp.mockResolvedValue(undefined)

  // Need fresh module to pick up env change
  vi.resetModules()
  const { useSessionGuard: useSessionGuardFresh } = await import('./useSessionGuard')

  // Re-render with fresh hook
  function FreshWrapper() {
    hookResult = useSessionGuardFresh()
    return null
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container!)
    root.render(React.createElement(FreshWrapper))
  })

  await act(async () => {
    hookResult!.setReAuthPhone('+573001234567')
  })

  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  expect(mocks.sendOtp).toHaveBeenCalled()
  expect(hookResult!.reAuthStep).toBe('otp')
  vi.unstubAllEnvs()
})

it('10 — handleReAuthSendOtp error → reAuthError set', async () => {
  mocks.state.isSignedIn = false
  cdpSmsMocks.signInWithSms.mockRejectedValueOnce(new Error('Rate limit exceeded'))

  await renderHook()

  await act(async () => {
    hookResult!.setReAuthPhone('+15550001234')
  })

  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  expect(hookResult!.reAuthStep).toBe('phone')
  expect(hookResult!.reAuthError).toBe('Rate limit exceeded')
})

it('11 — handleReAuthVerifyOtp (CDP SMS) success → exchanges token, isAuthenticated: true', async () => {
  mocks.state.isSignedIn = false
  const newToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })

  // Mock the exchange-cdp-token fetch
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: newToken }),
  })
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')

  vi.resetModules()
  const { useSessionGuard: useSessionGuardFresh } = await import('./useSessionGuard')

  function FreshWrapper() {
    hookResult = useSessionGuardFresh()
    return null
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container!)
    root.render(React.createElement(FreshWrapper))
  })

  // First: send OTP to get flowId
  await act(async () => {
    hookResult!.setReAuthPhone('+573001234567')
  })
  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  // Then: verify OTP
  await act(async () => {
    hookResult!.setReAuthOtp('123456')
  })
  await act(async () => {
    await hookResult!.handleReAuthVerifyOtp()
  })

  expect(cdpSmsMocks.verifySmsOTP).toHaveBeenCalled()
  expect(hookResult!.isAuthenticated).toBe(true)
  expect(hookResult!.reAuthVisible).toBe(false)
  expect(mocks.storeToken).toHaveBeenCalledWith(newToken)

  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('12 — handleReAuthVerifyOtp error → reAuthError set, isAuthenticated unchanged', async () => {
  mocks.state.isSignedIn = false
  cdpSmsMocks.verifySmsOTP.mockRejectedValueOnce(new Error('Invalid OTP'))

  await renderHook()

  // Send OTP first
  await act(async () => {
    hookResult!.setReAuthPhone('+15550001234')
  })
  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  // Verify OTP (will fail)
  await act(async () => {
    hookResult!.setReAuthOtp('000000')
  })
  await act(async () => {
    await hookResult!.handleReAuthVerifyOtp()
  })

  expect(hookResult!.isAuthenticated).toBe(false)
  expect(hookResult!.reAuthError).toBe('Invalid OTP')
})

it('13 — dismissReAuth() sets reAuthVisible: false', async () => {
  mocks.state.isSignedIn = false

  await renderHook()

  await act(async () => {
    hookResult!.requireReauth()
  })

  expect(hookResult!.reAuthVisible).toBe(true)

  await act(async () => {
    hookResult!.dismissReAuth()
  })

  expect(hookResult!.reAuthVisible).toBe(false)
})

it('14 — expiry polling detects expired token and sets isAuthenticated: false', async () => {
  vi.useFakeTimers()
  const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
  mocks.state.isSignedIn = true
  mocks.state.currentUser = { evmSmartAccounts: ['0xabc'], evmAccounts: [] }
  mocks.getFreshToken.mockReturnValue(token)
  mocks.getTokenSecondsRemaining.mockReturnValue(3600)

  await renderHook()

  expect(hookResult!.isAuthenticated).toBe(true)

  // Simulate token expiry
  mocks.getStoredToken.mockReturnValue(null)
  mocks.isTokenExpired.mockReturnValue(true)

  await act(async () => {
    vi.advanceTimersByTime(30000)
    await Promise.resolve()
  })

  expect(hookResult!.isAuthenticated).toBe(false)

  vi.useRealTimers()
})
