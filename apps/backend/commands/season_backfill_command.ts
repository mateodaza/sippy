/**
 * Season 1 backfill command (Phase A).
 *
 *   node ace season:backfill              # project all transfers + build scores
 *   node ace season:backfill --rebuild    # TRUNCATE season.score first, then rebuild
 *   node ace season:backfill --season=s1  # target a specific season (default s1)
 *
 * Replays every onchain.transfer row into season.score_event (idempotent) and
 * builds season.score for the active season, then prints a sanity-check that
 * compares the season-derived MAW / transacted volume against the same totals
 * /api/stats serves (public_stats_controller).
 *
 * Guarded by SEASON1_ENABLED — refuses to run when the flag is off, so it can't
 * silently populate tables in an environment that hasn't opted in.
 *
 * NOTE ON THE COMPARISON: in Phase A the score reflects verified Sippy→Sippy
 * sends/receives ONLY. on-ramp / off-ramp / referral verbs are not wired yet
 * (Phase C), so the season "transacted volume" here is EXPECTED to be lower
 * than the blended /api/stats "USDC moved" total (which sums all indexed
 * transfer volume, deposits included). That gap is the un-blend the dashboard
 * is built on — it is not a bug. The command prints it explicitly.
 */

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { isSeason1Enabled, ACTIVE_SEASON_ID } from '#season/guard'
import { recompute, rebuildAll } from '#season/recompute'
import { maw30, getSpenderAddress } from '#season/definitions'
import { loadParams } from '#season/params'

const USDC_DECIMALS = 6

function usd(raw: string | number): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default class SeasonBackfillCommand extends BaseCommand {
  static commandName = 'season:backfill'
  static description =
    'Replay onchain.transfer into season.score_event + build season.score (Phase A)'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'TRUNCATE season.score and rebuild from scratch', default: false })
  declare rebuild: boolean

  @flags.string({ description: 'Season id to target', default: ACTIVE_SEASON_ID })
  declare season: string

  async run() {
    if (!isSeason1Enabled()) {
      this.logger.error('SEASON1_ENABLED is not "true" — refusing to run. Set it and retry.')
      this.exitCode = 1
      return
    }

    const seasonId = this.season || ACTIVE_SEASON_ID
    const now = Math.floor(Date.now() / 1000)

    this.logger.info(`[season1] backfill starting (season=${seasonId}, rebuild=${this.rebuild})`)
    const summary = this.rebuild
      ? await rebuildAll({ seasonId, now })
      : await recompute(undefined, { seasonId, now })
    this.logger.success(
      `[season1] projected ${summary.transfersProjected} transfers, scored ${summary.walletsScored} wallets`
    )

    await this.printSanityCheck(seasonId, now)
  }

  private async printSanityCheck(seasonId: string, now: number) {
    const params = await loadParams(seasonId)
    const spender = getSpenderAddress()
    const minRaw = BigInt(Math.round(params.minActiveUsd * 10 ** USDC_DECIMALS)).toString()

    // ── Season-derived numbers (the new, un-blended truth) ──────────────
    const verifiedCte = `
      verified AS (
        SELECT LOWER(wallet_address) AS addr FROM phone_registry WHERE wallet_address IS NOT NULL
        EXCEPT
        SELECT LOWER(wallet_address) AS addr FROM event_operator_wallets
      )`

    const [transactedRow, scoreDist, eventCount] = await Promise.all([
      // Transacted volume = verified Sippy→Sippy value-out sends (≥ $minActiveUsd).
      db.rawQuery(
        `WITH ${verifiedCte}
         SELECT COALESCE(SUM(t.amount), 0)::text AS raw, COUNT(*)::int AS cnt
           FROM onchain.transfer t
          WHERE LOWER(t."from") IN (SELECT addr FROM verified)
            AND LOWER(t."to")   IN (SELECT addr FROM verified)
            AND LOWER(t."from") <> LOWER(t."to")
            AND LOWER(t."to") <> ?
            AND t.amount >= ?::numeric`,
        [spender, minRaw]
      ),
      db.rawQuery(
        `SELECT tier, COUNT(*)::int AS n, COALESCE(MAX(score),0) AS max_score
           FROM season.score WHERE season_id = ? GROUP BY tier ORDER BY n DESC`,
        [seasonId]
      ),
      db.rawQuery(
        `SELECT COUNT(*)::int AS n,
                COUNT(*) FILTER (WHERE flagged)::int AS flagged
           FROM season.score_event WHERE season_id = ?`,
        [seasonId]
      ),
    ])

    const seasonMaw = await maw30(now)

    // ── public_stats_controller comparison numbers (what /api/stats serves) ──
    const aliasCheck = await db.rawQuery(`SELECT to_regclass('public.wallet_aliases') AS t`)
    const hasAliases = aliasCheck.rows[0]?.t
    const sippyWalletsCte = hasAliases
      ? `sippy_wallets AS (
           SELECT LOWER(wallet_address) AS addr FROM phone_registry WHERE wallet_address IS NOT NULL
           UNION SELECT LOWER(address) FROM wallet_aliases
         )`
      : `sippy_wallets AS (
           SELECT LOWER(wallet_address) AS addr FROM phone_registry WHERE wallet_address IS NOT NULL
         )`

    const [blendedVolRow, transfersRow, onboardedRow, registeredRow, activeAcctRow] =
      await Promise.all([
        db.rawQuery(
          `SELECT COALESCE(SUM(total_usdc_volume),0)::text AS total FROM onchain.daily_volume`
        ),
        db.rawQuery(
          `SELECT COALESCE(SUM(transfer_count),0)::int AS total FROM onchain.daily_volume`
        ),
        db.rawQuery(
          `WITH ${sippyWalletsCte}
           SELECT COALESCE(SUM(amount::numeric),0)::text AS total
             FROM onchain.transfer t
            WHERE LOWER(t."to")   IN (SELECT addr FROM sippy_wallets)
              AND LOWER(t."from") NOT IN (SELECT addr FROM sippy_wallets)`
        ),
        db.rawQuery(
          `SELECT COUNT(*)::int AS total FROM phone_registry WHERE wallet_address IS NOT NULL`
        ),
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM onchain.account WHERE tx_count > 0`),
      ])

    const transacted = transactedRow.rows[0] ?? { raw: '0', cnt: 0 }
    const blendedVol = blendedVolRow.rows[0]?.total ?? '0'
    const onboarded = onboardedRow.rows[0]?.total ?? '0'

    this.logger.info('')
    this.logger.info('──────────────── Season 1 sanity-check vs /api/stats ────────────────')
    this.logger.info(`  Registered users (wallet-linked):   ${registeredRow.rows[0]?.total ?? 0}`)
    this.logger.info(`  Active accounts (tx_count>0):        ${activeAcctRow.rows[0]?.total ?? 0}`)
    this.logger.info(
      `  score_event rows (flagged):          ${eventCount.rows[0]?.n ?? 0} (${eventCount.rows[0]?.flagged ?? 0})`
    )
    this.logger.info('')
    this.logger.info('  SEASON-DERIVED (verified value-out only):')
    this.logger.info(`    MAW (trailing 30d):                ${seasonMaw}`)
    this.logger.info(
      `    Transacted volume (USD):           $${usd(transacted.raw)}  (${transacted.cnt} sends)`
    )
    this.logger.info('')
    this.logger.info('  /api/stats (blended — deposits + sends):')
    this.logger.info(`    USDC moved total (USD):            $${usd(blendedVol)}`)
    this.logger.info(`    Total transfers:                   ${transfersRow.rows[0]?.total ?? 0}`)
    this.logger.info(`    USDC onboarded (USD):              $${usd(onboarded)}`)
    this.logger.info('')
    this.logger.info('  Score distribution by tier:')
    for (const r of scoreDist.rows as { tier: string; n: number; max_score: number }[]) {
      this.logger.info(
        `    ${r.tier.padEnd(10)} ${String(r.n).padStart(5)}   (max score ${r.max_score})`
      )
    }
    this.logger.info('')
    this.logger.info('  NOTE: Phase A scores verified Sippy→Sippy sends/receives only.')
    this.logger.info('  on-ramp / off-ramp / referral verbs are Phase C, so the season')
    this.logger.info('  transacted volume is EXPECTED to be lower than the blended')
    this.logger.info('  /api/stats total. That gap is the un-blend, not a divergence bug.')
    this.logger.info('─────────────────────────────────────────────────────────────────────')
  }
}
