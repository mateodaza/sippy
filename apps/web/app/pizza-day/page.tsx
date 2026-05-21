/**
 * Pizza Day Cartagena 2026 — in-app guide (Spanish-only).
 *
 * One-page utility doc for attendees. Mobile-first. Covers:
 *   - Lo básico (qué es Sippy)
 *   - Conseguir USDC (exchange staff)
 *   - Enviar a otros asistentes (P2P)
 *   - Pagar comida/bebida en los puestos
 *   - Sippy Quest (premios)
 *   - POAP de Cartagena Onchain
 *   - Ayuda
 *
 * Linked from QR scan welcome message + admin shares this URL with attendees.
 * Spanish-only by design — the event is in Cartagena, audience is hispanohablante.
 * If we run an English-speaking event later, fork to /event-day or add i18n.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Pizza Day Cartagena 2026 — Sippy',
  description:
    'Cómo usar Sippy en Pizza Day Cartagena 2026: conseguir USDC, enviar a otros asistentes, pagar pizza, ganar premios del Quest, reclamar tu POAP.',
  alternates: { canonical: 'https://www.sippy.lat/pizza-day' },
  openGraph: {
    title: 'Pizza Day Cartagena 2026 — Sippy',
    description: 'Guía rápida para el evento. Sippy en WhatsApp.',
    type: 'article',
  },
}

const WA_URL = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent('Hola Sippy!')}`

export default function PizzaDayPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary,#FFFFFF)] text-[var(--text-primary,#1A1A2E)]">
      <article className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        {/* Hero */}
        <header className="mb-10 border-b-2 border-[var(--text-primary,#1A1A2E)] pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted,#6B7280)]">
            Sippy · Pizza Day
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">
            Cartagena Onchain · 2026
          </h1>
          <p className="mt-4 text-base text-[var(--text-secondary,#374151)] sm:text-lg">
            Sippy es tu billetera de dólares en WhatsApp. Hoy la usas para conseguir USDC con
            efectivo, pagar pizza, mandarle plata a otra gente del evento y reclamar tu POAP.
          </p>
        </header>

        {/* Audience router — sends people to the operational guide
            that matches what they're actually trying to do. Placed at
            the top so visitors who landed here from a "what is Sippy?"
            link can skip the long explainer and get straight to the
            payment flow they need. */}
        <nav className="mb-12 grid gap-3 sm:grid-cols-2" aria-label="Guías rápidas">
          <Link
            href="/pagar"
            className="group flex flex-col gap-1 rounded-md border-2 border-[var(--text-primary,#1A1A2E)] bg-[var(--bg-primary,#FFFFFF)] p-5 transition hover:bg-[var(--brand-primary,#00AFD7)] hover:text-white"
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted,#6B7280)] group-hover:text-white/80">
              Asistente
            </span>
            <span className="mt-1 flex items-center justify-between text-xl font-bold">
              <span>¿Vas a pagar?</span>
              <span aria-hidden="true">→</span>
            </span>
            <span className="text-sm text-[var(--text-secondary,#374151)] group-hover:text-white/90">
              Cómo pagar a un comercio con Sippy.
            </span>
          </Link>
          <Link
            href="/cobrar"
            className="group flex flex-col gap-1 rounded-md border-2 border-[var(--text-primary,#1A1A2E)] bg-[var(--bg-primary,#FFFFFF)] p-5 transition hover:bg-[var(--brand-primary,#00AFD7)] hover:text-white"
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted,#6B7280)] group-hover:text-white/80">
              Comercio o amigo
            </span>
            <span className="mt-1 flex items-center justify-between text-xl font-bold">
              <span>¿Vas a cobrar?</span>
              <span aria-hidden="true">→</span>
            </span>
            <span className="text-sm text-[var(--text-secondary,#374151)] group-hover:text-white/90">
              Cómo recibir USDC en Sippy.
            </span>
          </Link>
        </nav>

        {/* Sections */}
        <Section number="1" title="Conseguir USDC con efectivo">
          <p>
            Busca al equipo Sippy con el cartel de <strong>Exchange</strong>. Le entregas efectivo,
            te mandan USDC a tu billetera Sippy al instante. Mínimo $5, sin comisión.
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">
            Si todavía no tienes Sippy, escanea cualquier QR del evento o escríbele a Sippy en
            WhatsApp y te crea la billetera en segundos.
          </p>
        </Section>

        <Section number="2" title="Mandarle plata a otra gente">
          <p>Abre WhatsApp y escríbele a Sippy. Algunos ejemplos que ya entiende:</p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            <li className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
              envía 5 a +57 300 123 4567
            </li>
            <li className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
              mándale 10 a María
            </li>
            <li className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
              pásale 3 a @juan
            </li>
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">
            Si la otra persona aún no usa Sippy, le llega un mensaje invitándola. La plata queda
            guardada hasta que se cree la billetera.
          </p>
        </Section>

        <Section number="3" title="Pagar pizza y bebidas">
          <p>
            Cada puesto tiene un cartel con el nombre del vendor. Le escribes a Sippy en WhatsApp:
          </p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            <li className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
              paga 8 a pizza
            </li>
            <li className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
              envía 5 a bebidas
            </li>
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">
            Sippy te muestra el monto, confirmas, listo. El vendor ve el pago al instante.
          </p>
        </Section>

        <Section number="4" title="Sippy Quest — entradas al sorteo">
          <p>
            Sippy Quest es un sorteo. Acumulas <strong>entradas</strong> y al final del evento se
            sortean ganadores entre todas las entradas válidas, al azar. No es por ranking — estar
            en el primer puesto no garantiza premio.
          </p>
          <p className="mt-3">
            Cómo sumas entradas (máximo <span className="font-mono">5</span> por persona):
          </p>
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <strong>+1 entrada</strong> por asistir. Si ya tienes Sippy, escanea cualquier QR del
              evento al llegar. Si no, escanea un QR o escríbele a Sippy en WhatsApp para crear tu
              cuenta en Pizza Day.
            </li>
            <li>
              <strong>+1 entrada</strong> por cada amigo que se una a Sippy con tu link de Quest —
              vengan o no al evento. Si tu mamá se une desde Bogotá, te cuenta.
            </li>
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">
            Pídele a Sippy <span className="font-mono">mi codigo</span> en WhatsApp y te manda tu
            link personal. Cada amigo que entre con ese link suma una entrada para ti cuando llegue
            al evento.
          </p>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">
            Más entradas = más probabilidad de ganar.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/quest/pizza-day-ctg-2026"
              className="inline-flex items-center justify-center rounded border-2 border-[var(--text-primary,#1A1A2E)] px-4 py-2 font-mono text-sm font-semibold hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              Ver leaderboard en vivo →
            </Link>
            <span className="self-center text-xs text-[var(--text-muted,#6B7280)]">
              o pregúntale a Sippy <span className="font-mono">mi quest</span> para ver tus entradas
              y tu posición.
            </span>
          </div>
        </Section>

        <Section number="5" title="Reclama tu POAP de Cartagena Onchain">
          <p>
            Al final del evento, Sippy te manda el link de tu POAP. Tienes dos opciones cuando te lo
            pregunte:
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <strong>Reclamar a tu Sippy</strong> — un clic, queda en tu billetera Sippy.
            </li>
            <li>
              <strong>Reclamar a tu wallet</strong> — pegas la dirección y se acuña ahí.
            </li>
          </ul>
        </Section>

        <Section number="6" title="¿Necesitas ayuda?">
          <p>
            Escríbele a Sippy en WhatsApp y di <span className="font-mono">ayuda</span>. O busca a
            alguien del equipo en el evento (estamos con camisetas Sippy).
          </p>
        </Section>

        {/* Bottom CTA */}
        <div className="mt-12 flex flex-col items-center gap-4 border-t-2 border-[var(--text-primary,#1A1A2E)] pt-10">
          <a
            href={WA_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
          >
            Abrir Sippy en WhatsApp
          </a>
          <p className="text-center text-xs text-[var(--text-muted,#6B7280)]">
            <Link href="/" className="underline hover:no-underline">
              sippy.lat
            </Link>{' '}
            · Pizza Day Cartagena Onchain 2026
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
