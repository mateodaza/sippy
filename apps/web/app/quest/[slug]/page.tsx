/**
 * Sippy Quest — public leaderboard.
 *
 * Server entry: SSR fetch (with ISR revalidate=60) + metadata, then
 * delegates rendering to the client `QuestContent` which handles the
 * ES/EN bilingual toggle. Caching stays server-side; only the language
 * swap is client-side.
 *
 * Draw-mechanic copy is intentional and pinned by Slice 3 scope:
 *   "Top entradas. Los ganadores se sortean entre entradas válidas,
 *   no por ranking."
 * Without it, rank #1 implicitly looks like the winner, which is
 * wrong for a raffle and would create disputes after the draw.
 *
 * Phone display is the strict mask `+57 *** 4567` (no names, no
 * initials). Privacy stays clean and avoids identity-from-phone
 * disputes. Mask happens server-side in the backend controller; we
 * never receive the raw phone here.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QuestContent, { type QuestContentProps } from './QuestContent'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.sippy.lat'

export const revalidate = 60

type LeaderboardResponse = {
  event: QuestContentProps['event']
  cap: QuestContentProps['cap']
  totals: QuestContentProps['totals']
  leaderboard: QuestContentProps['leaderboard']
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

export default async function QuestLeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await fetchLeaderboard(slug)
  if (!data) {
    // 404 for unknown/inactive/expired events; mirrors the backend's
    // silent-reject behavior. Don't reveal which slugs exist.
    notFound()
  }

  // Suspense boundary required by Next 16 because QuestContent uses
  // `useSearchParams()`. ISR prerender otherwise bails out at build.
  return (
    <Suspense fallback={null}>
      <QuestContent
        event={data.event}
        cap={data.cap}
        totals={data.totals}
        leaderboard={data.leaderboard}
      />
    </Suspense>
  )
}
