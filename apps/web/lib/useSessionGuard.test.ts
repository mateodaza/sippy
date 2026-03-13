import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { useSessionGuard, type SessionGuardResult } from './useSessionGuard'

// Helper: build a minimal JWT with the given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
  storeToken: (...args: unknown[]) => mocks.storeToken(...args),
  clearToken: () => mocks.clearToken(),
  getFreshToken: () => mocks.getFreshToken(),
  isTokenExpired: (...args: unknown[]) => mocks.isTokenExpired(...args),
  getTokenSecondsRemaining: (...args: unknown[]) => mocks.getTokenSecondsRemaining(...args),
  sendOtp: (...args: unknown[]) => mocks.sendOtp(...args),
  verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useSignOut: () => ({ signOut: mocks.signOut }),
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

it('9 — handleReAuthSendOtp success → reAuthStep: otp', async () => {
  mocks.state.isSignedIn = false
  mocks.sendOtp.mockResolvedValue(undefined)

  await renderHook()

  await act(async () => {
    hookResult!.setReAuthPhone('+15550001234')
  })

  await act(async () => {
    await hookResult!.handleReAuthSendOtp()
  })

  expect(hookResult!.reAuthStep).toBe('otp')
  expect(hookResult!.reAuthError).toBeNull()
})

it('10 — handleReAuthSendOtp error → reAuthError set', async () => {
  mocks.state.isSignedIn = false
  mocks.sendOtp.mockRejectedValue(new Error('Rate limit exceeded'))

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

it('11 — handleReAuthVerifyOtp success → isAuthenticated: true, reAuthVisible: false, token stored', async () => {
  mocks.state.isSignedIn = false
  const newToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
  mocks.verifyOtp.mockResolvedValue(newToken)
  mocks.authenticateWithJWT.mockResolvedValue({ user: {} })

  await renderHook()

  await act(async () => {
    hookResult!.setReAuthPhone('+15550001234')
    hookResult!.setReAuthOtp('123456')
  })

  await act(async () => {
    await hookResult!.handleReAuthVerifyOtp()
  })

  expect(hookResult!.isAuthenticated).toBe(true)
  expect(hookResult!.reAuthVisible).toBe(false)
  expect(hookResult!.token).toBe(newToken)
  expect(mocks.storeToken).toHaveBeenCalledWith(newToken)
})

it('12 — handleReAuthVerifyOtp error → reAuthError set, isAuthenticated unchanged', async () => {
  mocks.state.isSignedIn = false
  mocks.verifyOtp.mockRejectedValue(new Error('Invalid OTP'))

  await renderHook()

  await act(async () => {
    hookResult!.setReAuthPhone('+15550001234')
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
