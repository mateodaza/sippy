'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { getStoredToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '@/components/shared/ChannelPicker'
import { SippyPhoneInput } from '@/components/ui/phone-input'
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
            {/* Printable sheet — kept on white background so printed output
                stays clean regardless of the on-screen theme. */}
            <article
              className="print-sheet panel-frame flex flex-col items-center justify-center gap-6 rounded-2xl bg-white p-8 text-black"
              aria-label={`Pay sheet for ${link.displayName ?? 'Sippy'}`}
            >
              <header className="w-full text-center">
                <div className="flex justify-center">
                  <Image
                    src="/images/logos/sippy-wordmark-cheetah.svg"
                    alt="Sippy"
                    width={88}
                    height={25}
                    className="h-6 w-auto"
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
                        className="w-full max-w-[280px] rounded-lg border border-neutral-300 px-3 py-2 text-center font-display text-2xl font-bold uppercase tracking-wide text-black focus:border-brand-primary focus:outline-none"
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
                          className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100"
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
                <p className="font-display text-lg font-bold uppercase tracking-wide">
                  Paga aquí con Sippy
                </p>
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
    <a href="/" className="inline-flex items-center gap-3">
      <Image
        src="/images/logos/sippy-s-mark-cheetah.svg"
        alt="Sippy"
        width={18}
        height={32}
        className="h-7 w-auto"
        priority
      />
      <Image
        src="/images/logos/sippy-wordmark-cheetah.svg"
        alt="Sippy"
        width={88}
        height={25}
        className="h-5 w-auto"
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
