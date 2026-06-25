/**
 * Pizza Day hub body — bilingual (ES + EN). Spanish is the default and
 * the primary audience; English is for the slice of attendees who don't
 * speak Spanish. Bot deep-link text also localized so an EN user's
 * first WhatsApp interaction triggers the bot's English path.
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

type RouterCard = { eyebrow: string; question: string; sub: string }
type Copy = {
  eyebrow: string
  h1: string
  intro: string
  routerPay: RouterCard
  routerReceive: RouterCard
  s1Title: string
  s1Body: React.ReactNode
  s1Sub: React.ReactNode
  s2Title: string
  s2Intro: string
  s2Examples: string[]
  s2Tail: string
  s3Title: string
  s3Steps: React.ReactNode[]
  s3Tail: (lang: DocsLang) => React.ReactNode
  s4Title: string
  s4Lead: React.ReactNode
  s4HowIntro: React.ReactNode
  s4Items: React.ReactNode[]
  s4ShareHint: React.ReactNode
  s4Odds: string
  s4BoardCta: string
  s4Aside: React.ReactNode
  s5Title: string
  s5Body: React.ReactNode
  s5Items: React.ReactNode[]
  s6Title: string
  s6Body: React.ReactNode
  ctaOpenWa: string
  waGreeting: string
  footerTag: string
}

const COPY: Record<DocsLang, Copy> = {
  es: {
    eyebrow: 'Sippy · Pizza Day',
    h1: 'Cartagena Onchain · 2026',
    intro:
      'Sippy es tu billetera de dólares en WhatsApp. Hoy la usas para conseguir USDC con efectivo, pagar pizza, mandarle plata a otra gente del evento y reclamar tu POAP.',
    routerPay: {
      eyebrow: 'Asistente',
      question: '¿Vas a pagar?',
      sub: 'Cómo pagar a un comercio con Sippy.',
    },
    routerReceive: {
      eyebrow: 'Comercio o amigo',
      question: '¿Vas a cobrar?',
      sub: 'Cómo recibir USDC en Sippy.',
    },
    s1Title: 'Conseguir USDC con efectivo',
    s1Body: (
      <>
        Busca al equipo Sippy o pasa por nuestro stand. Le entregas efectivo, te mandan USDC a tu
        billetera Sippy, normalmente en segundos. Mínimo $5, sin comisión.
      </>
    ),
    s1Sub: (
      <>
        Si todavía no tienes Sippy, escanea cualquier QR del evento o escríbele a Sippy en WhatsApp
        y te crea la billetera, normalmente en segundos.
      </>
    ),
    s2Title: 'Mandarle plata a otra gente',
    s2Intro: 'Abre WhatsApp y escríbele a Sippy. Algunos ejemplos que ya entiende:',
    s2Examples: ['envía 5 a +57 300 123 4567', 'mándale 10 a María', 'pásale 3 a @juan'],
    s2Tail:
      'Si la otra persona aún no usa Sippy, le llega un mensaje invitándola. La plata queda guardada hasta que se cree la billetera.',
    s3Title: 'Pagar pizza y bebidas',
    s3Steps: [
      <>
        <strong>1.</strong> Cada puesto tiene un QR. Abre la cámara de tu teléfono (no Sippy, la
        cámara normal) y apunta al QR.
      </>,
      <>
        <strong>2.</strong> Toca el link que aparece. Se abre WhatsApp con Sippy.
      </>,
      <>
        <strong>3.</strong> Escribe el monto que te dijo el puesto (ej.{' '}
        <span className="font-mono">5</span>), confirma con <span className="font-mono">si</span>.
        El pago se envía, normalmente en segundos.
      </>,
    ],
    s3Tail: (lang: DocsLang) => (
      <>
        ¿Más detalle?{' '}
        <Link
          href={lang === 'en' ? '/pagar?lang=en' : '/pagar'}
          className="font-semibold text-[var(--brand-primary,#00AFD7)] hover:underline"
        >
          Ver guía completa de cómo pagar →
        </Link>
      </>
    ),
    s4Title: 'Sippy Quest: entradas al sorteo',
    s4Lead: (
      <>
        Sippy Quest es un sorteo. Acumulas <strong>entradas</strong> y al final del evento se
        sortean ganadores entre todas las entradas válidas, al azar. No es por ranking. Estar en el
        primer puesto no garantiza premio.
      </>
    ),
    s4HowIntro: (
      <>
        Cómo sumas entradas (máximo <span className="font-mono">5</span> por persona):
      </>
    ),
    s4Items: [
      <>
        <strong>+1 entrada</strong> por asistir. Si ya tienes Sippy, escanea cualquier QR del evento
        al llegar. Si no, escanea un QR o escríbele a Sippy en WhatsApp para crear tu cuenta en
        Pizza Day.
      </>,
      <>
        <strong>+1 entrada</strong> por cada amigo que se una a Sippy con tu link de Quest, vengan o
        no al evento. Si tu mamá se une desde la casa, te cuenta.
      </>,
    ],
    s4ShareHint: (
      <>
        Pídele a Sippy <span className="font-mono">mi codigo</span> en WhatsApp y te manda tu link
        personal. Cada amigo que se una a Sippy con ese link suma una entrada para ti.
      </>
    ),
    s4Odds: 'Más entradas = más probabilidad de ganar.',
    s4BoardCta: 'Ver tablero del Quest →',
    s4Aside: (
      <>
        o pregúntale a Sippy <span className="font-mono">mi quest</span> para ver tus entradas y tu
        posición.
      </>
    ),
    s5Title: 'Reclama tu POAP de Cartagena Onchain',
    s5Body: (
      <>
        Al final del evento, Sippy te manda el link de tu POAP. Tienes dos opciones cuando te lo
        pregunte:
      </>
    ),
    s5Items: [
      <>
        <strong>Reclamar a tu Sippy</strong>: un clic, queda en tu billetera Sippy.
      </>,
      <>
        <strong>Reclamar a tu wallet</strong>: pegas la dirección y se acuña ahí.
      </>,
    ],
    s6Title: '¿Necesitas ayuda?',
    s6Body: (
      <>
        Escríbele a Sippy en WhatsApp y di <span className="font-mono">ayuda</span>. Te lista los
        comandos. Si necesitas a una persona, busca al equipo Sippy o pasa por nuestro stand.
      </>
    ),
    ctaOpenWa: 'Abrir Sippy en WhatsApp',
    waGreeting: 'Hola Sippy!',
    footerTag: 'Pizza Day Cartagena Onchain 2026',
  },
  en: {
    eyebrow: 'Sippy · Pizza Day',
    h1: 'Cartagena Onchain · 2026',
    intro:
      'Sippy is your dollar wallet on WhatsApp. Today you use it to get USDC with cash, pay for pizza, send money to other attendees, and claim your POAP.',
    routerPay: {
      eyebrow: 'Attendee',
      question: 'Need to pay?',
      sub: 'How to pay a vendor with Sippy.',
    },
    routerReceive: {
      eyebrow: 'Vendor or friend',
      question: 'Need to receive?',
      sub: 'How to receive USDC in Sippy.',
    },
    s1Title: 'Get USDC with cash',
    s1Body: (
      <>
        Find the Sippy team or stop by our stand. Hand over cash, they send USDC to your Sippy
        wallet, usually in seconds. Minimum $5, no fee.
      </>
    ),
    s1Sub: (
      <>
        If you don't have Sippy yet, scan any event QR or message Sippy on WhatsApp and it sets up
        your wallet, usually in seconds.
      </>
    ),
    s2Title: 'Send money to other people',
    s2Intro: 'Open WhatsApp and message Sippy. Some examples it already understands:',
    s2Examples: ['send 5 to +57 300 123 4567', 'send 10 to Maria', 'send 3 to @juan'],
    s2Tail:
      "If the other person doesn't use Sippy yet, they get a message inviting them. The money sits in escrow until they set up a wallet.",
    s3Title: 'Pay for pizza and drinks',
    s3Steps: [
      <>
        <strong>1.</strong> Every booth has a QR. Open your phone camera (not Sippy, the regular
        camera) and point it at the QR.
      </>,
      <>
        <strong>2.</strong> Tap the link that appears. WhatsApp opens with Sippy.
      </>,
      <>
        <strong>3.</strong> Type the amount the booth told you (e.g.{' '}
        <span className="font-mono">5</span>), confirm with <span className="font-mono">yes</span>.
        The payment sends, usually in seconds.
      </>,
    ],
    s3Tail: (lang: DocsLang) => (
      <>
        Want more detail?{' '}
        <Link
          href={lang === 'en' ? '/pagar?lang=en' : '/pagar'}
          className="font-semibold text-[var(--brand-primary,#00AFD7)] hover:underline"
        >
          See the full pay guide →
        </Link>
      </>
    ),
    s4Title: 'Sippy Quest: raffle entries',
    s4Lead: (
      <>
        Sippy Quest is a raffle. You collect <strong>entries</strong> and at the end of the event,
        winners are drawn at random from all valid entries. It is not a ranking. Being at #1 does
        not guarantee a prize.
      </>
    ),
    s4HowIntro: (
      <>
        How to earn entries (max <span className="font-mono">5</span> per person):
      </>
    ),
    s4Items: [
      <>
        <strong>+1 entry</strong> for attending. If you already have Sippy, scan any event QR when
        you arrive. If not, scan a QR or message Sippy on WhatsApp to create your account at Pizza
        Day.
      </>,
      <>
        <strong>+1 entry</strong> for each friend who joins Sippy with your Quest link, whether they
        come to the event or not. If your mom joins from home, it counts.
      </>,
    ],
    s4ShareHint: (
      <>
        Ask Sippy <span className="font-mono">my code</span> on WhatsApp and you'll get your
        personal link. Each friend who joins Sippy with that link adds an entry for you.
      </>
    ),
    s4Odds: 'More entries = more chances to win.',
    s4BoardCta: 'See Quest board →',
    s4Aside: (
      <>
        or ask Sippy <span className="font-mono">my quest</span> to see your entries and rank.
      </>
    ),
    s5Title: 'Claim your Cartagena Onchain POAP',
    s5Body: (
      <>
        At the end of the event, Sippy sends you your POAP link. You have two options when it asks:
      </>
    ),
    s5Items: [
      <>
        <strong>Claim to your Sippy</strong>: one click, stays in your Sippy wallet.
      </>,
      <>
        <strong>Claim to your wallet</strong>: paste the address and it mints there.
      </>,
    ],
    s6Title: 'Need help?',
    s6Body: (
      <>
        Message Sippy on WhatsApp and say <span className="font-mono">help</span>. It lists every
        command. If you need a person, find the Sippy team or stop by our stand.
      </>
    ),
    ctaOpenWa: 'Open Sippy on WhatsApp',
    waGreeting: 'Hello Sippy!',
    footerTag: 'Pizza Day Cartagena Onchain 2026',
  },
}

export default function PizzaDayContent() {
  const [lang, setLang] = useDocsLang()
  const c = COPY[lang]
  const waUrl = `${WA_BASE}?text=${encodeURIComponent(c.waGreeting)}`
  const questHref =
    lang === 'en' ? '/quest/pizza-day-ctg-2026?lang=en' : '/quest/pizza-day-ctg-2026'
  const payHref = lang === 'en' ? '/pagar?lang=en' : '/pagar'
  const receiveHref = lang === 'en' ? '/cobrar?lang=en' : '/cobrar'

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
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted,#6B7280)]">
            {c.eyebrow}
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight sm:text-5xl">{c.h1}</h1>
          <p className="mt-4 text-base text-[var(--text-secondary,#374151)] sm:text-lg">
            {c.intro}
          </p>
        </header>

        <nav className="mb-12 grid gap-3 sm:grid-cols-2" aria-label="Quick guides">
          <RouterCardLink href={payHref} card={c.routerPay} />
          <RouterCardLink href={receiveHref} card={c.routerReceive} />
        </nav>

        <Section number="1" title={c.s1Title}>
          <p>{c.s1Body}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">{c.s1Sub}</p>
        </Section>

        <Section number="2" title={c.s2Title}>
          <p>{c.s2Intro}</p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            {c.s2Examples.map((ex) => (
              <li key={ex} className="rounded bg-[var(--bg-secondary,rgba(0,0,0,0.04))] px-3 py-2">
                {ex}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">{c.s2Tail}</p>
        </Section>

        <Section number="3" title={c.s3Title}>
          <ol className="mt-2 space-y-3 text-base">
            {c.s3Steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">{c.s3Tail(lang)}</p>
        </Section>

        <Section number="4" title={c.s4Title}>
          <p>{c.s4Lead}</p>
          <p className="mt-3">{c.s4HowIntro}</p>
          <ul className="mt-2 space-y-2 text-base">
            {c.s4Items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">{c.s4ShareHint}</p>
          <p className="mt-3 text-sm text-[var(--text-secondary,#374151)]">{c.s4Odds}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={questHref}
              className="inline-flex items-center justify-center rounded border-2 border-[var(--text-primary,#1A1A2E)] px-4 py-2 font-mono text-sm font-semibold hover:bg-[var(--text-primary,#1A1A2E)] hover:text-white"
            >
              {c.s4BoardCta}
            </Link>
            <span className="self-center text-xs text-[var(--text-muted,#6B7280)]">
              {c.s4Aside}
            </span>
          </div>
        </Section>

        <Section number="5" title={c.s5Title}>
          <p>{c.s5Body}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {c.s5Items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </Section>

        <Section number="6" title={c.s6Title}>
          <p>{c.s6Body}</p>
        </Section>

        <div className="mt-12 flex flex-col items-center gap-4 border-t-2 border-[var(--text-primary,#1A1A2E)] pt-10">
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-[var(--brand-primary,#00AFD7)] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
          >
            {c.ctaOpenWa}
          </a>
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

function RouterCardLink({ href, card }: { href: string; card: RouterCard }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-md border-2 border-[var(--text-primary,#1A1A2E)] bg-[var(--bg-primary,#FFFFFF)] p-5 transition hover:bg-[var(--brand-primary,#00AFD7)] hover:text-white"
    >
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--text-muted,#6B7280)] group-hover:text-white/80">
        {card.eyebrow}
      </span>
      <span className="mt-1 flex items-center justify-between text-xl font-bold">
        <span>{card.question}</span>
        <span aria-hidden="true">→</span>
      </span>
      <span className="text-sm text-[var(--text-secondary,#374151)] group-hover:text-white/90">
        {card.sub}
      </span>
    </Link>
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
