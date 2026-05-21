/**
 * /pagar — Cómo pagar con Sippy (asistentes / clientes)
 *
 * Operational one-pager. Attendee-facing, Spanish-only, mobile-first.
 * Designed for someone standing in front of a vendor booth wondering
 * "how does this work?" — readable in <60s.
 *
 * Structure pinned 2026-05-19 with Mateo:
 *   1. Qué necesitas
 *   2. Cómo hacerlo
 *   3. Cómo confirmar que funcionó
 *   4. Si algo falla
 *
 * Onboarding CTA goes via WhatsApp (`Hola Sippy!`) rather than directly
 * to /setup. The bot already handles the new-user welcome and serves the
 * setup link in-flow — keeps the user in one context instead of bouncing
 * them to a web form they didn't ask for.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Pagar con Sippy — Guía para clientes',
  description: 'Cómo pagar a un comercio con Sippy. Tres pasos: escaneas, confirmas, listo.',
  alternates: { canonical: 'https://www.sippy.lat/pagar' },
  openGraph: {
    title: 'Pagar con Sippy — Guía para clientes',
    description: 'Escaneas, confirmas, listo. Tres pasos en WhatsApp.',
    type: 'article',
  },
}

const WA_BASE = `https://wa.me/${WHATSAPP_BOT_NUMBER}`
const WA_HOLA = `${WA_BASE}?text=${encodeURIComponent('Hola Sippy!')}`
const WA_SALDO = `${WA_BASE}?text=${encodeURIComponent('saldo')}`

export default function PagarPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary,#FFFFFF)] text-[var(--text-primary,#1A1A2E)]">
      <article className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        {/* Hero */}
        <header className="mb-10 border-b-2 border-[var(--text-primary,#1A1A2E)] pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--brand-primary,#00AFD7)]">
            Sippy · Pagar
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">
            ¿Cómo pago con Sippy?
          </h1>
          <p className="mt-4 text-base text-[var(--text-secondary,#374151)] sm:text-lg">
            Tres pasos. Sin instalar nada. Escaneas el QR del comercio, confirmas en WhatsApp,
            listo.
          </p>
        </header>

        <Section number="1" title="Qué necesitas">
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <strong>Sippy en WhatsApp.</strong> Si todavía no tienes cuenta, escríbele a Sippy y
              te guía en menos de un minuto.
            </li>
            <li>
              <strong>USDC en tu saldo.</strong> Si no tienes, busca al equipo Sippy con el cartel
              de <strong>Exchange</strong> en el evento. Le entregas efectivo, te mandan USDC en
              segundos.
            </li>
            <li>
              <strong>Datos o Wi-Fi.</strong> Solo para abrir WhatsApp cuando pagues.
            </li>
          </ul>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {/* Two distinct destinations: web-form onboarding vs jumping
                into the bot chat. Earlier pass had both buttons pointing
                at the same wa.me URL — fixed 2026-05-19. */}
            <Link
              href="/setup"
              className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Crear mi cuenta
            </Link>
            <a
              href={WA_HOLA}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              Abrir Sippy en WhatsApp
            </a>
          </div>
        </Section>

        <Section number="2" title="Cómo hacerlo">
          <ol className="mt-2 space-y-3 text-base">
            <li>
              <strong>1.</strong> Abre la cámara de tu teléfono (no Sippy, la cámara normal) y
              apunta al QR del comercio.
            </li>
            <li>
              <strong>2.</strong> Toca el link que te aparece. Se abre WhatsApp con Sippy.
            </li>
            <li>
              <strong>3.</strong> Sippy te pregunta cuánto pagar. Escribes el monto que te dijo el
              comercio (ej. <span className="font-mono">5</span>), confirmas con{' '}
              <span className="font-mono">si</span>. El pago se envía, normalmente en segundos.
            </li>
          </ol>
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)]">
            ¿No hay QR a la mano? Puedes pagarle directo a un amigo escribiendo en WhatsApp:{' '}
            <span className="font-mono">envía 5 a +57 300 123 4567</span> o{' '}
            <span className="font-mono">mándale 10 a María</span> si la tienes en tus contactos.
          </p>
        </Section>

        <Section number="3" title="Cómo confirmar que funcionó">
          <p>
            Sippy te confirma el envío en el mismo chat con el comprobante. Si quieres ver tu saldo
            después, escribe <span className="font-mono">saldo</span> en cualquier momento.
          </p>
          <div className="mt-4">
            <a
              href={WA_SALDO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              Ver mi saldo
            </a>
          </div>
        </Section>

        <Section number="4" title="Si algo falla">
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <strong>La cámara no te abre WhatsApp.</strong> Toca el link directamente desde el QR
              si está impreso con la URL visible, o pídele al comercio que te comparta el link por
              WhatsApp.
            </li>
            <li>
              <strong>Sippy no te pide el monto.</strong> Asegúrate de haber abierto el link del
              comercio (no escribiste tú mismo). Vuelve a escanear si hace falta.
            </li>
            <li>
              <strong>No estás seguro si pagaste.</strong> Si Sippy te mostró un comprobante, el
              pago salió. Si no estás seguro, no lo repitas todavía: escribe{' '}
              <span className="font-mono">historial</span> o busca al equipo Sippy. Reintentarlo sin
              confirmar puede generar un pago doble.
            </li>
            <li>
              <strong>Algo más raro.</strong> Busca al equipo Sippy en el evento (camisetas Sippy) o
              escribe <span className="font-mono">ayuda</span> en WhatsApp.
            </li>
          </ul>
        </Section>

        {/* Bottom anchor */}
        <div className="mt-12 border-t-2 border-[var(--text-primary,#1A1A2E)] pt-8 text-center">
          <p className="text-xs text-[var(--text-muted,#6B7280)]">
            <Link href="/" className="underline hover:no-underline">
              sippy.lat
            </Link>{' '}
            · Billetera de dólares en WhatsApp
          </p>
        </div>
      </article>
    </main>
  )
}

function Section({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-baseline gap-3 text-2xl font-bold">
        <span className="font-mono text-base text-[var(--brand-primary,#00AFD7)]">
          {number.padStart(2, '0')}
        </span>
        <span>{title}</span>
      </h2>
      <div className="text-base leading-relaxed text-[var(--text-primary,#1A1A2E)]">{children}</div>
    </section>
  )
}

export const dynamic = 'force-static'
