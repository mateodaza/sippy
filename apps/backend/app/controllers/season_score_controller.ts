/**
 * Season Score Controller — the Phase D / D1 read surfaces.
 *
 *   GET /api/season/score        (JWT-authenticated)  — the signed-in user's own standing
 *   GET /api/season/leaderboard  (public, IP-throttled) — usage-ranked, fully anonymous
 *
 * Reputation-only. Reads `season.score` (never writes); all scoring lives in
 * #season/*. This controller is a thin HTTP layer — wallet resolution, the score
 * read, and the board query all live in #season/standing (behind its DI seam, so
 * they're unit-tested there). Both surfaces degrade to a friendly empty state when
 * the season is off or no scores exist — never an error, never a zero leaderboard.
 *
 * AUTH BINDING (audited, load-bearing): `score` lives in the JWT-auth `/api`
 * group, the same one `embedded_wallet_controller.walletStatus` uses. The wallet
 * is resolved SERVER-SIDE from `ctx.cdpUser.phoneNumber`. This controller NEVER
 * reads a `wallet` or `phone` query/body param in `score` — it doesn't touch
 * `request` at all there — so a user can only ever read their OWN score.
 *
 * LEADERBOARD PRIVACY (audited): each row carries an anonymous `displayId` only
 * (HMAC of `seasonId:wallet`, stable per season, non-reversible). NO phone, NO
 * handle/name, NO raw wallet. Mirrors quest_controller.publicLeaderboard's
 * ranking/throttle but NOT its identity output (that one returns a masked `phone`,
 * which must never appear here).
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ACTIVE_SEASON_ID, isSeason1Enabled } from '#season/guard'
import {
  getStanding,
  getLeaderboard,
  resolveWalletForPhone,
  type LeaderboardRow,
} from '#season/standing'
import { getKyc, isFullKyc } from '#services/colurs_kyc.service'

// Leaderboard sizing — mirrors quest_controller's contract (floor 1, ceiling 50,
// default 20). Larger ceilings would need a paging story.
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// Short in-process cache for the (viewer-independent) public board, matching
// season_stats_controller: collapses burst traffic to ≤1 query per window.
const CACHE_TTL_MS = 15_000

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT)
}

// Module-level memo for the public board: { builtAt, in-flight/resolved rows }.
let boardCache: { at: number; rows: Promise<LeaderboardRow[]> } | null = null

export default class SeasonScoreController {
  /**
   * GET /api/season/score
   *
   * The signed-in user's own reputation standing. Resolves the wallet from the
   * JWT (`cdpUser.phoneNumber`) — no input is trusted. Returns `{ scored: false }`
   * as the friendly empty state when the season is off, the user has no wallet, or
   * the wallet has no score yet.
   */
  async score({ response, cdpUser }: HttpContext) {
    try {
      const seasonId = ACTIVE_SEASON_ID

      // Master switch — in shadow mode every surface is the empty state.
      if (!isSeason1Enabled()) {
        return response.json({ scored: false, seasonId })
      }

      // Wallet resolved SERVER-SIDE from the authenticated phone. We never read a
      // wallet/phone param — a user can only read their own score.
      const phoneNumber = cdpUser!.phoneNumber
      const wallet = await resolveWalletForPhone(phoneNumber)
      if (!wallet) {
        return response.json({ scored: false, seasonId })
      }

      // KYC for the Power step's verificationRequired — sourced from the EXISTING
      // onramp KYC status, never from season.score. Degrades to "not verified" on
      // any failure (so Power is never shown as reachable from score alone).
      const hasKyc = await resolveHasKyc(phoneNumber)

      const standing = await getStanding({ wallet, hasKyc, seasonId })
      if (!standing) {
        return response.json({ scored: false, seasonId })
      }

      return response.json({ scored: true, seasonId, ...standing })
    } catch (err) {
      logger.error({ err }, 'season.score: failed')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/season/leaderboard?limit=20
   *
   * Public usage-ranked board, fully anonymous. Empty (`leaderboard: []`) is a
   * valid 200 so the page renders its empty state without a 404 branch.
   */
  async leaderboard({ request, response }: HttpContext) {
    try {
      const seasonId = ACTIVE_SEASON_ID
      const limit = parseLimit(request.input('limit'))

      if (!isSeason1Enabled()) {
        return response.json({ seasonId, leaderboard: [] })
      }

      const nowMs = Date.now()
      if (!boardCache || nowMs - boardCache.at >= CACHE_TTL_MS) {
        boardCache = { at: nowMs, rows: getLeaderboard(seasonId, MAX_LIMIT) }
      }
      let rows: LeaderboardRow[]
      try {
        rows = await boardCache.rows
      } catch (err) {
        boardCache = null // don't cache a failure — let the next request retry
        logger.error({ err }, 'season.leaderboard: build failed')
        // Degrade to an empty board rather than erroring the public page.
        return response.json({ seasonId, leaderboard: [] })
      }

      return response.json({ seasonId, leaderboard: rows.slice(0, limit) })
    } catch (err) {
      logger.error({ err }, 'season.leaderboard: failed')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}

/**
 * Whether the user has FULL, document-verified KYC — the personhood signal the
 * Power tier wants. Uses the shared `isFullKyc` predicate so quick-flow approval
 * (level 0, "no real verification") does NOT clear the Power verification gate.
 * Reads the existing onramp KYC record; null/unregistered or any error → false.
 */
async function resolveHasKyc(phoneNumber: string): Promise<boolean> {
  try {
    return isFullKyc(await getKyc(phoneNumber))
  } catch {
    return false
  }
}
