'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { useSendUserOperation } from '@coinbase/cdp-hooks'
import { SippyPhoneInput } from '@/components/ui/phone-input'
import { getStoredToken, clearToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '../../components/shared/ChannelPicker'
import {
  getActivity,
  formatAddress,
  getExplorerTxUrl,
  type NormalizedTransaction,
  type Balance,
} from '@/lib/blockscout'
import { getBalance, readContract } from '@wagmi/core'
import { wagmiConfig } from '../providers/Web3Provider'
import { formatUnits, formatEther } from 'viem'

const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

async function getBalancesRpc(address: string): Promise<Balance> {
  const [ethResult, usdcResult] = await Promise.all([
    getBalance(wagmiConfig, { address: address as `0x${string}`, chainId: 42161 }),
    readContract(wagmiConfig, {
      address: USDC_ADDRESS,
      abi: ERC20_BALANCE_ABI,
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
import { ensureGasReady, buildUsdcTransferCall } from '@/lib/usdc-transfer'
import { ActivityList } from '@/components/activity/ActivityList'
import {
  Language,
  getStoredLanguage,
  storeLanguage,
  resolveLanguage,
  localizeError,
  t,
} from '../../lib/i18n'
import { CDPProviderDefault } from '../providers/cdp-provider'

const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum'
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

type SendStep = 'form' | 'confirm' | 'sending' | 'success' | 'error'
type SendFrom = 'whatsapp' | 'web'

function WalletContent() {
  const searchParams = useSearchParams()
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
    currentUser,
    signOut,
  } = useSessionGuard()

  const isPhoneLocked = !!phoneFromUrl
  const isCdpConfigured = !!CDP_PROJECT_ID

  // Initialize re-auth phone from URL param
  useEffect(() => {
    if (phoneFromUrl) setReAuthPhone(phoneFromUrl)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Language state
  const [lang, setLang] = useState<Language>('en')

  // Keep html lang attribute in sync for screen readers
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Wallet state — two wallets
  const [eoaAddress, setEoaAddress] = useState<string | null>(null)
  const [eoaBalances, setEoaBalances] = useState<Balance | null>(null)
  const [smartBalances, setSmartBalances] = useState<Balance | null>(null)
  const [activity, setActivity] = useState<NormalizedTransaction[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)

  // Send state
  const [sendStep, setSendStep] = useState<SendStep>('form')
  const [sendFrom, setSendFrom] = useState<SendFrom>('whatsapp')
  const [recipient, setRecipient] = useState('')
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendTxHash, setSendTxHash] = useState<string | null>(null)
  const [recipientMode, setRecipientMode] = useState<'phone' | 'address'>('phone')

  // CDP Hooks
  const {
    sendUserOperation,
    status: sendOpStatus,
    data: sendOpData,
    error: sendOpError,
  } = useSendUserOperation()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smartAccountAddress = (currentUser as any)?.evmSmartAccountObjects?.[0]?.address ?? null

  // Active balance based on selected send-from wallet
  const activeBalance = sendFrom === 'whatsapp' ? eoaBalances : smartBalances

  // ============================================================================
  // Language
  // ============================================================================

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

  // ============================================================================
  // Data fetching
  // ============================================================================

  const fetchWalletData = useCallback(async () => {
    const token = getStoredToken()
    if (!token) return
    setIsLoadingData(true)
    try {
      // Fetch EOA address from backend
      const statusRes = await fetch(`${BACKEND_URL}/api/wallet-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (statusRes.ok) {
        const status = await statusRes.json()
        if (status.walletAddress) {
          setEoaAddress(status.walletAddress)
          const [eoaBal, act] = await Promise.all([
            getBalancesRpc(status.walletAddress),
            getActivity(status.walletAddress, 10),
          ])
          setEoaBalances(eoaBal)
          setActivity(act)
          // Auto-select whichever wallet has funds
          if (parseFloat(eoaBal?.usdc ?? '0') > 0) setSendFrom('whatsapp')
        }
      }

      // Fetch smart account balance in parallel if available
      if (smartAccountAddress) {
        const smartBal = await getBalancesRpc(smartAccountAddress)
        setSmartBalances(smartBal)
        // If EOA is empty but smart account has funds, auto-select smart
        if (parseFloat(eoaBalances?.usdc ?? '0') === 0 && parseFloat(smartBal?.usdc ?? '0') > 0) {
          setSendFrom('web')
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet data:', err)
    } finally {
      setIsLoadingData(false)
    }
  }, [smartAccountAddress, BACKEND_URL]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated) return
    fetchWalletData()
    const interval = setInterval(fetchWalletData, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, fetchWalletData])

  // ============================================================================
  // Send flow
  // ============================================================================

  const isPhoneNumber = (input: string) => /^\+?\d{7,15}$/.test(input.replace(/[\s\-()]/g, ''))

  const isAddress = (input: string) => /^0x[a-fA-F0-9]{40}$/.test(input)

  const handleSendReview = async () => {
    setSendError(null)

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setSendError(t('wallet.errInvalidAmount', lang))
      return
    }
    if (activeBalance && numAmount > parseFloat(activeBalance.usdc)) {
      setSendError(t('wallet.errInsufficientBalance', lang))
      return
    }

    const trimmed = recipient.trim()
    if (isAddress(trimmed)) {
      setResolvedAddress(trimmed)
      setSendStep('confirm')
    } else if (isPhoneNumber(trimmed)) {
      try {
        const accessToken = getStoredToken()
        if (!accessToken) {
          setSendError(t('wallet.errSessionExpired', lang))
          return
        }

        const response = await fetch(`${BACKEND_URL}/api/resolve-phone`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phone: trimmed.startsWith('+') ? trimmed : `+${trimmed}`,
          }),
        })

        if (response.status === 404) {
          setSendError(t('wallet.errNotSippyUser', lang))
          return
        }
        if (response.status === 429) {
          setSendError(t('wallet.errTooManyLookups', lang))
          return
        }
        if (!response.ok) {
          setSendError(t('wallet.errResolvePhone', lang))
          return
        }

        const data = await response.json()
        setResolvedAddress(data.address)
        setSendStep('confirm')
      } catch {
        setSendError(t('wallet.errNetwork', lang))
      }
    } else {
      setSendError(t('wallet.errInvalidInput', lang))
    }
  }

  const handleSendConfirm = async () => {
    if (!resolvedAddress) return

    setSendError(null)
    setSendStep('sending')

    try {
      if (sendFrom === 'whatsapp') {
        // EOA send via backend SpendPermission
        const accessToken = getStoredToken()
        if (!accessToken) throw new Error('Session expired. Please sign in again.')

        const res = await fetch(`${BACKEND_URL}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ to: resolvedAddress, amount }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(localizeError(body, 'send', lang))
        }

        const data = await res.json()
        setSendTxHash(data.txHash ?? null)
        setSendStep('success')
        fetchWalletData()
      } else {
        // Smart account UserOp
        if (!smartAccountAddress) throw new Error('Smart account not found.')

        const accessToken = getStoredToken()
        if (!accessToken) throw new Error('Session expired. Please sign in again.')

        await ensureGasReady(BACKEND_URL, accessToken, 2, smartAccountAddress ?? undefined)

        const call = buildUsdcTransferCall(resolvedAddress, amount)
        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: NETWORK as 'arbitrum',
          calls: [call],
        })
        // success handled by useEffect watching sendOpStatus
      }
    } catch (err) {
      console.error('Send failed:', err)
      setSendError(localizeError(err, 'send', lang))
      setSendStep('error')
    }
  }

  // Watch smart account UserOp status
  useEffect(() => {
    if (sendFrom !== 'web') return
    if (sendOpStatus === 'success' && sendOpData) {
      setSendTxHash(sendOpData.transactionHash ?? null)
      setSendStep('success')
      fetchWalletData()
    }
    if (sendOpStatus === 'error' && sendOpError) {
      setSendError(localizeError(sendOpError, 'send', lang))
      setSendStep('error')
    }
  }, [sendOpStatus, sendOpData, sendOpError, sendFrom, fetchWalletData])

  const resetSend = () => {
    setSendStep('form')
    setRecipient('')
    setResolvedAddress(null)
    setAmount('')
    setSendError(null)
    setSendTxHash(null)
    setRecipientMode('phone')
  }

  const handleMax = () => {
    if (activeBalance) setAmount(activeBalance.usdc)
  }

  // ============================================================================
  // Render helpers
  // ============================================================================

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">💰</div>
            <p className="text-[var(--text-secondary)]">{t('wallet.loading', lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated && !isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full panel-frame rounded-2xl bg-[var(--bg-primary)] p-8">
          <h1 className="font-display text-2xl font-bold uppercase mb-6 text-[var(--text-primary)]">
            {t('wallet.title', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{t('wallet.subtitle', lang)}</p>

          {!isCdpConfigured && (
            <div className="mb-4 p-3 bg-[var(--fill-warning-light)] border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              <strong>{t('wallet.configRequired', lang)}</strong>{' '}
              {t('wallet.configInstruction', lang)}
            </div>
          )}

          {reAuthError && (
            <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
              {reAuthError}
            </div>
          )}

          {reAuthStep === 'phone' && (
            <>
              <input
                type="tel"
                value={reAuthPhone}
                onChange={(e) => !isPhoneLocked && setReAuthPhone(e.target.value)}
                placeholder="+573001234567"
                disabled={isPhoneLocked}
                className={`w-full p-3 border rounded-lg mb-4 text-[var(--text-primary)] ${
                  isPhoneLocked ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]' : ''
                }`}
              />
              {isPhoneLocked && (
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {t('wallet.phoneFromWhatsapp', lang)}
                </p>
              )}
              <ChannelPicker
                canSwitch={reAuthCanSwitchChannel}
                isLoading={reAuthLoading}
                disabled={!reAuthPhone || !isCdpConfigured}
                lang={lang}
                onSend={handleReAuthSendOtp}
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
                  : `${t('wallet.codeSentTo', lang)} ${reAuthPhone}`}
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reAuthLoading ? t('wallet.verifying', lang) : t('wallet.verify', lang)}
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
                {t('wallet.back', lang)}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ============================================================================
  // Authenticated wallet view
  // ============================================================================

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Expiry warning banner */}
        {expiryWarning && (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-sm">
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
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 border border-amber-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold uppercase text-[var(--text-primary)]">
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
                <input
                  type="tel"
                  value={reAuthPhone}
                  onChange={(e) => setReAuthPhone(e.target.value)}
                  placeholder="+573001234567"
                  disabled={!!reAuthPhone}
                  className="w-full p-3 border rounded-lg mb-3 text-[var(--text-primary)] disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed"
                />
                <ChannelPicker
                  canSwitch={reAuthCanSwitchChannel}
                  isLoading={reAuthLoading}
                  disabled={!reAuthPhone}
                  lang={lang}
                  onSend={handleReAuthSendOtp}
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
                    : `${t('wallet.codeSentTo', lang)} ${reAuthPhone}`}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={reAuthOtp}
                  onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full p-3 border rounded-lg mb-3 text-center text-2xl tracking-widest text-[var(--text-primary)]"
                />
                <button
                  onClick={handleReAuthVerifyOtp}
                  disabled={reAuthLoading || reAuthOtp.length !== 6}
                  className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reAuthLoading ? t('wallet.verifying', lang) : t('wallet.verify', lang)}
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

        {/* Wallet cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* WhatsApp Wallet (EOA) */}
          <div
            role="button"
            tabIndex={0}
            aria-pressed={sendFrom === 'whatsapp'}
            onClick={() => setSendFrom('whatsapp')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSendFrom('whatsapp')
              }
            }}
            className={`bg-[var(--bg-primary)] rounded-2xl border border-brand-primary/20 p-4 text-left transition-all cursor-pointer ${
              sendFrom === 'whatsapp' ? 'ring-2 ring-brand-primary' : 'opacity-70'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                {t('wallet.whatsappWallet', lang)}
              </p>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Info"
                  className="peer p-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.focus()
                  }}
                >
                  <Info size={12} className="text-[var(--text-muted)]" />
                </button>
                <div className="absolute bottom-full left-0 mb-1 hidden peer-hover:block peer-focus:block bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] p-2 rounded-lg shadow-lg w-48 z-10">
                  {lang === 'es'
                    ? 'Tu billetera principal. Sippy envia desde aqui por WhatsApp.'
                    : lang === 'pt'
                      ? 'Sua carteira principal. Sippy envia daqui pelo WhatsApp.'
                      : 'Your main wallet. Sippy sends from here when you use WhatsApp.'}
                </div>
              </div>
            </div>
            {isLoadingData ? (
              <div className="animate-pulse h-7 bg-[var(--bg-tertiary)] rounded w-20 mb-1" />
            ) : (
              <p className="text-xl font-bold text-[var(--text-primary)]">
                ${parseFloat(eoaBalances?.usdc ?? '0').toFixed(2)}
              </p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
              {eoaAddress ? formatAddress(eoaAddress) : '—'}
            </p>
          </div>

          {/* Web Wallet (Smart Account) */}
          <div
            role="button"
            tabIndex={0}
            aria-pressed={sendFrom === 'web'}
            onClick={() => setSendFrom('web')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSendFrom('web')
              }
            }}
            className={`bg-[var(--bg-primary)] rounded-2xl border border-brand-primary/20 p-4 text-left transition-all cursor-pointer ${
              sendFrom === 'web' ? 'ring-2 ring-brand-primary' : 'opacity-70'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                {t('wallet.webWallet', lang)}
              </p>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Info"
                  className="peer p-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget.focus()
                  }}
                >
                  <Info size={12} className="text-[var(--text-muted)]" />
                </button>
                <div className="absolute bottom-full left-0 mb-1 hidden peer-hover:block peer-focus:block bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] p-2 rounded-lg shadow-lg w-48 z-10">
                  {lang === 'es'
                    ? 'Tu billetera web. Una cuenta inteligente que agrupa transacciones.'
                    : lang === 'pt'
                      ? 'Sua carteira web. Uma conta inteligente que agrupa transacoes.'
                      : 'Your web wallet. A smart account that batches transactions for lower fees.'}
                </div>
              </div>
            </div>
            {isLoadingData ? (
              <div className="animate-pulse h-7 bg-[var(--bg-tertiary)] rounded w-20 mb-1" />
            ) : (
              <p className="text-xl font-bold text-[var(--text-primary)]">
                ${parseFloat(smartBalances?.usdc ?? '0').toFixed(2)}
              </p>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
              {smartAccountAddress ? formatAddress(smartAccountAddress) : '—'}
            </p>
          </div>
        </div>

        {/* Selected wallet address + copy */}
        <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)]">
              {sendFrom === 'whatsapp'
                ? t('wallet.whatsappWallet', lang)
                : t('wallet.webWallet', lang)}{' '}
              {t('wallet.walletAddress', lang)}
            </p>
            <p className="text-sm font-mono text-[var(--text-secondary)]">
              {sendFrom === 'whatsapp'
                ? eoaAddress
                  ? formatAddress(eoaAddress)
                  : '—'
                : smartAccountAddress
                  ? formatAddress(smartAccountAddress)
                  : '—'}
            </p>
          </div>
          <button
            onClick={() => {
              const addr = sendFrom === 'whatsapp' ? eoaAddress : smartAccountAddress
              if (addr) navigator.clipboard.writeText(addr)
            }}
            className="text-xs text-brand-primary hover:text-brand-primary-hover font-medium"
          >
            {t('wallet.copy', lang)}
          </button>
        </div>

        {/* Send section */}
        <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold uppercase text-[var(--text-primary)]">
              {t('wallet.send', lang)}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {t('wallet.sendFrom', lang)}{' '}
              <span className="font-medium text-[var(--text-secondary)]">
                {sendFrom === 'whatsapp'
                  ? t('wallet.whatsappWallet', lang)
                  : t('wallet.webWallet', lang)}
              </span>
            </span>
          </div>

          {sendStep === 'form' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-[var(--text-secondary)]">
                    {t('wallet.toLabel', lang)}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientMode(recipientMode === 'phone' ? 'address' : 'phone')
                      setRecipient('')
                    }}
                    className="text-xs text-brand-primary hover:text-brand-primary-hover"
                  >
                    {recipientMode === 'phone'
                      ? lang === 'es'
                        ? 'Usar direccion 0x'
                        : lang === 'pt'
                          ? 'Usar endereco 0x'
                          : 'Use 0x address'
                      : lang === 'es'
                        ? 'Usar telefono'
                        : lang === 'pt'
                          ? 'Usar telefone'
                          : 'Use phone number'}
                  </button>
                </div>
                {recipientMode === 'phone' ? (
                  <SippyPhoneInput value={recipient} onChange={setRecipient} />
                ) : (
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full p-3 border rounded-lg text-[var(--text-primary)]"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  {t('wallet.amountLabel', lang)}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="flex-1 p-3 border rounded-lg text-[var(--text-primary)]"
                  />
                  <button
                    onClick={handleMax}
                    className="px-4 py-3 bg-brand-primary/10 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-brand-primary/15"
                  >
                    {t('wallet.max', lang).toUpperCase()}
                  </button>
                </div>
              </div>
              {sendError && <p className="text-sm text-red-600">{sendError}</p>}
              <button
                onClick={handleSendReview}
                disabled={!recipient || !amount}
                className="w-full py-3 bg-brand-primary text-white rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('wallet.review', lang)}
              </button>
            </div>
          )}

          {sendStep === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 bg-[var(--bg-secondary)] rounded-lg">
                <p className="text-sm text-[var(--text-secondary)]">{t('wallet.send', lang)}</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  ${parseFloat(amount).toFixed(2)} USDC
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-2">{t('wallet.to', lang)}</p>
                <p className="text-sm font-mono text-gray-800 break-all">
                  {isPhoneNumber(recipient.trim())
                    ? `${recipient.trim()} (${formatAddress(resolvedAddress || '')})`
                    : formatAddress(resolvedAddress || '')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  from{' '}
                  {sendFrom === 'whatsapp'
                    ? t('wallet.whatsappWallet', lang)
                    : t('wallet.webWallet', lang)}
                </p>
              </div>
              <button
                onClick={handleSendConfirm}
                className="w-full py-3 bg-brand-primary text-white rounded-lg font-semibold hover:bg-brand-primary-hover"
              >
                {t('wallet.confirmSend', lang)}
              </button>
              <button
                onClick={() => setSendStep('form')}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('wallet.back', lang)}
              </button>
            </div>
          )}

          {sendStep === 'sending' && (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-primary mx-auto mb-4" />
              <p className="text-[var(--text-secondary)] font-medium">
                {t('wallet.sendingProgress', lang)} ${parseFloat(amount).toFixed(2)} USDC...
              </p>
            </div>
          )}

          {sendStep === 'success' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2 text-semantic-success">&#10003;</div>
                <p className="text-semantic-success font-semibold">{t('wallet.sent', lang)}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  ${parseFloat(amount).toFixed(2)} USDC {t('wallet.sentSuccess', lang)}
                </p>
              </div>
              {sendTxHash && (
                <a
                  href={getExplorerTxUrl(sendTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-brand-primary hover:text-brand-primary-hover underline"
                >
                  {t('wallet.viewOnBlockscout', lang)}
                </a>
              )}
              <button
                onClick={resetSend}
                className="w-full py-3 bg-brand-primary text-white rounded-lg font-semibold hover:bg-brand-primary-hover"
              >
                {t('wallet.sendAnother', lang)}
              </button>
            </div>
          )}

          {sendStep === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{sendError || t('wallet.txFailed', lang)}</p>
              </div>
              <button
                onClick={handleSendConfirm}
                className="w-full py-3 bg-brand-primary text-white rounded-lg font-semibold hover:bg-brand-primary-hover"
              >
                {t('wallet.retry', lang)}
              </button>
              <button
                onClick={resetSend}
                className="w-full py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-secondary)]"
              >
                {t('wallet.cancel', lang)}
              </button>
            </div>
          )}
        </div>

        {/* Activity */}
        {isLoadingData && activity.length === 0 ? (
          <div className="bg-[var(--bg-primary)] backdrop-blur-xl rounded-2xl sm:rounded-[32px] shadow-[0_20px_50px_rgba(15,23,42,0.12)] border border-[var(--border-default)] overflow-hidden animate-pulse">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--border-default)]">
              <div className="h-5 bg-[var(--bg-tertiary)] rounded w-32 mb-2" />
              <div className="h-3 bg-[var(--bg-tertiary)] rounded w-24" />
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 border-b border-[var(--border-default)] last:border-b-0"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--bg-tertiary)]" />
                <div className="flex-1">
                  <div className="h-4 bg-[var(--bg-tertiary)] rounded w-24 mb-2" />
                  <div className="h-3 bg-[var(--bg-tertiary)] rounded w-32" />
                </div>
                <div className="text-right">
                  <div className="h-4 bg-[var(--bg-tertiary)] rounded w-16 mb-2" />
                  <div className="h-3 bg-[var(--bg-tertiary)] rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ActivityList transactions={activity} lang={lang} />
        )}

        {/* Navigation */}
        <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-4 flex items-center justify-between">
          <a
            href="/settings"
            className="text-sm text-brand-primary hover:text-brand-primary-hover font-medium"
          >
            {t('wallet.settings', lang)}
          </a>
          <button
            onClick={async () => {
              clearToken()
              await signOut()
              setEoaBalances(null)
              setSmartBalances(null)
              setActivity([])
              resetSend()
            }}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
          >
            {t('wallet.signOut', lang)}
          </button>
        </div>

        <div className="text-center text-xs text-[var(--text-secondary)] pb-4">
          <p>{t('wallet.poweredBy', lang)}</p>
          <p className="mt-1">Network: {NETWORK}</p>
        </div>
      </div>
    </div>
  )
}

export default function WalletPage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <WalletContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
