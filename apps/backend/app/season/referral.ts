/**
 * #season/referral — the C1 referral state machine over ONE season.referral ledger,
 * fed by BOTH existing sources (Quest referral_attributions + direct pending_invites),
 * joined to wallets via phone_registry.
 *
 * Stages (spec §3 / plan §6 — pay on transition, never on signup, two-sided):
 *   pending   — referee onboarded (a referral_attributions row, or a completed
 *               pending_invite). syncPendingReferrals() creates the row.
 *   unlocked  — referee's first qualifying send ≥ unlockMinSend to a verified
 *               counterparty (≠ the referrer) within unlockWindowDays AND backed by
 *               the referee's OWN funds (C3 eligible-balance). detectReferralUnlock()
 *               (called by the projector) fires referrer +40 / referee +25.
 *   retained  — referee still active retainedWindowDays after unlock.
 *               promoteRetainedReferrals() (season job) fires referrer +30.
 *   void      — sybil / circular / self-ref. voidReferral() (C2) zeroes the awards.
 *
 * Precedence when a referee is reachable through BOTH sources: referral_attributions
 * FIRST, then pending_invites (the canonical public /r/<code> path wins). Enforced by
 * processing source A before B under UNIQUE(season_id, referee_wallet) + ON CONFLICT.
 *
 * Reputation-only: every transition is score points, never money/token/redeemable
 * (Lina gate). All awards use deterministic ids so a replay/recompute never double-pays.
 */

import logger from '@adonisjs/core/services/logger'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'
import { loadParams } from '#season/params'
import { computeEligibleBalance } from '#season/onramp'
import { isActiveLogical } from '#season/definitions'

// DI seam (mirrors the other #season modules).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

/**
 * Sync pending referrals from both sources into season.referral (idempotent).
 *
 * Source A (canonical): referral_attributions. Source B: completed pending_invites.
 * A is inserted first; B's INSERT for an already-attributed referee is a no-op via
 * UNIQUE(season_id, referee_wallet) — that's the precedence rule. Self-referrals are
 * filtered (referee_wallet <> referrer_wallet — inherits the existing guard). The
 * row's created_at is anchored to the referee's onboarding (phone_registry.created_at)
 * so the unlock window measures from onboarding, deterministically. Returns the count
 * of new pending rows created.
 */
export async function syncPendingReferrals(seasonId: string = ACTIVE_SEASON_ID): Promise<number> {
  // Source A — Quest referral codes (canonical). referee_phone is the lifetime PK.
  const a = await deps.query(
    `INSERT INTO season.referral
       (season_id, referrer_wallet, referee_wallet, source, ref_id, stage, created_at, updated_at)
     SELECT $1, LOWER(rfr.wallet_address), LOWER(ree.wallet_address), 'quest_code',
            ra.referee_phone, 'pending', to_timestamp(ree.created_at / 1000.0), NOW()
       FROM referral_attributions ra
       JOIN phone_registry ree
         ON (ree.phone_number = ra.referee_phone OR ree.phone_number = LTRIM(ra.referee_phone, '+'))
       JOIN phone_registry rfr
         ON (rfr.phone_number = ra.referrer_phone OR rfr.phone_number = LTRIM(ra.referrer_phone, '+'))
      WHERE ree.wallet_address IS NOT NULL AND rfr.wallet_address IS NOT NULL
        AND LOWER(ree.wallet_address) <> LOWER(rfr.wallet_address)
     ON CONFLICT (season_id, referee_wallet) DO NOTHING`,
    [seasonId]
  )

  // Source B — direct WhatsApp invites, only those that completed (referee signed up).
  const b = await deps.query(
    `INSERT INTO season.referral
       (season_id, referrer_wallet, referee_wallet, source, ref_id, stage, created_at, updated_at)
     SELECT $1, LOWER(rfr.wallet_address), LOWER(ree.wallet_address), 'direct_invite',
            pi.id::text, 'pending', to_timestamp(ree.created_at / 1000.0), NOW()
       FROM pending_invites pi
       JOIN phone_registry ree
         ON (ree.phone_number = pi.recipient_phone OR ree.phone_number = LTRIM(pi.recipient_phone, '+'))
       JOIN phone_registry rfr
         ON (rfr.phone_number = pi.sender_phone OR rfr.phone_number = LTRIM(pi.sender_phone, '+'))
      WHERE pi.status = 'completed'
        AND ree.wallet_address IS NOT NULL AND rfr.wallet_address IS NOT NULL
        AND LOWER(ree.wallet_address) <> LOWER(rfr.wallet_address)
     ON CONFLICT (season_id, referee_wallet) DO NOTHING`,
    [seasonId]
  )

  return (a.rowCount ?? 0) + (b.rowCount ?? 0)
}

interface PendingReferralRow {
  id: number
  referrer_wallet: string
  anchor: string // EXTRACT(EPOCH FROM created_at)
}

/**
 * Detect a referral UNLOCK on the referee's qualifying send (called by the projector
 * for every verified-sender send). The unlock fires iff the sender has a PENDING
 * referral and this send is:
 *   (1) to a verified counterparty that is NOT the referrer,
 *   (2) ≥ unlockMinSend, within unlockWindowDays of onboarding, and
 *   (3) backed by the referee's OWN funds — its eligible balance (C3) covers it.
 * Without (3) the fund-and-bounce farm (referrer funds referee, referee bounces it
 * back) trivially unlocks; the eligible-balance check is the load-bearing anti-farm.
 *
 * On success: referrer +40, referee +25 (deterministic ids keyed on referee_wallet),
 * stage → unlocked. Idempotent: once unlocked the pending lookup misses, so a replay
 * never re-pays. Returns the wallets whose score changed (so the caller recomputes).
 */
export async function detectReferralUnlock(args: {
  seasonId: string
  sender: string // the referee
  recipient: string
  recipientVerified: boolean
  usd: number
  txId: string
  txTs: number
  unlockMinSend: number
  unlockWindowDays: number
}): Promise<string[]> {
  const referee = args.sender.toLowerCase()
  const recipient = args.recipient.toLowerCase()

  const res = await deps.query<PendingReferralRow>(
    `SELECT id, referrer_wallet, EXTRACT(EPOCH FROM created_at)::bigint AS anchor
       FROM season.referral
      WHERE season_id = $1 AND referee_wallet = $2 AND stage = 'pending'
      LIMIT 1`,
    [args.seasonId, referee]
  )
  const pending = res.rows[0]
  if (!pending) return []

  const referrer = pending.referrer_wallet.toLowerCase()
  const anchor = Number(pending.anchor)
  const windowEnd = anchor + args.unlockWindowDays * 86_400

  // Gate (1) + (2): verified cp that isn't the referrer, ≥ min send, in window.
  if (!args.recipientVerified) return []
  if (recipient === referrer) return [] // a send to the referrer never qualifies
  if (args.usd < args.unlockMinSend) return []
  if (args.txTs > windowEnd) return []

  // Gate (2b): the qualifying send itself must be UNFLAGGED. A sybil-voided send can
  // never unlock; and because sybil flags are sticky across reproject, this also stops
  // a re-unlock on a later pass after C2 has voided the send (reconcileReferralStages
  // reverts the existing unlock; this stops it re-firing).
  const sendRow = await deps.query(
    `SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2 AND flagged = false`,
    [args.seasonId, `send:${args.txId}`]
  )
  if (sendRow.rows.length === 0) return []

  // Gate (3) — source of funds: the send must draw on the referee's OWN eligible
  // balance (realized on-ramp + non-referrer inbound), not on referrer-funded balance.
  const eligible = await computeEligibleBalance({
    refereeWallet: referee,
    referrerWallet: referrer,
    beforeTs: args.txTs,
    beforeTxId: args.txId,
  })
  if (eligible < args.usd) return []

  // Unlock — two-sided, deterministic ids keyed on the referee (one unlock per referee).
  await emitReferralEvent({
    id: `referral_unlock_referrer:${args.seasonId}:${referee}`,
    seasonId: args.seasonId,
    wallet: referrer,
    verb: 'referral_unlock_referrer',
    counterparty: referee,
    timestamp: args.txTs,
  })
  await emitReferralEvent({
    id: `referral_unlock_referee:${args.seasonId}:${referee}`,
    seasonId: args.seasonId,
    wallet: referee,
    verb: 'referral_unlock_referee',
    counterparty: referrer,
    timestamp: args.txTs,
  })
  await deps.query(
    `UPDATE season.referral
        SET stage = 'unlocked', unlocked_at = $3, unlock_tx_id = $4, updated_at = NOW()
      WHERE id = $1 AND season_id = $2 AND stage = 'pending'`,
    [pending.id, args.seasonId, args.txTs, args.txId]
  )
  logger.info('[season1] referral unlocked (referee=%s)', referee.slice(0, 10))
  return [referrer, referee]
}

/**
 * Reconcile referral stages against the current send set (P1b — reorg/sybil
 * reversibility). An unlock (and any retention built on it) is only valid while its
 * qualifying send still exists AND is unflagged. If the send was reorged out or
 * flagged sybil, revert the referral to `pending`, clear the unlock/retention
 * timestamps, and DELETE its award events so a later genuine qualifying send can
 * re-unlock cleanly (the projector re-fires detectReferralUnlock when stage=pending).
 * Returns the referrer/referee wallets whose score changed.
 */
export async function reconcileReferralStages(
  seasonId: string = ACTIVE_SEASON_ID
): Promise<string[]> {
  const invalid = await deps.query<{ referrer_wallet: string; referee_wallet: string }>(
    `SELECT referrer_wallet, referee_wallet
       FROM season.referral r
      WHERE r.season_id = $1 AND r.stage IN ('unlocked', 'retained')
        AND (
          r.unlock_tx_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM season.score_event s
             WHERE s.season_id = $1 AND s.id = 'send:' || r.unlock_tx_id AND s.flagged = false
          )
        )`,
    [seasonId]
  )
  const affected: string[] = []
  for (const r of invalid.rows) {
    const referee = r.referee_wallet.toLowerCase()
    await deps.query(
      `UPDATE season.referral
          SET stage = 'pending', unlocked_at = NULL, retained_at = NULL,
              unlock_tx_id = NULL, updated_at = NOW()
        WHERE season_id = $1 AND referee_wallet = $2`,
      [seasonId, referee]
    )
    // Delete (not flag) the award events — a clean re-unlock recreates them.
    await deps.query(
      `DELETE FROM season.score_event
        WHERE season_id = $1
          AND id IN (
            'referral_unlock_referrer:' || $1 || ':' || $2,
            'referral_unlock_referee:'  || $1 || ':' || $2,
            'referral_retained:'        || $1 || ':' || $2
          )`,
      [seasonId, referee]
    )
    affected.push(r.referrer_wallet.toLowerCase(), referee)
  }
  if (affected.length > 0) {
    logger.info(
      '[season1] reverted %d referral(s) with invalid qualifying send',
      invalid.rows.length
    )
  }
  return Array.from(new Set(affected))
}

/**
 * Promote unlocked referrals to retained (season job). A referral is retained when
 * retainedWindowDays have passed since unlock AND the referee is still active (≥1
 * qualifying value-out in the trailing retained window — the relay-aware isActiveLogical
 * definition, so spender-routed sends count). Fires referrer +30. Idempotent (stage
 * guard + deterministic id).
 * Returns the referrer wallets whose score changed.
 */
export async function promoteRetainedReferrals(
  seasonId: string = ACTIVE_SEASON_ID,
  now?: number
): Promise<string[]> {
  const params = await loadParams(seasonId)
  const ref = now ?? Math.floor(Date.now() / 1000)
  const windowSecs = params.referral.retainedWindowDays * 86_400

  const due = await deps.query<{ id: number; referrer_wallet: string; referee_wallet: string }>(
    `SELECT id, referrer_wallet, referee_wallet
       FROM season.referral
      WHERE season_id = $1 AND stage = 'unlocked'
        AND unlocked_at IS NOT NULL AND unlocked_at + $2 <= $3`,
    [seasonId, windowSecs, ref]
  )

  const affected: string[] = []
  for (const r of due.rows) {
    // "Still active retainedWindowDays after unlock" — a qualifying value-out in the
    // trailing retained window (which, given the due check above, lies after unlock).
    // Relay-aware: most real sends route through the spender, so a raw isActive() would
    // miss them and wrongly drop a still-active referee from retention.
    const active = await isActiveLogical(r.referee_wallet, {
      start: ref - windowSecs,
      end: ref,
    })
    if (!active) continue
    await emitReferralEvent({
      id: `referral_retained:${seasonId}:${r.referee_wallet}`,
      seasonId,
      wallet: r.referrer_wallet,
      verb: 'referral_retained',
      counterparty: r.referee_wallet,
      timestamp: ref,
    })
    await deps.query(
      `UPDATE season.referral
          SET stage = 'retained', retained_at = $3, updated_at = NOW()
        WHERE id = $1 AND season_id = $2 AND stage = 'unlocked'`,
      [r.id, seasonId, ref]
    )
    affected.push(r.referrer_wallet.toLowerCase())
  }
  return affected
}

/**
 * Void a referral (called by C2 anti-sybil): stage → void and the referral's award
 * score events are flagged (flagged-not-deleted) so computeScore zeroes them. The
 * referrer/referee score events are keyed on the referee wallet. Idempotent. Returns
 * the wallets whose score changed (referrer + referee) so the caller recomputes.
 */
export async function voidReferral(
  seasonId: string,
  refereeWallet: string,
  reason: string
): Promise<string[]> {
  const referee = refereeWallet.toLowerCase()
  const row = await deps.query<{ referrer_wallet: string }>(
    `UPDATE season.referral
        SET stage = 'void', updated_at = NOW()
      WHERE season_id = $1 AND referee_wallet = $2 AND stage <> 'void'
      RETURNING referrer_wallet`,
    [seasonId, referee]
  )
  if (row.rows.length === 0) return []
  const referrer = row.rows[0].referrer_wallet.toLowerCase()

  await deps.query(
    `UPDATE season.score_event
        SET flagged = true, flag_reason = $3
      WHERE season_id = $1
        AND id IN (
          'referral_unlock_referrer:' || $1 || ':' || $2,
          'referral_unlock_referee:'  || $1 || ':' || $2,
          'referral_retained:'        || $1 || ':' || $2
        )`,
    [seasonId, referee, reason]
  )
  return [referrer, referee]
}

/**
 * Insert one referral award score event (deterministic id). On a re-unlock the row
 * may already exist but FLAGGED — from a voidReferral that a later flag-clear undid
 * (the stage went void→pending but the award stayed flagged). emitReferralEvent only
 * runs when a referral genuinely (re-)unlocks, so ON CONFLICT REVIVES it: clears the
 * flag and refreshes the timestamp to the new qualifying send. Without this the
 * referrer's points never come back after a cleared false-positive void (reviewer P2).
 */
async function emitReferralEvent(row: {
  id: string
  seasonId: string
  wallet: string
  verb: 'referral_unlock_referrer' | 'referral_unlock_referee' | 'referral_retained'
  counterparty: string
  timestamp: number
}): Promise<void> {
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, true, NULL, NULL, false, NULL, '{}'::jsonb, $6)
     ON CONFLICT (season_id, id) DO UPDATE
       SET flagged = false, flag_reason = NULL, timestamp = EXCLUDED.timestamp`,
    [row.id, row.seasonId, row.wallet, row.verb, row.counterparty, row.timestamp]
  )
}
