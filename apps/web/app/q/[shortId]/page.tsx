/**
 * QR scan landing — /q/<short-id>
 *
 * Server-rendered entry point for every QR a Sippy user scans. The flow:
 *
 *   1. Detect device class (mobile vs desktop) from the User-Agent header.
 *   2. POST to backend /api/qr/scan/:shortId, which logs the scan and returns
 *      the outcome plus a pre-built wa.me URL.
 *   3. On mobile, redirect the user straight into WhatsApp via wa.me. This
 *      is the happy path — Sippy lives in WhatsApp, the QR is just plumbing.
 *   4. On desktop, render a fallback page with the wa.me link, the bracketed
 *      code (copy-able), and a note to scan with their phone instead.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Image from 'next/image'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'
import { QrCodeImage } from './QrCodeImage'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production')
      })()
    : 'http://localhost:3001')

type DeviceClass = 'mobile' | 'desktop' | 'unknown'

/**
 * Mirror of the backend ScanResponse shape. `backend_error` is wire-only
 * (never a DB-stored outcome) and is set by either:
 *   - the backend, when its `getQrLinkForScan` throws
 *   - this page, when the backend fetch itself fails (network/non-2xx)
 * Hoist into @sippy/shared post-freeze.
 */
interface ScanResponse {
  outcome:
    | 'redirected'
    | 'revoked'
    | 'not_found'
    | 'rate_limited'
    | 'invalid_version'
    | 'backend_error'
  shortId: string
  kind: 'pay' | 'event' | 'referral' | null
  waUrl: string
  displayLabel: string | null
}

/**
 * Classify the user agent. Cheap regex — good enough for the routing
 * decision. Mistakes only hurt by sending mobile users to the desktop
 * fallback (which still has a wa.me button), never the other way around.
 */
function detectDevice(userAgent: string): DeviceClass {
  if (!userAgent) return 'unknown'
  if (/iphone|ipod|ipad|android|mobile|blackberry|windows phone/i.test(userAgent)) {
    return 'mobile'
  }
  return 'desktop'
}

async function fetchScanResult(
  shortId: string,
  deviceClass: DeviceClass,
  userAgent: string | null,
  referer: string | null
): Promise<ScanResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/qr/scan/${encodeURIComponent(shortId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceClass, userAgent, referer }),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(
        `[qr/scan] backend returned non-2xx: status=${res.status} shortId=${shortId} backend=${BACKEND_URL}`
      )
      return null
    }
    return (await res.json()) as ScanResponse
  } catch (err) {
    // Network failure, DNS, TLS, JSON parse — all collapse here. Log enough
    // to triage from server logs without leaking the backend URL into client
    // bundles (this file is a Server Component, so console.error goes to the
    // Next.js server's stderr).
    console.error(`[qr/scan] backend fetch threw: shortId=${shortId} backend=${BACKEND_URL}`, err)
    return null
  }
}

export default async function QrLandingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId: rawShortId } = await params
  // Normalize once. The backend regex `[A-Z0-9]{8}` and the bot's bracket-
  // token regex are uppercase-only, so anything we pass downstream (wa.me
  // text, fallback render, fetch body) must be uppercase. Lowercase printed
  // URLs should still route correctly.
  const shortId = rawShortId.toUpperCase()
  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent')
  const referer = hdrs.get('referer')
  const deviceClass = detectDevice(userAgent ?? '')

  const scan = await fetchScanResult(shortId, deviceClass, userAgent, referer)

  // Backend unreachable — degrade to a generic wa.me redirect so the user
  // still ends up talking to Sippy. The bracketed code is preserved (printed
  // QR is presumed valid; the failure is on our side). No backend-side scan
  // log is written in this branch — the backend is what's down — so failures
  // here are only visible in apps/web server logs (see fetchScanResult).
  if (!scan) {
    // Always include the Sippy number — a numberless wa.me silently redirects
    // to api.whatsapp.com/send/ and makes the user pick a contact, which
    // breaks the "always lands in Sippy" promise. Use the canonical bot
    // number from shared constants so this never drifts from the rest of the
    // app's WhatsApp links.
    const fallbackUrl = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(`Hola Sippy! [${shortId}]`)}`
    if (deviceClass === 'mobile') {
      redirect(fallbackUrl)
    }
    return <DesktopFallback shortId={shortId} waUrl={fallbackUrl} outcome="backend_error" />
  }

  // Mobile happy path: hand off to WhatsApp.
  if (deviceClass === 'mobile') {
    redirect(scan.waUrl)
  }

  // Desktop fallback page.
  return (
    <DesktopFallback
      shortId={scan.shortId}
      waUrl={scan.waUrl}
      outcome={scan.outcome}
      displayLabel={scan.displayLabel}
    />
  )
}

function DesktopFallback({
  shortId,
  waUrl,
  outcome,
  displayLabel,
}: {
  shortId: string
  waUrl: string
  outcome: ScanResponse['outcome']
  displayLabel?: string | null
}) {
  // Per-outcome copy. backend_error gets its own honest message rather than
  // borrowing "not found" — the QR is presumed valid; Sippy is what's down.
  const heading =
    outcome === 'redirected'
      ? displayLabel
        ? `Abre Sippy para continuar con ${displayLabel}`
        : 'Abre Sippy para continuar'
      : outcome === 'revoked'
        ? 'Este QR ya no está activo'
        : outcome === 'backend_error'
          ? 'No pudimos conectarnos con Sippy'
          : 'No encontramos este código'

  const subline =
    outcome === 'redirected'
      ? 'Escanea con tu teléfono o abre WhatsApp para continuar.'
      : outcome === 'revoked'
        ? 'Pídele al dueño del QR uno nuevo. Puedes abrir WhatsApp para pedir ayuda.'
        : outcome === 'backend_error'
          ? 'Intenta de nuevo en unos segundos, o abre WhatsApp y envía el código de abajo.'
          : 'Puedes abrir WhatsApp y escribirle a Sippy directamente.'

  // Route is forced-dark via ThemeWrapper, so design tokens evaluate to the
  // dark palette. Using vars keeps this consistent with the rest of the app
  // (wallet, settings, stats) instead of bespoke hex.
  const showQr = outcome === 'redirected' || outcome === 'backend_error'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-primary)] px-6 py-12 text-[var(--text-primary)]">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/images/logos/sippy-wordmark-cheetah.svg"
            alt="Sippy"
            width={120}
            height={34}
            className="h-7 w-auto"
            priority
          />
        </div>

        <div className="mb-2 flex items-center justify-center gap-3">
          <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
          <span className="spec-label spec-label-muted">
            {outcome === 'redirected'
              ? 'PAY QR'
              : outcome === 'revoked'
                ? 'INACTIVE'
                : outcome === 'backend_error'
                  ? 'OFFLINE'
                  : 'NOT FOUND'}
          </span>
        </div>

        <h1 className="mb-3 text-center font-display text-2xl font-bold uppercase tracking-wide">
          {heading}
        </h1>
        <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">{subline}</p>

        {/* Hide the QR on dead-end outcomes (revoked / not_found / invalid_version)
            — scanning it would just bounce back here. Card uses the same
            panel-frame double-border as the rest of the receive-money surfaces. */}
        {showQr ? (
          <div className="mb-6 flex justify-center">
            <div className="panel-frame rounded-2xl bg-[#0a0a0a] p-6">
              <QrCodeImage waUrl={waUrl} />
            </div>
          </div>
        ) : null}

        <div className="flex justify-center">
          <a
            href={waUrl}
            className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-primary-hover"
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
        </div>

        {outcome !== 'not_found' && outcome !== 'invalid_version' ? (
          <div className="mt-8">
            <p className="mb-2 spec-label spec-label-muted">CÓDIGO</p>
            <code className="block rounded-lg border border-[var(--border-strong)] bg-[#0a0a0a] px-3 py-2 font-mono text-sm text-[var(--text-primary)]">
              [{shortId}]
            </code>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Si abres WhatsApp manualmente, envía este código al inicio del mensaje.
            </p>
          </div>
        ) : null}

        <p className="mt-12 text-center text-xs text-[var(--text-muted)]">
          <Link href="/" className="underline hover:text-[var(--text-secondary)]">
            Volver a sippy.lat
          </Link>
        </p>
      </div>
    </main>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
