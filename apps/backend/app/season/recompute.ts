/**
 * #season/recompute — rebuild season.score from the event log.
 *
 * Mirrors onchain_writer.recomputeAggregates(): season.score is a DERIVED
 * aggregate, fully rebuildable. recompute()
 *   1. derives send/receive/first_send rows from onchain.transfer via the
 *      projector (idempotent — ON CONFLICT), then
 *   2. replays season.score_event through the pure computeScore() and upserts
 *      season.score.
 *
 * Idempotent: running it twice with the same reference `now` yields identical
 * season.score rows. Reprojecting refreshes verification-derived flags. The
 * optional `now` makes runs deterministic for tests; in production it defaults
 * to wall-clock seconds.
 *
 * This is a library — the SEASON1_ENABLED guard lives at the entry points
 * (backfill command, admin route, webhook hook), so tests can call it directly.
 */

import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'
import { loadParams } from '#season/params'
import { computeScore, type ScoreEvent } from '#season/score'
import type { Verb } from '#season/params'
import { rebuildOnrampRealization } from '#season/onramp'
import { getSpenderAddress } from '#season/definitions'
import {
  buildContext,
  projectAllTransfers,
  projectWalletTransfers,
  type ProjectContext,
} from '#season/projector'

// DI seam (mirrors invite.service.ts).
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

interface EventRow {
  verb: string
  usd: string | null
  counterparty: string | null
  timestamp: number | string
  flagged: boolean
}

function toScoreEvents(rows: EventRow[]): ScoreEvent[] {
  return rows.map((r) => ({
    verb: r.verb as Verb,
    usd: r.usd === null || r.usd === undefined ? null : Number(r.usd),
    counterparty: r.counterparty,
    timestamp: Number(r.timestamp),
    flagged: r.flagged === true,
  }))
}

/**
 * Reconcile a wallet's DERIVED events to the current set of UNFLAGGED value-outs,
 * so a send flagged by C2 sybil (or removed by reorg, or re-flagged by a
 * verification change) zeroes EVERYTHING it produced — not just the raw send.
 * Idempotent, and behaviour-preserving when nothing is flagged (it reproduces what
 * the projector/job would emit). Run at the top of every score rebuild so the
 * "a flagged send earns nothing, anywhere" invariant always holds.
 *
 *   • onramp_used      — the whole realization is REBUILT from scratch (delete +
 *                        re-derive FIFO over the currently-realizable value-outs), so
 *                        a sybil flag/clear can never double-allocate a pending. This
 *                        is the single owner of onramp_used + pending_remaining.
 *   • first_send       — re-pointed to the earliest unflagged qualifying send, or
 *                        removed (de-activation) when none remain.
 *   • new_counterparty — flagged when no unflagged qualifying send to that cp remains.
 *
 * active_week is the ONE derived verb NOT reconciled here — it's a periodic reward
 * emitted (and delete-stale reconciled) by the season job (#season/job.emitActiveWeeks),
 * so a plain recompute keeps the same score it always did (no active_week churn).
 */
async function reconcileDerivedEvents(
  seasonId: string,
  wallet: string,
  minActiveUsd: number
): Promise<void> {
  const w = wallet.toLowerCase()

  // (a) on-ramp realization — rebuilt from scratch (toggling flagged-state can't
  // capture FIFO re-allocation across flag/clear; see #season/onramp).
  await rebuildOnrampRealization({
    seasonId,
    wallet: w,
    minActiveUsd,
    spender: getSpenderAddress(),
  })

  // (b) first_send = earliest unflagged qualifying send; removed if none remain.
  await deps.query(
    `DELETE FROM season.score_event WHERE season_id = $1 AND id = 'first_send:' || $1 || ':' || $2`,
    [seasonId, w]
  )
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
     SELECT 'first_send:' || $1 || ':' || $2, $1, $2, 'first_send', counterparty, usd, tx_hash,
            true, NULL, NULL, false, NULL, '{}'::jsonb, timestamp
       FROM season.score_event
      WHERE season_id = $1 AND wallet = $2 AND verb = 'send' AND flagged = false AND usd >= $3
      ORDER BY timestamp ASC, id ASC
      LIMIT 1`,
    [seasonId, w, minActiveUsd]
  )

  // (c) new_counterparty flagged unless an unflagged qualifying send to that cp remains.
  await deps.query(
    `UPDATE season.score_event nc
        SET flagged = NOT keep.ok,
            flag_reason = CASE WHEN keep.ok THEN NULL ELSE 'voided_value_out' END
       FROM (
         SELECT nc2.id,
                EXISTS (
                  SELECT 1 FROM season.score_event s
                   WHERE s.season_id = $1 AND s.wallet = $2 AND s.verb = 'send'
                     AND s.counterparty = nc2.counterparty AND s.flagged = false AND s.usd >= $3
                ) AS ok
           FROM season.score_event nc2
          WHERE nc2.season_id = $1 AND nc2.wallet = $2 AND nc2.verb = 'new_counterparty'
       ) keep
      WHERE nc.season_id = $1 AND nc.id = keep.id`,
    [seasonId, w, minActiveUsd]
  )
}

/**
 * Recompute one wallet's score from its score_event rows and upsert season.score.
 * Assumes the wallet's transfer-derived events are already projected (callers
 * project first). Reconciles derived events first, then computeScore → upsert.
 */
async function rebuildWalletScore(wallet: string, seasonId: string, now: number): Promise<void> {
  const w = wallet.toLowerCase()
  const params = await loadParams(seasonId)
  await reconcileDerivedEvents(seasonId, w, params.minActiveUsd)
  const res = await deps.query<EventRow>(
    `SELECT verb, usd, counterparty, timestamp, flagged
       FROM season.score_event
      WHERE season_id = $1 AND wallet = $2`,
    [seasonId, w]
  )
  const result = computeScore(toScoreEvents(res.rows), params, { now })

  await deps.query(
    `INSERT INTO season.score
       (wallet, season_id, score, tier, active_weeks, distinct_counterparties,
        last_active, dormant, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (wallet, season_id) DO UPDATE SET
       score = EXCLUDED.score,
       tier = EXCLUDED.tier,
       active_weeks = EXCLUDED.active_weeks,
       distinct_counterparties = EXCLUDED.distinct_counterparties,
       last_active = EXCLUDED.last_active,
       dormant = EXCLUDED.dormant,
       updated_at = NOW()`,
    [
      w,
      seasonId,
      result.score,
      result.tier,
      result.activeWeeks,
      result.distinctCounterparties,
      result.lastActive,
      result.dormant,
    ]
  )
}

/**
 * Recompute a single wallet's score from its score_event rows.
 *
 * Default (backfill / single-wallet admin recompute): first project the
 * wallet's transfers from onchain.transfer (idempotent) so score_event is
 * current, then rebuild. This re-scans the wallet's entire transfer history.
 *
 * With `skipProjection` (the live webhook hook): skip that re-scan and rebuild
 * straight from the already-projected score_event rows. The hook has just
 * projected the freshly-ingested batch and every earlier transfer is already in
 * score_event, so for a fixed `now` the result is identical to the full path —
 * it just no longer costs O(wallet transfer history) per webhook event.
 */
export async function recomputeWallet(
  wallet: string,
  seasonId: string = ACTIVE_SEASON_ID,
  opts: { now?: number; ctx?: ProjectContext; skipProjection?: boolean } = {}
): Promise<void> {
  const now = opts.now ?? nowSeconds()
  if (!opts.skipProjection) {
    const ctx = opts.ctx ?? (await buildContext(seasonId))
    await projectWalletTransfers(wallet, ctx)
  }
  await rebuildWalletScore(wallet, seasonId, now)
}

export interface RecomputeSummary {
  seasonId: string
  transfersProjected: number
  walletsScored: number
}

/**
 * Recompute scores. With a `wallet`, rebuilds just that wallet. Without one,
 * projects all transfers then rebuilds every wallet that has events in the
 * season. Idempotent given a fixed `now`.
 */
export async function recompute(
  wallet?: string,
  opts: { now?: number; seasonId?: string } = {}
): Promise<RecomputeSummary> {
  const seasonId = opts.seasonId ?? ACTIVE_SEASON_ID
  const now = opts.now ?? nowSeconds()
  const ctx = await buildContext(seasonId)

  if (wallet) {
    await recomputeWallet(wallet, seasonId, { now, ctx })
    return { seasonId, transfersProjected: 0, walletsScored: 1 }
  }

  const { transfers } = await projectAllTransfers(ctx)
  const walletsRes = await deps.query<{ wallet: string }>(
    `SELECT DISTINCT wallet FROM season.score_event WHERE season_id = $1`,
    [seasonId]
  )
  for (const row of walletsRes.rows) {
    await rebuildWalletScore(row.wallet, seasonId, now)
  }
  logger.info(
    '[season1] recompute: %d transfers projected, %d wallets scored',
    transfers,
    walletsRes.rows.length
  )
  return { seasonId, transfersProjected: transfers, walletsScored: walletsRes.rows.length }
}

/**
 * Full rebuild from scratch: delete the derived season.score rows, clear the
 * transfer-derived projection for this season, re-project all current
 * onchain.transfer rows, and recompute every wallet.
 *
 * Transfer-derived = send / receive / first_send / onramp / new_counterparty. These
 * are deleted and re-derived from onchain.transfer; first_send + the whole on-ramp
 * realization (onramp_used + pending_remaining) are then re-derived per wallet by
 * reconcileDerivedEvents in the recompute loop, and active_week by the job. The
 * externally-emitted offramp + referral_* events are left intact (not derivable from
 * the transfer feed; offramp realizations are re-derived by the per-wallet rebuild
 * from the surviving offramp events). The escape hatch for stale/orphaned transfer
 * events when the live hook didn't run.
 */
export async function rebuildAll(
  opts: { now?: number; seasonId?: string } = {}
): Promise<RecomputeSummary> {
  const seasonId = opts.seasonId ?? ACTIVE_SEASON_ID
  await db.rawQuery('DELETE FROM season.score WHERE season_id = ?', [seasonId])
  await db.rawQuery(
    `DELETE FROM season.score_event
      WHERE season_id = ?
        AND verb IN ('send', 'receive', 'first_send', 'onramp', 'new_counterparty')`,
    [seasonId]
  )
  // onramp_used + pending_remaining are owned by reconcileDerivedEvents (it rebuilds
  // them per wallet during the recompute below), so no explicit cleanup here.
  const summary = await recompute(undefined, opts)
  // Revert any referral unlock/retained whose qualifying send didn't survive the
  // rebuild (reorged out / now flagged), then re-score the affected wallets (P1b).
  const { reconcileReferralStages } = await import('#season/referral')
  const reverted = await reconcileReferralStages(seasonId)
  for (const w of reverted) {
    await rebuildWalletScore(w, seasonId, opts.now ?? nowSeconds())
  }
  return summary
}
