'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { getStoredToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '@/components/shared/ChannelPicker'
import { SippyPhoneInput } from '@/components/ui/phone-input'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'
import { CDPProviderDefault } from '../../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const MAX_DISPLAY_NAME = 40
// QR foreground stays the literal brand hex because qrcode.react needs a
// concrete color, not a CSS variable.
const BRAND_BLUE = '#00AFD7'

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

  // Payer-redirect: `/wallet/pay-qr?phone=<X>` is exclusively a SHARE
  // link — anyone who opens it (owner OR a payer, authenticated OR not)
  // gets bounced to WhatsApp with a send-intent prefill. The bot takes
  // over from there (asks for amount → confirm → pay).
  //
  // Why ALWAYS redirect, not just when unauthenticated:
  //   - A non-owner authenticated user (signed in to their own Sippy
  //     account) would otherwise hit the owner's dashboard view and see
  //     either their OWN pay-QR (wrong) or an auth wall asking them to
  //     re-auth as the URL phone (also wrong — they came here to pay,
  //     not to take over the owner's account).
  //   - Treating the phone-param URL as a one-way share link removes
  //     all the auth-disambiguation complexity. Simple rule: presence
  //     of `?phone=` means "this is for paying that person."
  //
  // Owner dashboard moved: the owner reaches their pay-QR dashboard via
  // `/wallet` (the unified hub) → "My Pay QR" — that path serves the
  // dashboard view authenticated against THEIR session, no URL phone
  // disambiguation needed. The bot reply for `mi qr` should surface
  // both URLs: the share link (this URL) and the dashboard path.
  useEffect(() => {
    if (isCheckingSession) return
    if (!phoneFromUrl) return
    if (typeof window === 'undefined') return
    const text = `Hola Sippy! pagar a ${phoneFromUrl}`
    const waUrl = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(text)}`
    window.location.replace(waUrl)
  }, [isCheckingSession, phoneFromUrl])

  const [link, setLink] = useState<PayLink | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')

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

  if (isCheckingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]">
        <p className="font-mono text-sm text-[var(--text-secondary)]">Cargando…</p>
      </main>
    )
  }

  // Phone in URL = share link → page-mount useEffect bounced to WhatsApp.
  // Render a brief holding state so we don't flash the dashboard or
  // auth form before the navigation lands.
  if (phoneFromUrl) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]">
        <p className="font-mono text-sm text-[var(--text-secondary)]">Abriendo WhatsApp…</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]">
        <div className="w-full max-w-md panel-frame rounded-2xl bg-[var(--bg-primary)] p-6">
          <BrandHeader />
          <h1 className="mt-6 font-display text-2xl font-bold uppercase tracking-wide text-[var(--text-primary)]">
            Mi código de pago
          </h1>
          <p className="mt-1 mb-6 text-sm text-[var(--text-secondary)]">
            Inicia sesión para generar y compartir tu QR.
          </p>

          {reAuthError ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-[var(--fill-danger-light)] px-4 py-3 text-sm text-red-700"
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
                <p className="mt-1 text-xs text-[var(--text-muted)]">Número desde WhatsApp.</p>
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
              <p className="mb-4 text-sm text-[var(--text-secondary)]">
                Enviamos un código a {reAuthPhone}.
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full p-3 border rounded-lg text-center text-2xl tracking-widest text-[var(--text-primary)]"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="mt-4 w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="mt-2 w-full py-2 text-sm text-[var(--text-secondary)]"
              >
                Atrás
              </button>
            </>
          )}
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-primary)]">
        <p className="font-mono text-sm text-[var(--text-secondary)]">Cargando…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
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
          /* Force the dark-mode text/border utilities back to print defaults
             so the sheet always prints with high contrast on paper. SVG QR
             colors come from element attrs, not CSS, so they're untouched. */
          .print-sheet * { color: black !important; border-color: #d4d4d4 !important; }
          .print-sheet::after { display: none !important; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <div className="mx-auto max-w-md p-6">
        <header className="no-print mb-6">
          <BrandHeader />
          <div className="flex items-center gap-3 mt-6 mb-2">
            <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
            <span className="spec-label spec-label-muted">PAY QR</span>
          </div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-[var(--text-primary)]">
            Mi código de pago
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Comparte tu QR para que te paguen con Sippy. Tú decides el nombre que ven.
          </p>
        </header>

        {error ? (
          <div
            className="no-print mb-4 rounded-lg border border-red-200 bg-[var(--fill-danger-light)] px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {!link ? (
          <form
            onSubmit={handleCreate}
            className="no-print panel-frame rounded-2xl bg-[var(--bg-primary)] p-6 space-y-4"
          >
            <div>
              <label htmlFor="displayName" className="block spec-label spec-label-muted mb-2">
                NOMBRE PARA MOSTRAR
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={MAX_DISPLAY_NAME}
                placeholder="Carolina's Pizza  ·  Mateo  ·  @cafe-norte"
                className="w-full p-3 border rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                required
                autoFocus
              />
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Aparece en el QR impreso y en el chat de quien te paga.
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting || !displayName.trim()}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Generando…' : 'Generar mi código'}
            </button>
          </form>
        ) : (
          <>
            {/* Receive-money sheet — dark on screen so the brand-blue QR pops
                against a near-black surface in low light; print stylesheet
                forces it back to a clean white sheet for the printed copy. */}
            <article
              className="print-sheet panel-frame flex flex-col items-center justify-center gap-6 rounded-2xl bg-white p-8 text-black dark:bg-[#0a0a0a] dark:text-white"
              aria-label={`Pay sheet for ${link.displayName ?? 'Sippy'}`}
            >
              <header className="w-full text-center">
                <div className="flex justify-center">
                  <Image
                    src="/images/logos/sippy-s-mark-cheetah.svg"
                    alt="Sippy"
                    width={32}
                    height={56}
                    className="h-8 w-auto"
                  />
                </div>
                {isEditing ? (
                  <>
                    {/* Print fallback: while the user has the edit input
                        open, Cmd/Ctrl+P would otherwise print a nameless
                        sheet. Render the current saved name in a
                        print-only h2 so the printed output always has it. */}
                    <h2 className="mt-3 hidden font-display text-3xl font-bold uppercase tracking-wide print:block">
                      {link.displayName ?? 'Sippy'}
                    </h2>
                    <div className="no-print mt-3 flex flex-col items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        maxLength={MAX_DISPLAY_NAME}
                        className="w-full max-w-[280px] rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-center font-display text-2xl font-bold uppercase tracking-wide text-black focus:border-brand-primary focus:outline-none dark:border-[var(--border-strong)] dark:text-white"
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
                          className="bg-brand-primary text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-brand-primary-hover disabled:opacity-50"
                        >
                          {savingEdit ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:border-[var(--border-strong)] dark:hover:bg-white/5"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <h2 className="font-display text-3xl font-bold uppercase tracking-wide">
                      {link.displayName ?? 'Sippy'}
                    </h2>
                    <button
                      type="button"
                      onClick={startEdit}
                      aria-label="Cambiar nombre"
                      className="no-print rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-white/5 dark:hover:text-white"
                    >
                      <PencilIcon />
                    </button>
                  </div>
                )}
              </header>

              {/* Light + print QR: brand blue on white. Printed copies always
                  use this variant regardless of on-screen theme. */}
              <div className="dark:hidden print:!block">
                <QRCodeSVG
                  value={link.scanUrl}
                  size={300}
                  level="H"
                  fgColor={BRAND_BLUE}
                  bgColor="#FFFFFF"
                  includeMargin
                />
              </div>
              {/* Dark-mode QR: white on transparent so it sits flush on the
                  dark sheet. Hidden in print (the version above wins). */}
              <div className="hidden dark:block print:!hidden">
                <QRCodeSVG
                  value={link.scanUrl}
                  size={300}
                  level="H"
                  fgColor="#FFFFFF"
                  bgColor="transparent"
                  includeMargin
                />
              </div>

              <footer className="w-full text-center">
                <p className="font-display text-lg font-bold uppercase tracking-wide">
                  Paga aquí con Sippy
                </p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-white/60">
                  Escanea con tu cámara para pagar.
                </p>
                <p className="mt-2 break-all font-mono text-[11px] text-neutral-500 dark:text-white/40">
                  {link.scanUrl}
                </p>
              </footer>
            </article>

            <div className="no-print mt-6 flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 panel-frame rounded-lg bg-[var(--bg-primary)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 bg-brand-primary text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-brand-primary-hover"
              >
                Compartir
              </button>
            </div>
            <p className="no-print mt-3 text-center font-mono text-xs text-[var(--text-muted)]">
              {link.ownerPhoneMasked}
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function BrandHeader() {
  return (
    <a href="/" className="inline-flex items-center">
      <Image
        src="/images/logos/sippy-wordmark-cheetah.svg"
        alt="Sippy"
        width={120}
        height={34}
        className="h-7 w-auto"
        priority
      />
    </a>
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
