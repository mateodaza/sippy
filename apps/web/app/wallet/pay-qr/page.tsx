'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { getStoredToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '@/components/shared/ChannelPicker'
import { CDPProviderDefault } from '../../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const MAX_DISPLAY_NAME = 40

interface PayLink {
  shortId: string
  displayName: string | null
  scanUrl: string
  ownerPhoneMasked: string
}

function PayQrContent() {
  const searchParams = useSearchParams()
  const phoneFromUrl = searchParams.get('phone') || ''

  // Session guard hook — exposes inline re-auth state + handlers so we can
  // render an OTP flow on the unauth branch instead of a dead-end message.
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

  // Seed the re-auth phone from the URL param the bot sent (?phone=+57...).
  // Once-only initialization mirrors the wallet page pattern.
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

  function handlePrint() {
    window.print()
  }

  async function handleShare() {
    if (!link) return
    const shareText = `Págame con Sippy: ${link.scanUrl}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.displayName ?? 'Sippy',
          text: shareText,
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

  // ── Checking session → spinner (brief) ─────────────────────────────────
  if (isCheckingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <p className="font-mono text-sm text-neutral-500">Cargando…</p>
      </main>
    )
  }

  // ── Unauthenticated → inline OTP flow seeded from ?phone=... ──────────
  // Mirrors the /wallet page's re-auth pattern so a bot-driven link
  // ("/wallet/pay-qr?phone=+57...") gives the user a one-step sign-in
  // instead of a dead-end message.
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md rounded border border-neutral-200 p-6">
          <h1 className="text-2xl font-bold tracking-tight">Mi código de pago</h1>
          <p className="mt-1 mb-6 text-sm text-neutral-600">
            Inicia sesión para generar y compartir tu QR.
          </p>

          {reAuthError ? (
            <div
              className="mb-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
              role="alert"
            >
              {reAuthError}
            </div>
          ) : null}

          {reAuthStep === 'phone' && (
            <>
              <input
                type="tel"
                value={reAuthPhone}
                onChange={(e) => !isPhoneLocked && setReAuthPhone(e.target.value)}
                placeholder="+573001234567"
                disabled={isPhoneLocked}
                className={`w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#00AFD7] focus:outline-none ${
                  isPhoneLocked ? 'bg-neutral-100 text-neutral-500' : ''
                }`}
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
              <p className="mb-4 text-sm text-neutral-600">Enviamos un código a {reAuthPhone}.</p>
              <input
                type="text"
                inputMode="numeric"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full rounded border border-neutral-300 px-3 py-3 text-center text-2xl tracking-widest focus:border-[#00AFD7] focus:outline-none"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="mt-4 w-full rounded-md bg-[#00AFD7] px-5 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
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

  // ── Authenticated; per-fetch loading shows while we read the existing QR ─
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <p className="font-mono text-sm text-neutral-500">Cargando…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          .no-print, .no-print * { display: none !important; }
          .print-sheet { padding: 0 !important; min-height: 100vh; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <div className="mx-auto max-w-md p-6">
        <header className="no-print mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Mi código de pago</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Comparte tu QR para que te paguen con Sippy. Tú decides el nombre que ven.
          </p>
        </header>

        {error ? (
          <div
            className="no-print mb-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
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
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-[#00AFD7] focus:outline-none"
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
              className="w-full rounded-md bg-[#00AFD7] px-5 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              {submitting ? 'Generando…' : 'Generar mi código'}
            </button>
          </form>
        ) : (
          <>
            <article
              className="print-sheet flex flex-col items-center justify-center gap-6 rounded border border-neutral-200 bg-white p-8"
              aria-label={`Pay sheet for ${link.displayName ?? 'Sippy'}`}
            >
              <header className="text-center">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Sippy
                </p>
                <h2 className="mt-1 text-3xl font-semibold">{link.displayName ?? 'Sippy'}</h2>
              </header>

              <QRCodeSVG
                value={link.scanUrl}
                size={300}
                level="H"
                fgColor="#00AFD7"
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
                className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 rounded-md bg-[#00AFD7] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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

export default function PayQrPage() {
  return (
    <CDPProviderDefault>
      <Suspense fallback={null}>
        <PayQrContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
