'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getStoredToken } from '../../lib/auth'
import { useSessionGuard } from '../../lib/useSessionGuard'
import { CDPProviderDefault } from '../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

// ── Types ──────────────────────────────────────────────────────────────────────

type Step =
  | 'loading'
  | 'add_bank' // register first bank account
  | 'select_account' // pick from existing accounts
  | 'amount' // enter USDC amount + get quote
  | 'confirm' // review quote before initiating
  | 'status' // poll order status

interface Bank {
  id: number
  name: string
  code?: string
}
interface BankAccount {
  id: number
  holder_name: string
  account_suffix: string
  account_type: string
  bank_name: string
  is_default: boolean
}
interface Quote {
  quoteId: string
  amountUsdc: number
  amountCop: number
  rate: number
  expiresAt: string
}
interface OfframpOrder {
  orderId: number
  amountUsdc: number
  amountCop: number
  rate: number
  status: string
}

// ── API helper ─────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: Record<string, unknown>) {
  const token = getStoredToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Query-string "+" decodes to space per URL spec. Callers that forgot to
// encodeURIComponent the phone land here with " 573..." — restore the +.
function normalizePhoneParam(raw: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

// ── Main content ───────────────────────────────────────────────────────────────

function OfframpContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const phoneFromUrl = normalizePhoneParam(searchParams.get('phone'))

  const { isAuthenticated, isCheckingSession } = useSessionGuard()

  const [step, setStep] = useState<Step>('loading')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Bank state
  const [banks, setBanks] = useState<Bank[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)

  // Add bank form
  const [holderName, setHolderName] = useState('')
  const [documentType, setDocumentType] = useState('CC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState<'savings' | 'checking'>('savings')
  const [bankId, setBankId] = useState<number | null>(null)

  // Quote / order state
  const [amountUsdc, setAmountUsdc] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [order, setOrder] = useState<OfframpOrder | null>(null)
  const [orderStatus, setOrderStatus] = useState<string | null>(null)

  // Country eligibility — resolved from URL param or /api/wallet-status.
  // null = unknown (still resolving), '' = no phone available.
  const [userPhone, setUserPhone] = useState<string | null>(phoneFromUrl || null)

  useEffect(() => {
    if (phoneFromUrl) {
      setUserPhone(phoneFromUrl)
      return
    }
    if (!isAuthenticated) return
    ;(async () => {
      try {
        const data = await api('GET', '/api/wallet-status')
        setUserPhone(data.phoneNumber || '')
      } catch {
        setUserPhone('')
      }
    })()
  }, [isAuthenticated, phoneFromUrl])

  const isCountryEligible = userPhone == null ? null : userPhone.startsWith('+57')

  // ── Boot ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isCheckingSession || !isAuthenticated) return
    if (isCountryEligible !== true) return
    init()
  }, [isAuthenticated, isCheckingSession, isCountryEligible]) // eslint-disable-line react-hooks/exhaustive-deps

  async function init() {
    try {
      const [accountsData, banksData] = await Promise.all([
        api('GET', '/api/offramp/bank-accounts'),
        api('GET', '/api/offramp/banks'),
      ])
      const list: BankAccount[] = accountsData.accounts ?? []
      const bankList: Bank[] = banksData.banks ?? []
      setAccounts(list)
      setBanks(bankList)

      if (list.length === 0) {
        setStep('add_bank')
      } else {
        setSelectedAccountId(list[0].id)
        setStep(list.length > 1 ? 'select_account' : 'amount')
      }
    } catch {
      setStep('add_bank')
    }
  }

  // ── Add bank account ──────────────────────────────────────────────────────────

  async function handleAddBankAccount() {
    if (!bankId) {
      setError('Please select a bank')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const selectedBank = banks.find((b) => b.id === bankId)
      const result = await api('POST', '/api/offramp/bank-accounts', {
        holderName,
        documentType,
        documentNumber,
        accountNumber,
        accountType,
        bankId,
        bankName: selectedBank?.name,
      })
      setSelectedAccountId(result.id)
      // Refresh account list
      const accountsData = await api('GET', '/api/offramp/bank-accounts')
      setAccounts(accountsData.accounts ?? [])
      setStep('amount')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Quote ─────────────────────────────────────────────────────────────────────

  async function handleQuote() {
    const usdc = parseFloat(amountUsdc)
    if (!usdc || usdc < 50) {
      setError('Minimum amount is $50 USDC')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await api('POST', '/api/offramp/quote', { amountUsdc: usdc })
      setQuote(data)
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get quote')
    } finally {
      setLoading(false)
    }
  }

  // ── Initiate ─────────────────────────────────────────────────────────────────

  async function handleInitiate() {
    if (!quote || !selectedAccountId) return
    setError(null)
    setLoading(true)
    try {
      const data = await api('POST', '/api/offramp/initiate', {
        quoteId: quote.quoteId,
        bankAccountId: selectedAccountId,
      })
      setOrder(data)
      setOrderStatus(data.status)
      setStep('status')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Offramp failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Poll status ───────────────────────────────────────────────────────────────

  async function handleCheckStatus() {
    if (!order) return
    setLoading(true)
    try {
      const data = await api('GET', `/api/offramp/status/${order.orderId}`)
      setOrderStatus(data.status)
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    router.replace(`/setup?phone=${encodeURIComponent(phoneFromUrl)}`)
    return null
  }

  if (isCountryEligible === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="animate-pulse text-[var(--text-secondary)]">Loading...</div>
      </div>
    )
  }

  if (isCountryEligible === false) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] p-4 flex items-center justify-center">
        <div className="max-w-md w-full panel-frame rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">🌎</div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Only available in Colombia
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            USDC ↔ COP ramps currently require a Colombian phone number (+57). Your account isn't
            eligible.
          </p>
          <button
            onClick={() => router.replace('/settings')}
            className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold hover:bg-brand-crypto/90"
          >
            Back to settings
          </button>
        </div>
      </div>
    )
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2 pb-1">
          <button
            onClick={() => router.back()}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl leading-none"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)] font-display">Withdraw</h1>
            <p className="text-xs text-[var(--text-muted)]">USDC → COP to your bank account</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 text-center">
            <div className="animate-pulse text-[var(--text-secondary)] text-sm">
              Loading your accounts...
            </div>
          </div>
        )}

        {/* ── Add bank account ── */}
        {step === 'add_bank' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Add bank account
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Enter your Colombian bank account to receive COP payments.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Full name (account holder)
                </label>
                <input
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="As it appears on your bank account"
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Document type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm bg-[var(--bg-primary)]"
                  >
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                    <option value="NIT">NIT</option>
                    <option value="TI">TI</option>
                    <option value="PPT">PPT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Document number
                  </label>
                  <input
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="1234567890"
                    className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Bank
                </label>
                <select
                  value={bankId ?? ''}
                  onChange={(e) => setBankId(Number(e.target.value) || null)}
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm bg-[var(--bg-primary)]"
                >
                  <option value="">Select bank...</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Account number
                </label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="000000000000"
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Account type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['savings', 'checking'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAccountType(t)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        accountType === t
                          ? 'bg-brand-crypto text-white border-brand-crypto'
                          : 'border-[var(--border-strong)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {t === 'savings' ? 'Savings' : 'Checking'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleAddBankAccount}
              disabled={loading || !holderName || !documentNumber || !accountNumber || !bankId}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save account'}
            </button>
          </div>
        )}

        {/* ── Select account ── */}
        {step === 'select_account' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
              Select bank account
            </h2>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => {
                  setSelectedAccountId(acc.id)
                  setStep('amount')
                }}
                className={`w-full p-4 border rounded-xl text-left transition-colors ${
                  selectedAccountId === acc.id
                    ? 'border-brand-crypto bg-brand-crypto/5'
                    : 'border-[var(--border-strong)] hover:border-brand-crypto'
                }`}
              >
                <div className="font-semibold text-[var(--text-primary)] text-sm">
                  {acc.bank_name}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {acc.account_type === 'savings' ? 'Savings' : 'Checking'} ···
                  {acc.account_suffix}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{acc.holder_name}</div>
              </button>
            ))}
            <button
              onClick={() => setStep('add_bank')}
              className="w-full py-2 text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border-strong)] rounded-lg"
            >
              + Add another account
            </button>
          </div>
        )}

        {/* ── Amount ── */}
        {step === 'amount' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Withdraw amount</h2>
              {selectedAccount && (
                <button
                  onClick={() => setStep(accounts.length > 1 ? 'select_account' : 'add_bank')}
                  className="text-xs text-brand-crypto"
                >
                  {selectedAccount.bank_name} ···{selectedAccount.account_suffix}
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Amount in USDC
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">
                  $
                </span>
                <input
                  type="number"
                  value={amountUsdc}
                  onChange={(e) => {
                    setAmountUsdc(e.target.value)
                    setQuote(null)
                  }}
                  placeholder="100"
                  min="50"
                  step="1"
                  className="w-full pl-7 pr-14 py-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs">
                  USDC
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Minimum $50 USDC</p>
            </div>

            <button
              onClick={handleQuote}
              disabled={loading || !amountUsdc}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Getting rate...' : 'Get quote'}
            </button>
          </div>
        )}

        {/* ── Confirm ── */}
        {step === 'confirm' && quote && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Confirm withdrawal</h2>

            <div className="p-4 bg-[var(--bg-tertiary)] rounded-xl space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">You send</span>
                <span className="font-bold text-[var(--text-primary)]">
                  ${quote.amountUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">You receive</span>
                <span className="font-bold text-green-600">
                  ${quote.amountCop.toLocaleString('es-CO')} COP
                </span>
              </div>
              <div className="border-t border-[var(--border-strong)] pt-2 flex justify-between text-xs text-[var(--text-muted)]">
                <span>Rate</span>
                <span>1 USDC ≈ {quote.rate.toLocaleString('es-CO')} COP</span>
              </div>
              {selectedAccount && (
                <div className="border-t border-[var(--border-strong)] pt-2 flex justify-between text-xs text-[var(--text-muted)]">
                  <span>To account</span>
                  <span>
                    {selectedAccount.bank_name} ···{selectedAccount.account_suffix}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              USDC will be pulled from your wallet now. COP arrives in 1–3 business days.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('amount')
                  setQuote(null)
                }}
                className="flex-1 py-3 border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-secondary)]"
              >
                Back
              </button>
              <button
                onClick={handleInitiate}
                disabled={loading}
                className="flex-1 py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* ── Status ── */}
        {step === 'status' && order && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div className="text-center py-2">
              <div className="text-4xl mb-3">
                {orderStatus === 'completed'
                  ? '✅'
                  : orderStatus === 'failed'
                    ? '❌'
                    : orderStatus === 'needs_reconciliation'
                      ? '⚠️'
                      : '⏳'}
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {orderStatus === 'completed'
                  ? 'Withdrawal sent'
                  : orderStatus === 'failed'
                    ? 'Withdrawal failed'
                    : orderStatus === 'needs_reconciliation'
                      ? 'Manual review required'
                      : 'Processing withdrawal'}
              </h2>
            </div>

            <div className="p-4 bg-[var(--bg-tertiary)] rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Status</span>
                <span
                  className={`font-medium capitalize ${
                    orderStatus === 'completed'
                      ? 'text-green-600'
                      : orderStatus === 'failed'
                        ? 'text-red-600'
                        : orderStatus === 'needs_reconciliation'
                          ? 'text-amber-600'
                          : 'text-amber-600'
                  }`}
                >
                  {orderStatus ?? order.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">USDC sent</span>
                <span className="font-medium text-[var(--text-primary)]">
                  ${order.amountUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">COP to receive</span>
                <span className="font-medium text-[var(--text-primary)]">
                  ${order.amountCop.toLocaleString('es-CO')} COP
                </span>
              </div>
            </div>

            {orderStatus === 'completed' ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
                Payment sent. Check your bank account in 1–3 business days.
              </div>
            ) : orderStatus === 'failed' ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                Withdrawal failed. Contact support if USDC was deducted.
              </div>
            ) : orderStatus === 'needs_reconciliation' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <p className="font-semibold mb-1">Our team is reviewing your withdrawal</p>
                <p>
                  Your USDC was received but the bank payout could not be started automatically. We
                  will process it manually — please do not retry. Contact support if you need an
                  update after 24 hours.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--text-muted)] text-center">
                  Your withdrawal is being processed. COP arrives in 1–3 business days.
                </p>
                <button
                  onClick={handleCheckStatus}
                  disabled={loading}
                  className="w-full py-3 border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-brand-crypto disabled:opacity-50"
                >
                  {loading ? 'Refreshing...' : 'Refresh status'}
                </button>
              </>
            )}

            <button
              onClick={() => router.push(`/settings?phone=${encodeURIComponent(phoneFromUrl)}`)}
              className="w-full py-2 text-sm text-[var(--text-secondary)]"
            >
              Back to settings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OfframpPage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <OfframpContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
