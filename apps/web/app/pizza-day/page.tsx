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

        <Section number="4" title="Sippy Quest — el reto del evento">
          <p>
            <strong>Un solo reto:</strong> convence a la mayor cantidad de gente posible de que te
            manden <span className="font-mono">$0.10</span> o más por Sippy. Cuentan personas
            distintas, no monto. El que más amigos distintos lo logre, gana.
          </p>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">
            100 personas mandándote $0.10 valen más que 1 persona mandándote $100. Es un juego
            social: pitch, networking, ser memorable.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Prize
              amount="$80 USDC"
              name="🥇 1° lugar"
              criterion="Más personas distintas que te mandaron"
            />
            <Prize amount="$40 USDC" name="🥈 2° lugar" criterion="Segundo en personas distintas" />
            <Prize amount="$20 USDC" name="🥉 3° lugar" criterion="Tercero en personas distintas" />
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)]">
            No cuentan envíos a vendors ni a uno mismo. Mira el leaderboard en vivo en la pantalla
            del evento o pregúntale a Sippy <span className="font-mono">leaderboard</span>.
          </p>
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

function Prize({ amount, name, criterion }: { amount: string; name: string; criterion: string }) {
  return (
    <div className="rounded-md border-2 border-[var(--text-primary,#1A1A2E)] bg-[var(--bg-primary,#FFFFFF)] p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted,#6B7280)]">
        {amount}
      </p>
      <p className="mt-1 text-lg font-bold">{name}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary,#374151)]">{criterion}</p>
    </div>
  )
}

export const dynamic = 'force-static'
