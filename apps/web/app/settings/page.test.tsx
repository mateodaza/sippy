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
  authenticateWithJWT: vi.fn(),
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
}))

vi.mock('@coinbase/cdp-hooks', () => ({
  useAuthenticateWithJWT: () => ({ authenticateWithJWT: mocks.authenticateWithJWT }),
  useCreateSpendPermission: () => ({ createSpendPermission: mocks.createSpendPermission, status: null }),
  useRevokeSpendPermission: () => ({ revokeSpendPermission: mocks.revokeSpendPermission }),
  useListSpendPermissions: () => ({ refetch: mocks.refetchPermissions, data: mocks.permissionsData }),
  useCurrentUser: () => ({ currentUser: mocks.state.currentUser }),
  useIsSignedIn: () => ({ isSignedIn: mocks.state.isSignedIn }),
  useSignOut: () => ({ signOut: mocks.signOut }),
  useEvmAccounts: () => ({ evmAccounts: mocks.state.evmAccounts }),
  useExportEvmAccount: () => ({ exportEvmAccount: mocks.exportEvmAccount }),
  useSendUserOperation: () => ({ sendUserOperation: mocks.sendUserOperation, status: null, data: null, error: null }),
}))

vi.mock('../../lib/auth', () => ({
  sendOtp: (...args: unknown[]) => mocks.sendOtp(...args),
  verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args),
  storeToken: (...args: unknown[]) => mocks.storeToken(...args),
  getStoredToken: () => mocks.getStoredToken(),
  clearToken: () => mocks.clearToken(),
}))

vi.mock('../../lib/blockscout', () => ({
  getBalances: (...args: unknown[]) => mocks.getBalances(...args),
}))

vi.mock('../../lib/usdc-transfer', () => ({
  buildUsdcTransferCall: (...args: unknown[]) => mocks.buildUsdcTransferCall(...args),
  ensureGasReady: (...args: unknown[]) => mocks.ensureGasReady(...args),
}))

vi.mock('viem', () => ({
  parseUnits: vi.fn(() => BigInt(0)),
}))

// --- Helpers ---

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
  it('happy path: advances to otp step and calls sendOtp with E.164 phone', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    await renderPage()

    await goToOtpStep('+573001234567')

    expect(mocks.sendOtp).toHaveBeenCalledWith('+573001234567')
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
    expect(container!.textContent).toContain('+573001234567')
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
  it('happy path: verifies OTP, stores token, authenticates, shows Wallet Security', async () => {
    // Setup: use default beforeEach (no BACKEND_URL, no fetch stub)
    // walletStatus stays null since fetchWalletStatus is a no-op without BACKEND_URL
    mocks.state.evmAccounts = [{ address: '0xEOA123' }]
    mocks.state.currentUser = {
      evmSmartAccounts: ['0xSMART456'],
      evmSmartAccountObjects: [{ address: '0xSMART456' }],
      evmAccounts: ['0xEOA123'],
    }
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: {
        evmSmartAccounts: ['0xSMART456'],
        evmSmartAccountObjects: [{ address: '0xSMART456' }],
        evmAccounts: ['0xEOA123'],
      },
    })
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(mocks.storeToken).toHaveBeenCalledWith('jwt-token')
    expect(mocks.authenticateWithJWT).toHaveBeenCalled()
    // OTP input no longer present (transitioned out of 'otp' step)
    expect(container!.querySelector('input[type="text"]')).toBeNull()
    // "Wallet Security" heading always rendered in authenticated view (regardless of walletStatus)
    expect(container!.textContent).toContain('Wallet Security')
    // "No permission" rendered because walletStatus is null (ternary is false)
    expect(container!.textContent).toContain('No permission')
  })

  it('shows error and stays on otp step when verifyOtp throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockRejectedValue(new Error('Invalid OTP'))
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(container!.textContent).toContain('Invalid OTP')
    // Still on OTP step (text input for OTP visible)
    expect(container!.querySelector('input[type="text"]')).not.toBeNull()
  })

  it('shows error when authenticateWithJWT throws', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockRejectedValue(new Error('Auth failed'))
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(container!.textContent).toContain('Auth failed')
  })

  it('shows no-wallet error when user has no EVM accounts', async () => {
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: { evmSmartAccounts: [], evmSmartAccountObjects: [], evmAccounts: [] },
    })
    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    expect(container!.textContent).toContain('No wallet found')
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
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/wallet-status')
    )
    expect(walletStatusCall).toBeDefined()
    expect((walletStatusCall![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer mock-token',
    })

    const registerWalletCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/register-wallet')
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
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/wallet-status')
    )
    expect(walletStatusCall).toBeDefined()
    expect((walletStatusCall![1] as RequestInit).headers).toMatchObject({
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
      spendPermissions: [{
        permission: { spender: '0xSIPPY' },
        permissionHash: '0xHASH',
        revoked: false,
      }],
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

    const revokeCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/revoke-permission')
    )
    expect(revokeCall).toBeDefined()
    expect((revokeCall![1] as RequestInit).headers).toMatchObject({
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
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/register-permission')
    )
    expect(registerCall).toBeDefined()
    expect((registerCall![1] as RequestInit).headers).toMatchObject({
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
    // Allow fire-and-forget logExportEventFn to complete
    await act(async () => {})

    const logCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/api/log-export-event')
    )
    expect(logCall).toBeDefined()
    expect((logCall![1] as RequestInit).headers).toMatchObject({
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasPermission: true, dailyLimit: 100 }),
    }))
  })

  it('handleSweep happy path: calls ensureGasReady, buildUsdcTransferCall, sendUserOperation', async () => {
    await renderPage()

    await act(async () => { findButton('Export Private Key')!.click() })
    await act(async () => { findButton('I Understand, Continue')!.click() })
    await act(async () => {}) // wait for getBalances and sweep_offer render

    await act(async () => {
      findButton('to exportable address')!.click()
    })
    await act(async () => {}) // wait for handleSweep

    expect(mocks.ensureGasReady).toHaveBeenCalledWith('http://localhost:3001', 'mock-token')
    expect(mocks.buildUsdcTransferCall).toHaveBeenCalledWith('0xEOA123', expect.any(String))
    expect(mocks.sendUserOperation).toHaveBeenCalledWith(expect.objectContaining({
      evmSmartAccount: '0xSMART456',
    }))
  })

  it('handleSweep null token error: shows "Session expired" and does not call sendUserOperation', async () => {
    // Override: allow session recovery (2 getStoredToken calls) + logExportEventFn (1 call),
    // then return null for handleSweep token check
    mocks.state.isSignedIn = false // Use OTP flow to avoid session recovery consuming tokens
    mocks.getStoredToken.mockReturnValue(null) // null throughout — OTP flow doesn't call getStoredToken
    mocks.sendOtp.mockResolvedValue(undefined)
    mocks.verifyOtp.mockResolvedValue('jwt-token')
    mocks.authenticateWithJWT.mockResolvedValue({
      user: {
        evmSmartAccounts: ['0xSMART456'],
        evmSmartAccountObjects: [{ address: '0xSMART456' }],
        evmAccounts: ['0xEOA123'],
      },
    })

    await renderPage()

    await goToOtpStep()
    await goToVerifyStep()

    await act(async () => { findButton('Export Private Key')!.click() })
    await act(async () => { findButton('I Understand, Continue')!.click() })
    await act(async () => {}) // wait for getBalances and sweep_offer render

    await act(async () => {
      findButton('to exportable address')!.click()
    })
    await act(async () => {}) // wait for handleSweep

    expect(container!.textContent).toContain('Session expired. Please sign in again.')
    expect(mocks.sendUserOperation).not.toHaveBeenCalled()
  })

  it('handleExportContinue happy path: private key displayed', async () => {
    // Use low balance so handleWarningContinue auto-proceeds to handleExportContinue
    mocks.getBalances.mockResolvedValue({ usdc: '0.001' })
    mocks.exportEvmAccount.mockResolvedValue({ privateKey: '0xPRIVKEY' })

    await renderPage()

    await act(async () => { findButton('Export Private Key')!.click() })
    await act(async () => { findButton('I Understand, Continue')!.click() })
    await act(async () => {}) // wait for auto-export

    expect(container!.textContent).toContain('0xPRIVKEY')
  })

  it('handleExportContinue error path: shows export error, key not shown', async () => {
    // Use low balance so handleWarningContinue auto-proceeds to handleExportContinue
    mocks.getBalances.mockResolvedValue({ usdc: '0.001' })
    mocks.exportEvmAccount.mockRejectedValue(new Error('Export failed'))

    await renderPage()

    await act(async () => { findButton('Export Private Key')!.click() })
    await act(async () => { findButton('I Understand, Continue')!.click() })
    await act(async () => {}) // wait for error

    expect(container!.textContent).toContain('Export failed')
    // exportStep does NOT advance to export_active — "Your Private Key" section not shown
    expect(container!.textContent).not.toContain('Your Private Key')
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
