/**
 * Sippy Quest — public leaderboard.
 *
 * Server-rendered page at /quest/[slug]. Top-20 masked leaderboard +
 * total counters + the share CTA back to WhatsApp. Designed as the
 * viral surface: anyone can land here from a share link or word of
 * mouth, see how the draw is doing, and either join (new user) or
 * climb (existing user).
 *
 * Draw-mechanic copy is intentional and pinned by Slice 3 scope:
 *   "Top entradas. Los ganadores se sortean entre entradas válidas,
 *   no por ranking."
 * Without it, rank #1 implicitly looks like the winner — which is
 * wrong for a raffle and would create disputes after the draw.
 *
 * Phone display is the strict mask `+57 *** 4567` (no names, no
 * initials). Privacy stays clean and avoids identity-from-phone
 * disputes. Mask happens server-side in the backend controller; we
 * never receive the raw phone here.
 *
 * Revalidation: ISR with revalidate=60. The leaderboard moves slowly
 * (a few entries per hour at most), so a 60s cache balances freshness
 * with cost (we don't want to slam the backend on every refresh).
 */

import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.sippy.lat'

export const revalidate = 60

interface LeaderboardRow {
  rank: number
  phone: string
  entries: number
  activity: 0 | 1
  referrals: number
}

interface LeaderboardResponse {
  event: { slug: string; name: string; endsAt: string | null }
  cap: number
  totals: { totalEntrants: number; totalEntries: number }
  leaderboard: LeaderboardRow[]
}

async function fetchLeaderboard(slug: string): Promise<LeaderboardResponse | null> {
  if (!BACKEND_URL) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/quest/${encodeURIComponent(slug)}/leaderboard`, {
      next: { revalidate: 60 },
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    return (await res.json()) as LeaderboardResponse
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await fetchLeaderboard(slug)
  if (!data) {
    return { title: 'Sippy Quest', robots: { index: false, follow: false } }
  }
  const title = `${data.event.name} · Sippy Quest`
  const description = `${data.totals.totalEntries} entradas, ${data.totals.totalEntrants} participantes. Mira el leaderboard en vivo y suma tus propias entradas.`
  return {
    title,
    description,
    alternates: { canonical: `${FRONTEND_URL}/quest/${data.event.slug}` },
    openGraph: { title, description, type: 'website' },
  }
}

const WA_HOLA = `https://wa.me/${WHATSAPP_BOT_NUMBER}?text=${encodeURIComponent('Hola Sippy! mi quest')}`

export default async function QuestLeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await fetchLeaderboard(slug)
  if (!data) {
    // 404 for unknown/inactive/expired events — mirrors the backend's
    // silent-reject behavior. Don't reveal which slugs exist.
    notFound()
  }

  const { event, totals, leaderboard, cap } = data
  const isEmpty = leaderboard.length === 0

  return (
    <main className="min-h-screen bg-[var(--bg-primary,#FFFFFF)] text-[var(--text-primary,#1A1A2E)]">
      <article className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
        {/* Brand mark — links home; same asset used across /pagar, /cobrar,
            /pizza-day (cheetah-blue wordmark). */}
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
            Sippy Quest · Leaderboard
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{event.name}</h1>
          {event.endsAt && (
            <p className="mt-3 font-mono text-xs uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
              Sorteo: {formatDrawDate(event.endsAt)}
            </p>
          )}
          <p className="mt-4 text-sm text-[var(--text-secondary,#374151)] sm:text-base">
            Top entradas. Los ganadores se sortean entre entradas válidas, no por ranking.
          </p>
        </header>

        {/* Counters */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2">
          <Counter label="Entradas en juego" value={totals.totalEntries} />
          <Counter label="Participantes" value={totals.totalEntrants} />
        </section>

        {/* Leaderboard */}
        <section className="mb-10">
          {/* Hide "Top N" until there's actually a leaderboard. The earlier
              `leaderboard.length || 20` showed "Top 20" against an empty list,
              which implied 20 slots and read as a count. Suppress when empty;
              show the real count once entries exist. */}
          {!isEmpty && (
            <h2 className="mb-4 text-sm font-mono uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
              Top {leaderboard.length}
            </h2>
          )}

          {isEmpty ? (
            <div className="rounded border-2 border-dashed border-[var(--brand-primary,#00AFD7)] px-6 py-10 text-center">
              <p className="text-base font-semibold">Aún no hay entradas.</p>
              <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">
                Sé el primero. Escríbele a Sippy{' '}
                <code className="font-mono text-[var(--brand-primary,#00AFD7)]">mi codigo</code> y
                comparte tu link.
              </p>
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
                      {row.referrals} amigos
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Draw mechanic — explicit */}
        <section className="mb-10 rounded border-2 border-[var(--text-primary,#1A1A2E)] bg-[rgba(0,175,215,0.06)] px-5 py-4">
          <h2 className="text-sm font-mono uppercase tracking-wider text-[var(--brand-primary,#00AFD7)]">
            Cómo se eligen ganadores
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary,#374151)]">
            Cada participante puede juntar hasta <strong>{cap} entradas</strong>: 1 por asistir
            (escanear un QR del evento al llegar) y 1 por cada amigo que se una a Sippy con tu link,
            vengan o no al evento. Los ganadores se sortean al azar entre TODAS las entradas
            válidas, no por puesto en el ranking.
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted,#6B7280)]">
            Más entradas = más probabilidad. Estar #1 no garantiza premio.
          </p>
        </section>

        {/* CTA */}
        <section className="mb-10">
          <Link
            href={WA_HOLA}
            className="block w-full rounded border-2 border-[var(--brand-primary,#00AFD7)] bg-[var(--brand-primary,#00AFD7)] px-6 py-4 text-center font-mono text-base font-semibold text-white transition hover:bg-[var(--brand-primary-hover,#0098BD)]"
          >
            Ver mis entradas en Sippy
          </Link>
          <p className="mt-3 text-center text-xs text-[var(--text-muted,#6B7280)]">
            Abre WhatsApp y te llega tu Quest al instante.
          </p>
        </section>

        <footer className="border-t border-[var(--text-muted,#E5E7EB)] pt-6 text-center text-xs text-[var(--text-muted,#6B7280)]">
          Sippy · Billetera de dólares en WhatsApp
        </footer>
      </article>
    </main>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border-2 border-[var(--text-primary,#1A1A2E)] px-5 py-4">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted,#6B7280)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--brand-primary,#00AFD7)] sm:text-4xl">
        {value.toLocaleString('es-CO')}
      </p>
    </div>
  )
}

/**
 * Format the event endsAt timestamp as a short Spanish draw date.
 * Example: "22 de mayo" (no year — current-season context implied).
 * Falls back to the raw ISO if parsing fails so the hero never throws.
 */
function formatDrawDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}
