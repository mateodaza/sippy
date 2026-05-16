/**
 * Admin QR Sheets page — generate printable event/assistant QR sheets.
 *
 * Renders existing event QRs in a print-optimized layout (one sheet per page,
 * `page-break-after: always`) plus a creation form. The same page handles
 * both the screen view (form visible, sheets shown in a grid) and the print
 * view (form hidden, sheets one per page).
 *
 * Open the page → fill the form → submit → page reloads with the new QRs →
 * use browser print (Cmd/Ctrl+P) → save as PDF or print directly.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */

import type { FormEvent } from 'react'
import { Head, useForm } from '@inertiajs/react'
import { QRCodeSVG } from 'qrcode.react'
import AdminLayout from '../../layouts/admin_layout.js'

interface QrLink {
  shortId: string
  sourceTag: string | null
  scanUrl: string
}

interface Props {
  event: {
    slug: string
    name: string
    endsAt: string | null
  }
  qrLinks: QrLink[]
  defaultOwnerPhone: string | null
  scanUrlBase: string
  scanUrlIsFallback: boolean
  flash: { error?: string | string[]; created?: number | number[] } | null
}

function readFlash(value: string | number | string[] | number[] | undefined): string | null {
  if (value === undefined) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first !== undefined ? String(first) : null
  }
  return String(value)
}

export default function QrSheetsPage({
  event,
  qrLinks,
  defaultOwnerPhone,
  scanUrlBase,
  scanUrlIsFallback,
  flash,
}: Props) {
  const { data, setData, post, processing, errors } = useForm({
    ownerPhoneNumber: defaultOwnerPhone ?? '',
  })

  const flashError = flash?.error ? readFlash(flash.error) : null
  const flashCreated = flash?.created ? readFlash(flash.created) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    post(`/admin/qr-sheets/${encodeURIComponent(event.slug)}`)
  }

  return (
    <AdminLayout>
      <Head title={`QR Sheets — ${event.name}`} />

      {/* Print-only stylesheet. Hides the layout chrome and form, stacks each
          sheet on its own page. Inline so it's bundled with the page rather
          than depending on a global stylesheet. */}
      <style>{`
        @media print {
          html, body { background: white !important; }
          .no-print, .no-print * { display: none !important; }
          .print-sheet { page-break-after: always; break-after: page; }
          .print-sheet:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      {/* ── Screen-only chrome + form ─────────────────────────────────────── */}
      <div className="no-print mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
            QR Sheets
          </h1>
          <p className="spec-label mt-1">
            {event.name} · {event.slug}
            {event.endsAt ? ` · ends ${new Date(event.endsAt).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
          <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-crypto-hover">
            {qrLinks.length} SHEET{qrLinks.length === 1 ? '' : 'S'}
          </span>
          {qrLinks.length > 0 ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-current px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] hover:bg-current hover:text-white"
            >
              Print
            </button>
          ) : null}
        </div>
      </div>

      {/* URL preflight — printed QRs encode `${scanUrlBase}/q/<short-id>?v=1`.
          If this prefix is wrong, every sheet is unrecoverable. Surface it
          before printing so misconfig is caught in the UI, not in the field. */}
      <div
        className={`no-print mb-4 rounded border-l-4 px-4 py-3 text-sm ${
          scanUrlIsFallback
            ? 'border-amber-600 bg-amber-50 text-amber-900'
            : 'border-sky-600 bg-sky-50 text-sky-900'
        }`}
        role={scanUrlIsFallback ? 'alert' : 'note'}
      >
        <div className="font-mono text-xs uppercase tracking-[0.12em]">
          {scanUrlIsFallback ? 'URL prefix (fallback)' : 'URL prefix'}
        </div>
        <div className="mt-1 break-all font-mono text-sm">{scanUrlBase}/q/&lt;short-id&gt;?v=1</div>
        {scanUrlIsFallback ? (
          <p className="mt-2 text-xs">
            <strong>FRONTEND_URL is not set</strong> — using the default. Verify this matches the
            actual apps/web public domain BEFORE printing. Set FRONTEND_URL on the backend service
            if it&apos;s wrong; printed QRs cannot be recalled.
          </p>
        ) : (
          <p className="mt-2 text-xs">
            Open one of the generated URLs below in a phone browser before printing to confirm the
            /q route is reachable and redirects to WhatsApp.
          </p>
        )}
      </div>

      {flashError ? (
        <div
          className="no-print mb-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {flashError}
        </div>
      ) : null}

      {flashCreated ? (
        <div
          className="no-print mb-4 rounded border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          Created {flashCreated} new QR{flashCreated === '1' ? '' : 's'}. Use the Print button above
          to print all sheets.
        </div>
      ) : null}

      {/* Hide the form entirely once the event QR has been generated.
          The generated QR appears below — operator just hits Cmd+P. */}
      {qrLinks.length === 0 && (
        <form
          onSubmit={submit}
          className="no-print panel-frame mb-8 space-y-3 p-6"
          aria-label="Create event QR"
        >
          <p className="font-mono text-sm admin-text">
            One QR for the whole event. Click below to generate it — printing is just Cmd/Ctrl+P
            after.
          </p>
          {/* Owner phone is hidden — defaults to SIPPY_EVENT_QR_OWNER_PHONE env.
              No reason to ask the admin each time; the owner is a Sippy team
              account, not per-event metadata. If the env is missing the POST
              flashes a clear error. */}
          <input
            type="hidden"
            value={data.ownerPhoneNumber}
            onChange={(e) => setData('ownerPhoneNumber', e.target.value)}
          />
          {errors.ownerPhoneNumber ? (
            <p className="text-xs text-red-600">{errors.ownerPhoneNumber}</p>
          ) : null}

          <button
            type="submit"
            disabled={processing || !defaultOwnerPhone}
            className="rounded-md bg-crypto-hover px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50"
          >
            {processing ? 'Creating…' : 'Generate event QR'}
          </button>
          {!defaultOwnerPhone && (
            <p className="font-mono text-xs text-amber-700">
              Set <code>SIPPY_EVENT_QR_OWNER_PHONE</code> env var on the backend before generating.
              Must be a phone already onboarded in user_preferences.
            </p>
          )}
        </form>
      )}

      {/* ── Sheets (visible on screen as a grid; one-per-page in print) ──── */}
      {qrLinks.length === 0 ? (
        <p className="no-print panel-frame p-8 text-center text-sm admin-text opacity-70">
          No QR sheets yet for this event. Use the form above to create some.
        </p>
      ) : (
        <div className="grid gap-6 print:gap-0 sm:grid-cols-2 lg:grid-cols-2 print:grid-cols-1">
          {qrLinks.map((link) => (
            <PrintableSheet key={link.shortId} event={event} link={link} />
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

function PrintableSheet({ event, link }: { event: Props['event']; link: QrLink }) {
  return (
    <article
      className="print-sheet flex flex-col items-center justify-center gap-6 rounded border border-[var(--admin-border-subtle)] bg-white p-8 text-black print:rounded-none print:border-0 print:min-h-[calc(100vh-40mm)]"
      aria-label={`Sheet for ${link.sourceTag ?? link.shortId}`}
    >
      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Sippy</p>
        <h2 className="mt-1 text-2xl font-semibold">{event.name}</h2>
        {link.sourceTag ? (
          <p className="mt-1 font-mono text-sm uppercase tracking-[0.12em] text-neutral-700">
            {link.sourceTag}
          </p>
        ) : null}
      </header>

      <QRCodeSVG
        value={link.scanUrl}
        size={320}
        level="H"
        fgColor="#00AFD7"
        bgColor="#FFFFFF"
        includeMargin
      />

      <footer className="w-full text-center">
        <p className="text-sm">Escanea con tu cámara para empezar con Sippy.</p>
        <p className="mt-2 break-all font-mono text-xs text-neutral-500">{link.scanUrl}</p>
      </footer>
    </article>
  )
}
