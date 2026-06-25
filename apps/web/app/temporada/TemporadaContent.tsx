/**
 * Season board body — bilingual (ES + EN), mirrors QuestContent. Receives the
 * pre-fetched, fully-anonymous rows as props (server-rendered + ISR); only the
 * language toggle swaps client-side.
 *
 * Privacy contract (audited): a row's identity is the anonymous `displayId` only.
 * There is no phone, handle, name, or raw wallet anywhere in the payload or here.
 * Clearly a USAGE/reputation board — no balances, no "rewards".
 */

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'
import { DocsLanguageToggle, useDocsLang } from '@/components/shared/DocsLanguageToggle'
import {
  SEASON_TIER_NAME,
  TEMPORADA_COPY,
  TIER_ORDER,
  type LeaderboardRow,
  type Tier,
} from '@/lib/season'

export default function TemporadaContent({ leaderboard }: { leaderboard: LeaderboardRow[] }) {
  const [lang, setLang] = useDocsLang()
  const c = TEMPORADA_COPY[lang]
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
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{c.title}</h1>
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)] sm:text-base">
            {c.intro}
          </p>
        </header>

        <section className="mb-10">
          {!isEmpty && (
            <h2 className="mb-4 flex items-center justify-between font-mono text-sm uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
              <span>
                {c.topPrefix} {leaderboard.length}
              </span>
              <span>{c.scoreHeader}</span>
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
                  key={row.displayId}
                  className="flex items-center justify-between gap-4 px-1 py-3 sm:px-3"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="w-8 shrink-0 font-mono text-sm text-[var(--text-muted,#6B7280)]">
                      #{row.rank}
                    </span>
                    <span className="truncate font-mono text-sm text-[var(--text-secondary,#374151)]">
                      {row.displayId}
                    </span>
                    <TierBadge tier={row.tier} />
                  </div>
                  <span className="shrink-0 font-mono text-base font-semibold tabular-nums">
                    {row.score.toLocaleString(c.numberLocale)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mb-10 rounded border-2 border-[var(--text-primary,#1A1A2E)] bg-[rgba(0,175,215,0.06)] px-5 py-4">
          <h2 className="font-mono text-sm uppercase tracking-wider text-[var(--brand-primary,#00AFD7)]">
            {c.aboutTitle}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">{c.aboutBody}</p>
          <p className="mt-2 text-xs text-[var(--text-muted,#6B7280)]">{c.aboutNote}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TIER_ORDER.map((t) => (
              <TierBadge key={t} tier={t} />
            ))}
          </div>
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

/** Small tier chip. Higher tiers lean crypto-green, lower tiers cheetah-blue. */
function TierBadge({ tier }: { tier: Tier }) {
  const isHigh = tier === 'regular' || tier === 'power'
  const color = isHigh ? 'var(--brand-crypto,#00D796)' : 'var(--brand-primary,#00AFD7)'
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider"
      style={{ borderColor: color, color }}
    >
      {SEASON_TIER_NAME[tier]}
    </span>
  )
}
