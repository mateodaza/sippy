/**
 * /pagar body — bilingual (ES default + EN). Copy lives in the COPY map
 * below; structural JSX renders the active language. ES is the primary
 * audience for Pizza Day Cartagena; EN is for the slice of attendees who
 * don't speak Spanish.
 *
 * Bot deep-link text is also localized: an EN user opening WhatsApp with
 * "Hello Sippy!" lets the bot's language detector flip them to English
 * from message #1, so the in-WhatsApp experience matches what the page
 * promised.
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
  s1Title: string
  s1Items: { strong: string; rest: string }[]
  ctaCreate: string
  ctaOpenWa: string
  waGreeting: string
  s2Title: string
  s2Steps: React.ReactNode[]
  s2Helper: React.ReactNode
  s3Title: string
  s3Body: React.ReactNode
  ctaBalance: string
  waBalance: string
  s4Title: string
  s4Items: React.ReactNode[]
  navOther: string
  navBack: string
  footerTag: string
}

const COPY: Record<DocsLang, Copy> = {
  es: {
    eyebrow: 'Sippy · Pagar',
    h1: '¿Cómo pago con Sippy?',
    intro:
      'Tres pasos. Sin instalar nada. Escaneas el QR del comercio, confirmas en WhatsApp, listo.',
    s1Title: 'Qué necesitas',
    s1Items: [
      {
        strong: 'Sippy en WhatsApp.',
        rest: ' Si todavía no tienes cuenta, escríbele a Sippy y te guía en menos de un minuto.',
      },
      {
        strong: 'USDC en tu saldo.',
        rest: ' Si no tienes, busca al equipo Sippy o pasa por nuestro stand. Le entregas efectivo, te mandan USDC en segundos.',
      },
      {
        strong: 'Datos o Wi-Fi.',
        rest: ' Solo para abrir WhatsApp cuando pagues.',
      },
    ],
    ctaCreate: 'Crear mi cuenta',
    ctaOpenWa: 'Abrir Sippy en WhatsApp',
    waGreeting: 'Hola Sippy!',
    s2Title: 'Cómo hacerlo',
    s2Steps: [
      <>
        <strong>1.</strong> Abre la cámara de tu teléfono (no Sippy, la cámara normal) y apunta al
        QR del comercio.
      </>,
      <>
        <strong>2.</strong> Toca el link que te aparece. Se abre WhatsApp con Sippy.
      </>,
      <>
        <strong>3.</strong> Sippy te pregunta cuánto pagar. Escribes el monto que te dijo el
        comercio (ej. <span className="font-mono">5</span>), confirmas con{' '}
        <span className="font-mono">si</span>. El pago se envía, normalmente en segundos.
      </>,
    ],
    s2Helper: (
      <>
        ¿No hay QR a la mano? Puedes pagarle directo a un amigo escribiendo en WhatsApp:{' '}
        <span className="font-mono">envía 5 a +57 300 123 4567</span> o{' '}
        <span className="font-mono">mándale 10 a María</span> si la tienes en tus contactos.
      </>
    ),
    s3Title: 'Cómo confirmar que funcionó',
    s3Body: (
      <>
        Sippy te confirma el envío en el mismo chat con el comprobante. Si quieres ver tu saldo
        después, escribe <span className="font-mono">saldo</span> en cualquier momento.
      </>
    ),
    ctaBalance: 'Ver mi saldo',
    waBalance: 'saldo',
    s4Title: 'Si algo falla',
    s4Items: [
      <>
        <strong>La cámara no te abre WhatsApp.</strong> Toca el link directamente desde el QR si
        está impreso con la URL visible, o pídele al comercio que te comparta el link por WhatsApp.
      </>,
      <>
        <strong>Sippy no te pide el monto.</strong> Asegúrate de haber abierto el link del comercio
        (no escribiste tú mismo). Vuelve a escanear si hace falta.
      </>,
      <>
        <strong>No estás seguro si pagaste.</strong> Si Sippy te mostró un comprobante, el pago
        salió. Si no estás seguro, no lo repitas todavía: escribe{' '}
        <span className="font-mono">historial</span> o busca al equipo Sippy. Reintentarlo sin
        confirmar puede generar un pago doble.
      </>,
      <>
        <strong>No sabes qué escribirle a Sippy.</strong> Manda{' '}
        <span className="font-mono">ayuda</span> y te lista todos los comandos.{' '}
        <strong>Para problemas en el momento</strong>, busca al equipo Sippy o pasa por nuestro
        stand.
      </>,
    ],
    navOther: '¿Vas a cobrar en lugar de pagar? →',
    navBack: '← Volver a Pizza Day',
    footerTag: 'Billetera de dólares en WhatsApp',
  },
  en: {
    eyebrow: 'Sippy · Pay',
    h1: 'How do I pay with Sippy?',
    intro: "Three steps. Nothing to install. Scan the vendor's QR, confirm in WhatsApp, done.",
    s1Title: 'What you need',
    s1Items: [
      {
        strong: 'Sippy on WhatsApp.',
        rest: " If you don't have an account yet, message Sippy and it walks you through in under a minute.",
      },
      {
        strong: 'USDC in your balance.',
        rest: " If you don't have any, find the Sippy team or stop by our stand. Hand over cash, they send USDC in seconds.",
      },
      {
        strong: 'Mobile data or Wi-Fi.',
        rest: ' Just enough to open WhatsApp when you pay.',
      },
    ],
    ctaCreate: 'Create my account',
    ctaOpenWa: 'Open Sippy on WhatsApp',
    waGreeting: 'Hello Sippy!',
    s2Title: 'How to do it',
    s2Steps: [
      <>
        <strong>1.</strong> Open your phone camera (not Sippy, the regular camera) and point it at
        the vendor's QR.
      </>,
      <>
        <strong>2.</strong> Tap the link that appears. WhatsApp opens with Sippy.
      </>,
      <>
        <strong>3.</strong> Sippy asks how much to pay. Type the amount the vendor told you (e.g.{' '}
        <span className="font-mono">5</span>), confirm with <span className="font-mono">yes</span>.
        The payment sends, usually in seconds.
      </>,
    ],
    s2Helper: (
      <>
        No QR handy? You can pay a friend directly in WhatsApp:{' '}
        <span className="font-mono">send 5 to +57 300 123 4567</span> or{' '}
        <span className="font-mono">send 10 to Maria</span> if she's in your contacts.
      </>
    ),
    s3Title: 'Confirm it worked',
    s3Body: (
      <>
        Sippy confirms the send in the same chat with a receipt. To check your balance later, type{' '}
        <span className="font-mono">balance</span> anytime.
      </>
    ),
    ctaBalance: 'Check my balance',
    waBalance: 'balance',
    s4Title: 'If something fails',
    s4Items: [
      <>
        <strong>Your camera won't open WhatsApp.</strong> Tap the URL directly if the QR has it
        printed visibly, or ask the vendor to share the link with you over WhatsApp.
      </>,
      <>
        <strong>Sippy didn't ask for the amount.</strong> Make sure you opened the vendor's link
        (not typed something yourself). Scan again if you need to.
      </>,
      <>
        <strong>Not sure if you paid.</strong> If Sippy showed you a receipt, the payment went
        through. If you're not sure, don't retry yet: type{' '}
        <span className="font-mono">history</span> or find the Sippy team. Retrying without
        confirming can cause a double payment.
      </>,
      <>
        <strong>Don't know what to say to Sippy.</strong> Send{' '}
        <span className="font-mono">help</span> and it lists every command.{' '}
        <strong>For issues in the moment</strong>, find the Sippy team or stop by our stand.
      </>,
    ],
    navOther: 'Need to receive instead? →',
    navBack: '← Back to Pizza Day',
    footerTag: 'Your dollar wallet on WhatsApp',
  },
}

export default function PagarContent() {
  const [lang, setLang] = useDocsLang()
  const c = COPY[lang]
  const waHola = `${WA_BASE}?text=${encodeURIComponent(c.waGreeting)}`
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
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/setup"
              className="inline-flex items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {c.ctaCreate}
            </Link>
            <a
              href={waHola}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-3 text-sm font-semibold text-[var(--text-primary,#1A1A2E)] transition hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              {c.ctaOpenWa}
            </a>
          </div>
        </Section>

        <Section number="2" title={c.s2Title}>
          <ol className="mt-2 space-y-3 text-base">
            {c.s2Steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)]">{c.s2Helper}</p>
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
              href={lang === 'en' ? '/cobrar?lang=en' : '/cobrar'}
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
