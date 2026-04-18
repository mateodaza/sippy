'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getStoredToken } from '../../lib/auth'
import { useSessionGuard } from '../../lib/useSessionGuard'
import { CDPProviderDefault } from '../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

// ── Types ──────────────────────────────────────────────────────────────────────

type KycStatus =
  | 'unregistered'
  | 'registered'
  | 'phone_verified'
  | 'email_verified'
  | 'documents_submitted'
  | 'approved'
  | 'rejected'

type Step =
  | 'loading'
  | 'kyc_info' // collect fullname, idType, idNumber, email
  | 'kyc_phone_otp' // verify phone with Colurs OTP
  | 'kyc_email_otp' // verify email with Colurs OTP
  | 'kyc_document' // upload ID photo
  | 'kyc_pending' // waiting for Level 5 approval
  | 'method' // pick PSE / Nequi / Bancolombia
  | 'pse_bank' // pick PSE bank
  | 'amount' // enter COP amount
  | 'paying' // show payment link / Nequi instructions
  | 'status' // poll order status

interface PseBank {
  code: string
  name: string
}
interface Order {
  orderId: string
  method: string
  amountCop: number
  paymentLink: string | null
  trackingKey: string
  status: string
  instructions?: string
}

// ── API helpers ────────────────────────────────────────────────────────────────

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

// ── Document upload component ──────────────────────────────────────────────────

function DocumentCapture({
  onCapture,
}: {
  onCapture: (base64: string, mime: 'image/jpeg' | 'image/png') => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data:image/...;base64, prefix
      const base64 = result.split(',')[1]
      onCapture(base64, mime)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Upload a clear photo of your ID document. Make sure all text is visible.
      </p>
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full py-3 border-2 border-dashed border-[var(--border-strong)] rounded-lg text-[var(--text-secondary)] text-sm hover:border-brand-crypto hover:text-brand-crypto transition-colors"
      >
        Upload document
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ── Main content ───────────────────────────────────────────────────────────────

// Query-string "+" decodes to space per URL spec. Callers that forgot to
// encodeURIComponent the phone land here with " 573..." — restore the +.
function normalizePhoneParam(raw: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

function OnrampContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const phoneFromUrl = normalizePhoneParam(searchParams.get('phone'))

  const { isAuthenticated, isCheckingSession } = useSessionGuard()

  const [step, setStep] = useState<Step>('loading')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // KYC fields
  const [fullname, setFullname] = useState('')
  const [idType, setIdType] = useState('CC')
  const [idNumber, setIdNumber] = useState('')
  const [kycEmail, setKycEmail] = useState('')
  const [phoneOtp, setPhoneOtp] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [frontBase64, setFrontBase64] = useState<string | null>(null)
  const [frontMime, setFrontMime] = useState<'image/jpeg' | 'image/png'>('image/jpeg')
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [backBase64, setBackBase64] = useState<string | null>(null)
  const [backMime, setBackMime] = useState<'image/jpeg' | 'image/png'>('image/jpeg')
  const [kycLevel, setKycLevel] = useState(0)
  const [kycRejected, setKycRejected] = useState(false)

  // Payment fields
  // Idempotency key: generated once per payment attempt to prevent double-submission.
  // Reset when a payment fails so the user can retry with a fresh key.
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const [method, setMethod] = useState<'pse' | 'nequi' | 'bancolombia' | null>(null)
  const [pseBanks, setPseBanks] = useState<PseBank[]>([])
  const [selectedBank, setSelectedBank] = useState('')
  const [amountCop, setAmountCop] = useState('')
  const [estimatedUsdc, setEstimatedUsdc] = useState<number | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
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

  // ── Boot: check KYC status ─────────────────────────────────────────────────

  useEffect(() => {
    if (isCheckingSession || !isAuthenticated) return
    if (isCountryEligible !== true) return
    checkKyc()
  }, [isAuthenticated, isCheckingSession, isCountryEligible]) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkKyc() {
    try {
      const data = await api('GET', '/api/onramp/kyc')
      advanceFromKycStatus(data.kycStatus as KycStatus, data.isApproved)
    } catch {
      setStep('kyc_info')
    }
  }

  function advanceFromKycStatus(status: KycStatus, isApproved: boolean) {
    setKycRejected(status === 'rejected')
    if (isApproved) {
      setStep('method')
      return
    }
    switch (status) {
      case 'unregistered':
        setStep('kyc_info')
        break
      case 'registered':
        setStep('kyc_phone_otp')
        break
      case 'phone_verified':
        setStep('kyc_email_otp')
        break
      case 'email_verified':
        setStep('kyc_document')
        break
      case 'documents_submitted':
        setStep('kyc_pending')
        break
      case 'rejected':
        // Rejected by Colurs compliance — send user back to doc upload so they
        // can resubmit. The banner on kyc_document explains why.
        setStep('kyc_document')
        break
      default:
        setStep('kyc_info')
    }
  }

  // ── KYC Step 1: register ───────────────────────────────────────────────────

  async function handleRegister() {
    setError(null)
    setLoading(true)
    try {
      await api('POST', '/api/onramp/kyc/register', { fullname, idType, idNumber, email: kycEmail })
      // Request phone OTP immediately
      await api('POST', '/api/onramp/kyc/send-otp', { type: 'phone' })
      setStep('kyc_phone_otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // ── KYC Step 2: phone OTP ─────────────────────────────────────────────────

  async function handleVerifyPhone() {
    setError(null)
    setLoading(true)
    try {
      await api('POST', '/api/onramp/kyc/verify-phone', { code: phoneOtp })
      // Request email OTP
      await api('POST', '/api/onramp/kyc/send-otp', { type: 'email' })
      setStep('kyc_email_otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  // ── KYC Step 3: email OTP ─────────────────────────────────────────────────

  async function handleVerifyEmail() {
    setError(null)
    setLoading(true)
    try {
      await api('POST', '/api/onramp/kyc/verify-email', { code: emailOtp })
      setStep('kyc_document')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  // ── KYC Step 4: document upload ───────────────────────────────────────────

  async function handleUploadDocument() {
    if (!frontBase64 || !backBase64) return
    setError(null)
    setLoading(true)
    try {
      await api('POST', '/api/onramp/kyc/upload-document', {
        frontBase64,
        frontMimeType: frontMime,
        backBase64,
        backMimeType: backMime,
      })
      setKycRejected(false)
      setStep('kyc_pending')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  // ── KYC Step 5: poll for Level 5 ─────────────────────────────────────────

  async function handleRefreshLevel() {
    setError(null)
    setLoading(true)
    try {
      const data = await api('POST', '/api/onramp/kyc/refresh-level', {})
      setKycLevel(data.kycLevel)
      if (data.isApproved) {
        setKycRejected(false)
        setStep('method')
      } else if (data.kycStatus === 'rejected') {
        setKycRejected(true)
        setStep('kyc_document')
      } else {
        setError('Not approved yet. Check back in a few hours.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check status')
    } finally {
      setLoading(false)
    }
  }

  // ── Payment: get quote ─────────────────────────────────────────────────────

  async function handleQuote() {
    const cop = parseFloat(amountCop.replace(/,/g, ''))
    if (!cop || cop < 1000) {
      setError('Minimum amount is $1,000 COP')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await api('POST', '/api/onramp/quote', { amountCop: cop })
      setEstimatedUsdc(data.estimatedUsdc)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get quote')
    } finally {
      setLoading(false)
    }
  }

  // ── Payment: load PSE banks ────────────────────────────────────────────────

  async function loadPseBanks() {
    try {
      const data = await api('GET', '/api/onramp/pse-banks')
      setPseBanks(Array.isArray(data) ? data : (data.banks ?? []))
    } catch {
      /* non-fatal */
    }
  }

  // ── Payment: initiate ─────────────────────────────────────────────────────

  async function handleInitiate() {
    const cop = parseFloat(amountCop.replace(/,/g, ''))
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        method,
        amountCop: cop,
        idempotencyKey: idempotencyKeyRef.current,
      }
      if (method === 'pse') body.financialInstitutionCode = selectedBank
      const data = await api('POST', '/api/onramp/initiate', body)

      // 202 = first request still in flight, payment details not ready yet.
      // Wait briefly and retry with the same idempotency key.
      if (data.retry) {
        await new Promise((r) => setTimeout(r, 2000))
        const retryData = await api('POST', '/api/onramp/initiate', body)
        if (retryData.retry) {
          setError('Payment is still being created. Please try again in a few seconds.')
          return
        }
        setOrder(retryData)
        setStep('paying')
        return
      }

      setOrder(data)
      setStep('paying')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      // Generate a fresh key so the user can retry after a genuine failure
      idempotencyKeyRef.current = crypto.randomUUID()
    } finally {
      setLoading(false)
    }
  }

  // ── Poll order status ─────────────────────────────────────────────────────

  async function handleCheckStatus() {
    if (!order) return
    setLoading(true)
    try {
      const data = await api('GET', `/api/onramp/status/${order.orderId}`)
      setOrderStatus(data.status)
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────

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
            COP ↔ USDC ramps currently require a Colombian phone number (+57). Your account isn't
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

  // ── Render ─────────────────────────────────────────────────────────────────

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
            <h1 className="text-lg font-bold text-[var(--text-primary)] font-display">Add funds</h1>
            <p className="text-xs text-[var(--text-muted)]">
              COP → USDC via PSE / Nequi / Bancolombia
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── KYC: identity info ── */}
        {step === 'kyc_info' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Identity verification
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Required once by Colombian law. Your info is handled by Colurs, a licensed payment
                provider.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Full name
                </label>
                <input
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  placeholder="As it appears on your ID"
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Document type
                </label>
                <select
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm bg-[var(--bg-primary)]"
                >
                  {/*
                    CC-only in this release. The KYC document upload flow hardcodes
                    `national_id_front` + `national_id_back`. Re-enable CE/PA/NIT
                    once the type_documents code mapping covers their doc-type pairs.
                  */}
                  <option value="CC">Cédula de ciudadanía (CC)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Document number
                </label>
                <input
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="1234567890"
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={kycEmail}
                  onChange={(e) => setKycEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleRegister}
              disabled={loading || !fullname || !idNumber || !kycEmail}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Registering...' : 'Continue'}
            </button>
          </div>
        )}

        {/* ── KYC: phone OTP ── */}
        {step === 'kyc_phone_otp' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Verify your phone
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Enter the 4-digit code sent to {phoneFromUrl} by Colurs.
              </p>
            </div>
            <input
              value={phoneOtp}
              onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              maxLength={4}
              className="w-full p-3 border rounded-lg text-center text-2xl tracking-widest text-[var(--text-primary)]"
            />
            <button
              onClick={handleVerifyPhone}
              disabled={loading || phoneOtp.length !== 4}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify phone'}
            </button>
            <button
              onClick={() => api('POST', '/api/onramp/kyc/send-otp', { type: 'phone' })}
              className="w-full py-2 text-sm text-[var(--text-secondary)]"
            >
              Resend code
            </button>
          </div>
        )}

        {/* ── KYC: email OTP ── */}
        {step === 'kyc_email_otp' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Verify your email
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Enter the 4-digit code sent to your email by Colurs.
              </p>
            </div>
            <input
              value={emailOtp}
              onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              maxLength={4}
              className="w-full p-3 border rounded-lg text-center text-2xl tracking-widest text-[var(--text-primary)]"
            />
            <button
              onClick={handleVerifyEmail}
              disabled={loading || emailOtp.length !== 4}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify email'}
            </button>
            <button
              onClick={() => api('POST', '/api/onramp/kyc/send-otp', { type: 'email' })}
              className="w-full py-2 text-sm text-[var(--text-secondary)]"
            >
              Resend code
            </button>
          </div>
        )}

        {/* ── KYC: document upload (front + back of CC) ── */}
        {step === 'kyc_document' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
                Upload your {idType || 'ID'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Colurs requires both the front and back of your document.
              </p>
            </div>

            {kycRejected && (
              <div className="rounded-lg border border-red-200 bg-[var(--fill-danger-light)] p-3 text-sm text-red-700">
                Your previous submission was rejected by Colurs compliance. Please retake clearer
                photos of both sides of your document and try again.
              </div>
            )}

            {/* Front side */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Front</p>
              {frontPreview ? (
                <div className="space-y-2">
                  <img
                    src={frontPreview}
                    alt="Front preview"
                    className="w-full rounded-lg border object-contain max-h-48"
                  />
                  <button
                    onClick={() => {
                      setFrontPreview(null)
                      setFrontBase64(null)
                    }}
                    className="w-full py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Retake front
                  </button>
                </div>
              ) : (
                <DocumentCapture
                  onCapture={(b64, mime) => {
                    setFrontBase64(b64)
                    setFrontMime(mime)
                    setFrontPreview(`data:${mime};base64,${b64}`)
                  }}
                />
              )}
            </div>

            {/* Back side */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Back</p>
              {backPreview ? (
                <div className="space-y-2">
                  <img
                    src={backPreview}
                    alt="Back preview"
                    className="w-full rounded-lg border object-contain max-h-48"
                  />
                  <button
                    onClick={() => {
                      setBackPreview(null)
                      setBackBase64(null)
                    }}
                    className="w-full py-2 text-sm text-[var(--text-secondary)]"
                  >
                    Retake back
                  </button>
                </div>
              ) : (
                <DocumentCapture
                  onCapture={(b64, mime) => {
                    setBackBase64(b64)
                    setBackMime(mime)
                    setBackPreview(`data:${mime};base64,${b64}`)
                  }}
                />
              )}
            </div>

            <button
              onClick={handleUploadDocument}
              disabled={loading || !frontBase64 || !backBase64}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Uploading...' : 'Submit for review'}
            </button>
          </div>
        )}

        {/* ── KYC: pending approval ── */}
        {step === 'kyc_pending' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-3">⏳</div>
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-2">Under review</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Your documents have been submitted. Colurs typically reviews within a few hours.
                {kycLevel > 0 && ` Current level: ${kycLevel}`}
              </p>
            </div>
            <button
              onClick={handleRefreshLevel}
              disabled={loading}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Checking...' : 'Check approval status'}
            </button>
            <button
              onClick={() => router.push(`/settings?phone=${encodeURIComponent(phoneFromUrl)}`)}
              className="w-full py-2 text-sm text-[var(--text-secondary)]"
            >
              Back to settings
            </button>
          </div>
        )}

        {/* ── Payment: method picker ── */}
        {step === 'method' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
              How do you want to pay?
            </h2>
            {(['pse', 'nequi', 'bancolombia'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMethod(m)
                  if (m === 'pse') {
                    loadPseBanks()
                    setStep('pse_bank')
                  } else setStep('amount')
                }}
                className="w-full p-4 border border-[var(--border-strong)] rounded-xl text-left hover:border-brand-crypto hover:bg-brand-crypto/5 transition-colors"
              >
                <div className="font-semibold text-[var(--text-primary)] text-sm">
                  {m === 'pse' ? 'PSE — Bank transfer' : m === 'nequi' ? 'Nequi' : 'Bancolombia'}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {m === 'pse'
                    ? 'Pay from any Colombian bank'
                    : m === 'nequi'
                      ? 'Approve from the Nequi app'
                      : 'Pay via Bancolombia button'}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Payment: PSE bank picker ── */}
        {step === 'pse_bank' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
              Select your bank
            </h2>
            {pseBanks.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading banks...</p>
            ) : (
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full p-3 border rounded-lg text-[var(--text-primary)] text-sm bg-[var(--bg-primary)]"
              >
                <option value="">Select bank...</option>
                {pseBanks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setStep('amount')}
              disabled={!selectedBank}
              className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Payment: amount ── */}
        {step === 'amount' && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Enter amount</h2>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Amount in COP
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">
                  $
                </span>
                <input
                  type="number"
                  value={amountCop}
                  onChange={(e) => {
                    setAmountCop(e.target.value)
                    setEstimatedUsdc(null)
                  }}
                  placeholder="50000"
                  min="1000"
                  className="w-full pl-7 pr-3 py-3 border rounded-lg text-[var(--text-primary)] text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-xs">
                  COP
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">Minimum $1,000 COP</p>
            </div>

            {estimatedUsdc !== null && (
              <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                <p className="text-sm text-[var(--text-secondary)]">
                  You will receive approximately{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    {estimatedUsdc.toFixed(2)} USDC
                  </span>
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Final amount set by Colurs after payment clears.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {!estimatedUsdc ? (
                <button
                  onClick={handleQuote}
                  disabled={loading || !amountCop}
                  className="flex-1 py-3 border border-brand-crypto text-brand-crypto rounded-lg font-semibold text-sm disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Get quote'}
                </button>
              ) : (
                <button
                  onClick={handleInitiate}
                  disabled={loading}
                  className="flex-1 py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Pay now'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Payment: paying ── */}
        {step === 'paying' && order && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">{order.method === 'nequi' ? '📱' : '🔗'}</div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {order.method === 'nequi' ? 'Approve in Nequi' : 'Complete payment'}
              </h2>
            </div>

            <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Amount</span>
                <span className="font-medium text-[var(--text-primary)]">
                  ${order.amountCop.toLocaleString()} COP
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Method</span>
                <span className="font-medium text-[var(--text-primary)] capitalize">
                  {order.method}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Tracking key</span>
                <span className="font-mono text-xs text-[var(--text-primary)]">
                  {order.trackingKey}
                </span>
              </div>
            </div>

            {order.instructions && (
              <p className="text-sm text-[var(--text-secondary)] bg-amber-50 border border-amber-200 rounded-lg p-3">
                {order.instructions}
              </p>
            )}

            {order.paymentLink && (
              <a
                href={order.paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold text-center"
              >
                Open payment page →
              </a>
            )}

            <button
              onClick={() => {
                setStep('status')
                handleCheckStatus()
              }}
              disabled={loading}
              className="w-full py-3 border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-brand-crypto"
            >
              {loading ? 'Checking...' : 'Check payment status'}
            </button>
          </div>
        )}

        {/* ── Status ── */}
        {step === 'status' && order && (
          <div className="bg-[var(--bg-primary)] panel-frame rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Order status</h2>

            <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Status</span>
                <span
                  className={`font-medium capitalize ${orderStatus === 'completed' ? 'text-green-600' : orderStatus === 'failed' || orderStatus === 'bridge_failed' ? 'text-red-600' : 'text-amber-600'}`}
                >
                  {orderStatus ?? order.status}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Amount</span>
                <span className="font-medium text-[var(--text-primary)]">
                  ${order.amountCop.toLocaleString()} COP
                </span>
              </div>
            </div>

            {orderStatus === 'completed' ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
                Payment received. USDC will appear in your wallet shortly.
              </div>
            ) : orderStatus === 'bridge_failed' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                <p className="font-semibold mb-1">Manual review required</p>
                <p>
                  Your COP payment was confirmed but the USDC transfer could not be completed. Our
                  team has been notified and will resolve this. Please do not retry — contact
                  support if you need an update after 24 hours.
                </p>
              </div>
            ) : (
              <button
                onClick={handleCheckStatus}
                disabled={loading}
                className="w-full py-3 bg-brand-crypto text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh status'}
              </button>
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

export default function OnrampPage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <OnrampContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
