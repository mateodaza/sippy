/**
 * Admin Pay Sheets page — generate printable vendor pay-QR sheets.
 *
 * Vendor-facing equivalent of /admin/qr-sheets (which is event-bound). This
 * page lists all active `kind='pay'` QRs across all owners + a creation form.
 * Open the page → fill the form → submit → page reloads with the new QR →
 * Cmd/Ctrl+P → save as PDF or print directly for vendor signage.
 *
 * Cheetah blue `#00AFD7` for the QR foreground, matching the consumer-side
 * brand color (pay = consumer surface, vs event QR's same blue used for
 * onboarding).
 */

import { Head, useForm } from '@inertiajs/react'
import { QRCodeSVG } from 'qrcode.react'
import AdminLayout from '../../layouts/admin_layout.js'

interface PayLink {
  shortId: string
  displayName: string | null
  scanUrl: string
  ownerPhoneMasked: string
}

interface Props {
  payLinks: PayLink[]
  scanUrlBase: string
  scanUrlIsFallback: boolean
  flash: { error?: string | string[]; created?: string | string[] } | null
}

function readFlash(value: string | string[] | undefined): string | null {
  if (value === undefined) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first !== undefined ? String(first) : null
  }
  return String(value)
}

export default function PaySheetsPage({ payLinks, scanUrlBase, scanUrlIsFallback, flash }: Props) {
  const { data, setData, post, processing, errors } = useForm({
    ownerPhoneNumber: '',
    displayName: '',
  })

  const flashError = flash?.error ? readFlash(flash.error) : null
  const flashCreated = flash?.created ? readFlash(flash.created) : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    post('/admin/pay-sheets')
  }

  return (
    <AdminLayout>
      <Head title="Pay Sheets" />

      <style>{`
        @media print {
          html, body { background: white !important; }
          .no-print, .no-print * { display: none !important; }
          .print-sheet { page-break-after: always; break-after: page; }
          .print-sheet:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
            Pay Sheets
          </h1>
          <p className="spec-label mt-1">Vendor / merchant pay-QRs</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
          <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-crypto-hover">
            {payLinks.length} SHEET{payLinks.length === 1 ? '' : 'S'}
          </span>
          {payLinks.length > 0 ? (
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
            actual apps/web public domain BEFORE printing.
          </p>
        ) : null}
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
          Created pay-QR <code>{flashCreated}</code>. Use the Print button above to print.
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="no-print panel-frame mb-8 space-y-4 p-6"
        aria-label="Create pay QR"
      >
        <div>
          <label htmlFor="ownerPhoneNumber" className="spec-label block">
            Owner phone (must exist in user_preferences)
          </label>
          <input
            id="ownerPhoneNumber"
            type="text"
            value={data.ownerPhoneNumber}
            onChange={(e) => setData('ownerPhoneNumber', e.target.value)}
            placeholder="+57300..."
            className="mt-1 w-full rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
            required
          />
          {errors.ownerPhoneNumber ? (
            <p className="mt-1 text-xs text-red-600">{errors.ownerPhoneNumber}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="displayName" className="spec-label block">
            Display name (printed on sheet — e.g. &quot;Carolina&apos;s Pizza&quot;)
          </label>
          <input
            id="displayName"
            type="text"
            value={data.displayName}
            onChange={(e) => setData('displayName', e.target.value)}
            placeholder="Carolina's Pizza"
            maxLength={40}
            className="mt-1 w-full rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
            required
          />
          {errors.displayName ? (
            <p className="mt-1 text-xs text-red-600">{errors.displayName}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={processing}
          className="rounded-md bg-crypto-hover px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50"
        >
          {processing ? 'Creating…' : 'Generate Pay-QR'}
        </button>
      </form>

      {payLinks.length === 0 ? (
        <p className="no-print panel-frame p-8 text-center text-sm admin-text opacity-70">
          No pay-QRs yet. Use the form above to create one.
        </p>
      ) : (
        <div className="grid gap-6 print:gap-0 sm:grid-cols-2 lg:grid-cols-2 print:grid-cols-1">
          {payLinks.map((link) => (
            <PrintableSheet key={link.shortId} link={link} />
          ))}
        </div>
      )}
    </AdminLayout>
  )
}

function PrintableSheet({ link }: { link: PayLink }) {
  const display = link.displayName ?? 'Sippy'
  return (
    <article
      className="print-sheet flex flex-col items-center justify-center gap-6 rounded border border-[var(--admin-border-subtle)] bg-white p-8 text-black print:rounded-none print:border-0 print:min-h-[calc(100vh-40mm)]"
      aria-label={`Pay sheet for ${display}`}
    >
      <header className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">Sippy</p>
        <h2 className="mt-1 text-3xl font-semibold">{display}</h2>
        {/* Screen-only: owner phone disambiguates sheets when two vendors share
            a display name. Hidden in print so the printable face stays clean. */}
        <p className="no-print mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
          {link.ownerPhoneMasked}
        </p>
      </header>

      <QRCodeSVG
        value={link.scanUrl}
        size={360}
        level="H"
        fgColor="#00AFD7"
        bgColor="#FFFFFF"
        includeMargin
      />

      <footer className="w-full text-center">
        <p className="text-lg font-semibold">Paga aqui con Sippy</p>
        <p className="mt-1 text-sm text-neutral-600">Escanea con tu camara para pagar.</p>
        <p className="mt-2 break-all font-mono text-xs text-neutral-500">{link.scanUrl}</p>
      </footer>
    </article>
  )
}
