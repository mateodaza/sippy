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

// Advance to permission step
async function goToPermissionStep(otpCode = '123456') {
  await act(async () => {
    const input = container!.querySelector('input[type="text"]') as HTMLInputElement
    setInputValue(input, otpCode)
  })
  await act(async () => {
    findButton('Verify')!.click()
  })
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
  it('happy path: verifies OTP, stores token, authenticates, advances to permission step', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token-abc')
    mocks.storeToken.mockImplementation(() => {})
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: ['0xabc'], evmAccounts: [] },
      isNewUser: false,
    })
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToPermissionStep('123456')

    expect(mocks.verifyOtp).toHaveBeenCalledWith('+573001234567', '123456')
    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token-abc')
    expect(mocks.authenticateWithJWT).toHaveBeenCalled()
    // Should be on permission step
    expect(container!.textContent).toContain('Set Spending Limit')
  })

  it('shows error and stays on otp step when verifyOtp throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockRejectedValue(new Error('Invalid OTP'))
    await renderPage()

    await goToOtpStep('+573001234567')
    await goToPermissionStep('000000')

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
    await goToPermissionStep('123456')

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
    await goToPermissionStep('123456')

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

describe('source integrity', () => {
  it('does not import removed hooks from @coinbase/cdp-hooks', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/useSignInWithSms/)
    expect(source).not.toMatch(/useVerifySmsOTP/)
    expect(source).not.toMatch(/useGetAccessToken/)
  })
})
