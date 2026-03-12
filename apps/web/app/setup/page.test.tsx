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
  state: {
    isSignedIn: false as boolean | undefined,
    currentUser: null as unknown,
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useCreateSpendPermission: () => ({
    createSpendPermission: mocks.createSpendPermission,
    status: null,
  }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useSignOut: () => ({ signOut: mocks.signOut }),
}))

vi.mock('../../lib/auth', () => ({
  sendOtp: (...args: unknown[]) => mocks.sendOtp(...args),
  verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
  storeToken: (...args: unknown[]) => mocks.storeToken(...args),
  getStoredToken: () => mocks.getStoredToken(),
}))

vi.mock('viem', () => ({
  parseUnits: vi.fn(() => BigInt(0)),
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
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

// Advance to OTP step
async function goToOtpStep(phone = '+573001234567') {
  await act(async () => {
    const input = container!.querySelector('input[type="tel"]') as HTMLInputElement
    setInputValue(input, phone)
  })
  await act(async () => {
    findButton('Send Verification Code')!.click()
  })
}

// Advance to email step (after OTP verification)
async function goToEmailStep(otpCode = '123456') {
  await act(async () => {
    const input = container!.querySelector('input[type="text"]') as HTMLInputElement
    setInputValue(input, otpCode)
  })
  await act(async () => {
    findButton('Verify')!.click()
  })
}

async function goToPermissionStepViaSkip() {
  await act(async () => {
    findButton('Skip for now')!.click()
  })
}

// Advance to permission step (skip email)
async function goToPermissionStep(otpCode = '123456') {
  await goToEmailStep(otpCode)
  await goToPermissionStepViaSkip()
}

// --- Setup / Teardown ---

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.isSignedIn = false
  mocks.state.currentUser = null
  mocks.searchParamsGet.mockReturnValue(null)
  mocks.getStoredToken.mockReturnValue(null)
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

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567')
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('normalizes phone without + prefix', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()

    await goToOtpStep('573001234567')

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567')
    // phoneNumber state should be normalized — shown in OTP step text
    expect(container!.textContent).toContain('+573001234567')
  })

  it('shows error and stays on phone step when sendOtp throws', async () => {
    mocks.sendOtp.mockRejectedValue(new Error('Rate limit exceeded'))
    await renderPage()

    await goToOtpStep('+573001234567')

    expect(container!.textContent).toContain('Rate limit exceeded')
    // Still on phone step (tel input visible)
    expect(container!.querySelector('input[type="tel"]')).not.toBeNull()
  })
})

describe('handleVerifyOtp', () => {
  it('happy path: verifies OTP, stores token, authenticates, advances to email step', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
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

    expect(container!.textContent).toContain('Invalid OTP')
    // Should still be on OTP step (text input for OTP visible)
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('shows error when authenticateWithJWT throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockRejectedValue(new Error('Auth failed'))
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    expect(container!.textContent).toContain('Auth failed')
  })

  it('shows no-wallet error when user has no accounts', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: [], evmAccounts: [] },
    })
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    expect(container!.textContent).toContain('No wallet found. Please try again.')
  })
})

describe('session recovery', () => {
  it('uses getStoredToken for register-wallet fetch during session recovery', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    mocks.getStoredToken.mockReturnValue('stored-token-xyz')

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
    // Recovery routes to permission, not email — the single mock is sufficient
    // (no email-status fetch occurs during recovery)
    expect(container!.textContent).toContain('Set Spending Limit')

    vi.unstubAllGlobals()
  })

  it('routes to permission step (not email) when hasPermission is false — covers skipped-email recovery', async () => {
    // Covers all hasPermission:false recovery cases: skipped email, mid-email, never-saw-email.
    // None of them should show the email step on recovery ("no nag on this page").
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xwallet'], evmAccounts: [] }
    mocks.getStoredToken.mockReturnValue('stored-token-xyz')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ hasPermission: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    // Must show permission step, NOT email step
    expect(container!.textContent).toContain('Set Spending Limit')
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
    mocks.getStoredToken.mockReturnValue('stored-token-xyz')

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/api/wallet-status')) {
        return Promise.resolve({ ok: false, text: async () => 'Server error', json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, text: async () => '', json: async () => ({}) })
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    expect(container!.textContent).toContain('Set Spending Limit')
    expect(container!.textContent).not.toContain('Add a recovery email')

    vi.unstubAllGlobals()
  })
})

describe('ensureGasReady', () => {
  it('uses getStoredToken for /api/ensure-gas fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xwallet'], evmAccounts: [] },
      isNewUser: true,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-gas')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ ready: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToPermissionStep('123456')

    // Click Approve & Continue to trigger ensureGasReady
    await act(async () => {
      findButton('Approve')!.click()
    })

    const ensureGasCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/ensure-gas')
    )
    expect(ensureGasCall).toBeDefined()
    expect((ensureGasCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stored-token-gas',
    })

    vi.unstubAllGlobals()
  })
})

describe('handleApprovePermission', () => {
  it('uses getStoredToken for /api/register-permission fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xspender')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xwallet'], evmAccounts: [] },
      isNewUser: true,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-perm')
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ ready: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToPermissionStep('123456')

    await act(async () => {
      findButton('Approve')!.click()
    })

    const registerPermCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/register-permission')
    )
    expect(registerPermCall).toBeDefined()
    expect((registerPermCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stored-token-perm',
    })

    vi.unstubAllGlobals()
  })
})

describe('handleSendEmailCode', () => {
  it('happy path: calls POST /api/auth/send-email-code and shows code input', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-email')

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
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/send-email-code')
    )
    expect(sendCodeCall).toBeDefined()
    expect((sendCodeCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stored-token-email',
      'Content-Type': 'application/json',
    })
    expect((sendCodeCall![1] as RequestInit).body).toBe(JSON.stringify({ email: 'user@example.com' }))
    // Code input should now be visible
    expect(container!.textContent).toContain('Code sent to user@example.com')

    vi.unstubAllGlobals()
  })

  it('shows error when send-email-code returns non-OK', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-email')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Invalid email address',
      json: async () => ({}),
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

    expect(container!.textContent).toContain('Invalid email address')
    // Still on email step (email input still visible)
    expect(container!.querySelector('input[type="email"]')).not.toBeNull()

    vi.unstubAllGlobals()
  })
})

describe('handleVerifyEmailCode', () => {
  it('happy path: verifies code, shows confirmation, advances to permission after 1500ms', async () => {
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-email')

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
    await act(async () => { findButton('Send code')!.click() })

    // Enter verification code
    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '654321')
    })
    await act(async () => { findButton('Verify')!.click() })

    const verifyCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/verify-email-code')
    )
    expect(verifyCall).toBeDefined()
    expect((verifyCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer stored-token-email',
      'Content-Type': 'application/json',
    })
    expect((verifyCall![1] as RequestInit).body).toBe(JSON.stringify({ email: 'user@example.com', code: '654321' }))
    // Confirmation shown before auto-advance
    expect(container!.textContent).toContain('Email verified')

    // Advance timer to trigger setStep('permission')
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(container!.textContent).toContain('Set Spending Limit')

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows error when verify-email-code returns non-OK', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.getStoredToken.mockReturnValue('stored-token-email')

    // First call (register-wallet from handleVerifyOtp) succeeds,
    // second (send-email-code) succeeds, third (verify-email-code) fails
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, text: async () => 'Invalid code', json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => { findButton('Send code')!.click() })

    await act(async () => {
      const input = container!.querySelector('input[type="text"]') as HTMLInputElement
      setInputValue(input, '000000')
    })
    await act(async () => { findButton('Verify')!.click() })

    expect(container!.textContent).toContain('Invalid code')
    // Still on email step (code input still visible)
    expect(container!.textContent).toContain('Code sent to user@example.com')

    vi.unstubAllGlobals()
  })
})

describe('handleSkipEmail', () => {
  it('skip before sending code: advances directly to permission step with no API call', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })

    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    await act(async () => { findButton('Skip for now')!.click() })

    expect(container!.textContent).toContain('Set Spending Limit')
    // No email-related fetch calls should have been made
    const emailCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('/api/auth/')
    )
    expect(emailCalls).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  it('skip after sending code: "Skip for now" still visible and advances to permission', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    mocks.getStoredToken.mockReturnValue('stored-token')

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '', json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()
    await goToOtpStep('+573001234567')
    await goToEmailStep('123456')

    // Send code first
    await act(async () => {
      const input = container!.querySelector('input[type="email"]') as HTMLInputElement
      setInputValue(input, 'user@example.com')
    })
    await act(async () => { findButton('Send code')!.click() })

    // Now skip instead of entering code
    await act(async () => { findButton('Skip for now')!.click() })

    expect(container!.textContent).toContain('Set Spending Limit')

    vi.unstubAllGlobals()
  })
})

describe('source integrity', () => {
  it('does not import removed hooks from @coinbase/cdp-hooks', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/useSignInWithSms/)
    expect(source).not.toMatch(/useVerifySmsOTP/)
    expect(source).not.toMatch(/useGetAccessToken/)
  })
})
