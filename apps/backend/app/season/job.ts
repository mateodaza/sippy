/**
 * #season/job — the C4 season job (provider-managed timer + the periodic pass).
 *
 * GUARDED everywhere by SEASON1_ENABLED: the provider only starts the timer when
 * the flag is on (it never even ticks when off), and runSeasonPass() refuses
 * otherwise. Each pass is wrapped in a pool-safe singleton lock (season.job_lock)
 * so two warm processes / instances never run the same heavy pass at once — if the
 * lock isn't acquired the pass is skipped (logged) and the lock is released in a
 * finally.
 *
 * A pass, in order:
 *   1. syncPendingReferrals — create season.referral(pending) rows from both sources.
 *   2. recompute the active set WITH projection — fires referral unlocks + on-ramp
 *      realisation as a side effect of reprojecting recently-active wallets (a rare
 *      full rebuildAll every Nth pass keeps decay/dormancy honest network-wide).
 *   3. active_week — emit one idempotent +15 per wallet per qualifying ISO week.
 *   4. promoteRetainedReferrals — unlocked → retained (+30 referrer).
 *   5. expirePendingOnramps — pending on-ramps past their window → expired_onramp.
 *   6. runSybilScan — graph rules → flags + zero + void.
 *   7. fold: recompute every affected wallet (skipProjection — events already written,
 *      the active set is already projected) so all scores reflect 3–6.
 *
 * Cadence is configurable (open decision #3): SEASON1_JOB_INTERVAL_MS (default 1h),
 * SEASON1_RECOMPUTE_WINDOW_DAYS (active-set window, default 35), and a full rebuild
 * every SEASON1_FULL_REBUILD_EVERY passes (default 24 → ~daily at the 1h default).
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID, isSeason1Enabled } from '#season/guard'

const WEEK_SECONDS = 7 * 86_400
const LOCK_STALE_SECS = 600 // a claim older than this is considered abandoned + stealable

// DI seam (mirrors the other #season modules).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function intervalMs(): number {
  const raw = Number(env.get('SEASON1_JOB_INTERVAL_MS', '')) || 0
  return raw > 0 ? raw : 60 * 60 * 1000 // 1h default
}
function recomputeWindowDays(): number {
  const raw = Number(env.get('SEASON1_RECOMPUTE_WINDOW_DAYS', '')) || 0
  return raw > 0 ? raw : 35 // covers the 30d recency boundary + slack
}
function fullRebuildEvery(): number {
  const raw = Number(env.get('SEASON1_FULL_REBUILD_EVERY', '')) || 0
  return raw > 0 ? raw : 24
}

/**
 * Claim the season job lock (pool-safe). Returns a token if acquired (the caller
 * MUST release with it), or null if another process holds a fresh lock — in which
 * case the caller skips the pass. Steals a claim older than LOCK_STALE_SECS.
 */
async function acquireLock(seasonId: string): Promise<string | null> {
  const token = `${process.pid}:${nowSeconds()}`
  const res = await deps.query<{ locked_by: string }>(
    `INSERT INTO season.job_lock (season_id, locked_at, locked_by)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (season_id) DO UPDATE SET locked_at = NOW(), locked_by = $2
       WHERE season.job_lock.locked_at IS NULL
          OR season.job_lock.locked_at < NOW() - ($3 || ' seconds')::interval
     RETURNING locked_by`,
    [seasonId, token, String(LOCK_STALE_SECS)]
  )
  return res.rows[0]?.locked_by === token ? token : null
}

async function releaseLock(seasonId: string, token: string): Promise<void> {
  await deps.query(
    `UPDATE season.job_lock SET locked_at = NULL, locked_by = NULL
      WHERE season_id = $1 AND locked_by = $2`,
    [seasonId, token]
  )
}

/** Wallets with on-chain or score activity in the trailing window — the active set. */
async function getActiveSet(seasonId: string, now: number, windowDays: number): Promise<string[]> {
  const since = now - windowDays * 86_400
  const res = await deps.query<{ w: string }>(
    `SELECT DISTINCT w FROM (
       SELECT LOWER("from") AS w FROM onchain.transfer WHERE timestamp >= $1
       UNION SELECT LOWER("to") FROM onchain.transfer WHERE timestamp >= $1
       UNION SELECT wallet FROM season.score_event WHERE season_id = $2 AND timestamp >= $1
     ) s WHERE w IS NOT NULL`,
    [since, seasonId]
  )
  return res.rows.map((r) => r.w)
}

/**
 * Reconcile active_week (+15) — one event per wallet per qualifying ISO week (a week
 * with ≥1 UNFLAGGED value-out ≥ minActiveUsd). Adds newly-qualifying weeks AND
 * delete-stales weeks whose only value-outs are now flagged (sybil) — so a voided
 * send loses its weekly reward too (P1a). Deterministic id active_week:{season}:
 * {wallet}:{weekIndex}; the verb is NOT a VALUE_OUT verb, so it never inflates
 * computeScore's activeWeeks tier-gate count. Run after the sybil scan. Returns the
 * wallets whose active_week set changed.
 */
export async function emitActiveWeeks(seasonId: string, minActiveUsd: number): Promise<string[]> {
  // Delete-stale: an active_week with no surviving unflagged value-out in its week
  // (e.g. the only value-outs were flagged sybil). aw.timestamp is the week start, so
  // FLOOR(aw.timestamp / week) == its week index.
  const removed = await deps.query<{ wallet: string }>(
    `DELETE FROM season.score_event aw
      WHERE aw.season_id = $1 AND aw.verb = 'active_week'
        AND NOT EXISTS (
          SELECT 1 FROM season.score_event s
           WHERE s.season_id = $1 AND s.wallet = aw.wallet AND s.verb IN ('send', 'offramp')
             AND s.flagged = false AND s.usd >= $2
             AND FLOOR(s.timestamp / ${WEEK_SECONDS}) = FLOOR(aw.timestamp / ${WEEK_SECONDS})
        )
      RETURNING wallet`,
    [seasonId, minActiveUsd]
  )
  const added = await deps.query<{ wallet: string }>(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
     SELECT
       'active_week:' || $1 || ':' || wallet || ':' || week_idx,
       $1, wallet, 'active_week', NULL, NULL, NULL, true, NULL, NULL, false, NULL, '{}'::jsonb,
       week_idx * ${WEEK_SECONDS}
     FROM (
       SELECT wallet, FLOOR(timestamp / ${WEEK_SECONDS})::bigint AS week_idx
         FROM season.score_event
        WHERE season_id = $1 AND verb IN ('send', 'offramp')
          AND flagged = false AND usd >= $2
        GROUP BY wallet, FLOOR(timestamp / ${WEEK_SECONDS})
     ) qualifying
     ON CONFLICT (season_id, id) DO NOTHING
     RETURNING wallet`,
    [seasonId, minActiveUsd]
  )
  return Array.from(new Set([...removed.rows, ...added.rows].map((r) => r.wallet)))
}

export interface SeasonPassSummary {
  ran: boolean
  fullRebuild: boolean
  activeSet: number
  retained: number
  expired: number
  sybilFlags: number
  referralsReverted: number
  recomputed: number
}

/**
 * One season pass. Guarded by SEASON1_ENABLED + the singleton lock. `opts.now` and
 * `opts.passIndex` make it deterministic for tests; `opts.fullRebuild` forces the
 * network-wide rebuild path.
 */
export async function runSeasonPass(
  opts: { now?: number; seasonId?: string; passIndex?: number; fullRebuild?: boolean } = {}
): Promise<SeasonPassSummary> {
  const seasonId = opts.seasonId ?? ACTIVE_SEASON_ID
  const empty: SeasonPassSummary = {
    ran: false,
    fullRebuild: false,
    activeSet: 0,
    retained: 0,
    expired: 0,
    sybilFlags: 0,
    referralsReverted: 0,
    recomputed: 0,
  }
  if (!isSeason1Enabled()) return empty

  const token = await acquireLock(seasonId)
  if (!token) {
    logger.info('[season1] season pass skipped — lock held by another process')
    return empty
  }

  try {
    const now = opts.now ?? nowSeconds()
    const fullRebuild =
      opts.fullRebuild ??
      (opts.passIndex !== undefined && opts.passIndex % fullRebuildEvery() === 0)

    const { recomputeWallet, rebuildAll } = await import('#season/recompute')
    const { syncPendingReferrals, promoteRetainedReferrals, reconcileReferralStages } =
      await import('#season/referral')
    const { expirePendingOnramps } = await import('#season/onramp')
    const { runSybilScan } = await import('#season/sybil')
    const { loadParams } = await import('#season/params')
    const params = await loadParams(seasonId)
    const affected = new Set<string>()

    // 1. sync pending referrals from both sources.
    await syncPendingReferrals(seasonId)

    // 2. recompute the active set WITH projection — fires unlocks + on-ramp realization,
    //    and reconcileDerivedEvents (inside each recompute) emits active_week / first_send
    //    from the currently-unflagged value-outs.
    if (fullRebuild) {
      await rebuildAll({ seasonId, now })
    }
    const activeSet = await getActiveSet(seasonId, now, recomputeWindowDays())
    if (!fullRebuild) {
      for (const w of activeSet) {
        await recomputeWallet(w, seasonId, { now })
        affected.add(w)
      }
    } else {
      activeSet.forEach((w) => affected.add(w))
    }

    // 3. retained promotion + 4. on-ramp expiry.
    const retained = await promoteRetainedReferrals(seasonId, now)
    retained.forEach((w) => affected.add(w))
    const expired = await expirePendingOnramps(seasonId, now)
    expired.forEach((w) => affected.add(w))

    // 5. sybil scan — flags offending sends + voids referrals on flagged pairs.
    const sybil = await runSybilScan(seasonId)
    sybil.walletsAffected.forEach((w) => affected.add(w))

    // 6. referral stage reconcile — revert any unlock/retained whose qualifying send is
    //    now gone (reorg) or flagged (sybil), so a voided send can't keep paying (P1b).
    const reverted = await reconcileReferralStages(seasonId)
    reverted.forEach((w) => affected.add(w))

    // 7. active_week — add qualifying + delete-stale (weeks whose value-outs were just
    //    voided by sybil lose their reward too). Runs AFTER sybil so it sees the flags.
    const activeWeekWallets = await emitActiveWeeks(seasonId, params.minActiveUsd)
    activeWeekWallets.forEach((w) => affected.add(w))

    // Include every referral participant so unlock/retained referrer scores fold in
    // (unlocks fire deep inside step 2's recompute and don't surface their referrer).
    const refs = await deps.query<{ w: string }>(
      `SELECT DISTINCT referrer_wallet AS w FROM season.referral WHERE season_id = $1
       UNION SELECT DISTINCT referee_wallet FROM season.referral WHERE season_id = $1`,
      [seasonId]
    )
    refs.rows.forEach((r) => affected.add(r.w.toLowerCase()))

    // 8. fold everything — recompute (skipProjection) re-runs reconcileDerivedEvents so
    //    every score reflects the now-flagged sends, voided realisations and active weeks.
    for (const w of affected) {
      await recomputeWallet(w, seasonId, { now, skipProjection: true })
    }

    return {
      ran: true,
      fullRebuild,
      activeSet: activeSet.length,
      retained: retained.length,
      expired: expired.length,
      sybilFlags: sybil.flags,
      referralsReverted: reverted.length,
      recomputed: affected.size,
    }
  } catch (err) {
    logger.error('[season1] season pass failed: %o', err)
    return empty
  } finally {
    await releaseLock(seasonId, token).catch((err) =>
      logger.warn('[season1] season job lock release failed: %o', err)
    )
  }
}

// ── Timer management (called by SeasonProvider) ───────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null
let passIndex = 0

/**
 * Start the recurring season job. NO-OP unless SEASON1_ENABLED — the timer must
 * not even start when the season is off. Mirrors invite.service's retry timer
 * (interval + .unref() so it never holds the process open).
 */
export function startSeasonJob(): void {
  if (timer) return
  if (!isSeason1Enabled()) {
    // logger?. — this runs in the provider boot phase where the logger service may
    // not be resolved yet; a bare logger.info would throw and break app boot.
    logger?.info('[season1] season job not started (SEASON1_ENABLED off)')
    return
  }
  timer = setInterval(() => {
    passIndex += 1
    runSeasonPass({ passIndex }).catch((err) => {
      logger?.error('[season1] season job tick error: %o', err)
    })
  }, intervalMs())
  timer.unref()
  logger?.info('[season1] season job started (every %dms)', intervalMs())
}

export function stopSeasonJob(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
    logger?.info('[season1] season job stopped')
  }
}

// Internal lock primitives, exposed for tests (the singleton guard can't be
// observed through runSeasonPass when SEASON1_ENABLED is off, as it is in tests).
// eslint-disable-next-line @typescript-eslint/naming-convention -- `__testing` is the repo's test-seam convention
export const __testing = { acquireLock, releaseLock, LOCK_STALE_SECS }
