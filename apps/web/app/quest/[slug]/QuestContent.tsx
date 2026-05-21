/**
 * Quest leaderboard body — bilingual (ES + EN). Receives pre-fetched
 * leaderboard data from the server `page.tsx` as props so the ISR
 * caching layer + initial paint stay server-rendered; only the language
 * toggle and copy swap happen client-side.
 *
 * Draw-mechanic copy is intentional: lead with "raffle, not ranking" in
 * both languages so the visual leaderboard never reads as "rank #1 wins".
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

interface LeaderboardRow {
  rank: number
  phone: string
  entries: number
  activity: 0 | 1
  referrals: number
}

interface QuestEvent {
  slug: string
  name: string
  endsAt: string | null
}

export interface QuestContentProps {
  event: QuestEvent
  cap: number
  totals: { totalEntrants: number; totalEntries: number }
  leaderboard: LeaderboardRow[]
}

type Copy = {
  eyebrow: string
  drawDateLabel: (date: string) => string
  drawLine: string
  cTotalEntries: string
  cParticipants: string
  topPrefix: string
  emptyTitle: string
  emptyBody: React.ReactNode
  friendsSuffix: (n: number) => string
  drawHowTitle: string
  drawHowBody: (cap: number) => React.ReactNode
  drawHowNote: string
  ctaButton: string
  ctaSubtitle: string
  footer: string
  waText: string
  numberLocale: string
}

const COPY: Record<DocsLang, Copy> = {
  es: {
    eyebrow: 'Sippy Quest · Leaderboard',
    drawDateLabel: (d) => `Sorteo: ${d}`,
    drawLine: 'Top entradas. Los ganadores se sortean entre entradas válidas, no por ranking.',
    cTotalEntries: 'Entradas en juego',
    cParticipants: 'Participantes',
    topPrefix: 'Top',
    emptyTitle: 'Aún no hay entradas.',
    emptyBody: (
      <>
        Sé el primero. Escríbele a Sippy{' '}
        <code className="font-mono text-[var(--brand-primary,#00AFD7)]">mi codigo</code> y comparte
        tu link.
      </>
    ),
    friendsSuffix: (n) => `${n} amigos`,
    drawHowTitle: 'Cómo se eligen ganadores',
    drawHowBody: (cap) => (
      <>
        Cada participante puede juntar hasta <strong>{cap} entradas</strong>: 1 por asistir
        (escanear un QR del evento al llegar) y 1 por cada amigo que se una a Sippy con tu link,
        vengan o no al evento. Los ganadores se sortean al azar entre TODAS las entradas válidas, no
        por puesto en el ranking.
      </>
    ),
    drawHowNote: 'Más entradas = más probabilidad. Estar #1 no garantiza premio.',
    ctaButton: 'Ver mis entradas en Sippy',
    ctaSubtitle: 'Abre WhatsApp y te llega tu Quest al instante.',
    footer: 'Sippy · Billetera de dólares en WhatsApp',
    waText: 'Hola Sippy! mi quest',
    numberLocale: 'es-CO',
  },
  en: {
    eyebrow: 'Sippy Quest · Leaderboard',
    drawDateLabel: (d) => `Draw: ${d}`,
    drawLine: 'Top entries. Winners are drawn at random from valid entries, not by ranking.',
    cTotalEntries: 'Entries in play',
    cParticipants: 'Participants',
    topPrefix: 'Top',
    emptyTitle: 'No entries yet.',
    emptyBody: (
      <>
        Be the first. Message Sippy{' '}
        <code className="font-mono text-[var(--brand-primary,#00AFD7)]">my code</code> and share
        your link.
      </>
    ),
    friendsSuffix: (n) => `${n} friends`,
    drawHowTitle: 'How winners are chosen',
    drawHowBody: (cap) => (
      <>
        Each participant can collect up to <strong>{cap} entries</strong>: 1 for attending (scan an
        event QR when you arrive) and 1 per friend who joins Sippy with your link, whether they
        attend or not. Winners are drawn at random from ALL valid entries, not by leaderboard
        position.
      </>
    ),
    drawHowNote: 'More entries = better odds. Being #1 does not guarantee a prize.',
    ctaButton: 'See my entries in Sippy',
    ctaSubtitle: 'Opens WhatsApp; your Quest arrives instantly.',
    footer: 'Sippy · Your dollar wallet on WhatsApp',
    waText: 'Hello Sippy! my quest',
    numberLocale: 'en-US',
  },
}

function formatDrawDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

export default function QuestContent({ event, cap, totals, leaderboard }: QuestContentProps) {
  const [lang, setLang] = useDocsLang()
  const c = COPY[lang]
  const isEmpty = leaderboard.length === 0
  const waUrl = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent(c.waText)}`

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
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{event.name}</h1>
          {event.endsAt && (
            <p className="mt-3 font-mono text-xs uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
              {c.drawDateLabel(formatDrawDate(event.endsAt, c.numberLocale))}
            </p>
          )}
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)] sm:text-base">
            {c.drawLine}
          </p>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2">
          <Counter label={c.cTotalEntries} value={totals.totalEntries} locale={c.numberLocale} />
          <Counter label={c.cParticipants} value={totals.totalEntrants} locale={c.numberLocale} />
        </section>

        <section className="mb-10">
          {!isEmpty && (
            <h2 className="mb-4 text-sm font-mono uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
              {c.topPrefix} {leaderboard.length}
            </h2>
          )}
          {isEmpty ? (
            <div className="rounded border-2 border-dashed border-[var(--brand-primary,#00AFD7)] px-6 py-10 text-center">
              <p className="text-base font-semibold">{c.emptyTitle}</p>
              <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">{c.emptyBody}</p>
            </div>
          ) : (
            <ol className="divide-y divide-[var(--text-muted,#E5E7EB)] border-y-2 border-[var(--text-primary,#1A1A2E)]">
              {leaderboard.map((row) => (
                <li
                  key={`${row.rank}-${row.phone}`}
                  className="flex items-center justify-between gap-4 px-1 py-3 sm:px-3"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-10 font-mono text-sm text-[var(--text-muted,#6B7280)]">
                      #{row.rank}
                    </span>
                    <span className="font-mono text-sm">{row.phone}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-base font-semibold">
                      {row.entries}
                      <span className="text-[var(--text-muted,#6B7280)]">/{cap}</span>
                    </p>
                    <p className="font-mono text-xs text-[var(--text-muted,#6B7280)]">
                      {c.friendsSuffix(row.referrals)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mb-10 rounded border-2 border-[var(--text-primary,#1A1A2E)] bg-[rgba(0,175,215,0.06)] px-5 py-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-[var(--brand-primary,#00AFD7)]">
            {c.drawHowTitle}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">{c.drawHowBody(cap)}</p>
          <p className="mt-2 text-xs text-[var(--text-muted,#6B7280)]">{c.drawHowNote}</p>
        </section>

        <section className="mb-10">
          <Link
            href={waUrl}
            className="block w-full rounded border-2 border-[var(--brand-primary,#00AFD7)] bg-[var(--brand-primary,#00AFD7)] px-6 py-4 text-center font-mono text-base font-semibold text-white transition hover:bg-[var(--brand-primary-hover,#0098BD)]"
          >
            {c.ctaButton}
          </Link>
          <p className="mt-3 text-center text-xs text-[var(--text-muted,#6B7280)]">
            {c.ctaSubtitle}
          </p>
        </section>

        <footer className="border-t border-[var(--text-muted,#E5E7EB)] pt-6 text-center text-xs text-[var(--text-muted,#6B7280)]">
          {c.footer}
        </footer>
      </article>
    </main>
  )
}

function Counter({ label, value, locale }: { label: string; value: number; locale: string }) {
  return (
    <div className="rounded border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-4">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--brand-primary,#00AFD7)] sm:text-4xl">
        {value.toLocaleString(locale)}
      </p>
    </div>
  )
}
