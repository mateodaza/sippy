/**
 * Pizza Day backup flyer — printable one-page catch-all.
 *
 * Use case: when an assistant's phone breaks, Wi-Fi dies, a sheet gets lost,
 * or someone arrives mid-event with no sheet — ops carries printed copies of
 * this flyer to hand out. Big Sippy WhatsApp number + a QR that deep-links
 * straight into a chat with Sippy. Spanish copy.
 *
 * Print this from a browser (Cmd/Ctrl+P → save as PDF or print). The
 * print-only CSS hides everything except the sheet itself, A4, no margins
 * on screen and 15mm when printing.
 *
 * Client component because qrcode.react does its rendering in the browser.
 * No server data needed.
 */

'use client'

import { QRCodeSVG } from 'qrcode.react'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

const WA_DEEPLINK = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent('Hola Sippy!')}`
const DISPLAY_NUMBER = '+1 (472) 226-1449'

export default function PizzaDayBackupFlyerPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Print-only stylesheet. Hides the screen toolbar, fills the page. */}
      <style>{`
        @media print {
          html, body { background: white !important; }
          .no-print, .no-print * { display: none !important; }
          .print-sheet { page-break-after: auto; break-after: auto; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          Sippy · Pizza Day · Backup flyer
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border-2 border-black bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-black hover:bg-black hover:text-white"
        >
          Imprimir
        </button>
      </div>

      {/* The sheet itself — one page when printed */}
      <article className="print-sheet mx-auto flex max-w-3xl flex-col items-center justify-between gap-8 px-8 py-10 print:min-h-[calc(100vh-30mm)] print:gap-12">
        {/* Header */}
        <header className="w-full text-center">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-neutral-500">
            Cartagena Onchain · 2026
          </p>
          <h1 className="mt-2 text-5xl font-bold leading-tight sm:text-6xl">Pizza Day</h1>
          <div aria-hidden="true" className="mx-auto mt-4 h-[3px] w-32 bg-[#00AFD7]" />
        </header>

        {/* Main message */}
        <section className="w-full text-center">
          <p className="text-2xl font-semibold sm:text-3xl">
            ¿Algo no funciona? Escríbele a Sippy.
          </p>
          <p className="mt-3 text-base text-neutral-600">
            Esta es tu carta debajo de la manga si el QR del evento se pierde, no carga, o el Wi-Fi
            se cae.
          </p>
        </section>

        {/* QR + number — the two ways to reach Sippy */}
        <section className="grid w-full gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
          {/* QR */}
          <div className="flex flex-col items-center gap-3">
            <QRCodeSVG
              value={WA_DEEPLINK}
              size={260}
              level="H"
              fgColor="#00AFD7"
              bgColor="#FFFFFF"
              includeMargin
            />
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
              Escanea para abrir WhatsApp
            </p>
          </div>

          {/* Number + instructions */}
          <div className="space-y-4 text-left">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-500">
                Número de WhatsApp
              </p>
              <p className="mt-1 break-all font-mono text-2xl font-bold sm:text-3xl">
                {DISPLAY_NUMBER}
              </p>
            </div>

            <ol className="list-inside list-decimal space-y-2 text-base text-neutral-800">
              <li>Agrega el número a tus contactos como &ldquo;Sippy&rdquo;</li>
              <li>Abre WhatsApp y escríbele &ldquo;hola&rdquo;</li>
              <li>Sippy te crea la billetera y te lleva al evento en segundos</li>
            </ol>

            <p className="text-sm text-neutral-600">
              ¿Más info? <span className="font-mono">sippy.lat/pizza-day</span>
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t-2 border-black pt-4 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-neutral-500">
            Sippy · Dólares por WhatsApp · sippy.lat
          </p>
        </footer>
      </article>
    </main>
  )
}
