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
  clearToken: vi.fn(),
  isTokenExpired: vi.fn(() => false),
  getTokenSecondsRemaining: vi.fn(() => 3600),
  authenticateWithJWT: vi.fn(),
  signInWithSms: vi.fn(() => Promise.resolve({ flowId: 'test-flow-id' })),
  verifySmsOTP: vi.fn(() => Promise.resolve()),
  getAccessToken: vi.fn(() => Promise.resolve('cdp-test-token')),
  createSpendPermission: vi.fn(),
  revokeSpendPermission: vi.fn(),
  refetchPermissions: vi.fn(),
  permissionsData: null as unknown,
  exportEvmAccount: vi.fn(),
  sendUserOperation: vi.fn(),
  signOut: vi.fn(),
  buildUsdcTransferCall: vi.fn(() => ({ to: '0x', data: '0x', value: BigInt(0) })),
  ensureGasReady: vi.fn(async () => true),
  getBalances: vi.fn(async () => ({ usdc: '10.5' })),
  searchParamsGet: vi.fn((_: string) => null as string | null),
  storeLanguage: vi.fn(),
  clearLanguage: vi.fn(),
  resolveLanguage: vi.fn(async () => 'en' as const),
  state: {
    isSignedIn: false as boolean | undefined,
    currentUser: null as unknown,
    // evmAccounts elements are objects with { address: string }
    // matching evmAccounts?.[0]?.address usage at settings/page.tsx line 440
    evmAccounts: [] as Array<{ address: string }>,
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  CDPHooksProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useCreateSpendPermission: () => ({
    createSpendPermission: mocks.createSpendPermission,
    status: null,
  }),
  useRevokeSpendPermission: () => ({ revokeSpendPermission: mocks.revokeSpendPermission }),
  useListSpendPermissions: () => ({
    refetch: mocks.refetchPermissions,
    data: mocks.permissionsData,
  }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useSignOut: () => ({ signOut: mocks.signOut }),
  useSignInWithSms: () => ({ signInWithSms: mocks.signInWithSms }),
  useVerifySmsOTP: () => ({ verifySmsOTP: mocks.verifySmsOTP }),
  useGetAccessToken: () => ({ getAccessToken: mocks.getAccessToken }),
  useEvmAccounts: () => ({ evmAccounts: mocks.state.evmAccounts }),
  useExportEvmAccount: () => ({ exportEvmAccount: mocks.exportEvmAccount }),
  useSendUserOperation: () => ({
    sendUserOperation: mocks.sendUserOperation,
    status: null,
    data: null,
    error: null,
  }),
}))

vi.mock('../../lib/i18n', async () => {
  // Import the real module and re-export everything, but override the
  // language-detection functions so the component always stays in English
  // during tests (prevents +57 Colombian number from switching to Spanish).
  const real = await vi.importActual('../../lib/i18n')
  return {
    ...(real as object),
    getStoredLanguage: () => 'en' as const,
    storeLanguage: mocks.storeLanguage,
    clearLanguage: mocks.clearLanguage,
    detectLanguageFromPhone: () => 'en' as const,
    fetchUserLanguage: async () => ({ language: 'en' as const, source: 'phone' as const }),
    resolveLanguage: mocks.resolveLanguage,
  }
})

vi.mock('../../lib/auth', () => ({
  sendOtp: mocks.sendOtp,
  verifyOtp: mocks.verifyOtp,
  storeToken: mocks.storeToken,
  getStoredToken: () => mocks.getStoredToken(),
  // getFreshToken delegates to getStoredToken so authenticated test setups work automatically
  getFreshToken: () => mocks.getStoredToken(),
  clearToken: mocks.clearToken,
  isTokenExpired: mocks.isTokenExpired,
  getTokenSecondsRemaining: mocks.getTokenSecondsRemaining,
}))

vi.mock('../../lib/blockscout', () => ({
  getBalances: mocks.getBalances,
}))

vi.mock('../../lib/usdc-transfer', () => ({
  buildUsdcTransferCall: mocks.buildUsdcTransferCall,
  ensureGasReady: mocks.ensureGasReady,
}))

vi.mock('viem', () => ({
  parseUnits: vi.fn(() => BigInt(0)),
  formatEther: vi.fn(() => '0.01'),
  formatUnits: vi.fn(() => '10.5'),
}))

vi.mock('@wagmi/core', () => ({
  getBalance: vi.fn(async () => ({ value: BigInt(10000000000000000) })),
  readContract: vi.fn(async () => BigInt(10500000)),
}))

vi.mock('../providers/Web3Provider', () => ({
  wagmiConfig: {},
}))

// Mock react-international-phone so SippyPhoneInput is a simple controlled <input type="tel">
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

// fetch mock calls are typed as [string] but actually include [string, RequestInit?]
type FetchCall = [url: string, init?: RequestInit]
function fetchInit(call: unknown): RequestInit {
  return (call as FetchCall)[1]!
}

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderPage() {
  // Dynamic import so vi.stubEnv takes effect at module load time
  const { default: SettingsPage } = await import('./page')
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    root = createRoot(container!)
    root.render(React.createElement(SettingsPage))
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
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function goToOtpStep(phone = '+573001234567') {
  await act(async () => {
    const input = container!.querySelector('input[type="tel"]') as HTMLInputElement
    setInputValue(input, phone)
  })
  await act(async () => {
    findButton('Send Verification Code')!.click()
  })
}

async function goToVerifyStep(otpCode = '123456') {
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
  mocks.state.evmAccounts = []
  mocks.permissionsData = null
  mocks.searchParamsGet.mockReturnValue(null)
  mocks.getStoredToken.mockReturnValue(null)
  mocks.refetchPermissions.mockResolvedValue(undefined)
  mocks.resolveLanguage.mockResolvedValue('en')
  vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '')
  vi.stubEnv('NEXT_PUBLIC_SIPPY_NETWORK', 'arbitrum')
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// --- Tests ---

describe('handleSendOtp', () => {
  it('happy path: advances to otp step and calls signInWithSms with E.164 phone', async () => {
    await renderPage()

    await goToOtpStep('+573001234567')

    // CDP SMS path (default when Twilio disabled)
    expect(mocks.signInWithSms).toHaveBeenCalledWith({ phoneNumber: '+573001234567' })
    expect(mocks.sendOtp).not.toHaveBeenCalled()
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
    expect(container!.textContent).toContain('+573001234567')
  })

  it('normalizes phone with + prefix before calling signInWithSms', async () => {
    await renderPage()

    await goToOtpStep('573001234567')

    // useSessionGuard normalizes: phone.startsWith('+') ? phone : `+${phone}`
    expect(mocks.signInWithSms).toHaveBeenCalledWith({ phoneNumber: '+573001234567' })
    expect(container!.textContent).toContain('573001234567')
  })

  it('shows error and stays on phone step when signInWithSms throws', async () => {
    mocks.signInWithSms.mockRejectedValueOnce(new Error('Rate limit exceeded'))
    await renderPage()

    await goToOtpStep('+573001234567')

    // Hook sets reAuthError to err.message directly
    expect(container!.textContent).toContain('Rate limit exceeded')
    // Still on phone step (tel input visible)
    expect(container!.querySelector('input[type="tel"]')).not.toBeNull()
  })
})

describe('handleVerifyOtp', () => {
  it('happy path: verifies OTP via CDP SMS, exchanges token, shows Wallet Security', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.evmAccounts = [{ address: '0xEOA123' }]
    mocks.state.currentUser = {
      evmSmartAccounts: ['0xSMART456'],
      evmSmartAccountObjects: [{ address: '0xSMART456' }],
      evmAccounts: ['0xEOA123'],
    }
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/exchange-cdp-token')) {
        return { ok: true, json: async () => ({ token: 'jwt-token' }) }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(mocks.verifySmsOTP).toHaveBeenCalled()
    expect(mocks.getAccessToken).toHaveBeenCalled()
    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token')
    // authenticateWithJWT NOT called for CDP SMS path
    expect(mocks.authenticateWithJWT).not.toHaveBeenCalled()
    expect(container!.querySelector('input[type="text"]')).toBeNull()
    expect(container!.textContent).toContain('Wallet Security')
  })

  it('shows error and stays on otp step when verifySmsOTP throws', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.verifySmsOTP.mockRejectedValueOnce(new Error('Invalid OTP'))
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(container!.textContent).toContain('Invalid OTP')
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('shows error when exchange-cdp-token fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(container!.textContent).toContain('Failed to exchange CDP token')
  })

  it('authenticates even when user has no EVM accounts (no-wallet check removed from hook)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/exchange-cdp-token')) {
        return { ok: true, json: async () => ({ token: 'jwt-token' }) }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token')
    expect(container!.textContent).toContain('Wallet Security')
  })
})

describe('session recovery', () => {
  it('restores session and calls only /api/wallet-status (not /api/register-wallet)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: true, dailyLimit: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    const walletStatusCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/wallet-status')
    )
    expect(walletStatusCall).toBeDefined()
    expect(fetchInit(walletStatusCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })

    const registerWalletCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/register-wallet')
    )
    expect(registerWalletCall).toBeUndefined()
  })
})

describe('backend API calls use getStoredToken', () => {
  it('fetchWalletStatus sends Authorization Bearer to /api/wallet-status', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    const walletStatusCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/wallet-status')
    )
    expect(walletStatusCall).toBeDefined()
    expect(fetchInit(walletStatusCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })
  })

  it('handleRevoke sends Authorization Bearer to /api/revoke-permission', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xSIPPY')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    // permissionsData must contain an active permission matching SIPPY_SPENDER_ADDRESS
    mocks.permissionsData = {
      spendPermissions: [
        {
          permission: { spender: '0xSIPPY' },
          permissionHash: '0xHASH',
          revoked: false,
        },
      ],
    }
    // wallet-status returns hasPermission: true so the Revoke button renders
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: true, dailyLimit: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)
    mocks.revokeSpendPermission.mockResolvedValue(undefined)

    await renderPage()

    await act(async () => {
      findButton('Revoke Permission')!.click()
    })
    // No verified email → warning_no_email gate shown; dismiss to proceed
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    // wait for handleRevoke (includes 100ms setTimeout for permissionsDataRef settle)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })

    const revokeCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/revoke-permission')
    )
    expect(revokeCall).toBeDefined()
    expect(fetchInit(revokeCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })
  })

  it('handleChangeLimit sends Authorization Bearer to /api/register-permission', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xSIPPY')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    // wallet-status returns hasPermission: false so "Enable Sippy" button renders
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: false }),
    })
    vi.stubGlobal('fetch', mockFetch)
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })

    await renderPage()

    await act(async () => {
      findButton('Enable Sippy')!.click()
    })

    const registerCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/register-permission')
    )
    expect(registerCall).toBeDefined()
    expect(fetchInit(registerCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })
  })

  it('logExportEventFn sends Authorization Bearer to /api/log-export-event', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    // eoaAddress comes from evmAccounts?.[0]?.address (line 440)
    // must be set so the "Export Private Key" button renders
    mocks.state.evmAccounts = [{ address: '0xEOA123' }]
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: true, dailyLimit: 100 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    await act(async () => {
      findButton('Export Private Key')!.click()
    })
    // No verified email → warning_no_email gate shown; dismiss to proceed
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    // Allow fire-and-forget logExportEventFn to complete
    await act(async () => {})

    const logCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/log-export-event')
    )
    expect(logCall).toBeDefined()
    expect(fetchInit(logCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })
  })
})

describe('sweep and export flow', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = {
      evmSmartAccounts: ['0xSMART456'],
      evmSmartAccountObjects: [{ address: '0xSMART456' }], // line 97: smartAccountAddress source
      evmAccounts: ['0xEOA123'],
    }
    mocks.state.evmAccounts = [{ address: '0xEOA123' }] // line 440: eoaAddress source
    mocks.getStoredToken.mockReturnValue('mock-token')
    mocks.getBalances.mockResolvedValue({ usdc: '10.5' }) // non-trivial → sweep_offer shown
    // session recovery fetch: wallet-status returns authenticated state
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hasPermission: true, dailyLimit: 100 }),
      })
    )
  })

  it('handleSweep happy path: calls ensureGasReady, buildUsdcTransferCall, sendUserOperation', async () => {
    await renderPage()

    await act(async () => {
      findButton('Export Private Key')!.click()
    })
    // No verified email → warning_no_email gate; dismiss to proceed to export flow
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    await act(async () => {
      findButton('I understand, continue')!.click()
    })
    // Flush async getBalancesRpcSettings + state update for sweep_offer render
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      findButton('Transfer to Web Wallet')!.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mocks.ensureGasReady).toHaveBeenCalledWith(
      'http://localhost:3001',
      'mock-token',
      2,
      '0xSMART456'
    )
    expect(mocks.buildUsdcTransferCall).toHaveBeenCalledWith('0xEOA123', expect.any(String))
    expect(mocks.sendUserOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        evmSmartAccount: '0xSMART456',
      })
    )
  })

  it('handleSweep null token error: shows "Session expired" and does not call sendUserOperation', async () => {
    // Provide tokens for fetchWalletStatus + fetchEmailStatus (called after OTP verification)
    // so emailSectionStep transitions out of 'loading' and the export button becomes clickable.
    // Then return null for logExportEventFn and handleSweep — handleSweep shows "Session expired".
    mocks.state.isSignedIn = false // Use OTP flow
    // useSessionGuard now checks getStoredToken() + isTokenExpired() on mount;
    // return expired so it falls through to OTP flow
    mocks.isTokenExpired.mockReturnValueOnce(true)
    mocks.getStoredToken
      .mockReturnValueOnce('setup-token') // useSessionGuard hook useState lazy init
      .mockReturnValueOnce('setup-token') // useSessionGuard mount effect getStoredToken()
      .mockReturnValueOnce('setup-token') // language mount useEffect (getStoredToken call)
      .mockReturnValueOnce('setup-token') // fetchWalletStatus after OTP
      .mockReturnValueOnce('setup-token') // fetchEmailStatus after OTP
      .mockReturnValue(null) // fetchPrivacyStatus (early return) + export flow null tokens

    // CDP SMS verify + token exchange
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/exchange-cdp-token')) {
        return { ok: true, json: async () => ({ token: 'jwt-token' }) }
      }
      if (typeof url === 'string' && url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: true, dailyLimit: 100 }) }
    })
    vi.stubGlobal('fetch', mockFetch)

    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    await act(async () => {
      findButton('Export Private Key')!.click()
    })
    // No verified email → warning_no_email gate; dismiss to proceed to export flow
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    await act(async () => {
      findButton('I understand, continue')!.click()
    })
    await act(async () => {}) // wait for getBalances and sweep_offer render

    await act(async () => {
      findButton('Transfer to Web Wallet')!.click()
    })
    await act(async () => {}) // wait for handleSweep

    expect(container!.textContent).toContain('Transfer failed. Please try again.')
    expect(mocks.sendUserOperation).not.toHaveBeenCalled()
  })

  it('handleExportContinue happy path: private key displayed', async () => {
    // Low USDC balance so handleWarningContinue auto-skips sweep → export
    const { formatUnits } = await import('viem')
    ;(formatUnits as ReturnType<typeof vi.fn>).mockReturnValueOnce('0.001')
    mocks.exportEvmAccount.mockResolvedValue({ privateKey: '0xPRIVKEY' })

    await renderPage()

    await act(async () => {
      findButton('Export Private Key')!.click()
    })
    // No verified email → warning_no_email gate; dismiss to proceed to export flow
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    await act(async () => {
      findButton('I understand, continue')!.click()
    })
    await act(async () => {}) // wait for auto-export

    expect(container!.textContent).toContain('0xPRIVKEY')
  })

  it('handleExportContinue error path: shows export error, key not shown', async () => {
    // Low USDC balance so handleWarningContinue auto-skips sweep → export
    const { formatUnits } = await import('viem')
    ;(formatUnits as ReturnType<typeof vi.fn>).mockReturnValueOnce('0.001')
    mocks.exportEvmAccount.mockRejectedValue(new Error('Export failed'))

    await renderPage()

    await act(async () => {
      findButton('Export Private Key')!.click()
    })
    // No verified email → warning_no_email gate; dismiss to proceed to export flow
    await act(async () => {
      findButton('Continue Anyway')!.click()
    })
    await act(async () => {
      findButton('I understand, continue')!.click()
    })
    await act(async () => {}) // wait for error

    expect(container!.textContent).toContain('Export failed')
    // exportStep does NOT advance to export_active — "Your Private Key" section not shown
    expect(container!.textContent).not.toContain('Your Private Key')
  })
})

// Helper: render with authenticated session and email-status stub
async function renderWithEmailStatus(emailStatusPayload: object) {
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
  mocks.state.isSignedIn = true
  mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
  mocks.getStoredToken.mockReturnValue('mock-token')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return { ok: true, json: async () => emailStatusPayload }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
  )
  await renderPage()
}

describe('email management', () => {
  it('banner shown when no email', async () => {
    await renderWithEmailStatus({ hasEmail: false, verified: false, maskedEmail: null })
    expect(container!.textContent).toContain(
      'Add a recovery email to unlock higher spending limits'
    )
  })

  it('banner dismissed on ✕ click', async () => {
    await renderWithEmailStatus({ hasEmail: false, verified: false, maskedEmail: null })
    await act(async () => {
      findButton('✕')!.click()
    })
    expect(container!.textContent).not.toContain(
      'Add a recovery email to unlock higher spending limits'
    )
  })

  it('no email — shows email input directly without extra click', async () => {
    await renderWithEmailStatus({ hasEmail: false, verified: false, maskedEmail: null })
    expect(container!.querySelector('input[type="email"]')).not.toBeNull()
  })

  it('handleSendEmailCode (add flow) calls correct endpoint with email and auth header', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      if (url.includes('/api/auth/send-email-code')) {
        return { ok: true, json: async () => ({ success: true }) }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'test@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Add Email')!.click()
    })

    const sendCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/send-email-code')
    )
    expect(sendCall).toBeDefined()
    expect(fetchInit(sendCall!).headers).toMatchObject({ Authorization: 'Bearer mock-token' })
    expect(JSON.parse(fetchInit(sendCall!).body as string)).toEqual({ email: 'test@example.com' })
  })

  it('code input shown after send success', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/email-status')) {
          return {
            ok: true,
            json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
          }
        }
        return { ok: true, json: async () => ({ success: true }) }
      })
    )
    await renderPage()

    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'test@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Add Email')!.click()
    })

    expect(container!.querySelector('input[placeholder="Enter 6-digit code"]')).not.toBeNull()
    expect(container!.textContent).toContain('Code sent to test@example.com')
  })

  it('handleVerifyEmailCode (add flow) includes email in body', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    // Enter email and send code
    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'test@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Add Email')!.click()
    })

    // Enter code and verify
    await act(async () => {
      const codeInput = container!.querySelector(
        'input[placeholder="Enter 6-digit code"]'
      ) as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(codeInput, '123456')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    const verifyCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCall).toBeDefined()
    expect(JSON.parse(fetchInit(verifyCall!).body as string)).toEqual({
      email: 'test@example.com',
      code: '123456',
    })
  })

  it('error displayed on failed verify', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/auth/email-status')) {
          return {
            ok: true,
            json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
          }
        }
        if (url.includes('/api/auth/send-email-code')) {
          return { ok: true, json: async () => ({ success: true }) }
        }
        if (url.includes('/api/auth/verify-email-code')) {
          return { ok: false, json: async () => ({ error: 'invalid_or_expired_code' }) }
        }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'test@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Add Email')!.click()
    })
    await act(async () => {
      const codeInput = container!.querySelector(
        'input[placeholder="Enter 6-digit code"]'
      ) as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(codeInput, '123456')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    expect(container!.textContent).toContain('Invalid or expired code.')
  })

  it('Resend code (add flow) calls send-email-code with same email', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'test@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Add Email')!.click()
    })
    mockFetch.mockClear()
    await act(async () => {
      findButton('Resend code')!.click()
    })

    const resendCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/send-email-code')
    )
    expect(resendCall).toBeDefined()
    expect(JSON.parse(fetchInit(resendCall!).body as string)).toEqual({ email: 'test@example.com' })
  })

  it('verified email — shows maskedEmail and Change button', async () => {
    await renderWithEmailStatus({ hasEmail: true, verified: true, maskedEmail: 'm***@gmail.com' })
    expect(container!.textContent).toContain('m***@gmail.com')
    expect(findButton('Change')).not.toBeNull()
  })

  it('unverified — shows maskedEmail, Verify and Resend code buttons', async () => {
    await renderWithEmailStatus({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' })
    expect(container!.textContent).toContain('u***@gmail.com')
    expect(findButton('Verify')).not.toBeNull()
    expect(findButton('Resend code')).not.toBeNull()
  })

  it('Verify click (unverified idle) transitions to verify_entry — shows email and code inputs, no fetch yet', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    mockFetch.mockClear()
    await act(async () => {
      findButton('Verify')!.click()
    })

    expect(container!.querySelector('input[type="email"]')).not.toBeNull()
    expect(container!.querySelector('input[placeholder="Enter 6-digit code"]')).not.toBeNull()
    const verifyCalls = mockFetch.mock.calls.filter(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCalls).toHaveLength(0)
  })

  it('Resend code click (unverified idle) transitions to verify_entry — shows email input, no fetch yet', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    mockFetch.mockClear()
    await act(async () => {
      findButton('Resend code')!.click()
    })

    expect(container!.querySelector('input[type="email"]')).not.toBeNull()
    const sendCalls = mockFetch.mock.calls.filter(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/send-email-code')
    )
    expect(sendCalls).toHaveLength(0)
  })

  it('verify submit from verify_entry — calls verify-email-code with email and code', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      findButton('Verify')!.click()
    }) // → verify_entry
    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'user@gmail.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      const codeInput = container!.querySelector(
        'input[placeholder="Enter 6-digit code"]'
      ) as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(codeInput, '123456')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    const verifyCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCall).toBeDefined()
    expect(JSON.parse(fetchInit(verifyCall!).body as string)).toEqual({
      email: 'user@gmail.com',
      code: '123456',
    })
  })

  it('verify submit from verify_entry — blocked when email empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      findButton('Verify')!.click()
    }) // → verify_entry
    // leave email empty, fill code
    await act(async () => {
      const codeInput = container!.querySelector(
        'input[placeholder="Enter 6-digit code"]'
      ) as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(codeInput, '123456')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mockFetch.mockClear()
    // Verify button should be disabled (empty email) — clicking does nothing
    const verifyBtn = findButton('Verify') as HTMLButtonElement
    expect(verifyBtn.disabled).toBe(true)

    const verifyCalls = mockFetch.mock.calls.filter(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCalls).toHaveLength(0)
  })

  it('Resend code from verify_entry — calls send-email-code with email', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: false, maskedEmail: 'u***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      findButton('Resend code')!.click()
    }) // → verify_entry
    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'user@gmail.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mockFetch.mockClear()
    await act(async () => {
      findButton('Resend code')!.click()
    })

    const sendCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/send-email-code')
    )
    expect(sendCall).toBeDefined()
    expect(JSON.parse(fetchInit(sendCall!).body as string)).toEqual({ email: 'user@gmail.com' })
  })

  it('Change — shows new email input; verify-email-code not called yet', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: true, maskedEmail: 'm***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    mockFetch.mockClear()
    await act(async () => {
      findButton('Change')!.click()
    })

    expect(container!.querySelector('input[type="email"]')).not.toBeNull()
    const verifyCalls = mockFetch.mock.calls.filter(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCalls).toHaveLength(0)
  })

  it('change flow — verify new email calls verify-email-code with new email', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: true, verified: true, maskedEmail: 'm***@gmail.com' }),
        }
      }
      return { ok: true, json: async () => ({ success: true }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      findButton('Change')!.click()
    }) // → change_entry
    await act(async () => {
      const emailInput = container!.querySelector('input[type="email"]') as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(emailInput, 'new@example.com')
      emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Send Code')!.click()
    }) // → change_sent
    await act(async () => {
      const codeInput = container!.querySelector(
        'input[placeholder="Enter 6-digit code"]'
      ) as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(codeInput, '123456')
      codeInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      findButton('Verify')!.click()
    })

    const verifyCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/verify-email-code')
    )
    expect(verifyCall).toBeDefined()
    expect(JSON.parse(fetchInit(verifyCall!).body as string)).toEqual({
      email: 'new@example.com',
      code: '123456',
    })
  })

  it('fetchEmailStatus called on session restore', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    const emailStatusCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/email-status')
    )
    expect(emailStatusCall).toBeDefined()
    expect(fetchInit(emailStatusCall!).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })
  })

  it('fetchEmailStatus called after OTP verify', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = false
    mocks.state.currentUser = null
    mocks.state.evmAccounts = [{ address: '0xEOA123' }]
    // useSessionGuard now checks getStoredToken() + isTokenExpired() on mount;
    // return expired so it falls through to OTP flow
    mocks.isTokenExpired.mockReturnValueOnce(true)
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/exchange-cdp-token')) {
        return { ok: true, json: async () => ({ token: 'jwt-token' }) }
      }
      if (typeof url === 'string' && url.includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      return { ok: true, json: async () => ({ hasPermission: false }) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    const emailStatusCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/auth/email-status')
    )
    expect(emailStatusCall).toBeDefined()
  })
})

describe('source integrity', () => {
  it('settings/page.tsx does not contain useSignInWithSms', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/useSignInWithSms/)
  })

  it('settings/page.tsx does not contain useVerifySmsOTP', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/useVerifySmsOTP/)
  })

  it('settings/page.tsx does not contain useGetAccessToken', () => {
    const source = readFileSync(join(__dir, 'page.tsx'), 'utf-8')
    expect(source).not.toMatch(/useGetAccessToken/)
  })
})

// Helper: render the page in authenticated state with verifiedPhone set
async function renderAuthenticated(
  opts: {
    backendUrl?: string
    phoneNumber?: string
    walletStatusExtra?: Record<string, unknown>
  } = {}
) {
  const backendUrl = opts.backendUrl ?? 'http://localhost:3001'
  const phoneNumber = opts.phoneNumber ?? '+5511999990000'
  vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', backendUrl)
  mocks.state.isSignedIn = true
  mocks.state.currentUser = {
    evmSmartAccounts: ['0xSMART456'],
    evmSmartAccountObjects: [{ address: '0xSMART456' }],
    evmAccounts: ['0xEOA123'],
  }
  mocks.state.evmAccounts = [{ address: '0xEOA123' }]
  mocks.getStoredToken.mockReturnValue('mock-token')
  const mockFetch = vi.fn(async (url: string) => {
    if ((url as string).includes('/api/auth/email-status')) {
      return {
        ok: true,
        json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
      }
    }
    if ((url as string).includes('/api/set-language')) {
      return { ok: true, json: async () => ({ ok: true }) }
    }
    // wallet-status
    return {
      ok: true,
      json: async () => ({
        hasPermission: true,
        dailyLimit: 100,
        phoneNumber,
        ...(opts.walletStatusExtra ?? {}),
      }),
    }
  })
  vi.stubGlobal('fetch', mockFetch)
  await renderPage()
  return mockFetch
}

describe('handleSetLanguage', () => {
  it('TC-LN-003-F01: language buttons render after auth (en/es/pt/auto all present)', async () => {
    await renderAuthenticated()
    expect(container!.textContent).toContain('Language')
    expect(findButton('English')).not.toBeNull()
    expect(findButton('Español')).not.toBeNull()
    expect(findButton('Português')).not.toBeNull()
    expect(findButton('Auto-detect')).not.toBeNull()
  })

  it('TC-LN-003-F02: clicking Español POSTs {language:es} and storeLanguage(es) called', async () => {
    const mockFetch = await renderAuthenticated()

    await act(async () => {
      findButton('Español')!.click()
    })

    const setLangCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/set-language')
    )
    expect(setLangCall).toBeDefined()
    expect(JSON.parse(fetchInit(setLangCall!).body as string)).toEqual({ language: 'es' })
    expect(mocks.storeLanguage).toHaveBeenCalledWith('es')
  })

  it('TC-LN-003-F03: clicking Português POSTs {language:pt} and lang updates to pt', async () => {
    const mockFetch = await renderAuthenticated()

    await act(async () => {
      findButton('Português')!.click()
    })

    const setLangCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/set-language')
    )
    expect(setLangCall).toBeDefined()
    expect(JSON.parse(fetchInit(setLangCall!).body as string)).toEqual({ language: 'pt' })
    expect(mocks.storeLanguage).toHaveBeenCalledWith('pt')
    // Verify the UI re-rendered: the Português button should now be highlighted (lang === 'pt')
    expect(findButton('Português')!.className).toContain('border-brand-crypto')
  })

  it('TC-LN-003-F04: clicking Auto-detect POSTs {language:null}, clears language, calls resolveLanguage with verifiedPhone', async () => {
    const mockFetch = await renderAuthenticated({ phoneNumber: '+5511999990000' })

    await act(async () => {
      findButton('Auto-detect')!.click()
    })

    const setLangCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/set-language')
    )
    expect(setLangCall).toBeDefined()
    expect(JSON.parse(fetchInit(setLangCall!).body as string)).toEqual({ language: null })
    expect(mocks.clearLanguage).toHaveBeenCalled()
    expect(mocks.resolveLanguage).toHaveBeenCalledWith(
      '+5511999990000',
      expect.anything(),
      expect.anything()
    )
  })

  it('TC-LN-003-F05: POST fails → error message shown', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = {
      evmSmartAccounts: ['0xSMART456'],
      evmSmartAccountObjects: [{ address: '0xSMART456' }],
      evmAccounts: ['0xEOA123'],
    }
    mocks.state.evmAccounts = [{ address: '0xEOA123' }]
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if ((url as string).includes('/api/auth/email-status')) {
        return {
          ok: true,
          json: async () => ({ hasEmail: false, verified: false, maskedEmail: null }),
        }
      }
      if ((url as string).includes('/api/set-language')) {
        return { ok: false, json: async () => ({ error: 'internal_error' }) }
      }
      return {
        ok: true,
        json: async () => ({ hasPermission: true, dailyLimit: 100, phoneNumber: '+5511999990000' }),
      }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    await act(async () => {
      findButton('English')!.click()
    })

    expect(container!.textContent).toContain('Failed to save language preference')
  })
})

describe('privacy toggle', () => {
  it('TC-PV-003-W-01: GET /api/privacy-status called on session restore with Bearer token', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/wallet-status'))
        return { ok: true, json: async () => ({ hasPermission: false }) }
      if (url.includes('/api/auth/email-status'))
        return { ok: true, json: async () => ({ verified: false }) }
      if (url.includes('/api/privacy-status'))
        return { ok: true, json: async () => ({ phoneVisible: true }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    const privacyCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/privacy-status')
    )
    expect(privacyCall).toBeDefined()
    expect(fetchInit(privacyCall!).headers).toMatchObject({ Authorization: 'Bearer mock-token' })
  })

  it('TC-PV-003-W-02: toggle renders checked when phoneVisible: true', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: false }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/privacy-status'))
          return { ok: true, json: async () => ({ phoneVisible: true }) }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    const checkbox = container!.querySelector('input[role="switch"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(true)
  })

  it('TC-PV-003-W-03: toggle renders unchecked when phoneVisible: false', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: false }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/privacy-status'))
          return { ok: true, json: async () => ({ phoneVisible: false }) }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    const checkbox = container!.querySelector('input[role="switch"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(false)
  })

  it('TC-PV-003-W-04: toggling off calls POST /api/set-privacy with {phoneVisible:false} and Bearer', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/wallet-status'))
        return { ok: true, json: async () => ({ hasPermission: false }) }
      if (url.includes('/api/auth/email-status'))
        return { ok: true, json: async () => ({ verified: false }) }
      if (url.includes('/api/privacy-status'))
        return { ok: true, json: async () => ({ phoneVisible: true }) }
      if (url.includes('/api/set-privacy')) return { ok: true, json: async () => ({}) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', mockFetch)
    await renderPage()

    const checkbox = container!.querySelector('input[role="switch"]') as HTMLInputElement
    await act(async () => {
      checkbox.click()
    })

    const setPrivacyCall = mockFetch.mock.calls.find(
      (call: any[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('/api/set-privacy')
    )
    expect(setPrivacyCall).toBeDefined()
    expect(JSON.parse(fetchInit(setPrivacyCall!).body as string)).toEqual({ phoneVisible: false })
    expect(fetchInit(setPrivacyCall!).headers).toMatchObject({ Authorization: 'Bearer mock-token' })
  })

  it('TC-PV-003-W-05: toggle is disabled while privacySaving (save in-flight)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    let resolveSetPrivacy!: () => void
    const setPrivacyPromise = new Promise<void>((resolve) => {
      resolveSetPrivacy = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: false }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/privacy-status'))
          return { ok: true, json: async () => ({ phoneVisible: true }) }
        if (url.includes('/api/set-privacy')) {
          await setPrivacyPromise
          return { ok: true, json: async () => ({}) }
        }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    const checkbox = container!.querySelector('input[role="switch"]') as HTMLInputElement
    // Trigger toggle without awaiting completion — use sync act so state flushes but fetch stays pending
    act(() => {
      checkbox.click()
    })

    // While save is in-flight, checkbox should be disabled
    expect(checkbox.disabled).toBe(true)

    // Cleanup: resolve the promise
    await act(async () => {
      resolveSetPrivacy()
    })
  })

  it('TC-PV-003-W-06: error from POST /api/set-privacy shows error text', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: false }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/privacy-status'))
          return { ok: true, json: async () => ({ phoneVisible: true }) }
        if (url.includes('/api/set-privacy')) return { ok: false, json: async () => ({}) }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    const checkbox = container!.querySelector('input[role="switch"]') as HTMLInputElement
    await act(async () => {
      checkbox.click()
    })

    expect(container!.textContent).toContain('Failed to save privacy setting')
  })
})

// ---------------------------------------------------------------------------
// Change-limit UI (for users with active permission)
// ---------------------------------------------------------------------------

describe('change-limit UI', () => {
  async function renderWithPermission(dailyLimit = 50) {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xSIPPY')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: true, dailyLimit }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/privacy-status'))
          return { ok: true, json: async () => ({ phoneVisible: true }) }
        if (url.includes('/api/register-permission'))
          return { ok: true, json: async () => ({ dailyLimit }) }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()
  }

  it('shows "Change limit" link when user has an active permission', async () => {
    await renderWithPermission(50)
    expect(container!.textContent).toContain('Change limit')
  })

  it('opens limit picker when "Change limit" is clicked', async () => {
    await renderWithPermission(50)

    await act(async () => {
      findButton('Change limit')!.click()
    })

    // Limit options should be visible (unverified: $10, $25, $50)
    expect(container!.textContent).toContain('$10')
    expect(container!.textContent).toContain('$25')
    expect(container!.textContent).toContain('$50')
    // Cancel button should be present
    expect(findButton('Cancel')).not.toBeNull()
  })

  it('disables Update Limit button when selected value matches current limit', async () => {
    await renderWithPermission(50)

    await act(async () => {
      findButton('Change limit')!.click()
    })

    const updateBtn = findButton('Update Limit')
    expect(updateBtn).not.toBeNull()
    // Current limit is 50, default selection should be 50 → disabled
    expect(updateBtn!.disabled).toBe(true)
  })

  it('enables Update Limit button when a different value is selected', async () => {
    await renderWithPermission(50)

    await act(async () => {
      findButton('Change limit')!.click()
    })

    // Click the $25 option
    const option25 = Array.from(container!.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('$25') && b.textContent?.includes('/day')
    )
    expect(option25).not.toBeNull()

    await act(async () => {
      option25!.click()
    })

    const updateBtn = findButton('Update Limit')
    expect(updateBtn!.disabled).toBe(false)
  })

  it('collapses picker after Cancel is clicked', async () => {
    await renderWithPermission(50)

    await act(async () => {
      findButton('Change limit')!.click()
    })
    expect(findButton('Update Limit')).not.toBeNull()

    await act(async () => {
      findButton('Cancel')!.click()
    })
    // Picker should be gone, "Change limit" link should be back
    expect(findButton('Update Limit')).toBeNull()
    expect(findButton('Change limit')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Error classification in handleChangeLimit
// ---------------------------------------------------------------------------

describe('handleChangeLimit error classification', () => {
  it('shows tier-cap error directly instead of misclassifying as refuel cooldown', async () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:3001')
    vi.stubEnv('NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS', '0xSIPPY')
    mocks.state.isSignedIn = true
    mocks.state.currentUser = { evmSmartAccounts: ['0xSMART456'], evmAccounts: ['0xEOA123'] }
    mocks.getStoredToken.mockReturnValue('mock-token')
    mocks.createSpendPermission.mockResolvedValue({ userOperationHash: '0xhash' })

    // wallet-status: no permission → shows Enable Sippy with limit picker
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/wallet-status'))
          return { ok: true, json: async () => ({ hasPermission: false }) }
        if (url.includes('/api/auth/email-status'))
          return { ok: true, json: async () => ({ verified: false }) }
        if (url.includes('/api/register-permission'))
          return {
            ok: false,
            status: 400,
            text: async () =>
              'Daily limit cannot exceed $50. Verify your email at sippy.lat/settings to increase your limit.',
          }
        return { ok: true, json: async () => ({}) }
      })
    )
    await renderPage()

    await act(async () => {
      findButton('Enable Sippy')!.click()
    })

    // Should show the actual tier-cap message, NOT the refuel cooldown message
    expect(container!.textContent).toContain('cannot exceed')
    expect(container!.textContent).not.toContain('too many times')
  })
})
