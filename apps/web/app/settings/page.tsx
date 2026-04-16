'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  useCreateSpendPermission,
  useRevokeSpendPermission,
  useListSpendPermissions,
  useCurrentUser,
  useIsSignedIn,
  useSignOut,
  useExportEvmAccount,
  useEvmAccounts,
  useSendUserOperation,
} from '@coinbase/cdp-hooks'
import { getStoredToken, clearToken } from '../../lib/auth'
import { useSessionGuard } from '../../lib/useSessionGuard'
import { parseUnits } from 'viem'
import { getBalance, readContract } from '@wagmi/core'
import { wagmiConfig } from '../providers/Web3Provider'
import { formatUnits, formatEther } from 'viem'
import type { Balance } from '../../lib/blockscout'

const USDC_ADDRESS_SETTINGS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

async function getBalancesRpcSettings(address: string): Promise<Balance> {
  const [ethResult, usdcResult] = await Promise.all([
    getBalance(wagmiConfig, { address: address as `0x${string}`, chainId: 42161 }),
    readContract(wagmiConfig, {
      address: USDC_ADDRESS_SETTINGS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
      chainId: 42161,
    }),
  ])
  return {
    eth: formatEther(ethResult.value),
    usdc: formatUnits(usdcResult as bigint, 6),
  }
}
import { ensureGasReady, buildUsdcTransferCall } from '../../lib/usdc-transfer'
import {
  Language,
  getStoredLanguage,
  storeLanguage,
  clearLanguage,
  resolveLanguage,
  localizeError,
  t,
} from '../../lib/i18n'
import { SippyPhoneInput } from '../../components/ui/phone-input'
import { ChannelPicker, ResendButton } from '../../components/shared/ChannelPicker'
import { CDPProviderDefault } from '../providers/cdp-provider'

/**
 * Settings Page for Embedded Wallets
 *
 * Uses CDP's SMS authentication flow to:
 * 1. View current spend permission details
 * 2. Revoke existing permission
 * 3. Create new permission with different limit
 *
 * Session persistence: Uses useCurrentUser and useIsSignedIn hooks
 * to automatically restore session if user is already authenticated.
 */

// Environment variables
const SIPPY_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS || ''
const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum'
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

const DAILY_LIMIT_UNVERIFIED = 50 // must match backend EL-001 constant
const DAILY_LIMIT_VERIFIED = 500

const LIMIT_OPTIONS_UNVERIFIED = ['10', '25', '50']
const LIMIT_OPTIONS_VERIFIED = ['50', '100', '200', '500']

// USDC addresses by network (CDP SDK doesn't support 'usdc' shortcut on Arbitrum)
const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}
const USDC_ADDRESS = USDC_ADDRESSES[NETWORK] || USDC_ADDRESSES.arbitrum

interface WalletStatus {
  hasWallet: boolean
  walletAddress?: string
  hasPermission: boolean
  dailyLimit?: number
  dailySpent?: number
  phoneNumber?: string
}

type ExportStep = 'idle' | 'warning' | 'sweep_offer' | 'sweeping' | 'export_active'

interface EmailStatus {
  hasEmail: boolean
  verified: boolean
  maskedEmail: string | null
}

type EmailGateContext = 'export' | 'revoke' | null
type EmailGateStep = 'idle' | 'warning_no_email' | 'code_entry' | 'code_sent'

type EmailSectionStep =
  | 'loading'
  | 'fetch_error'
  | 'no_email'
  | 'add_sent'
  | 'unverified'
  | 'verify_entry'
  | 'verified'
  | 'change_entry'
  | 'change_sent'

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const phoneFromUrl = searchParams.get('phone') || ''

  // Session guard hook
  const {
    isAuthenticated,
    isCheckingSession,
    expiryWarning,
    reAuthVisible,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    requireReauth,
    dismissReAuth,
    reAuthChannel,
    reAuthCanSwitchChannel,
  } = useSessionGuard()

  const isPhoneLocked = !!phoneFromUrl
  const isCdpConfigured = !!CDP_PROJECT_ID

  // Initialize re-auth phone from URL param
  useEffect(() => {
    if (phoneFromUrl) setReAuthPhone(phoneFromUrl)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [error, setError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  // Language state
  const [lang, setLang] = useState<Language>('en')

  // Keep html lang attribute in sync for screen readers
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Permission state
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null)
  const [newLimit, setNewLimit] = useState('100')
  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [showLimitPicker, setShowLimitPicker] = useState(false)

  // Export state machine (wallet recovery)
  const [exportStep, setExportStep] = useState<ExportStep>('idle')
  const [exportUnlockedAt, setExportUnlockedAt] = useState<number | null>(null)
  const [exportAttemptId, setExportAttemptId] = useState<string | null>(null)
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [exportCountdown, setExportCountdown] = useState(0)

  // Sweep state (transfer USDC from smart account → EOA before export)
  const [smartAccountBalance, setSmartAccountBalance] = useState<string | null>(null)
  const [sweepTxHash, setSweepTxHash] = useState<string | null>(null)
  const [sweepError, setSweepError] = useState<string | null>(null)

  // Email management state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [emailSectionStep, setEmailSectionStep] = useState<EmailSectionStep>('loading')
  const [emailInput, setEmailInput] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Email gate state
  const [emailGateContext, setEmailGateContext] = useState<EmailGateContext>(null)
  const [emailGateStep, setEmailGateStep] = useState<EmailGateStep>('idle')
  const [emailGateCode, setEmailGateCode] = useState('')
  const [emailGateError, setEmailGateError] = useState<string | null>(null)
  const [emailGateLoading, setEmailGateLoading] = useState(false)
  const [emailGateToken, setEmailGateToken] = useState<string | null>(null)

  // Language selector state
  const [langSaving, setLangSaving] = useState(false)
  const [langSaveError, setLangSaveError] = useState<string | null>(null)

  // Privacy toggle state
  const [phoneVisible, setPhoneVisible] = useState<boolean | null>(null)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacySaveError, setPrivacySaveError] = useState<string | null>(null)

  // CDP Hooks
  const { createSpendPermission } = useCreateSpendPermission()
  const { revokeSpendPermission } = useRevokeSpendPermission()
  const { refetch: refetchPermissions, data: permissionsData } = useListSpendPermissions({
    network: NETWORK as 'arbitrum',
  })
  // Keep a ref to permissionsData so async callbacks always read the
  // latest value instead of a stale closure capture.
  const permissionsDataRef = useRef(permissionsData)
  permissionsDataRef.current = permissionsData
  const { currentUser } = useCurrentUser()
  const { isSignedIn } = useIsSignedIn()
  const { signOut } = useSignOut()
  const {
    sendUserOperation,
    status: sweepStatus,
    data: sweepData,
    error: sweepOpError,
  } = useSendUserOperation()

  // Smart account address — NEVER fall back to evmAccounts for UserOps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smartAccountAddress = (currentUser as any)?.evmSmartAccountObjects?.[0]?.address ?? null

  // Set wallet address from currentUser when authenticated
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr =
        (currentUser as any)?.evmSmartAccounts?.[0] || (currentUser as any)?.evmAccounts?.[0]
      if (addr) setWalletAddress(addr)
    } else if (!isAuthenticated) {
      setWalletAddress(null)
    }
  }, [isAuthenticated, currentUser])

  // Fetch settings data after authentication
  useEffect(() => {
    if (!isAuthenticated) return
    fetchWalletStatus()
    fetchEmailStatus()
    fetchPrivacyStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Language mount effect — two-phase: instant render from cache, then authoritative API update
  useEffect(() => {
    const cached = getStoredLanguage()
    if (cached) setLang(cached)

    const token = getStoredToken()
    resolveLanguage(phoneFromUrl || null, token, BACKEND_URL)
      .then((resolved) => {
        if (resolved !== cached) setLang(resolved)
      })
      .catch(() => {})
  }, [])

  // Fetch email status from backend
  const fetchEmailStatus = async () => {
    const accessToken = getStoredToken()
    if (!accessToken || !BACKEND_URL) return
    setEmailSectionStep('loading')
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/email-status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        setEmailSectionStep('fetch_error')
        return
      }
      const data: EmailStatus = await res.json()
      setEmailStatus(data)
      if (!data.hasEmail) setEmailSectionStep('no_email')
      else if (!data.verified) setEmailSectionStep('unverified')
      else setEmailSectionStep('verified')
    } catch {
      // On fetch failure, enter error state so gate buttons stay disabled
      // and the user can retry. Do NOT set emailStatus to a false-email
      // sentinel — that would route verified users into the bypass path.
      setEmailSectionStep('fetch_error')
    }
  }

  const fetchPrivacyStatus = async () => {
    const accessToken = getStoredToken()
    if (!accessToken || !BACKEND_URL) {
      setPhoneVisible(null)
      return
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/privacy-status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPhoneVisible(data.phoneVisible ?? true)
      } else {
        console.error('Privacy status fetch failed:', res.status)
        setPhoneVisible(null)
      }
    } catch (err) {
      console.error('Privacy status fetch error:', err)
      setPhoneVisible(null)
    }
  }

  // Fetch wallet status from backend after authentication
  const fetchWalletStatus = async () => {
    try {
      const accessToken = getStoredToken()
      if (!accessToken || !BACKEND_URL) return

      const response = await fetch(`${BACKEND_URL}/api/wallet-status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (response.ok) {
        const status = await response.json()
        setWalletStatus(status)
        if (status.dailyLimit) {
          setNewLimit(status.dailyLimit.toString())
        }
        if (status.phoneNumber) {
          setVerifiedPhone(status.phoneNumber)
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet status:', err)
    }
  }

  // Send email verification code
  const handleSendEmailCode = async (email: string) => {
    setEmailLoading(true)
    setEmailError(null)
    try {
      const accessToken = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/auth/send-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setEmailInput(email)
        setEmailSectionStep((prev) => (prev === 'change_entry' ? 'change_sent' : 'add_sent'))
      } else {
        const err = await res.json().catch(() => ({}))
        setEmailError(localizeError(err, 'email-send', lang))
      }
    } catch {
      setEmailError(localizeError({}, 'email-send', lang))
    } finally {
      setEmailLoading(false)
    }
  }

  // Verify email code
  const handleVerifyEmailCode = async () => {
    if (!emailInput || !emailCode) return
    setEmailLoading(true)
    setEmailError(null)
    try {
      const accessToken = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput, code: emailCode }),
      })
      if (res.ok) {
        setEmailCode('')
        setEmailInput('')
        await fetchEmailStatus()
      } else {
        const err = await res.json().catch(() => ({}))
        setEmailError(localizeError(err, 'email-verify', lang))
      }
    } catch {
      setEmailError(localizeError({}, 'email-verify', lang))
    } finally {
      setEmailLoading(false)
    }
  }

  // Set preferred language
  const handleSetLanguage = async (newLang: Language | 'auto') => {
    setLangSaving(true)
    setLangSaveError(null)
    try {
      const accessToken = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/set-language`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language: newLang === 'auto' ? null : newLang }),
      })
      if (res.ok) {
        if (newLang === 'auto') {
          clearLanguage()
          const resolved = await resolveLanguage(verifiedPhone || null, accessToken, BACKEND_URL)
          setLang(resolved)
        } else {
          storeLanguage(newLang)
          setLang(newLang)
        }
      } else {
        setLangSaveError(t('settings.langSaveError', lang))
      }
    } catch {
      setLangSaveError(t('settings.langSaveError', lang))
    } finally {
      setLangSaving(false)
    }
  }

  const handleSetPhoneVisible = async (visible: boolean) => {
    setPrivacySaving(true)
    setPrivacySaveError(null)
    try {
      const accessToken = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/set-privacy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneVisible: visible }),
      })
      if (res.ok) {
        setPhoneVisible(visible)
      } else {
        setPrivacySaveError('Failed to save privacy setting')
      }
    } catch {
      setPrivacySaveError('Failed to save privacy setting')
    } finally {
      setPrivacySaving(false)
    }
  }

  // Revoke permission
  const handleRevoke = useCallback(
    async (gateToken?: string) => {
      setPermissionStatus('loading')
      setError(null)

      try {
        if (!walletAddress) {
          throw new Error('Wallet address not found. Please refresh and try again.')
        }

        // FAIL CLOSED: if this user has a verified email, a gate token is required.
        // Do not proceed to CDP or DB without one. This guards against any code path
        // that calls handleRevoke(undefined) for a verified-email user.
        if (emailStatus?.verified === true && !gateToken) {
          throw new Error(t('settings.errGateRequired', lang))
        }

        // STEP 1: Onchain revoke via CDP SDK.
        // refetch() returns void on CDP hooks, so we trigger it for side-effect.
        // permissionsData in this closure is stale after refetch because React
        // state updates are async. We read from permissionsDataRef instead,
        // giving React a tick to flush the new state.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const findSippyPermission = (data: any) =>
          data?.spendPermissions?.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p: any) =>
              p.permission?.spender?.toLowerCase() === SIPPY_SPENDER_ADDRESS.toLowerCase() &&
              !p.revoked
          )

        await refetchPermissions()
        // Give React a tick to flush the state update from refetch
        await new Promise((r) => setTimeout(r, 100))

        let sippyPermission = findSippyPermission(permissionsDataRef.current)

        if (!sippyPermission) {
          // Retry once: wait longer for React to settle, then refetch again
          await new Promise((r) => setTimeout(r, 1500))
          await refetchPermissions()
          await new Promise((r) => setTimeout(r, 500))
          sippyPermission = findSippyPermission(permissionsDataRef.current)
        }

        if (!sippyPermission) {
          throw new Error('No active Sippy permission found to revoke.')
        }

        await revokeSpendPermission({
          network: NETWORK as 'arbitrum',
          permissionHash: sippyPermission.permissionHash,
          ...(NETWORK === 'base' && { useCdpPaymaster: true }),
        })

        // STEP 2: Sync DB — only reached if onchain revoke succeeded.
        // Backend enforces gate token for verified-email users.
        if (BACKEND_URL) {
          const accessToken = getStoredToken()
          if (!accessToken) {
            throw new Error('Failed to get access token. Please try again.')
          }
          const revokeRes = await fetch(`${BACKEND_URL}/api/revoke-permission`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(gateToken ? { gateToken } : {}),
          })
          if (!revokeRes.ok) {
            const data = await revokeRes.json().catch(() => ({}))
            if ((data as { error?: string }).error === 'gate_required') {
              throw new Error(t('settings.errGateRequired', lang))
            }
            console.error('Failed to update backend after revoke:', data)
            throw new Error(localizeError(data, 'revoke-permission', lang))
          }
        }

        setWalletStatus((prev) =>
          prev ? { ...prev, hasPermission: false, dailyLimit: undefined } : null
        )
        setPermissionStatus('success')
      } catch (err) {
        console.error('Revoke failed:', err)
        setError(err instanceof Error ? err.message : localizeError(err, 'revoke-permission', lang))
        setPermissionStatus('error')
      }
    },
    [walletAddress, emailStatus, refetchPermissions, revokeSpendPermission, lang]
  )

  // Create/update permission with new limit
  const tierMax = emailStatus?.verified ? DAILY_LIMIT_VERIFIED : DAILY_LIMIT_UNVERIFIED
  const limitOptions = emailStatus?.verified ? LIMIT_OPTIONS_VERIFIED : LIMIT_OPTIONS_UNVERIFIED

  const handleChangeLimit = async (overrideLimit?: string) => {
    setPermissionStatus('loading')
    setError(null)

    try {
      if (!SIPPY_SPENDER_ADDRESS) {
        throw new Error('Sippy spender address not configured.')
      }

      // Submit-time clamp: enforce tier max regardless of what the input says
      const rawLimit = overrideLimit ?? newLimit
      const parsedLimit = Math.min(Math.max(1, Number(rawLimit) || 0), tierMax)
      const clampedLimit = parsedLimit.toString()
      if (clampedLimit !== newLimit) {
        setNewLimit(clampedLimit)
      }

      // Ensure smart account has gas for the onchain UserOp (Arbitrum needs ETH)
      if (BACKEND_URL) {
        const accessToken = getStoredToken()
        if (accessToken) {
          const gasOk = await ensureGasReady(
            BACKEND_URL,
            accessToken,
            2,
            smartAccountAddress ?? undefined
          )
          if (!gasOk) {
            throw new Error(t('setup.errInsufficientEth', lang))
          }
        }
      }

      // Create new spend permission using CDP SDK
      const result = await createSpendPermission({
        network: NETWORK as 'arbitrum',
        spender: SIPPY_SPENDER_ADDRESS as `0x${string}`,
        token: USDC_ADDRESS as `0x${string}`,
        allowance: parseUnits(clampedLimit, 6), // USDC has 6 decimals
        periodInDays: 1, // Daily limit
      })

      // Register permission with backend - this MUST succeed for transfers to work
      if (BACKEND_URL) {
        const accessToken = getStoredToken()
        if (!accessToken) {
          throw new Error('Failed to get access token. Please try again.')
        }

        const response = await fetch(`${BACKEND_URL}/api/register-permission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            dailyLimit: clampedLimit,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Failed to register permission with backend:', errorText)
          // Preserve tier-cap messages so the catch block can show them directly;
          // generic backend errors get localized to a user-friendly fallback.
          const errorLower = errorText.toLowerCase()
          if (errorLower.includes('cannot exceed')) {
            throw new Error(errorText)
          }
          throw new Error(localizeError({ message: errorText }, 'enable-permission', lang))
        }

        // Use the backend response as source of truth (derives limit from onchain)
        const data = await response.json()
        const onchainLimit = data.dailyLimit ?? parseFloat(clampedLimit)
        setWalletStatus((prev) =>
          prev ? { ...prev, hasPermission: true, dailyLimit: onchainLimit } : null
        )
        setNewLimit(onchainLimit.toString())
      } else {
        // No backend configured, use local value
        setWalletStatus((prev) =>
          prev ? { ...prev, hasPermission: true, dailyLimit: parseFloat(clampedLimit) } : null
        )
      }

      setPermissionStatus('success')
      setShowLimitPicker(false)
    } catch (err) {
      console.error('Change limit failed:', err)
      const rawMsg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : String(err)
      const lower = rawMsg.toLowerCase()
      if (lower.includes('cannot exceed')) {
        // Tier-cap rejection from backend — show the server message directly
        setError(rawMsg)
      } else if (lower.includes('cooldown')) {
        setError(t('setup.errRefuelLimit', lang))
      } else if (
        lower.includes('insufficient') ||
        lower.includes('gas') ||
        lower.includes('funds')
      ) {
        setError(t('setup.errInsufficientEth', lang))
      } else {
        setError(localizeError(err, 'enable-permission', lang))
      }
      setPermissionStatus('error')
    }
  }

  // Enable permission (for users who revoked or don't have one)
  const handleEnablePermission = async () => {
    const defaultLimit = limitOptions[0]
    setNewLimit(defaultLimit)
    await handleChangeLimit(defaultLimit)
  }

  // ============================================================================
  // Wallet Export (Recovery Feature)
  // ============================================================================

  const { evmAccounts } = useEvmAccounts()
  const eoaAddress = evmAccounts?.[0]?.address ?? null
  const { exportEvmAccount } = useExportEvmAccount()
  const [exportedKey, setExportedKey] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Fire-and-forget audit logging
  const logExportEventFn = async (event: string, attemptIdOverride?: string) => {
    const id = attemptIdOverride ?? exportAttemptId
    if (!id) return
    try {
      const accessToken = getStoredToken()
      if (!accessToken || !BACKEND_URL) return
      await fetch(`${BACKEND_URL}/api/log-export-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ event, attemptId: id }),
      })
    } catch {} // Fire-and-forget
  }

  const resetExport = useCallback((reason: 'completed' | 'expired' | 'cancelled') => {
    logExportEventFn(reason)
    setExportStep('idle')
    setExportUnlockedAt(null)
    setHasCopied(false)
    setExportAttemptId(null)
    setExportedKey(null)
    setExportError(null)
    setSmartAccountBalance(null)
    setSweepTxHash(null)
    setSweepError(null)
  }, [])

  // Start export flow
  const handleExportStart = () => {
    const attemptId = crypto.randomUUID()
    setExportAttemptId(attemptId)
    setSweepError(null)
    setSweepTxHash(null)
    setSmartAccountBalance(null)
    setExportStep('warning')
    logExportEventFn('initiated', attemptId)
  }

  // After warning acknowledged — check balance and offer sweep
  const handleWarningContinue = async () => {
    if (!smartAccountAddress) {
      // No smart account → skip sweep, go straight to export
      await handleExportContinue()
      return
    }

    try {
      const balances = await getBalancesRpcSettings(smartAccountAddress)
      const balance = balances.usdc // Already formatted string (e.g. "10.5")

      // If balance < $0.01, auto-skip sweep
      if (parseFloat(balance) < 0.01) {
        await handleExportContinue()
        return
      }

      setSmartAccountBalance(balance)
      setExportStep('sweep_offer')
    } catch (err) {
      console.error('Failed to fetch balance for sweep:', err)
      // On failure, still let user proceed to export
      await handleExportContinue()
    }
  }

  // Execute sweep: transfer all USDC from smart account → EOA
  const handleSweep = async () => {
    if (!smartAccountAddress || !eoaAddress || !smartAccountBalance) return

    setSweepError(null)
    setExportStep('sweeping')

    try {
      // Step 1: Ensure gas
      const accessToken = getStoredToken()
      if (!accessToken) throw new Error('Session expired. Please sign in again.')

      await ensureGasReady(BACKEND_URL, accessToken, 2, smartAccountAddress ?? undefined)

      // Step 2: Build and send UserOperation
      const call = buildUsdcTransferCall(eoaAddress, smartAccountBalance)
      await sendUserOperation({
        evmSmartAccount: smartAccountAddress as `0x${string}`,
        network: NETWORK as 'arbitrum',
        calls: [call],
      })
    } catch (err) {
      console.error('Sweep failed:', err)
      setSweepError(localizeError(err instanceof Error ? err : {}, 'sweep', lang))
    }
  }

  // ── Email gate helpers ─────────────────────────────────────────────────────

  const resetEmailGate = useCallback(() => {
    setEmailGateContext(null)
    setEmailGateStep('idle')
    setEmailGateCode('')
    setEmailGateError(null)
    setEmailGateLoading(false)
    setEmailGateToken(null)
  }, [])

  const proceedWithGatedOperation = useCallback(
    async (gateToken?: string) => {
      const ctx = emailGateContext

      if (ctx === 'export') {
        // Backend enforcement: for verified-email users, validate and consume the gate
        // token on the server before starting the export. This prevents client-side-only
        // enforcement — an API-level attacker cannot bypass this without a valid token.
        if (emailStatus?.verified === true) {
          if (!gateToken) {
            setEmailGateError(t('settings.errGateRequired', lang))
            return
          }
          try {
            const accessToken = getStoredToken()
            const res = await fetch(`${BACKEND_URL}/api/auth/validate-export-gate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ gateToken }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              setEmailGateError(localizeError(data, 'export-gate-verify', lang))
              return
            }
          } catch {
            setEmailGateError(localizeError({}, 'export-gate-verify', lang))
            return
          }
        }
        resetEmailGate()
        handleExportStart()
      } else if (ctx === 'revoke') {
        resetEmailGate()
        handleRevoke(gateToken)
      }
    },
    [emailGateContext, emailStatus, resetEmailGate, handleExportStart, handleRevoke, lang]
  )

  const handleEmailGateSendCode = useCallback(async () => {
    setEmailGateLoading(true)
    setEmailGateError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/auth/send-gate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setEmailGateError(
          (data as { error?: string; message?: string }).error === 'no_verified_email'
            ? t('settings.errNoVerifiedEmail', lang)
            : localizeError(data, 'export-gate-send', lang)
        )
      } else {
        setEmailGateStep('code_sent')
      }
    } catch {
      setEmailGateError(localizeError({}, 'export-gate-send', lang))
    } finally {
      setEmailGateLoading(false)
    }
  }, [lang])

  const handleEmailGateVerify = useCallback(async () => {
    setEmailGateLoading(true)
    setEmailGateError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-gate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: emailGateCode }),
      })
      const data = (await res.json()) as {
        success?: boolean
        gateToken?: unknown
        error?: string
        message?: string
      }
      if (!res.ok || !data.success) {
        setEmailGateError(
          data.error === 'invalid_or_expired_code'
            ? t('settings.errInvalidCode', lang)
            : localizeError(data, 'export-gate-verify', lang)
        )
      } else if (!data.gateToken || typeof data.gateToken !== 'string') {
        // Fail closed: success=true but no usable token is an error condition.
        // Never call proceedWithGatedOperation without a valid token.
        setEmailGateError(localizeError({}, 'export-gate-verify', lang))
      } else {
        proceedWithGatedOperation(data.gateToken)
      }
    } catch {
      setEmailGateError(localizeError({}, 'export-gate-verify', lang))
    } finally {
      setEmailGateLoading(false)
    }
  }, [emailGateCode, proceedWithGatedOperation, lang])

  // Watch sweep status changes
  useEffect(() => {
    if (sweepStatus === 'success' && sweepData) {
      setSweepTxHash(sweepData.transactionHash ?? null)
      logExportEventFn('swept')
      // Auto-proceed to export after successful sweep
      handleExportContinue()
    }
    if (sweepStatus === 'error' && sweepOpError) {
      setSweepError(localizeError(sweepOpError instanceof Error ? sweepOpError : {}, 'sweep', lang))
      setExportStep('sweeping') // Stay on sweeping to show error + retry/skip
    }
  }, [sweepStatus, sweepData, sweepOpError])

  // Activate export — fetch key programmatically
  const handleExportContinue = async () => {
    if (!eoaAddress) {
      setExportError('No account address available.')
      return
    }
    setIsExporting(true)
    setExportError(null)
    try {
      const { privateKey } = await exportEvmAccount({ evmAccount: eoaAddress as `0x${string}` })
      setExportedKey(privateKey)
      setExportStep('export_active')
      setExportUnlockedAt(Date.now())
      logExportEventFn('unlocked')
      logExportEventFn('iframe_ready') // Reuse event for "key ready"
    } catch (err) {
      setExportError(localizeError(err instanceof Error ? err : {}, 'export', lang))
    } finally {
      setIsExporting(false)
    }
  }

  // 5-minute expiry timer
  useEffect(() => {
    if (!exportUnlockedAt) return
    const remaining = 5 * 60 * 1000 - (Date.now() - exportUnlockedAt)
    if (remaining <= 0) {
      resetExport('expired')
      return
    }
    const timer = setTimeout(() => resetExport('expired'), remaining)
    return () => clearTimeout(timer)
  }, [exportUnlockedAt])

  // Countdown display
  useEffect(() => {
    if (!exportUnlockedAt) {
      setExportCountdown(0)
      return
    }
    const tick = () => {
      const remaining = Math.max(0, 5 * 60 - Math.floor((Date.now() - exportUnlockedAt) / 1000))
      setExportCountdown(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [exportUnlockedAt])

  // Copy key to clipboard
  const handleCopyKey = async () => {
    if (!exportedKey) return
    try {
      await navigator.clipboard.writeText(exportedKey)
      setHasCopied(true)
      logExportEventFn('copied')
      // Clear key from memory after a short delay to reduce exposure window
      setTimeout(() => setExportedKey(null), 2000)
    } catch {
      // Fallback for mobile browsers that block clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = exportedKey
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setHasCopied(true)
      logExportEventFn('copied')
      setTimeout(() => setExportedKey(null), 2000)
    }
  }

  // Show loading while checking for existing session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">🔐</div>
            <p className="text-[var(--text-secondary)]">{t('settings.loading', lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  // Render auth flow if not authenticated
  if (!isAuthenticated && !isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8">
          <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
            {t('settings.authTitle', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{t('settings.authSubtitle', lang)}</p>

          {/* Configuration warning */}
          {!isCdpConfigured && (
            <div className="mb-4 p-3 bg-[var(--fill-warning-light)] border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              <strong>{t('settings.configRequired', lang)}</strong>{' '}
              {t('settings.configInstruction', lang)}
            </div>
          )}

          {reAuthError && (
            <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
              {reAuthError}
            </div>
          )}

          {reAuthStep === 'phone' && (
            <>
              <div className="mb-4">
                <SippyPhoneInput
                  value={reAuthPhone}
                  onChange={setReAuthPhone}
                  locked={isPhoneLocked}
                />
              </div>
              {isPhoneLocked && (
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {t('settings.phoneFromWhatsapp', lang)}
                </p>
              )}
              <ChannelPicker
                canSwitch={reAuthCanSwitchChannel}
                isLoading={reAuthLoading}
                disabled={!reAuthPhone || !isCdpConfigured}
                lang={lang}
                onSend={handleReAuthSendOtp}
                brandColor="primary"
              />
            </>
          )}

          {reAuthStep === 'otp' && (
            <>
              <p className="text-[var(--text-secondary)] mb-4">
                {reAuthChannel === 'whatsapp'
                  ? lang === 'es'
                    ? `Enviamos un codigo a tu WhatsApp (${reAuthPhone})`
                    : lang === 'pt'
                      ? `Enviamos um codigo para seu WhatsApp (${reAuthPhone})`
                      : `We sent a code to your WhatsApp (${reAuthPhone})`
                  : `${t('settings.codeSentTo', lang)} ${reAuthPhone}`}
              </p>
              <input
                type="text"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.codePlaceholder', lang)}
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="w-full bg-brand-crypto text-white py-3 rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reAuthLoading ? t('settings.verifying', lang) : t('settings.verify', lang)}
              </button>
              <ResendButton
                channel={reAuthChannel}
                isLoading={reAuthLoading}
                lang={lang}
                onResend={() => handleReAuthSendOtp(reAuthChannel)}
              />
              <button
                onClick={() => setReAuthOtp('')}
                className="w-full mt-2 text-[var(--text-secondary)] py-2"
              >
                {t('settings.back', lang)}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Settings UI for authenticated users
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-6 text-[var(--text-primary)]">
          {t('settings.title', lang)}
        </h1>

        {/* Expiry warning banner */}
        {expiryWarning && (
          <div className="mb-4 flex items-center justify-between p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-sm">
            <span>Your session expires soon. Re-authenticate to continue.</span>
            <button
              onClick={requireReauth}
              className="ml-3 font-semibold underline whitespace-nowrap"
            >
              Re-auth
            </button>
          </div>
        )}

        {/* Inline re-auth overlay */}
        {reAuthVisible && (
          <div className="mb-4 bg-amber-50 rounded-xl border border-amber-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Session expired
              </h2>
              <button
                onClick={dismissReAuth}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xl leading-none"
              >
                &times;
              </button>
            </div>
            {reAuthError && (
              <div className="mb-3 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
                {reAuthError}
              </div>
            )}
            {reAuthStep === 'phone' && (
              <>
                <div className="mb-3">
                  <SippyPhoneInput value={reAuthPhone} onChange={setReAuthPhone} />
                </div>
                <ChannelPicker
                  canSwitch={reAuthCanSwitchChannel}
                  isLoading={reAuthLoading}
                  disabled={!reAuthPhone}
                  lang={lang}
                  onSend={handleReAuthSendOtp}
                  brandColor="primary"
                />
              </>
            )}
            {reAuthStep === 'otp' && (
              <>
                <p className="text-[var(--text-secondary)] mb-3 text-sm">
                  {reAuthChannel === 'whatsapp'
                    ? lang === 'es'
                      ? `Codigo enviado a tu WhatsApp (${reAuthPhone})`
                      : lang === 'pt'
                        ? `Codigo enviado para seu WhatsApp (${reAuthPhone})`
                        : `Code sent to your WhatsApp (${reAuthPhone})`
                    : `${t('settings.codeSentTo', lang)} ${reAuthPhone}`}
                </p>
                <input
                  type="text"
                  value={reAuthOtp}
                  onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('settings.codePlaceholder', lang)}
                  maxLength={6}
                  className="w-full p-3 border rounded-lg mb-3 text-center text-2xl tracking-widest text-[var(--text-primary)]"
                />
                <button
                  onClick={handleReAuthVerifyOtp}
                  disabled={reAuthLoading || reAuthOtp.length !== 6}
                  className="w-full bg-brand-crypto text-white py-3 rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reAuthLoading ? t('settings.verifying', lang) : t('settings.verify', lang)}
                </button>
                <ResendButton
                  channel={reAuthChannel}
                  isLoading={reAuthLoading}
                  lang={lang}
                  onResend={() => handleReAuthSendOtp(reAuthChannel)}
                />
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {permissionStatus === 'success' && (
          <div className="mb-4 p-3 bg-[var(--fill-success-light)] border border-green-200 rounded-lg text-green-700 text-sm">
            {t('settings.updateSuccess', lang)}
          </div>
        )}

        {/* Daily limit + usage */}
        <div className="mb-6 p-4 bg-[var(--bg-secondary)] rounded-lg">
          {emailSectionStep === 'loading' && (
            <p className="text-2xl font-bold text-[var(--text-muted)]">
              — {t('settings.perDay', lang)}
            </p>
          )}
          {emailSectionStep === 'fetch_error' && (
            <>
              <p className="text-2xl font-bold text-[var(--text-muted)]">
                — {t('settings.perDay', lang)}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {t('settings.limitLoadError', lang)}
              </p>
            </>
          )}
          {emailSectionStep !== 'loading' && emailSectionStep !== 'fetch_error' && (
            <>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t('settings.dailyLimit', lang)}
                  </p>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {walletStatus?.hasPermission && walletStatus.dailyLimit
                      ? `$${walletStatus.dailyLimit}${t('settings.perDay', lang)}`
                      : t('settings.noPermission', lang)}
                  </p>
                </div>
                {walletStatus?.hasPermission && walletStatus.dailyLimit && (
                  <div className="text-right">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {t('settings.usedToday', lang)}
                    </p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                      ${walletStatus.dailySpent?.toFixed(2) ?? '0.00'}
                    </p>
                  </div>
                )}
              </div>
              {walletStatus?.hasPermission && walletStatus.dailyLimit && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, ((walletStatus.dailySpent ?? 0) / walletStatus.dailyLimit) * 100)}%`,
                        backgroundColor:
                          (walletStatus.dailySpent ?? 0) / walletStatus.dailyLimit > 0.8
                            ? 'var(--color-danger, #ef4444)'
                            : 'var(--color-brand-crypto, #00D796)',
                      }}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    ${((walletStatus.dailyLimit ?? 0) - (walletStatus.dailySpent ?? 0)).toFixed(2)}{' '}
                    {t('settings.remaining', lang)}
                  </p>
                </div>
              )}
              {(emailSectionStep === 'verified' ||
                emailSectionStep === 'change_entry' ||
                emailSectionStep === 'change_sent') &&
              walletStatus?.dailyLimit != null &&
              walletStatus.dailyLimit < tierMax ? (
                <div className="mt-3 border border-green-400 bg-green-50 rounded-lg p-3">
                  <p className="text-sm text-green-800 mb-2">
                    {t('settings.upgradeLimitCta', lang)} ${tierMax}
                    {t('settings.perDay', lang)}
                  </p>
                  <button
                    onClick={() => {
                      setNewLimit(String(tierMax))
                      setPermissionStatus('idle')
                      setShowLimitPicker(true)
                    }}
                    className="text-sm font-semibold text-green-700 underline"
                  >
                    {t('settings.upgradeNow', lang)}
                  </button>
                </div>
              ) : emailSectionStep === 'verified' ||
                emailSectionStep === 'change_entry' ||
                emailSectionStep === 'change_sent' ? (
                <p className="text-xs text-green-600 mt-2">✓ {t('settings.emailVerified', lang)}</p>
              ) : null}
              {(emailSectionStep === 'unverified' ||
                emailSectionStep === 'no_email' ||
                emailSectionStep === 'add_sent' ||
                emailSectionStep === 'verify_entry') && (
                <div className="mt-3 border border-amber-400 bg-amber-50 rounded-lg p-3">
                  <p className="text-sm text-amber-800 mb-2">
                    {t('settings.verifyEmailCta', lang)}
                  </p>
                  <button
                    onClick={() => {
                      const el = document.getElementById('recovery-email')
                      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className="text-sm text-amber-700 underline"
                  >
                    {t('settings.unlockLimit', lang)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Change limit */}
        {walletStatus?.hasPermission && (
          <div className="border-t pt-4">
            {!showLimitPicker ? (
              <button
                onClick={() => {
                  setNewLimit(walletStatus.dailyLimit?.toString() ?? limitOptions[0])
                  setPermissionStatus('idle')
                  setShowLimitPicker(true)
                }}
                className="text-sm text-brand-crypto hover:underline"
              >
                {t('settings.changeLimitLabel', lang)}
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t('settings.changeLimitLabel', lang)}
                  </h3>
                  <button
                    onClick={() => {
                      setShowLimitPicker(false)
                      setPermissionStatus('idle')
                    }}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    {t('settings.cancel', lang)}
                  </button>
                </div>
                <div className="space-y-2 mb-4">
                  {limitOptions.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setNewLimit(amount)}
                      className={`w-full p-3 rounded-lg border-2 text-left ${
                        newLimit === amount
                          ? 'border-brand-crypto bg-brand-crypto/10'
                          : 'border-brand-primary/20 hover:border-brand-primary/30'
                      }`}
                    >
                      <span className="font-bold text-[var(--text-primary)]">
                        ${amount}
                        {t('settings.perDay', lang)}
                      </span>
                      {amount === String(tierMax) && (
                        <span className="ml-2 text-xs text-[var(--text-muted)]">max</span>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleChangeLimit()}
                  disabled={
                    permissionStatus === 'loading' ||
                    newLimit === walletStatus.dailyLimit?.toString()
                  }
                  className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {permissionStatus === 'loading'
                    ? t('settings.updating', lang)
                    : t('settings.updateLimit', lang)}
                </button>
                {permissionStatus === 'error' && error && (
                  <p className="text-sm text-red-600 mt-2">{error}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Revoke permission */}
        {walletStatus?.hasPermission && (
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-2 text-red-600">
              {t('settings.disableTitle', lang)}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t('settings.disableDesc', lang)}
            </p>
            {!(emailGateContext === 'revoke' && emailGateStep !== 'idle') && (
              <button
                onClick={() => {
                  if (emailSectionStep === 'loading' || emailSectionStep === 'fetch_error') return
                  if (emailStatus?.verified) {
                    setEmailGateContext('revoke')
                    setEmailGateStep('code_entry')
                  } else {
                    setEmailGateContext('revoke')
                    setEmailGateStep('warning_no_email')
                  }
                }}
                disabled={
                  permissionStatus === 'loading' ||
                  emailSectionStep === 'loading' ||
                  emailSectionStep === 'fetch_error'
                }
                className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {permissionStatus === 'loading'
                  ? t('settings.revoking', lang)
                  : t('settings.revokePermission', lang)}
              </button>
            )}
            {emailGateStep === 'warning_no_email' && emailGateContext === 'revoke' && (
              <div className="rounded border border-yellow-400 bg-[var(--fill-warning-light)] p-3 text-sm text-yellow-800">
                <p className="mb-2">⚠️ {t('settings.emailWarning', lang)}</p>
                <div className="flex gap-2">
                  <button
                    className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                    onClick={resetEmailGate}
                  >
                    {t('settings.cancel', lang)}
                  </button>
                  <button
                    className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                    onClick={() => proceedWithGatedOperation()}
                  >
                    {t('settings.continueAnyway', lang)}
                  </button>
                </div>
              </div>
            )}
            {emailGateStep === 'code_entry' && emailGateContext === 'revoke' && (
              <div className="space-y-2">
                <p className="text-sm">
                  {t('settings.verifyIdentity', lang)}
                  {emailStatus?.maskedEmail && (
                    <span className="ml-1 text-[var(--text-secondary)]">
                      ({emailStatus.maskedEmail})
                    </span>
                  )}
                </p>
                <button
                  className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleEmailGateSendCode}
                  disabled={emailGateLoading}
                >
                  {emailGateLoading
                    ? t('settings.emailSending', lang)
                    : t('settings.emailSendCode', lang)}
                </button>
                {emailGateError && <p className="text-sm text-red-600">{emailGateError}</p>}
                <button
                  className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                  onClick={resetEmailGate}
                >
                  {t('settings.cancel', lang)}
                </button>
              </div>
            )}
            {emailGateStep === 'code_sent' && emailGateContext === 'revoke' && (
              <div className="space-y-2">
                <p className="text-sm">{t('settings.emailCodeInstruction', lang)}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={emailGateCode}
                  onChange={(e) => setEmailGateCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('settings.emailCodePlaceholder', lang)}
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)]"
                />
                <button
                  className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleEmailGateVerify}
                  disabled={emailGateLoading || emailGateCode.length !== 6}
                >
                  {emailGateLoading
                    ? t('settings.emailVerifying', lang)
                    : t('settings.verify', lang)}
                </button>
                {emailGateError && <p className="text-sm text-red-600">{emailGateError}</p>}
                <div className="flex gap-2">
                  <button
                    className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                    onClick={() => setEmailGateStep('code_entry')}
                  >
                    {t('settings.back', lang)}
                  </button>
                  <button
                    className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                    onClick={resetEmailGate}
                  >
                    {t('settings.cancel', lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Re-enable permission */}
        {walletStatus && !walletStatus.hasPermission && (
          <div>
            <h2 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">
              {t('settings.enableTitle', lang)}
            </h2>
            <p className="text-[var(--text-secondary)] mb-4">{t('settings.disableDesc', lang)}</p>

            <div className="space-y-3 mb-4">
              {limitOptions.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setNewLimit(amount)}
                  className={`w-full p-3 rounded-lg border-2 text-left ${
                    newLimit === amount
                      ? 'border-brand-crypto bg-brand-crypto/10'
                      : 'border-brand-primary/20 hover:border-brand-primary/30'
                  }`}
                >
                  <span className="font-bold text-[var(--text-primary)]">
                    ${amount}
                    {t('settings.perDay', lang)}
                  </span>
                  {amount === limitOptions[0] && (
                    <span className="ml-2 text-sm text-brand-crypto">
                      {t('settings.recommended', lang)}
                    </span>
                  )}
                  {amount === String(tierMax) && (
                    <span className="ml-2 text-xs text-[var(--text-muted)]">max</span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleChangeLimit()}
              disabled={permissionStatus === 'loading'}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {permissionStatus === 'loading'
                ? t('settings.enabling', lang)
                : t('settings.enableSippy', lang)}
            </button>
          </div>
        )}

        {/* Wallet info */}
        {walletAddress && (
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              {t('settings.walletAddress', lang)}
            </p>
            <p className="font-mono text-xs text-[var(--text-secondary)] break-all">
              {walletAddress}
            </p>
          </div>
        )}

        {/* Recovery Email */}
        <div id="recovery-email" className="mt-6 pt-6 border-t">
          <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
            {t('settings.recoveryEmail', lang)}
          </h2>

          {emailSectionStep === 'fetch_error' && (
            <div className="text-sm text-red-600">
              {t('settings.emailLoadError', lang)}{' '}
              <button className="underline" onClick={fetchEmailStatus}>
                {t('settings.emailLoadRetry', lang)}
              </button>
            </div>
          )}

          {emailSectionStep === 'no_email' && (
            <>
              {!bannerDismissed && (
                <div className="mb-4 p-3 bg-[var(--fill-info-light)] border border-blue-200 rounded-lg flex justify-between items-start">
                  <p className="text-sm text-blue-800">{t('settings.addEmailBanner', lang)}</p>
                  <button
                    onClick={() => setBannerDismissed(true)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    ✕
                  </button>
                </div>
              )}
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading ? t('settings.emailSending', lang) : t('settings.addEmailBtn', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'add_sent' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {t('settings.emailCodeSentTo', lang)} {emailInput}
              </p>
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={emailCode.length !== 6 || emailLoading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
              >
                {emailLoading
                  ? t('settings.emailVerifying', lang)
                  : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={emailLoading}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'unverified' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {emailStatus?.maskedEmail} — {t('settings.emailNotVerified', lang)}
              </p>
              <button
                onClick={() => setEmailSectionStep('verify_entry')}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 mb-2"
              >
                {t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => setEmailSectionStep('verify_entry')}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'verify_entry' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {t('settings.emailEnterToVerify', lang)} ({emailStatus?.maskedEmail})
              </p>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={!emailInput || emailCode.length !== 6 || emailLoading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
              >
                {emailLoading
                  ? t('settings.emailVerifying', lang)
                  : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'verified' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {emailStatus?.maskedEmail} ✓ {t('settings.emailVerified', lang)}
              </p>
              <button
                onClick={() => {
                  setEmailInput('')
                  setEmailCode('')
                  setEmailSectionStep('change_entry')
                }}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90"
              >
                Change
              </button>
            </>
          )}

          {emailSectionStep === 'change_entry' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {t('settings.emailEnterToVerify', lang)}
              </p>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading
                  ? t('settings.emailSending', lang)
                  : t('settings.emailSendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'change_sent' && (
            <>
              <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
                {t('settings.emailLabel', lang)}
              </label>
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {t('settings.emailCodeSentTo', lang)} {emailInput}
              </p>
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)]"
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={emailCode.length !== 6 || emailLoading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
              >
                {emailLoading
                  ? t('settings.emailVerifying', lang)
                  : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={emailLoading}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailError && <p className="text-red-600 text-sm mt-2">{emailError}</p>}
        </div>

        {/* Language selector */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
            {t('settings.languageTitle', lang)}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'en', label: t('settings.langEn', lang) },
              { value: 'es', label: t('settings.langEs', lang) },
              { value: 'pt', label: t('settings.langPt', lang) },
              { value: 'auto', label: t('settings.langAuto', lang) },
            ].map(({ value, label }) => (
              <button
                key={value}
                disabled={langSaving}
                onClick={() => handleSetLanguage(value as Language | 'auto')}
                className={`py-2 px-3 rounded-lg border-2 text-sm font-medium
                  ${
                    value !== 'auto' && lang === value
                      ? 'border-brand-crypto bg-brand-crypto/10'
                      : 'border-brand-primary/20 hover:border-brand-primary/30'
                  }
                  disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
          {langSaveError && <p className="text-sm text-red-600 mt-2">{langSaveError}</p>}
        </div>

        {/* Privacy */}
        <div className="border-t pt-6 mb-6">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Privacy</h2>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm text-[var(--text-primary)]">
                Show phone number on profile
              </span>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                When off, your phone number is hidden on your public profile
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              className="sr-only peer"
              checked={phoneVisible ?? true}
              disabled={privacySaving || phoneVisible === null}
              onChange={(e) => handleSetPhoneVisible(e.target.checked)}
            />
            <div className="relative w-11 h-6 bg-[var(--bg-tertiary)] rounded-full peer-checked:bg-brand-crypto peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:bg-[var(--bg-primary)] after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 ml-3 flex-shrink-0" />
          </label>
          {privacySaveError && <p className="text-sm text-red-600 mt-2">{privacySaveError}</p>}
        </div>

        {/* Wallet Security */}
        <div className="mt-6 pt-6 border-t">
          <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
            {t('settings.walletSecurity', lang)}
          </h2>

          {exportStep === 'idle' && (
            <>
              {eoaAddress ? (
                <>
                  {!(emailGateContext === 'export' && emailGateStep !== 'idle') && (
                    <button
                      onClick={() => {
                        if (emailSectionStep === 'loading' || emailSectionStep === 'fetch_error')
                          return
                        if (emailStatus?.verified) {
                          setEmailGateContext('export')
                          setEmailGateStep('code_entry')
                        } else {
                          setEmailGateContext('export')
                          setEmailGateStep('warning_no_email')
                        }
                      }}
                      disabled={
                        exportStep !== 'idle' ||
                        emailSectionStep === 'loading' ||
                        emailSectionStep === 'fetch_error'
                      }
                      className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('settings.exportKey', lang)}
                    </button>
                  )}
                  {emailGateStep === 'warning_no_email' && emailGateContext === 'export' && (
                    <div className="rounded border border-yellow-400 bg-[var(--fill-warning-light)] p-3 text-sm text-yellow-800">
                      <p className="mb-2">⚠️ {t('settings.emailWarning', lang)}</p>
                      <div className="flex gap-2">
                        <button
                          className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                          onClick={resetEmailGate}
                        >
                          {t('settings.cancel', lang)}
                        </button>
                        <button
                          className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700"
                          onClick={() => proceedWithGatedOperation()}
                        >
                          {t('settings.continueAnyway', lang)}
                        </button>
                      </div>
                    </div>
                  )}
                  {emailGateStep === 'code_entry' && emailGateContext === 'export' && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        {t('settings.verifyIdentity', lang)}
                        {emailStatus?.maskedEmail && (
                          <span className="ml-1 text-[var(--text-secondary)]">
                            ({emailStatus.maskedEmail})
                          </span>
                        )}
                      </p>
                      <button
                        className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleEmailGateSendCode}
                        disabled={emailGateLoading}
                      >
                        {emailGateLoading
                          ? t('settings.emailSending', lang)
                          : t('settings.emailSendCode', lang)}
                      </button>
                      {emailGateError && <p className="text-sm text-red-600">{emailGateError}</p>}
                      <button
                        className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                        onClick={resetEmailGate}
                      >
                        {t('settings.cancel', lang)}
                      </button>
                    </div>
                  )}
                  {emailGateStep === 'code_sent' && emailGateContext === 'export' && (
                    <div className="space-y-2">
                      <p className="text-sm">{t('settings.emailCodeInstruction', lang)}</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={emailGateCode}
                        onChange={(e) => setEmailGateCode(e.target.value.replace(/\D/g, ''))}
                        placeholder={t('settings.emailCodePlaceholder', lang)}
                        className="w-full p-3 border rounded-lg text-[var(--text-primary)]"
                      />
                      <button
                        className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleEmailGateVerify}
                        disabled={emailGateLoading || emailGateCode.length !== 6}
                      >
                        {emailGateLoading
                          ? t('settings.emailVerifying', lang)
                          : t('settings.verify', lang)}
                      </button>
                      {emailGateError && <p className="text-sm text-red-600">{emailGateError}</p>}
                      <div className="flex gap-2">
                        <button
                          className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                          onClick={() => setEmailGateStep('code_entry')}
                        >
                          {t('settings.back', lang)}
                        </button>
                        <button
                          className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                          onClick={resetEmailGate}
                        >
                          {t('settings.cancel', lang)}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  {t('settings.noExportAccount', lang)}
                </p>
              )}
            </>
          )}

          {exportStep === 'warning' && (
            <div className="space-y-4">
              <div className="p-4 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-medium mb-2">
                  {t('settings.exportWarningTitle', lang)}
                </p>
                <p className="text-sm text-red-700">{t('settings.exportWarningBody', lang)}</p>
              </div>
              {exportError && (
                <div className="p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
                  {exportError}
                </div>
              )}
              <button
                onClick={handleWarningContinue}
                disabled={isExporting}
                className="w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting
                  ? t('settings.loadingKey', lang)
                  : t('settings.understandContinue', lang)}
              </button>
              <button
                onClick={() => resetExport('cancelled')}
                disabled={isExporting}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.cancel', lang)}
              </button>
            </div>
          )}

          {exportStep === 'sweep_offer' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium mb-2">
                  {t('settings.transferFirst', lang)}
                </p>
                <p className="text-sm text-amber-700">{t('settings.transferDesc', lang)}</p>
              </div>

              <div className="p-4 bg-[var(--bg-secondary)] rounded-lg">
                <p className="text-sm text-[var(--text-secondary)]">
                  {t('settings.smartBalance', lang)}
                </p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  ${parseFloat(smartAccountBalance || '0').toFixed(2)} USDC
                </p>
                {eoaAddress && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2 font-mono break-all">
                    To: {eoaAddress}
                  </p>
                )}
              </div>

              <button
                onClick={handleSweep}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90"
              >
                {t('settings.transferTo', lang)} ($
                {parseFloat(smartAccountBalance || '0').toFixed(2)})
              </button>

              <button
                onClick={handleExportContinue}
                disabled={isExporting}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('settings.skipShowKey', lang)}
              </button>
              <p className="text-xs text-amber-600 text-center">
                {t('settings.skipWarning', lang)}
              </p>
            </div>
          )}

          {exportStep === 'sweeping' && (
            <div className="space-y-4">
              {!sweepError ? (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-crypto mx-auto mb-4" />
                  <p className="text-[var(--text-secondary)] font-medium">
                    {t('settings.transferring', lang)}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {t('settings.movingFunds', lang)}
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{sweepError}</p>
                  </div>
                  <button
                    onClick={handleSweep}
                    className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90"
                  >
                    {t('settings.retryTransfer', lang)}
                  </button>
                  <button
                    onClick={handleExportContinue}
                    disabled={isExporting}
                    className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
                  >
                    {t('settings.skipAnyway', lang)}
                  </button>
                </>
              )}
            </div>
          )}

          {exportStep === 'export_active' && exportedKey && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {t('settings.yourPrivateKey', lang)}
                </span>
                <span
                  className={`text-sm font-mono ${exportCountdown <= 60 ? 'text-red-600' : 'text-[var(--text-secondary)]'}`}
                >
                  {Math.floor(exportCountdown / 60)}:
                  {(exportCountdown % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                <p className="font-mono text-xs break-all text-gray-800 select-all">
                  {exportedKey}
                </p>
              </div>

              <button
                onClick={handleCopyKey}
                className={`w-full py-3 rounded-lg font-semibold ${
                  hasCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-brand-crypto text-white hover:bg-brand-crypto/90'
                }`}
              >
                {hasCopied ? t('settings.copied', lang) : t('settings.copyKey', lang)}
              </button>

              <button
                onClick={() => resetExport(hasCopied ? 'completed' : 'cancelled')}
                className="w-full py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700"
              >
                {t('settings.done', lang)}
              </button>

              <p className="text-xs text-red-500 text-center">{t('settings.keyWillClear', lang)}</p>
            </div>
          )}
        </div>

        {/* Fiat ramp — Colombia (+57) only */}
        {phoneFromUrl.startsWith('+57') && (
          <div className="mt-6 pt-6 border-t border-[var(--border-strong)]">
            <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">
              {lang === 'pt'
                ? 'Pesos colombianos'
                : lang === 'en'
                  ? 'Colombian Pesos'
                  : 'Pesos colombianos'}
            </p>
            <div className="flex gap-3">
              <a
                href={`/onramp?phone=${encodeURIComponent(phoneFromUrl)}`}
                className="flex-1 py-3 bg-brand-crypto text-white rounded-lg font-semibold text-center text-sm hover:bg-brand-crypto/90"
              >
                {lang === 'pt'
                  ? 'Adicionar COP'
                  : lang === 'en'
                    ? 'Add funds (COP)'
                    : 'Agregar COP'}
              </a>
              <a
                href={`/offramp?phone=${encodeURIComponent(phoneFromUrl)}`}
                className="flex-1 py-3 border border-brand-crypto text-brand-crypto rounded-lg font-semibold text-center text-sm hover:bg-brand-crypto/10"
              >
                {lang === 'pt' ? 'Retirar COP' : lang === 'en' ? 'Withdraw (COP)' : 'Retirar COP'}
              </a>
            </div>
          </div>
        )}

        {/* Support */}
        <div className="mt-6 pt-6 border-t border-[var(--border-strong)]">
          <a
            href="/support"
            className="block w-full text-center text-sm text-brand-primary hover:text-brand-primary-hover font-semibold py-2"
          >
            {t('support.title', lang)}
          </a>
        </div>

        {/* Navigation + Sign out */}
        <div className="mt-6 pt-6 border-t flex items-center justify-between">
          <a
            href="/wallet"
            className="text-sm text-brand-crypto hover:text-brand-crypto/90 font-medium"
          >
            {t('settings.openWallet', lang)}
          </a>
          <button
            onClick={async () => {
              if (exportStep !== 'idle') resetExport('cancelled')
              clearToken()
              await signOut()
              router.replace('/setup')
            }}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
          >
            {t('settings.signOut', lang)}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-[var(--text-secondary)]">
          <p>{t('settings.poweredBy', lang)}</p>
          <p className="mt-1">Network: {NETWORK}</p>
          {SIPPY_SPENDER_ADDRESS && (
            <p className="mt-1 font-mono text-[10px] truncate">Spender: {SIPPY_SPENDER_ADDRESS}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
