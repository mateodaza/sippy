'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { getStoredToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '@/components/shared/ChannelPicker'
import { SippyPhoneInput } from '@/components/ui/phone-input'
import { CDPProviderDefault } from '../../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const MAX_DISPLAY_NAME = 40

// Brand tokens — kept inline so this page doesn't depend on the wider
// theme system (which is light-mode-first). Pizza Day is at night;
// dark is the right default for the receive-money surface.
const BRAND_BLUE = '#00AFD7' // cheetah blue — consumer / primary CTA
const BRAND_GREEN = '#00D796' // electric green — crypto / value accent

interface PayLink {
  shortId: string
  displayName: string | null
  scanUrl: string
  ownerPhoneMasked: string
}

function PayQrContent() {
  const searchParams = useSearchParams()
  const phoneFromUrl = searchParams.get('phone') || ''

  const {
    isAuthenticated,
    isCheckingSession,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    reAuthChannel,
    reAuthCanSwitchChannel,
  } = useSessionGuard()

  const isPhoneLocked = !!phoneFromUrl

  useEffect(() => {
    if (phoneFromUrl) setReAuthPhone(phoneFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [link, setLink] = useState<PayLink | null>(null)
  // loading is per-fetch only. Start false so the unauth branch renders
  // immediately instead of hanging on "Cargando" (loadExisting never runs
  // without auth).
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')

  // Edit mode for the displayName on an existing pay-QR. PATCH preserves
  // the shortId so any printed sheets keep working — only the name shown
  // on the bot confirm prompt + this page changes.
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const loadExisting = useCallback(async () => {
    const token = getStoredToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/my-pay-link`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) {
        setLink(null)
      } else if (res.ok) {
        const data = (await res.json()) as PayLink
        setLink(data)
      } else {
        setError(`No pudimos cargar tu código (${res.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && !isCheckingSession) {
      loadExisting()
    }
  }, [isAuthenticated, isCheckingSession, loadExisting])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = displayName.trim()
    if (!name) return
    const token = getStoredToken()
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/my-pay-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: name }),
      })
      if (res.ok) {
        const data = (await res.json()) as PayLink
        setLink(data)
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || `No pudimos crear tu código (${res.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit() {
    if (!link) return
    setEditValue(link.displayName ?? '')
    setIsEditing(true)
    setError(null)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditValue('')
  }

  async function saveEdit() {
    if (!link) return
    const name = editValue.trim()
    if (!name || name === link.displayName) {
      setIsEditing(false)
      return
    }
    const token = getStoredToken()
    if (!token) return
    setSavingEdit(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/my-pay-link`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: name }),
      })
      if (res.ok) {
        const data = (await res.json()) as PayLink
        setLink(data)
        setIsEditing(false)
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || `No pudimos actualizar el nombre (${res.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSavingEdit(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  async function handleShare() {
    if (!link) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.displayName ?? 'Sippy',
          text: 'Págame con Sippy',
          url: link.scanUrl,
        })
      } catch {
        // user cancelled — silent
      }
    } else {
      try {
        await navigator.clipboard.writeText(link.scanUrl)
        alert('Enlace copiado')
      } catch {
        // ignore
      }
    }
  }

  // ── Checking session → spinner ──────────────────────────────────────────
  if (isCheckingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-black">
        <p className="font-mono text-sm text-neutral-500">Cargando…</p>
      </main>
    )
  }

  // ── Unauthenticated → inline OTP flow seeded from ?phone=... ────────────
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <BrandHeader />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Mi código de pago</h1>
          <p className="mt-1 mb-6 text-sm text-neutral-400">
            Inicia sesión para generar y compartir tu QR.
          </p>

          {reAuthError ? (
            <div
              className="mb-4 rounded border-l-4 border-red-500 bg-red-950/40 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {reAuthError}
            </div>
          ) : null}

          {reAuthStep === 'phone' && (
            <>
              <SippyPhoneInput
                value={reAuthPhone}
                onChange={setReAuthPhone}
                locked={isPhoneLocked}
              />
              {isPhoneLocked ? (
                <p className="mt-1 text-xs text-neutral-500">Número desde WhatsApp.</p>
              ) : null}
              <div className="mt-4">
                <ChannelPicker
                  canSwitch={reAuthCanSwitchChannel}
                  isLoading={reAuthLoading}
                  disabled={!reAuthPhone}
                  lang="es"
                  onSend={handleReAuthSendOtp}
                />
              </div>
            </>
          )}

          {reAuthStep === 'otp' && (
            <>
              <p className="mb-4 text-sm text-neutral-400">Enviamos un código a {reAuthPhone}.</p>
              <input
                type="text"
                inputMode="numeric"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full rounded border border-neutral-700 bg-neutral-900 text-white px-3 py-3 text-center text-2xl tracking-widest focus:border-[#00AFD7] focus:outline-none"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                style={{ backgroundColor: BRAND_BLUE }}
                className="mt-4 w-full rounded-md px-5 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
              >
                {reAuthLoading ? 'Verificando…' : 'Verificar'}
              </button>
              <ResendButton
                channel={reAuthChannel}
                isLoading={reAuthLoading}
                lang="es"
                onResend={() => handleReAuthSendOtp(reAuthChannel)}
              />
              <button
                onClick={() => setReAuthOtp('')}
                className="mt-2 w-full py-2 text-sm text-neutral-500"
              >
                Atrás
              </button>
            </>
          )}
        </div>
      </main>
    )
  }

  // ── Per-fetch loading (authenticated) ──────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-black">
        <p className="font-mono text-sm text-neutral-500">Cargando…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <style>{`
        @media print {
          html, body { background: white !important; color: black !important; }
          .no-print, .no-print * { display: none !important; }
          .print-sheet {
            background: white !important;
            color: black !important;
            border: none !important;
            padding: 0 !important;
            min-height: 100vh;
          }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <div className="mx-auto max-w-md p-6">
        <header className="no-print mb-6">
          <BrandHeader />
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Mi código de pago</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Comparte tu QR para que te paguen con Sippy. Tú decides el nombre que ven.
          </p>
        </header>

        {error ? (
          <div
            className="no-print mb-4 rounded border-l-4 border-red-500 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {!link ? (
          <form onSubmit={handleCreate} className="no-print space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium">
                Nombre para mostrar
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={MAX_DISPLAY_NAME}
                placeholder="Carolina's Pizza  ·  Mateo  ·  @cafe-norte"
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 text-white px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-[#00AFD7] focus:outline-none"
                required
                autoFocus
              />
              <p className="mt-1 text-xs text-neutral-500">
                Aparece en el QR impreso y en el chat de quien te paga.
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !displayName.trim()}
              style={{ backgroundColor: BRAND_BLUE }}
              className="w-full rounded-md px-5 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              {submitting ? 'Generando…' : 'Generar mi código'}
            </button>
          </form>
        ) : (
          <>
            {/* Printable sheet — kept on white background so the printed
                output stays clean even when the screen is dark. */}
            <article
              className="print-sheet flex flex-col items-center justify-center gap-6 rounded-xl border border-neutral-200 bg-white p-8 text-black"
              aria-label={`Pay sheet for ${link.displayName ?? 'Sippy'}`}
            >
              <header className="w-full text-center">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Sippy
                </p>
                {isEditing ? (
                  <>
                    {/* Print fallback: while the user has the edit input
                        open, Cmd/Ctrl+P would otherwise print a nameless
                        sheet. Render the current saved name in a
                        print-only h2 so the printed output always has it. */}
                    <h2 className="mt-1 hidden text-3xl font-semibold print:block">
                      {link.displayName ?? 'Sippy'}
                    </h2>
                    <div className="no-print mt-2 flex flex-col items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        maxLength={MAX_DISPLAY_NAME}
                        className="w-full max-w-[280px] rounded border border-neutral-300 px-3 py-2 text-center text-2xl font-semibold text-black focus:border-[#00AFD7] focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveEdit()
                          } else if (e.key === 'Escape') {
                            cancelEdit()
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit || !editValue.trim()}
                          style={{ backgroundColor: BRAND_BLUE }}
                          className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingEdit ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <h2 className="text-3xl font-semibold">{link.displayName ?? 'Sippy'}</h2>
                    <button
                      type="button"
                      onClick={startEdit}
                      aria-label="Cambiar nombre"
                      className="no-print rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <PencilIcon />
                    </button>
                  </div>
                )}
              </header>

              <QRCodeSVG
                value={link.scanUrl}
                size={300}
                level="H"
                fgColor={BRAND_BLUE}
                bgColor="#FFFFFF"
                includeMargin
              />

              <footer className="w-full text-center">
                <p className="text-lg font-semibold">Paga aquí con Sippy</p>
                <p className="mt-1 text-sm text-neutral-600">Escanea con tu cámara para pagar.</p>
                <p className="mt-2 break-all font-mono text-[11px] text-neutral-500">
                  {link.scanUrl}
                </p>
              </footer>
            </article>

            <div className="no-print mt-6 flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={handleShare}
                style={{ backgroundColor: BRAND_BLUE }}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Compartir
              </button>
            </div>
            <p className="no-print mt-3 text-center text-xs text-neutral-500">
              {link.ownerPhoneMasked}
            </p>
          </>
        )}
      </div>
    </main>
  )
}

/**
 * Sippy wordmark — small, mono-style header used at the top of dark
 * surfaces. Cheetah blue accent on the "ppy" so the brand color is
 * present without dominating the layout.
 */
function BrandHeader() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-base font-bold text-black"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        S
      </span>
      <span className="font-mono text-lg font-bold tracking-tight">
        si<span style={{ color: BRAND_BLUE }}>ppy</span>
      </span>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PayQrPage() {
  return (
    <CDPProviderDefault>
      <Suspense fallback={null}>
        <PayQrContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
