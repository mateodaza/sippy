/**
 * Quest Controller — public read endpoints.
 *
 * - GET /api/quest/:slug/leaderboard (public, IP-throttled) — top N entrants
 *
 * Public surface for the viral leaderboard at `apps/web /quest/[slug]`.
 * Phones are masked here (not at the scoring layer) so admin surfaces can
 * still consume the raw FK-form phone via `getLeaderboard` directly. The
 * masking decision is privacy policy + display contract, kept at the
 * boundary where it ships to untrusted clients.
 *
 * Silent-reject on unknown/inactive/expired slugs (returns 404) — mirrors
 * `getEventPublic` behavior so we don't leak which slugs exist or are
 * currently running.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { getActiveEventBySlug } from '#services/event.service'
import {
  getLeaderboard,
  getQuestStats,
  getEntryCap,
  maskLeaderboardPhone,
} from '#services/quest/scoring.service'

// Cap the visible leaderboard. 20 is enough to feel competitive without
// turning the page into a wall — and matches the implicit expectation
// from the prize copy ("Top entradas"). Callers can pass ?limit= up to
// this ceiling; we floor at 1. Larger ceilings need a paging story.
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT)
}

export default class QuestController {
  /**
   * GET /api/quest/:slug/leaderboard?limit=20
   *
   * Returns event meta + masked top-N + total counters. Empty-state is
   * a valid 200 response (`leaderboard: []`, totals at 0) so the page
   * can render a "Sé el primero en sumar entradas" CTA without a
   * separate 404 branch in the client.
   */
  async publicLeaderboard({ params, request, response }: HttpContext) {
    try {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      if (!slug) {
        return response.status(404).json({ error: 'Not found' })
      }

      const event = await getActiveEventBySlug(slug)
      if (!event) {
        return response.status(404).json({ error: 'Not found' })
      }

      const limit = parseLimit(request.input('limit'))
      const [rows, stats] = await Promise.all([
        getLeaderboard({ eventSlug: slug, limit }),
        getQuestStats(slug),
      ])

      return response.status(200).json({
        event: {
          slug: event.slug,
          name: event.name,
          endsAt: event.endsAt ? event.endsAt.toISO() : null,
        },
        cap: getEntryCap(),
        totals: stats,
        leaderboard: rows.map((r) => ({
          rank: r.rank,
          phone: maskLeaderboardPhone(r.phone),
          entries: r.entries,
          activity: r.activity,
          referrals: r.referrals,
        })),
      })
    } catch (err) {
      logger.error({ err }, 'quest.publicLeaderboard: failed')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}
