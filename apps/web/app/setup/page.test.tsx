import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// --- Hoisted mock state ---
const mocks = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  sendEmailLogin: vi.fn(),
  verifyEmailLogin: vi.fn(),
  storeToken: vi.fn(),
  getStoredToken: vi.fn(() => null as string | null),
  authenticateWithJWT: vi.fn(),
  createSpendPermission: vi.fn(),
  signOut: vi.fn(),
  searchParamsGet: vi.fn((_: string) => null as string | null),
  routerReplace: vi.fn(),
  state: {
    isSignedIn: false as boolean | undefined,
    currentUser: null as unknown,
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
  useRouter: () => ({ replace: mocks.routerReplace, push: vi.fn() }),
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  CDPHooksProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useCreateSpendPermission: () => ({
    createSpendPermission: mocks.createSpendPermission,
    status: null,
  }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useSignOut: () => ({ signOut: mocks.signOut }),
  useGetAccessToken: () => ({ getAccessToken: vi.fn().mockResolvedValue('cdp-test-token') }),
}))

vi.mock('../../lib/i18n', async () => {
  // Import the real module and re-export everything, but override the
  // language-detection functions so the component always stays in English
  // during tests (prevents +57 Colombian number from switching to Spanish).
  const real = await vi.importActual<typeof import('../../lib/i18n')>('../../lib/i18n')
  return {
    ...real,
    getStoredLanguage: () => 'en' as const,
    storeLanguage: () => {},
    detectLanguageFromPhone: () => 'en' as const,
    fetchUserLanguage: async () => ({ language: 'en' as const, source: 'phone' as const }),
    resolveLanguage: async () => 'en' as const,
  }
})

// Token state: tracks the JWT stored by storeToken() so getStoredToken/getFreshToken
// return null during session check (before OTP) and the real token after OTP verify.
let _storedToken: string | null = null
vi.mock('../../lib/auth', () => ({
  sendOtp: (...args: unknown[]) => mocks.sendOtp(...args),
  verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
  sendEmailLogin: (...args: unknown[]) => mocks.sendEmailLogin(...args),
  verifyEmailLogin: (...args: unknown[]) => mocks.verifyEmailLogin(...args),
  storeToken: (token: string) => {
    _storedToken = token
    mocks.storeToken(token)
  },
  getStoredToken: () => _storedToken,
  clearToken: () => {
    _storedToken = null
  },
  getFreshToken: () => _storedToken,
}))

vi.mock('viem', () => ({
  parseUnits: vi.fn(() => BigInt(0)),
}))

// Mock react-international-phone so PhoneInput is a simple controlled <input type="tel">
vi.mock('react-international-phone', () => ({
  PhoneInput: ({
    value,
    onChange,
    inputProps,
  }: {
    value?: string
    onChange?: (val: string) => void
    inputProps?: Record<string, unknown>
    [key: string]: unknown
  }) => {
    const React = require('react')
    return React.createElement('input', {
      type: 'tel',
      value: value || '',
      onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
      ...inputProps,
    })
  },
  defaultCountries: [],
  parseCountry: () => ({ iso2: '' }),
}))

// --- Helpers ---

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderPage() {
  // Dynamic import so vi.stubEnv takes effect at module load time
  const { default: SetupPage } = await import('./page')
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container!)
    root.render(React.createElement(SetupPage))
  })
  // Flush effects (session check + async recovery fetches)
  await flushAsync()
}

function cleanup() {
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  if (container?.parentNode) {
    document.body.removeChild(container)
    container = null
  }
}

function findButton(text: string): HTMLButtonElement | null {
  if (!container) return null
  const buttons = container.querySelectorAll('button')
  for (const btn of buttons) {
    if (btn.textContent?.includes(text)) return btn as HTMLButtonElement
  }
  return null
}

function setInputValue(input: HTMLInputElement, value: string) {
  // Use the native setter when available (works for real HTMLInputElement instances),
  // fall back to direct assignment for jsdom proxies / third-party component wrappers.
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set
  try {
    if (nativeSetter) {
      nativeSetter.call(input, value)
    } else {
      // eslint-disable-next-line no-param-reassign
      input.value = value
    }
  } catch {
    // jsdom may throw if the element isn't a "valid instance" — fall back to direct assignment
    // eslint-disable-next-line no-param-reassign
    input.value = value
  }
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

// Advance to OTP step
async function goToOtpStep(phone = '+573001234567') {
  await act(async () => {
    const input = container!.querySelector('input[type="tel"]') as HTMLInputElement
    setInputValue(input, phone)
  })
  await act(async () => {
    // Non-+1 shows two buttons (SMS / WhatsApp); +1 shows single WhatsApp button
    const smsBtn = findButton('SMS')
    const waBtn = findButton('WhatsApp')
    if (smsBtn) {
      smsBtn.click()
    } else if (waBtn) {
      waBtn.click()
    } else {
      throw new Error('Neither SMS nor WhatsApp button found on phone step')
    }
  })
}

/**
 * Flush pending microtasks/promises so async handlers (fetch chains) resolve.
 * Uses process.nextTick which flushes microtasks in jsdom better than setTimeout.
 */
async function flushAsync(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => process.nextTick(r))
    })
  }
}

/**
 * Wait for specific text to appear in the container.
 * Polls with microtask flushing until the text appears or timeout.
 */
async function waitForContent(text: string, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await act(async () => {
      await new Promise((r) => process.nextTick(r))
    })
    if (container?.textContent?.includes(text)) return
  }
  throw new Error(
    `waitForContent("${text}") timed out after ${timeoutMs}ms.\nContent: ${container?.textContent?.slice(0, 300)}`
  )
}

/** Wait for router.replace to be called with a specific path */
async function waitForRedirect(path: string, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await act(async () => {
      await new Promise((r) => process.nextTick(r))
    })
    if (mocks.routerReplace.mock.calls.some((c: unknown[]) => c[0] === path)) return
  }
  throw new Error(
    `waitForRedirect("${path}") timed out. Calls: ${JSON.stringify(mocks.routerReplace.mock.calls)}`
  )
}

// Advance past OTP verification. With the event-day fast path, this no longer
// lands on a recovery-email screen; it either redirects, completes setup, or
// auto-creates the spend permission.
async function goPastOtpStep(otpCode = '123456') {
  await act(async () => {
    const input = container!.querySelector('input[type="text"]') as HTMLInputElement
    setInputValue(input, otpCode)
  })
  await act(async () => {
    findButton('Verify')!.click()
  })
  // Flush async fetch chains (register-wallet → advanceToCorrectStep)
  await flushAsync()
}

// Advance to permission step (OTP verification now skips recovery email + ToS)
async function goToPermissionStep(otpCode = '123456') {
  await goPastOtpStep(otpCode)
}

// --- Setup / Teardown ---

beforeEach(() => {
  vi.clearAllMocks()
  _storedToken = null
  mocks.state.isSignedIn = false
  mocks.state.currentUser = null
  // Default: provide a Colombian phone via URL (Twilio auth mode)
  // Tests that need bare /setup (PhoneEntryGate) can override to null
  mocks.searchParamsGet.mockImplementation((key: string) =>
    key === 'phone' ? '573001234567' : null
  )
  vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
  vi.stubEnv('NEXT_PUBLIC_SIPPY_NETWORK', 'arbitrum')
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.unstubAllEnvs()
})

// --- Tests ---

describe('handleSendOtp', () => {
  it('happy path: advances to otp step and calls sendOtp with E.164 phone', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()

    await goToOtpStep('+573001234567')

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567', 'sms')
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('normalizes phone without + prefix', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()

    await goToOtpStep('573001234567')

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567', 'sms')
    // phoneNumber state should be normalized — shown in OTP step text
    expect(container!.textContent).toContain('+573001234567')
  })

  it('shows error and stays on phone step when sendOtp throws', async () => {
    mocks.sendOtp.mockRejectedValue(new Error('Rate limit exceeded'))
    await renderPage()

    await goToOtpStep('+573001234567')

    expect(container!.textContent).toContain('Failed to send verification code')
    // Still on phone step (tel input visible)
    expect(container!.querySelector('input[type="tel"]')).not.toBeNull()
  })
})

describe('handleVerifyOtp', () => {
  it('happy path: verifies OTP, stores token, authenticates, skips email/ToS, and completes setup', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })
    await renderPage()

    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()

    expect(mocks.verifyOtp).toHaveBeenCalledWith('+573001234567', '123456')
    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token-abc')
    expect(mocks.authenticateWithJWT).toHaveBeenCalled()
    expect(container!.textContent).not.toContain('Add a recovery email')
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(container!.textContent).toContain("You're All Set")
  })

  it('shows error and stays on otp step when verifyOtp throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockRejectedValue(new Error('Invalid OTP'))
    await renderPage()

    await goToOtpStep('+573001234567')
    await goPastOtpStep('000000')

    expect(container!.textContent).toContain('Verification failed')
    // Should still be on OTP step (text input for OTP visible)
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('shows error when authenticateWithJWT throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockRejectedValue(new Error('Auth failed'))
    await renderPage()

    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')

    expect(container!.textContent).toContain('Verification failed')
  })

  it('waits for wallet when user has no accounts yet (awaitingCdpWallet)', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: [], evmAccounts: [] },
    })
    await renderPage()

    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')

    // Should be in loading state waiting for wallet to populate
    // (awaitingCdpWallet = true, useEffect polling currentUser)
    expect(container!.textContent).toContain('Verifying')
  })
})

describe('session recovery', () => {
  it('uses stored token for register-wallet fetch during session recovery', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ hasPermission: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    const registerCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/register-wallet')
    )
    expect(registerCall).toBeDefined()
    expect((registerCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stored-token-xyz',
    })
    // Recovery routes straight to permission creation when tosAccepted is falsy
    await flushAsync()
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(container!.textContent).not.toContain('Add a recovery email')

    vi.unstubAllGlobals()
  })

  it('routes to permission step when hasPermission is false — skips email and ToS recovery', async () => {
    // Covers all hasPermission:false recovery cases: skipped email, mid-email, never-saw-email.
    // None of them should show the email step on recovery ("no nag on this page").
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ hasPermission: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    // Must skip ToS and email.
    await flushAsync()
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(container!.textContent).not.toContain('Add a recovery email')
    // No email-status fetch should occur during recovery
    const emailStatusCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/email-status')
    )
    expect(emailStatusCalls).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  it('routes to permission step when wallet-status returns non-OK', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: false,
          text: async () => 'Server error',
          json: async () => ({}),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    await flushAsync()
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(container!.textContent).not.toContain('Add a recovery email')

    vi.unstubAllGlobals()
  })
})

describe('ensureGasReady', () => {
  it('uses stored token for /api/ensure-gas fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xwallet'], evmAccounts: [] },
      isNewUser: true,
    })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ ready: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    // ToS now auto-fires handleApprovePermission (which calls ensureGasReady)
    await goToPermissionStep('123456')
    await flushAsync()

    const ensureGasCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/ensure-gas')
    )
    expect(ensureGasCall).toBeDefined()
    expect((ensureGasCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer jwt-token',
    })

    vi.unstubAllGlobals()
  })
})

describe('handleApprovePermission', () => {
  it('uses stored token for /api/register-permission fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xwallet'], evmAccounts: [] },
      isNewUser: true,
    })
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ ready: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    // ToS now auto-fires handleApprovePermission
    await goToPermissionStep('123456')
    await flushAsync()

    const registerPermCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('/api/register-permission')
    )
    expect(registerPermCall).toBeDefined()
    expect((registerPermCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer jwt-token',
    })
    expect(JSON.parse((registerPermCall![1] as RequestInit).body as string)).toEqual({
      dailyLimit: '50',
    })

    const viem = await import('viem')
    expect(viem.parseUnits).toHaveBeenCalledWith('50', 6)

    vi.unstubAllGlobals()
  })
})

describe('email login flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows "Log in with email" link on phone step', async () => {
    await renderPage()
    expect(container!.textContent).toContain('Log in with email')
  })

  it('clicking link navigates to email-login step', async () => {
    await renderPage()
    await act(async () => {
      findButton('Log in with email')!.click()
    })
    expect(container!.textContent).toContain('Log In With Email')
    expect(container!.querySelector('input[type="email"]')).not.toBeNull()
  })

  it('back button returns to phone step', async () => {
    await renderPage()
    await act(async () => {
      findButton('Log in with email')!.click()
    })
    await act(async () => {
      findButton('Back to phone login')!.click()
    })
    expect(container!.querySelector('input[type="tel"]')).not.toBeNull()
  })

  it('happy path: send code → verify → authenticateWithJWT → advanceToCorrectStep', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendEmailLogin.mockResolvedValue(undefined)
    mocks.verifyEmailLogin.mockResolvedValue('email-jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: true, tosAccepted: true },
    })

    await renderPage()
    // Go to email login
    await act(async () => {
      findButton('Log in with email')!.click()
    })
    // Enter email
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    // Send code
    await act(async () => {
      findButton('Send code')!.click()
    })
    await flushAsync()

    expect(mocks.sendEmailLogin).toHaveBeenCalledWith('user@example.com')
    // Should be on OTP step
    expect(container!.textContent).toContain('If this email is registered')

    // Enter code
    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '123456')
    })
    // Verify
    await act(async () => {
      findButton('Verify')!.click()
    })
    await flushAsync()

    expect(mocks.verifyEmailLogin).toHaveBeenCalledWith('user@example.com', '123456')
    expect(mocks.storeToken).toHaveBeenCalledWith('email-jwt-token')
    expect(mocks.authenticateWithJWT).toHaveBeenCalled()
    await waitForRedirect('/settings')
  })

  it('shows error on invalid code', async () => {
    mocks.sendEmailLogin.mockResolvedValue(undefined)
    mocks.verifyEmailLogin.mockRejectedValue(new Error('Invalid or expired code'))

    await renderPage()
    await act(async () => {
      findButton('Log in with email')!.click()
    })
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })
    await flushAsync()

    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '000000')
    })
    await act(async () => {
      findButton('Verify')!.click()
    })
    await flushAsync()

    expect(container!.textContent).toContain('Invalid or expired code')
  })
})

// --- Helpers for advanceToCorrectStep tests ---

/** Standard OTP mocks for a returning-user test with backend enabled */
function setupOtpMocksWithBackend() {
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
  mocks.sendOtp.mockResolvedValue(undefined)
  // verifyOtp returns a JWT which storeToken() saves → getStoredToken()/getFreshToken() pick it up
  mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
  mocks.authenticateWithJWT.mockResolvedValue({
    user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
    isNewUser: false,
  })
}

/**
 * Create a fetch mock that routes by URL pattern.
 * register-wallet always succeeds; other URLs are configurable.
 */
function mockFetchByUrl(routes: Record<string, object>) {
  const fn = vi.fn().mockImplementation((url: string) => {
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ ok: true, text: async () => '', json: async () => body })
      }
    }
    // Default: succeed with empty body (covers register-wallet, etc.)
    return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('advanceToCorrectStep (after OTP verify with backend)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fully onboarded user (hasPermission) → redirects to /settings', async () => {
    setupOtpMocksWithBackend()
    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: true, tosAccepted: true },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await waitForRedirect('/settings')
  })

  it('returning user with tosAccepted but no permission → auto-creates permission', async () => {
    setupOtpMocksWithBackend()
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })
    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: false, tosAccepted: true },
      '/api/ensure-gas': { ready: true },
      '/api/register-permission': { ok: true },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    // useEffect auto-fires handleApprovePermission
    await flushAsync()
    await flushAsync()
    await flushAsync()
    expect(mocks.createSpendPermission).toHaveBeenCalled()
  })

  it('returning user with verified email but no ToS → skips email/ToS, auto-creates permission', async () => {
    setupOtpMocksWithBackend()
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })
    const fetchMock = mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: false, tosAccepted: false },
      '/api/auth/email-status': { hasEmail: true, verified: true, maskedEmail: 'u***@example.com' },
      '/api/ensure-gas': { ready: true },
      '/api/register-permission': { ok: true },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(container!.textContent).not.toContain('Add a recovery email')
    expect(mocks.createSpendPermission).toHaveBeenCalled()
    expect(
      fetchMock.mock.calls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('/api/auth/email-status')
      )
    ).toBe(false)
    expect(
      fetchMock.mock.calls.some(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/accept-tos')
      )
    ).toBe(false)
  })

  it('fresh user (no email, no ToS) → skips email/ToS and auto-creates permission', async () => {
    setupOtpMocksWithBackend()
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })
    const fetchMock = mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: false, tosAccepted: false },
      '/api/auth/email-status': { hasEmail: false, verified: false, maskedEmail: null },
      '/api/ensure-gas': { ready: true },
      '/api/register-permission': { ok: true },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')

    expect(container!.textContent).not.toContain('Add a recovery email')
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(mocks.createSpendPermission).toHaveBeenCalled()
    expect(
      fetchMock.mock.calls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('/api/auth/email-status')
      )
    ).toBe(false)
    expect(
      fetchMock.mock.calls.some(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/accept-tos')
      )
    ).toBe(false)
    expect(mocks.routerReplace).not.toHaveBeenCalledWith('/settings')
  })

  it('wallet-status returns non-OK → falls back to permission step (does not block onboarding)', async () => {
    setupOtpMocksWithBackend()
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })
    const fn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: false,
          text: async () => 'Server error',
          json: async () => ({}),
        })
      }
      if (url.includes('/api/ensure-gas')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ ready: true }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fn)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()
    expect(container!.textContent).not.toContain('Add a recovery email')
    expect(container!.textContent).not.toContain('Terms of Service')
    expect(mocks.createSpendPermission).toHaveBeenCalled()
  })
})

describe('session recovery redirects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hasPermission on recovery → redirects to /settings (not done step)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: true, tosAccepted: true },
    })

    await renderPage()
    await waitForRedirect('/settings')
  })

  it('recovered on-chain permission → redirects to /settings (not done step)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    const fn = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: false, tosAccepted: true }),
        })
      }
      if (url.includes('/api/register-permission') && opts?.method === 'POST') {
        // Simulate finding an existing on-chain permission
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ success: true, permissionHash: '0xhash', dailyLimit: 100 }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fn)

    await renderPage()
    await waitForRedirect('/settings')
  })
})

describe('OTP channel selection', () => {
  it('non-NANP number sends OTP via SMS by default', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()
    await goToOtpStep('+573001234567')

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567', 'sms')
  })

  it('NANP (+1) number sends OTP via WhatsApp', async () => {
    // Override URL phone to a US number
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === 'phone' ? '15550001234' : null
    )
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()

    // +1 shows single WhatsApp button (no SMS option)
    await act(async () => {
      findButton('WhatsApp')!.click()
    })

    expect(mocks.sendOtp).toHaveBeenCalledWith('+15550001234', 'whatsapp')
  })
})

describe('source integrity', () => {
  it('uses CDPProviderCustomAuth for all users', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).toMatch(/CDPProviderCustomAuth/)
  })

  it('uses channel-aware auth helpers', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).toMatch(/getDefaultChannel/)
    expect(source).toMatch(/canSwitchChannel/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// linkEventFiredRef guard — single-call invariant across the three call sites
//
// The setup page links the user to an event from three different places
// (see the block comment above `SetupContent`). All three are guarded by the
// same `linkEventFiredRef` so exactly one network call goes out per mount.
// If anyone adds a fourth call site without wiring the guard, these tests
// should catch it.
//
// Sites 2 (post-OTP `advanceToCorrectStep`) and 3 (mount-time session
// recovery) are driven directly here. Site 1 (the `done`-step effect) is
// covered by the source-code invariants below — driving it would require
// stepping through the full onboarding flow.
// ──────────────────────────────────────────────────────────────────────────────

describe('event linking — linkEventFiredRef guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
    window.localStorage?.clear?.()
  })

  // URL: ?phone=…&event=…&source=…
  function stubEventSearchParams(slug: string | null, source: string | null = null) {
    mocks.searchParamsGet.mockImplementation((key: string) => {
      if (key === 'phone') return '573001234567'
      if (key === 'event') return slug
      if (key === 'source') return source
      return null
    })
  }

  function countLinkEventCalls(mockFetch: ReturnType<typeof vi.fn>): RequestInit[] {
    return mockFetch.mock.calls
      .filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/api/link-event')
      )
      .map((c: unknown[]) => c[1] as RequestInit)
  }

  it('session recovery (signed-in user lands on /setup?event=…): fires linkEvent("returning") once and shows event-tagged step', async () => {
    // Site 3 — the mount-time recovery effect. The slug/source readers are
    // called inside the hasPermission branch (rather than reading the
    // closure-captured `eventSlug` state), which is what makes this path
    // reliable even on first-render-with-event-in-URL.
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    stubEventSearchParams('pizza-day', 'qr-booth')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      if (url.includes('/api/link-event')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({
            linked: true,
            event: { slug: 'pizza-day', name: 'Pizza Day', endsAt: null },
            actions: ['poap'],
            poapClaimUrl: 'https://poap.example/x',
            poapClaimed: false,
            linkedAtStep: 'returning',
          }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await flushAsync()
    await flushAsync()

    const calls = countLinkEventCalls(mockFetch)
    expect(calls.length).toBe(1)
    const body = JSON.parse(calls[0].body as string)
    expect(body).toEqual({
      eventSlug: 'pizza-day',
      linkedAtStep: 'returning',
      source: 'qr-booth',
    })
    // Stays on /setup rendering the event-tagged screen — does NOT redirect.
    expect(mocks.routerReplace).not.toHaveBeenCalledWith('/settings')
  })

  it('session recovery falls back to sessionStorage when URL has no event param', async () => {
    // Refresh case: user originally arrived via ?event=pizza-day, the slug
    // was persisted to sessionStorage, then the URL was cleaned. On a fresh
    // mount with no URL param, readAndPersistEventSlug picks up the stored
    // slug and site 3 still fires linkEvent.
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    // No event in URL
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    _storedToken = 'stored-token-xyz'
    window.sessionStorage.setItem('sippy:event-slug', 'pizza-day')
    window.sessionStorage.setItem('sippy:event-source', 'qr-booth')

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      if (url.includes('/api/link-event')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({
            linked: true,
            event: { slug: 'pizza-day', name: 'Pizza Day', endsAt: null },
            actions: [],
            poapClaimUrl: null,
            poapClaimed: false,
            linkedAtStep: 'returning',
          }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await flushAsync()
    await flushAsync()

    const calls = countLinkEventCalls(mockFetch)
    expect(calls.length).toBe(1)
    const body = JSON.parse(calls[0].body as string)
    expect(body.eventSlug).toBe('pizza-day')
    expect(body.source).toBe('qr-booth')
  })

  it('post-OTP advanceToCorrectStep (hasPermission + eventSlug): fires linkEvent("returning") exactly once', async () => {
    // Fresh OTP verify path: user enters phone + OTP, server reports
    // hasPermission=true, advanceToCorrectStep should fire linkEvent('returning')
    // exactly once with the canonical body (eventSlug + linkedAtStep + source).
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    stubEventSearchParams('pizza-day', 'twitter')
    setupOtpMocksWithBackend()

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      if (url.includes('/api/link-event')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({
            linked: true,
            event: { slug: 'pizza-day', name: 'Pizza Day', endsAt: null },
            actions: [],
            poapClaimUrl: null,
            poapClaimed: false,
            linkedAtStep: 'returning',
          }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()
    // Extra flushes in case a stray re-render attempts a second call.
    await flushAsync()

    const calls = countLinkEventCalls(mockFetch)
    expect(calls.length).toBe(1)
    const body = JSON.parse(calls[0].body as string)
    expect(body).toEqual({
      eventSlug: 'pizza-day',
      linkedAtStep: 'returning',
      source: 'twitter',
    })
  })

  it('source param is omitted from the request body when absent', async () => {
    // Defensive: lib/events.ts.linkEvent should only include `source` when
    // explicitly passed. Confirms attribution doesn't get polluted with an
    // empty-string source from a missing URL param.
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    stubEventSearchParams('pizza-day', null)
    setupOtpMocksWithBackend()

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      if (url.includes('/api/link-event')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({
            linked: true,
            event: { slug: 'pizza-day', name: 'Pizza Day', endsAt: null },
            actions: [],
            poapClaimUrl: null,
            poapClaimed: false,
            linkedAtStep: 'returning',
          }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()

    const calls = countLinkEventCalls(mockFetch)
    expect(calls.length).toBe(1)
    const body = JSON.parse(calls[0].body as string)
    expect(body).toEqual({ eventSlug: 'pizza-day', linkedAtStep: 'returning' })
    expect(body).not.toHaveProperty('source')
  })

  it('silent reject (linked:false) still fires exactly once — guard flips before await', async () => {
    // Server returns { linked: false } for unknown/inactive slugs. The guard
    // should still flip (it's set BEFORE the await), so a re-render of any
    // dependent effect can't double-fire even on rejection.
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    stubEventSearchParams('unknown-slug', 'twitter')
    setupOtpMocksWithBackend()

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      if (url.includes('/api/link-event')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ linked: false }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()
    await flushAsync()

    expect(countLinkEventCalls(mockFetch).length).toBe(1)
  })

  it('does not fire linkEvent on the post-OTP path when no eventSlug is present', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    setupOtpMocksWithBackend()

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: true,
          text: async () => '',
          json: async () => ({ hasWallet: true, hasPermission: true, tosAccepted: true }),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goPastOtpStep('123456')
    await flushAsync()

    expect(countLinkEventCalls(mockFetch).length).toBe(0)
    // Without an event slug, hasPermission redirects straight to /settings.
    await waitForRedirect('/settings')
  })
})

describe('event linking — source code invariants', () => {
  // Belt-and-suspenders: if someone removes the guard or adds a 4th call
  // site without wiring the ref, these tests fail fast — even when the
  // runtime path for that call site is hard to drive from JSDom.
  const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')

  // Strip line comments and block comments so the regexes below don't match
  // identifiers that only appear in comments. Cheap-and-cheerful: doesn't
  // handle every JS lexical edge case, but it's good enough for this file
  // where comments don't contain `//` or `/*` inside strings.
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }
  const code = stripComments(source)

  it('declares the linkEventFiredRef ref exactly once', () => {
    const declarations = code.match(/const linkEventFiredRef = useRef\(/g) ?? []
    expect(declarations.length).toBe(1)
  })

  it('every call to linkEvent() has a paired linkEventFiredRef.current = true assignment', () => {
    // Count `linkEvent(` invocations (excluding the named import in
    // `import { linkEvent, ... }`) vs ref-set sites. They should match —
    // if someone adds a 4th call site, this test forces them to wire the
    // guard too.
    const callSites = code.match(/(?:^|[^a-zA-Z_])linkEvent\(/g) ?? []
    // Drop the named-import occurrence: `  linkEvent,` inside the import block.
    // The import has a `,` immediately after, the calls have `(`. We already
    // matched `linkEvent(` so imports are excluded by construction.
    const refSets = code.match(/linkEventFiredRef\.current = true/g) ?? []
    expect(callSites.length).toBe(refSets.length)
    // And there really are three of them — the contract the block comment
    // above SetupContent describes.
    expect(callSites.length).toBe(3)
  })
})
