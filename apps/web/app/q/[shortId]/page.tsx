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
import Link from 'next/link'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production')
      })()
    : 'http://localhost:3001')

const SIPPY_NUMBER_DISPLAY = process.env.NEXT_PUBLIC_SIPPY_WHATSAPP_NUMBER || ''

type DeviceClass = 'mobile' | 'desktop' | 'unknown'

interface ScanResponse {
  outcome: 'redirected' | 'revoked' | 'not_found' | 'rate_limited' | 'invalid_version'
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
    if (!res.ok) return null
    return (await res.json()) as ScanResponse
  } catch {
    return null
  }
}

export default async function QrLandingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await params
  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent')
  const referer = hdrs.get('referer')
  const deviceClass = detectDevice(userAgent ?? '')

  const scan = await fetchScanResult(shortId, deviceClass, userAgent, referer)

  // Backend unreachable — degrade to a generic wa.me redirect so the user
  // still ends up talking to Sippy. Tracked separately because the spec
  // promises we never leave a scanner stranded.
  if (!scan) {
    const fallbackNumber = (SIPPY_NUMBER_DISPLAY || '').replace(/[^\d]/g, '')
    const fallbackUrl = fallbackNumber
      ? `https://wa.me/${fallbackNumber}?text=${encodeURIComponent(`Hola Sippy! [${shortId}]`)}`
      : 'https://wa.me/'
    if (deviceClass === 'mobile') {
      redirect(fallbackUrl)
    }
    return <DesktopFallback shortId={shortId} waUrl={fallbackUrl} outcome="rate_limited" />
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
  const heading =
    outcome === 'redirected'
      ? displayLabel
        ? `Abre Sippy para continuar con ${displayLabel}`
        : 'Abre Sippy para continuar'
      : outcome === 'revoked'
        ? 'Este QR ya no está activo'
        : 'No encontramos este código'

  const subline =
    outcome === 'redirected'
      ? 'Escanea con tu teléfono o abre WhatsApp para continuar.'
      : outcome === 'revoked'
        ? 'Pídele al dueño del QR uno nuevo. Puedes abrir WhatsApp para pedir ayuda.'
        : 'Puedes abrir WhatsApp y escribirle a Sippy directamente.'

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-primary)] px-6 py-12 text-[var(--text-primary)]">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
          Sippy
        </p>
        <h1 className="mb-3 text-2xl font-semibold">{heading}</h1>
        <p className="mb-8 text-sm text-[var(--text-secondary)]">{subline}</p>

        <a
          href={waUrl}
          className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:opacity-90"
          target="_blank"
          rel="noreferrer"
        >
          Abrir WhatsApp
        </a>

        {outcome !== 'not_found' && outcome !== 'invalid_version' ? (
          <div className="mt-8 text-left">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Código
            </p>
            <code className="block rounded-md border border-[var(--border-muted,rgba(0,0,0,0.1))] bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2 font-mono text-sm">
              [{shortId}]
            </code>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Si abres WhatsApp manualmente, envía este código al inicio del mensaje.
            </p>
          </div>
        ) : null}

        <p className="mt-12 text-xs text-[var(--text-muted)]">
          <Link href="/" className="underline">
            Volver a sippy.lat
          </Link>
        </p>
      </div>
    </main>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
