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

// Advance through the ToS step (checkbox + Continue)
async function goThroughTosStep() {
  await act(async () => {
    const checkbox = container!.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.click()
  })
  await act(async () => {
    findButton('Continue')!.click()
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

// Advance to email step (after OTP verification)
// When BACKEND_URL is set, handleVerifyOtp makes async fetch calls
// (register-wallet, wallet-status, email-status) that need extra flushing.
async function goToEmailStep(otpCode = '123456') {
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

async function goToPermissionStepViaSkip() {
  // Skip email -> goes to ToS
  await act(async () => {
    findButton('Skip for now')!.click()
  })
  // Accept ToS -> goes to permission
  await goThroughTosStep()
}

// Advance to permission step (skip email, accept ToS)
async function goToPermissionStep(otpCode = '123456') {
  await goToEmailStep(otpCode)
  await goToPermissionStepViaSkip()
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
  vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '')
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
  it('happy path: verifies OTP, stores token, authenticates, advances to email step', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    expect(mocks.verifyOtp).toHaveBeenCalledWith('+573001234567', '123456')
    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token-abc')
    expect(mocks.authenticateWithJWT).toHaveBeenCalled()
    // Should now be on email step
    expect(container!.textContent).toContain('Add a recovery email (recommended)')
  })

  it('shows error and stays on otp step when verifyOtp throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockRejectedValue(new Error('Invalid OTP'))
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToEmailStep('000000')

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
    await goToEmailStep('123456')

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
    await goToEmailStep('123456')

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
    // Recovery routes to tos (not email) when tosAccepted is falsy
    expect(container!.textContent).toContain('Terms of Service')

    vi.unstubAllGlobals()
  })

  it('routes to tos step (not email) when hasPermission is false — covers skipped-email recovery', async () => {
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

    // Must show tos step, NOT email step (tosAccepted is falsy in response)
    expect(container!.textContent).toContain('Terms of Service')
    expect(container!.textContent).not.toContain('Add a recovery email')
    // No email-status fetch should occur during recovery
    const emailStatusCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/email-status')
    )
    expect(emailStatusCalls).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  it('routes to tos step when wallet-status returns non-OK', async () => {
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

    expect(container!.textContent).toContain('Terms of Service')
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

    vi.unstubAllGlobals()
  })
})

describe('handleSendEmailCode', () => {
  it('happy path: calls POST /api/auth/send-email-code and shows code input', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    // Token is set automatically by storeToken() during OTP verify

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    // Enter email and click Send code
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })

    const sendCodeCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('/api/auth/send-email-code')
    )
    expect(sendCodeCall).toBeDefined()
    expect((sendCodeCall![1] as RequestInit).headers).toMatchObject({
      'Authorization': 'Bearer jwt-token-abc',
      'Content-Type': 'application/json',
    })
    expect((sendCodeCall![1] as RequestInit).body).toBe(
      JSON.stringify({ email: 'user@example.com' })
    )
    // Code input should now be visible
    expect(container!.textContent).toContain('Code sent to user@example.com')

    vi.unstubAllGlobals()
  })

  it('shows error when send-email-code returns non-OK', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    // Token is set automatically by storeToken() during OTP verify

    // register-wallet (from handleVerifyOtp) must succeed so we reach the email step;
    // send-email-code should fail to exercise the error branch.
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/send-email-code')) {
        return Promise.resolve({
          ok: false,
          text: async () => 'Invalid email address',
          json: async () => ({}),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'bad-email')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })

    expect(container!.textContent).toContain('Failed to send email code')
    // Still on email step (email input still visible)
    expect(container!.querySelector('input[type="email"]')).not.toBeNull()

    vi.unstubAllGlobals()
  })
})

describe('handleVerifyEmailCode', () => {
  it('happy path: verifies code, shows confirmation, advances to tos after 1500ms', async () => {
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    // Token is set automatically by storeToken() during OTP verify

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    // Send email code
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })

    // Enter verification code
    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '654321')
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    const verifyCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('/api/auth/verify-email-code')
    )
    expect(verifyCall).toBeDefined()
    expect((verifyCall![1] as RequestInit).headers).toMatchObject({
      'Authorization': 'Bearer jwt-token-abc',
      'Content-Type': 'application/json',
    })
    expect((verifyCall![1] as RequestInit).body).toBe(
      JSON.stringify({ email: 'user@example.com', code: '654321' })
    )
    // Confirmation shown before auto-advance
    expect(container!.textContent).toContain('Email verified')

    // Advance timer to trigger setStep('tos')
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(container!.textContent).toContain('Terms of Service')

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows error when verify-email-code returns non-OK', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    // Token is set automatically by storeToken() during OTP verify

    // verify-email-code fails; all other endpoints succeed
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/verify-email-code')) {
        return Promise.resolve({
          ok: false,
          text: async () => 'Invalid code',
          json: async () => ({}),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })

    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '000000')
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    expect(container!.textContent).toContain('Failed to verify email code')
    // Still on email step (code input still visible)
    expect(container!.textContent).toContain('Code sent to user@example.com')

    vi.unstubAllGlobals()
  })
})

describe('handleSkipEmail', () => {
  it('skip before sending code: advances directly to tos step with no API call', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    await act(async () => {
      findButton('Skip for now')!.click()
    })

    expect(container!.textContent).toContain('Terms of Service')
    // No email-related fetch calls should have been made
    const emailCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/')
    )
    expect(emailCalls).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  it('skip after sending code: "Skip for now" still visible and advances to tos', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    // Token is set automatically by storeToken() during OTP verify

    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '', json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    // Send code first
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => {
      findButton('Send code')!.click()
    })

    // Now skip instead of entering code
    await act(async () => {
      findButton('Skip for now')!.click()
    })

    expect(container!.textContent).toContain('Terms of Service')

    vi.unstubAllGlobals()
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
    await goToEmailStep('123456')
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
    await goToEmailStep('123456')
    // useEffect auto-fires handleApprovePermission
    await flushAsync()
    await flushAsync()
    await flushAsync()
    expect(mocks.createSpendPermission).toHaveBeenCalled()
  })

  it('returning user with verified email but no ToS → skips email, goes to tos step', async () => {
    setupOtpMocksWithBackend()
    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: false, tosAccepted: false },
      '/api/auth/email-status': { hasEmail: true, verified: true, maskedEmail: 'u***@example.com' },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')
    await waitForContent('Terms of Service')
  })

  it('fresh user (no email, no ToS) → shows email step', async () => {
    setupOtpMocksWithBackend()
    mockFetchByUrl({
      '/api/wallet-status': { hasWallet: true, hasPermission: false, tosAccepted: false },
      '/api/auth/email-status': { hasEmail: false, verified: false, maskedEmail: null },
    })

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    expect(container!.textContent).toContain('Add a recovery email')
    expect(mocks.routerReplace).not.toHaveBeenCalledWith('/settings')
  })

  it('wallet-status returns non-OK → falls back to email step (does not block onboarding)', async () => {
    setupOtpMocksWithBackend()
    const fn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/wallet-status')) {
        return Promise.resolve({
          ok: false,
          text: async () => 'Server error',
          json: async () => ({}),
        })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fn)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')
    await waitForContent('Add a recovery email')
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
