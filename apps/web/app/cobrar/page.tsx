/**
 * /cobrar — Cómo recibir pagos con Sippy
 *
 * Operational one-pager for ANYONE receiving payments — comercios at
 * Pizza Day, friends being paid back, splitting bills. The mechanics
 * are identical (mint a pay-QR, share it, receive USDC), so one page
 * covers the universe. Spanish-only, mobile-first, designed to be read
 * end-to-end in <60s.
 *
 * Structure pinned 2026-05-19 with Mateo:
 *   1. Qué necesitas
 *   2. Cómo hacerlo
 *   3. Cómo confirmar que funcionó
 *   4. Si algo falla
 *
 * Copy notes:
 *   - Receiver notification phrased conditionally ("también puedes
 *     escribir saldo para revisar") so the page reads correctly even
 *     if WhatsApp template delivery hiccups — `saldo` is the durable
 *     fallback.
 *   - Withdraw/offramp deliberately NOT mentioned. Tu saldo queda en
 *     Sippy. Introducing a second operational flow during Pizza Day adds
 *     cognitive load for zero day-of value.
 *   - "Quien te paga" instead of "el cliente" — works for both vendor
 *     and informal P2P framing without two copy variants.
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'Cobrar con Sippy — Cómo recibir pagos',
  description:
    'Cómo recibir pagos en USDC con Sippy. Funciona para comercios, eventos o entre amigos. Tres pasos, sin instalar nada.',
  alternates: { canonical: 'https://www.sippy.lat/cobrar' },
  openGraph: {
    title: 'Cobrar con Sippy — Cómo recibir pagos',
    description: 'Comercios, eventos o entre amigos. Recibe USDC en tres pasos. Sin instalar nada.',
    type: 'article',
  },
}

const WA_BASE = `https://wa.me/${WHATSAPP_BOT_NUMBER}`
const WA_MI_CODIGO = `${WA_BASE}?text=${encodeURIComponent('mi codigo de pago')}`
const WA_SALDO = `${WA_BASE}?text=${encodeURIComponent('saldo')}`

export default function CobrarPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary,#FFFFFF)] text-[var(--text-primary,#1A1A2E)]">
      <article className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        {/* Brand mark — links home; same asset used across /wallet/pay-qr
            and the rest of the brand surfaces (cheetah-blue wordmark). */}
        <Link href="/" className="mb-8 inline-flex items-center" aria-label="Sippy">
          <Image
            src="/images/logos/sippy-wordmark-cheetah.svg"
            alt="Sippy"
            width={120}
            height={34}
            className="h-7 w-auto"
            priority
          />
        </Link>

        {/* Hero */}
        <header className="mb-10 border-b-2 border-[var(--text-primary,#1A1A2E)] pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--brand-primary,#00AFD7)]">
            Sippy · Cobrar
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">
            ¿Cómo recibo pagos con Sippy?
          </h1>
          <p className="mt-4 text-base text-[var(--text-secondary,#374151)] sm:text-lg">
            Tres pasos. Sin instalar nada. Quien te paga escanea un código, te llega USDC —
            normalmente en segundos.
          </p>
          <p className="mt-3 text-sm text-[var(--text-muted,#6B7280)]">
            Funciona igual si eres un comercio en un evento, un amigo cobrando una cuenta dividida,
            o cualquier persona que necesita recibir.
          </p>
        </header>

        <Section number="1" title="Qué necesitas">
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <strong>Sippy en WhatsApp.</strong> Si todavía no tienes tu cuenta, escríbele a Sippy
              y te guía en menos de un minuto.
            </li>
            <li>
              <strong>Tu número confirmado.</strong> El que usas en WhatsApp. Sin verificar no
              puedes recibir.
            </li>
            <li>
              <strong>Internet o datos en tu teléfono.</strong> Solo para abrir WhatsApp cuando lo
              necesites.
            </li>
          </ul>
        </Section>

        <Section number="2" title="Cómo hacerlo">
          <ol className="mt-2 space-y-3 text-base">
            <li>
              <strong>1.</strong> Abre WhatsApp y escríbele a Sippy:{' '}
              <span className="font-mono">mi codigo de pago</span>.
            </li>
            <li>
              <strong>2.</strong> Sippy te manda un link. Ese es tu código. Compártelo por WhatsApp,
              imprime el QR para pegarlo en tu puesto, o mostralo en tu pantalla.
            </li>
            <li>
              <strong>3.</strong> Quien te paga abre el link (o escanea el QR), escribe el monto,
              confirma. El pago te llega en USDC, normalmente en segundos.
            </li>
          </ol>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href={WA_MI_CODIGO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Escribirle a Sippy
            </a>
            <Link
              href="/wallet/pay-qr"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              Abrir mi código de pago
            </Link>
          </div>
        </Section>

        <Section number="3" title="Cómo confirmar que funcionó">
          <p>
            Cuando el pago se complete, Sippy te avisa por WhatsApp con el monto recibido. También
            puedes escribirle <span className="font-mono">saldo</span> en cualquier momento para ver
            cuánto tienes acumulado.
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
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)]">
            Tu saldo queda en Sippy. Puedes usarlo para pagar o moverlo después.
          </p>
        </Section>

        <Section number="4" title="Si algo falla">
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <strong>No te llegó el aviso de un pago.</strong> Escríbele a Sippy{' '}
              <span className="font-mono">saldo</span>. Si el monto está ahí, el pago entró bien
              aunque el mensaje haya tardado.
            </li>
            <li>
              <strong>La persona no puede escanear tu QR.</strong> Pídele que toque el link
              directamente desde tu pantalla, o muéstrale tu QR de cerca y bien iluminado.
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
