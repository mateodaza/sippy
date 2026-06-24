/**
 * Public season leaderboard `/temporada` (Phase D / D1).
 *
 * Generalizes /quest/[slug]: usage-ranked, fully anonymous (rows carry an HMAC
 * `displayId` only — never a phone, handle, or raw wallet), IP-throttled at the
 * API. Server-fetches the public /api/season/leaderboard with ISR, then hands the
 * rows to a client component for the language toggle.
 *
 * Degradation-safe: an empty board is a valid render (the empty state), never a
 * 404 and never an error — so the page is safe to link from /stats even while the
 * season is off (shadow mode → empty board).
 */

import { Suspense } from 'react'
import TemporadaContent from './TemporadaContent'
import type { LeaderboardResponse } from '@/lib/season'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export const revalidate = 60

const EMPTY: LeaderboardResponse = { seasonId: 's1', leaderboard: [] }

async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  if (!BACKEND_URL) return EMPTY
  try {
    const res = await fetch(`${BACKEND_URL}/api/season/leaderboard`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return EMPTY
    return (await res.json()) as LeaderboardResponse
  } catch {
    return EMPTY
  }
}

export default async function TemporadaPage() {
  const data = await fetchLeaderboard()
  return (
    <Suspense fallback={null}>
      <TemporadaContent leaderboard={data.leaderboard} />
    </Suspense>
  )
}
