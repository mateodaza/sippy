/**
 * Season Stats Controller — the public proof dashboard aggregates (Phase B).
 *
 * GET /api/season/stats (public, IP-throttled). Mirrors public_stats_controller
 * (no PII, aggregate-only) but answers the believable-usage question instead of
 * the blended-movement one.
 *
 * SINGLE-DEFINITION RULE (audit, load-bearing): every usage metric — the
 * transacted-volume hero, MAW, active-this-week, retained, distinct
 * counterparties — comes from #season/definitions, the SAME functions the grant
 * report calls. They are NOT re-derived in SQL here. The only raw queries below
 * are the BROAD-set tiles (onboarded inflow, countries, all-transfer count),
 * which deliberately use the wider `phone_registry ∪ wallet_aliases` universe
 * and so are not personhood-floor usage metrics.
 *
 * TWO WALLET UNIVERSES:
 *   • strict personhood floor (#season/definitions, phone_registry − operators):
 *     transactedVolume, maw, activeThisWeek, retained, distinctCounterparties.
 *   • broad "is it ours" set (phone_registry ∪ wallet_aliases): onboarded only.
 *
 * FLAG SEMANTICS: the believable metrics derive live from onchain.transfer and
 * ship UNGUARDED (honest stats — they work in shadow mode with no projector).
 * Only scoreDistribution / topSenders read season.score; those degrade to null
 * when the table is empty (shadow mode), gating on DATA PRESENCE, not a flag.
 *
 * CACHING: the payload is identical for every viewer (network-wide aggregates),
 * so it's memoized in-process for CACHE_TTL_MS. This matters because the landing
 * page's LiveStats now hits this endpoint too — under burst traffic the DB sees
 * at most one query-set per TTL, and concurrent requests share one in-flight
 * build (stampede-safe). A failed build is not cached, so it retries next call.
 *
 * RESILIENCE: the core believable metrics (the point of the page) can 503 the
 * endpoint if the DB is down — that's the honest signal. But the supplementary
 * broad-set tiles (onboarded / transfers / registered / countries) each degrade
 * to a fallback on their own failure, so a wobble in one (e.g. the prod-only
 * wallet_aliases table) can never take down the hero + usage tiles.
 */

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { ACTIVE_SEASON_ID } from '#season/guard'
import {
  maw,
  trailing,
  transactedVolume,
  retention,
  distinctCounterpartiesNetwork,
  dailyTransactedVolume,
  onchainTransactionCount,
} from '#season/definitions'

// Tier display order (low → high) for a stable score-distribution layout.
const TIER_ORDER = ['newcomer', 'activated', 'active', 'regular', 'power'] as const

// Short in-process cache. 15s keeps the dashboard near-live while collapsing
// burst traffic (two surfaces now read it) to ≤1 query-set per window.
const CACHE_TTL_MS = 15_000

interface CountryRow {
  code: string
  users: number
}

interface ScoreBlocks {
  scoreDistribution: { tier: string; count: number }[] | null
  topSenders: { address: string; score: number; tier: string }[] | null
}

interface StatsPayload {
  seasonId: string
  transactedVolume: string
  totalMoved: string
  onboarded: string
  maw: number
  activeThisWeek: number
  retained: number
  retentionRate: number
  distinctCounterparties: number
  activatedCount: number
  activatedPct: number
  registeredUsers: number
  transferCount: number
  countries: CountryRow[]
  dailyVolumes: { date: string; volume: string; count: number }[]
  scoreDistribution: ScoreBlocks['scoreDistribution']
  topSenders: ScoreBlocks['topSenders']
}

// Mask an on-chain address for public display: 0x1234…abcd. Addresses are
// already public; this is presentation, not privacy. (Phones never appear here.)
function maskAddress(addr: string): string {
  if (!addr) return ''
  return addr.length <= 10 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// Module-level memo: { builtAt, the in-flight or resolved payload promise }.
let cache: { at: number; payload: Promise<StatsPayload> } | null = null

export default class SeasonStatsController {
  async index({ response }: HttpContext) {
    const nowMs = Date.now()
    if (!cache || nowMs - cache.at >= CACHE_TTL_MS) {
      cache = { at: nowMs, payload: this.build() }
    }
    try {
      const payload = await cache.payload
      return response.json(payload)
    } catch (error) {
      cache = null // don't cache a failure — let the next request retry
      logger.error({ err: error }, 'Season stats query failed')
      return response.status(503).json({ error: 'Stats temporarily unavailable' })
    }
  }

  /**
   * Build the full payload. The CORE believable metrics (from #season/definitions)
   * run in one Promise.all and may reject → 503. The SUPPLEMENTARY broad-set tiles
   * run alongside, each guarded so its own failure degrades only that tile.
   */
  private async build(): Promise<StatsPayload> {
    const now = Math.floor(Date.now() / 1000)
    const seasonId = ACTIVE_SEASON_ID

    const coreP = Promise.all([
      transactedVolume(), // hero: verified value-out, all-time
      maw(trailing(30, now)), // monthly active wallets
      maw(trailing(7, now)), // active this week (same definition, 7d window)
      maw({ start: 0, end: now }), // activated = ever made a qualifying value-out
      retention(now),
      distinctCounterpartiesNetwork(),
      dailyTransactedVolume(30, now),
    ] as const)

    const [
      [
        heroVolume,
        maw30,
        activeThisWeek,
        activatedCount,
        ret,
        distinctCounterparties,
        dailyVolumes,
      ],
      onboarded,
      totalMoved,
      transferCount,
      registeredUsers,
      countries,
      scoreBlocks,
    ] = await Promise.all([
      coreP,
      this.onboardedInflow(),
      this.totalMoved(),
      this.transferCount(),
      this.registeredUsers(),
      this.countryRows(),
      this.scoreBlocks(seasonId),
    ])

    const activatedPct =
      registeredUsers > 0 ? Math.round((activatedCount / registeredUsers) * 100) : 0

    return {
      seasonId,
      // Hero — verified value-out, all-time. The un-blend: NOT deposits+sends.
      transactedVolume: String(heroVolume),
      // Gross throughput (deposits + sends), shown beside the value-out hero as a clearly-labeled
      // second figure. A broad-set tile (onchain.daily_volume), NOT folded into transactedVolume.
      totalMoved,
      // Separate, clearly-labeled inflow tile. Never added into the hero.
      onboarded,
      // Usage tiles (strict floor).
      maw: maw30,
      activeThisWeek,
      retained: ret.retained,
      retentionRate: ret.retentionRate,
      distinctCounterparties,
      activatedCount,
      activatedPct,
      registeredUsers,
      transferCount,
      countries,
      dailyVolumes,
      // Null in shadow mode; the dashboard renders these only when present.
      scoreDistribution: scoreBlocks.scoreDistribution,
      topSenders: scoreBlocks.topSenders,
    }
  }

  /**
   * USDC onboarded (broad set): inflow from a non-Sippy address into a Sippy
   * wallet, where Sippy = phone_registry ∪ wallet_aliases. Identical to the
   * existing public_stats "usdcOnboarded" so the inflow number stays stable.
   * Degrades to '0' on failure (e.g. the prod-only wallet_aliases table absent).
   */
  private async onboardedInflow(): Promise<string> {
    try {
      const res = await db.rawQuery(`
        WITH sippy_wallets AS (
          SELECT LOWER(wallet_address) AS addr
            FROM phone_registry
           WHERE wallet_address IS NOT NULL
          UNION
          SELECT LOWER(address) FROM wallet_aliases
        )
        SELECT COALESCE(SUM(amount::numeric), 0)::text AS total
          FROM onchain.transfer t
         WHERE LOWER(t."to")   IN (SELECT addr FROM sippy_wallets)
           AND LOWER(t."from") NOT IN (SELECT addr FROM sippy_wallets)
      `)
      return String(res.rows?.[0]?.total ?? '0')
    } catch (error) {
      logger.warn({ err: error }, 'season stats: onboarded inflow degraded to 0')
      return '0'
    }
  }

  /**
   * Gross USDC moved (broad set): the blended deposits+sends throughput from the
   * onchain.daily_volume rollup — identical to public_stats "totalVolume". Shown beside the
   * value-out hero as a clearly-labeled second figure, never folded into it. Degrades to '0'.
   */
  private async totalMoved(): Promise<string> {
    try {
      const row = await db
        .from('onchain.daily_volume')
        .select(db.raw('COALESCE(SUM(total_usdc_volume), 0)::text as total'))
        .first()
      return String(row?.total ?? '0')
    } catch (error) {
      logger.warn({ err: error }, 'season stats: total moved degraded to 0')
      return '0'
    }
  }

  /**
   * Onchain transaction count (grant KPI "200–400 onchain transactions"). The
   * feed-consistent count of real Sippy transactions — relay legs (spender /
   * operator) and sub-$1 dust removed — from #season/definitions, NOT the raw
   * onchain.daily_volume rollup (which can't drop relay legs). Degrades to 0.
   */
  private async transferCount(): Promise<number> {
    try {
      return await onchainTransactionCount()
    } catch (error) {
      logger.warn({ err: error }, 'season stats: transfer count degraded to 0')
      return 0
    }
  }

  /** Registered users — phone_registry wallets (activation-rate denominator). Degrades to 0. */
  private async registeredUsers(): Promise<number> {
    try {
      const row = await db
        .from('phone_registry')
        .whereNotNull('wallet_address')
        .count('* as total')
        .first()
      return Number(row?.total ?? 0)
    } catch (error) {
      logger.warn({ err: error }, 'season stats: registered users degraded to 0')
      return 0
    }
  }

  /** Country distribution by phone-prefix (reuses the existing CTE). Degrades to []. */
  private async countryRows(): Promise<CountryRow[]> {
    try {
      const res = await db.rawQuery(`
        SELECT
          CASE
            WHEN phone_number LIKE '+57%'  THEN 'CO'
            WHEN phone_number LIKE '+52%'  THEN 'MX'
            WHEN phone_number LIKE '+54%'  THEN 'AR'
            WHEN phone_number LIKE '+55%'  THEN 'BR'
            WHEN phone_number LIKE '+51%'  THEN 'PE'
            WHEN phone_number LIKE '+56%'  THEN 'CL'
            WHEN phone_number LIKE '+58%'  THEN 'VE'
            WHEN phone_number LIKE '+593%' THEN 'EC'
            WHEN phone_number LIKE '+503%' THEN 'SV'
            WHEN phone_number LIKE '+502%' THEN 'GT'
            WHEN phone_number LIKE '+34%'  THEN 'ES'
            WHEN phone_number LIKE '+1%'   THEN 'US'
            ELSE 'OTHER'
          END AS code,
          COUNT(*)::int AS users
        FROM phone_registry
        WHERE wallet_address IS NOT NULL
        GROUP BY 1
        ORDER BY users DESC
      `)
      return (res.rows ?? []).map((r: { code: string; users: number }) => ({
        code: r.code,
        users: Number(r.users),
      }))
    } catch (error) {
      logger.warn({ err: error }, 'season stats: country rows degraded to []')
      return []
    }
  }

  /**
   * Score distribution + top senders from season.score. Returns nulls when the
   * season has no scored wallets yet (shadow mode) or the table is unavailable,
   * so the page degrades cleanly with no empty boxes and no errors.
   *
   * season.score only ever contains verified wallets (the projector skips the
   * spender / operators at the floor), and flagged sybil sends earn 0, so a
   * positive score is already sybil-filtered — only on-chain addresses (public),
   * masked for display, are exposed.
   */
  private async scoreBlocks(seasonId: string): Promise<ScoreBlocks> {
    try {
      const distRes = await db.rawQuery(
        `SELECT tier, COUNT(*)::int AS count
           FROM season.score
          WHERE season_id = ? AND score > 0
          GROUP BY tier`,
        [seasonId]
      )
      const rows = (distRes.rows ?? []) as { tier: string; count: number }[]
      if (rows.length === 0) return { scoreDistribution: null, topSenders: null }

      const scoreDistribution = TIER_ORDER.map((tier) => ({
        tier,
        count: Number(rows.find((r) => r.tier === tier)?.count ?? 0),
      })).filter((b) => b.count > 0)

      const topRes = await db.rawQuery(
        `SELECT wallet, score, tier
           FROM season.score
          WHERE season_id = ? AND score > 0
          ORDER BY score DESC, wallet ASC
          LIMIT 10`,
        [seasonId]
      )
      const topSenders = (
        (topRes.rows ?? []) as { wallet: string; score: number; tier: string }[]
      ).map((r) => ({ address: maskAddress(r.wallet), score: Number(r.score), tier: r.tier }))

      return { scoreDistribution, topSenders }
    } catch {
      return { scoreDistribution: null, topSenders: null }
    }
  }
}
