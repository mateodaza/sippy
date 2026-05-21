/**
 * /cobrar body — bilingual (ES + EN). Universal copy that reads
 * correctly for vendors, friends splitting bills, anyone receiving.
 * Bot deep-link text is localized so EN users land in WhatsApp with
 * an English greeting that the bot's language detector picks up.
 */

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'
import {
  DocsLanguageToggle,
  useDocsLang,
  type DocsLang,
} from '@/components/shared/DocsLanguageToggle'

const WA_BASE = `https://wa.me/${WHATSAPP_BOT_NUMBER}`

type Copy = {
  eyebrow: string
  h1: string
  intro: string
  introSub: string
  s1Title: string
  s1Items: { strong: string; rest: string }[]
  s2Title: string
  s2Steps: React.ReactNode[]
  ctaWriteBot: string
  waMyCode: string
  ctaOpenQr: string
  s3Title: string
  s3Body: React.ReactNode
  ctaBalance: string
  waBalance: string
  s3Tail: string
  s4Title: string
  s4Items: React.ReactNode[]
  navOther: string
  navBack: string
  footerTag: string
}

const COPY: Record<DocsLang, Copy> = {
  es: {
    eyebrow: 'Sippy · Cobrar',
    h1: '¿Cómo recibo pagos con Sippy?',
    intro:
      'Tres pasos. Sin instalar nada. Quien te paga escanea un código, te llega USDC, normalmente en segundos.',
    introSub:
      'Funciona igual si eres un comercio en un evento, un amigo cobrando una cuenta dividida, o cualquier persona que necesita recibir.',
    s1Title: 'Qué necesitas',
    s1Items: [
      {
        strong: 'Sippy en WhatsApp.',
        rest: ' Si todavía no tienes tu cuenta, escríbele a Sippy y te guía en menos de un minuto.',
      },
      {
        strong: 'Tu número confirmado.',
        rest: ' El que usas en WhatsApp. Sin verificar no puedes recibir.',
      },
      {
        strong: 'Internet o datos en tu teléfono.',
        rest: ' Solo para abrir WhatsApp cuando lo necesites.',
      },
    ],
    s2Title: 'Cómo hacerlo',
    s2Steps: [
      <>
        <strong>1.</strong> Abre WhatsApp y escríbele a Sippy:{' '}
        <span className="font-mono">mi codigo de pago</span>.
      </>,
      <>
        <strong>2.</strong> Sippy te manda un link. Ese es tu código. Compártelo por WhatsApp,
        imprime el QR para pegarlo en tu puesto, o mostralo en tu pantalla.
      </>,
      <>
        <strong>3.</strong> Quien te paga abre el link (o escanea el QR), escribe el monto,
        confirma. El pago te llega en USDC, normalmente en segundos.
      </>,
    ],
    ctaWriteBot: 'Escribirle a Sippy',
    waMyCode: 'mi codigo de pago',
    ctaOpenQr: 'Abrir mi código de pago',
    s3Title: 'Cómo confirmar que funcionó',
    s3Body: (
      <>
        Cuando el pago se complete, Sippy te avisa por WhatsApp con el monto recibido. También
        puedes escribirle <span className="font-mono">saldo</span> en cualquier momento para ver
        cuánto tienes acumulado.
      </>
    ),
    ctaBalance: 'Ver mi saldo',
    waBalance: 'saldo',
    s3Tail: 'Tu saldo queda en Sippy. Puedes usarlo para pagar o moverlo después.',
    s4Title: 'Si algo falla',
    s4Items: [
      <>
        <strong>No te llegó el aviso de un pago.</strong> Escríbele a Sippy{' '}
        <span className="font-mono">saldo</span>. Si el monto está ahí, el pago entró bien aunque el
        mensaje haya tardado.
      </>,
      <>
        <strong>La persona no puede escanear tu QR.</strong> Pídele que toque el link directamente
        desde tu pantalla, o muéstrale tu QR de cerca y bien iluminado.
      </>,
      <>
        <strong>No sabes qué escribirle a Sippy.</strong> Manda{' '}
        <span className="font-mono">ayuda</span> y te lista todos los comandos.{' '}
        <strong>Para problemas en el momento</strong>, busca al equipo Sippy o pasa por nuestro
        stand.
      </>,
    ],
    navOther: '¿Vas a pagar en lugar de cobrar? →',
    navBack: '← Volver a Pizza Day',
    footerTag: 'Billetera de dólares en WhatsApp',
  },
  en: {
    eyebrow: 'Sippy · Receive',
    h1: 'How do I receive payments with Sippy?',
    intro:
      'Three steps. Nothing to install. Whoever pays you scans a code, USDC lands in your balance, usually in seconds.',
    introSub:
      'Same flow whether you are a vendor at an event, a friend collecting on a split bill, or anyone who needs to be paid.',
    s1Title: 'What you need',
    s1Items: [
      {
        strong: 'Sippy on WhatsApp.',
        rest: " If you don't have an account yet, message Sippy and it walks you through in under a minute.",
      },
      {
        strong: 'Your number verified.',
        rest: ' The one you use on WhatsApp. Without verifying you cannot receive.',
      },
      {
        strong: 'Internet or mobile data on your phone.',
        rest: ' Just enough to open WhatsApp when you need it.',
      },
    ],
    s2Title: 'How to do it',
    s2Steps: [
      <>
        <strong>1.</strong> Open WhatsApp and message Sippy:{' '}
        <span className="font-mono">my pay code</span>.
      </>,
      <>
        <strong>2.</strong> Sippy sends back a link. That is your code. Share it on WhatsApp, print
        the QR and stick it at your booth, or show it on your screen.
      </>,
      <>
        <strong>3.</strong> Whoever pays opens the link (or scans the QR), types the amount,
        confirms. The payment lands in USDC, usually in seconds.
      </>,
    ],
    ctaWriteBot: 'Message Sippy',
    waMyCode: 'my pay code',
    ctaOpenQr: 'Open my pay code',
    s3Title: 'Confirm it worked',
    s3Body: (
      <>
        When the payment completes, Sippy notifies you on WhatsApp with the amount. You can also
        type <span className="font-mono">balance</span> anytime to see your running total.
      </>
    ),
    ctaBalance: 'Check my balance',
    waBalance: 'balance',
    s3Tail: 'Your balance stays in Sippy. You can use it to pay, or move it later.',
    s4Title: 'If something fails',
    s4Items: [
      <>
        <strong>You did not get a payment notification.</strong> Send Sippy{' '}
        <span className="font-mono">balance</span>. If the amount is there, the payment went through
        even if the message was delayed.
      </>,
      <>
        <strong>The person cannot scan your QR.</strong> Ask them to tap the link directly on your
        screen, or hold the QR close and well-lit.
      </>,
      <>
        <strong>You do not know what to say to Sippy.</strong> Send{' '}
        <span className="font-mono">help</span> and it lists every command.{' '}
        <strong>For issues in the moment</strong>, find the Sippy team or stop by our stand.
      </>,
    ],
    navOther: 'Need to pay instead? →',
    navBack: '← Back to Pizza Day',
    footerTag: 'Your dollar wallet on WhatsApp',
  },
}

export default function CobrarContent() {
  const [lang, setLang] = useDocsLang()
  const c = COPY[lang]
  const waMyCode = `${WA_BASE}?text=${encodeURIComponent(c.waMyCode)}`
  const waBalance = `${WA_BASE}?text=${encodeURIComponent(c.waBalance)}`

  return (
    <main className="min-h-screen bg-[var(--bg-primary,#FFFFFF)] text-[var(--text-primary,#1A1A2E)]">
      <article className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center" aria-label="Sippy">
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy"
              width={120}
              height={34}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <DocsLanguageToggle lang={lang} onChange={setLang} />
        </div>

        <header className="mb-10 border-b-2 border-[var(--text-primary,#1A1A2E)] pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--brand-primary,#00AFD7)]">
            {c.eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">{c.h1}</h1>
          <p className="mt-4 text-base text-[var(--text-secondary,#374151)] sm:text-lg">
            {c.intro}
          </p>
          <p className="mt-3 text-sm text-[var(--text-muted,#6B7280)]">{c.introSub}</p>
        </header>

        <Section number="1" title={c.s1Title}>
          <ul className="mt-2 space-y-2 text-base">
            {c.s1Items.map((it, i) => (
              <li key={i}>
                <strong>{it.strong}</strong>
                {it.rest}
              </li>
            ))}
          </ul>
        </Section>

        <Section number="2" title={c.s2Title}>
          <ol className="mt-2 space-y-3 text-base">
            {c.s2Steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href={waMyCode}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {c.ctaWriteBot}
            </a>
            <Link
              href="/wallet/pay-qr"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              {c.ctaOpenQr}
            </Link>
          </div>
        </Section>

        <Section number="3" title={c.s3Title}>
          <p>{c.s3Body}</p>
          <div className="mt-4">
            <a
              href={waBalance}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              {c.ctaBalance}
            </a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)]">{c.s3Tail}</p>
        </Section>

        <Section number="4" title={c.s4Title}>
          <ul className="mt-2 space-y-2 text-base">
            {c.s4Items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>

        <div className="mt-12 border-t-2 border-[var(--text-primary,#1A1A2E)] pt-8">
          <nav
            className="mb-6 flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-between"
            aria-label="More"
          >
            <Link
              href={lang === 'en' ? '/pagar?lang=en' : '/pagar'}
              className="font-semibold text-[var(--brand-primary,#00AFD7)] hover:underline"
            >
              {c.navOther}
            </Link>
            <Link
              href={lang === 'en' ? '/pizza-day?lang=en' : '/pizza-day'}
              className="text-[var(--text-secondary,#374151)] hover:underline"
            >
              {c.navBack}
            </Link>
          </nav>
          <p className="text-center text-xs text-[var(--text-muted,#6B7280)]">
            <Link href="/" className="underline hover:no-underline">
              sippy.lat
            </Link>{' '}
            · {c.footerTag}
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
