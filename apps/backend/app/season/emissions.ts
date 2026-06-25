/**
 * #season/emissions — the non-projector emission entry points (off-ramp completion,
 * /notify-fund corroboration).
 *
 * Money/bot paths are sacred: every export here is GUARDED by SEASON1_ENABLED and
 * fully try/caught, so a season failure logs and moves on — it can lose a score
 * event, never a user's money, never the bot/off-ramp/notify response. Callers
 * lazy-import this module (so the season stack isn't even loaded when the flag is
 * off) and never await it in a way that blocks the money path.
 */

import logger from '@adonisjs/core/services/logger'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID, isSeason1Enabled } from '#season/guard'

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

/**
 * Resolve a phone → its verified wallet address (lowercased). Matches both
 * canonical E.164 and legacy bare-digit phone_registry rows (same JOIN shape as
 * invite.service.retryPendingNotifications). Returns null when unmapped.
 */
async function walletForPhone(phone: string): Promise<string | null> {
  const res = await deps.query<{ wallet_address: string }>(
    `SELECT wallet_address FROM phone_registry
      WHERE (phone_number = $1 OR phone_number = LTRIM($1, '+'))
        AND wallet_address IS NOT NULL
      LIMIT 1`,
    [phone]
  )
  const addr = res.rows[0]?.wallet_address
  return addr ? addr.toLowerCase() : null
}

/**
 * Off-ramp completion CORE (unguarded; the shared core of onOfframpCompleted, also
 * driven directly in tests — mirrors projectAndRecompute vs onTransfersIngested):
 * write one idempotent `offramp` score event (base 20 + volume bonus, a value-out;
 * KYC-gated, low sybil risk), realise the wallet's pending on-ramps against it
 * (off-ramp is a qualifying value-out, spec §4), and recompute the wallet in shadow.
 * Idempotent: id `offramp:{order}` + ON CONFLICT, so a re-poll can't double-emit.
 * Returns the realised on-ramp total (for logging/tests).
 */
export async function applyOfframpCompletion(args: {
  orderId: string
  phone: string
  seasonId?: string
  now?: number
}): Promise<{ wallet: string; usd: number; realized: number } | null> {
  const seasonId = args.seasonId ?? ACTIVE_SEASON_ID
  const wallet = await walletForPhone(args.phone)
  if (!wallet) {
    logger.warn('[season1] offramp emission: no wallet for phone (skipping)')
    return null
  }

  // amount_usdc is the off-ramped value-out (USDC ≈ USD).
  const orderRes = await deps.query<{ amount_usdc: string }>(
    `SELECT amount_usdc FROM offramp_orders WHERE id = $1 LIMIT 1`,
    [args.orderId]
  )
  const usd = Number(orderRes.rows[0]?.amount_usdc ?? 0)
  if (!(usd > 0)) {
    logger.warn('[season1] offramp emission: non-positive amount (skipping)')
    return null
  }

  const now = args.now ?? nowSeconds()
  const eventId = `offramp:${args.orderId}`
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
     VALUES ($1, $2, $3, 'offramp', NULL, $4, NULL, true, NULL, NULL, false, NULL,
             $5::jsonb, $6)
     ON CONFLICT (season_id, id) DO NOTHING`,
    [eventId, seasonId, wallet, usd, JSON.stringify({ orderId: args.orderId }), now]
  )

  // The recompute below runs reconcileDerivedEvents, which rebuilds the wallet's
  // on-ramp realization from scratch over its value-outs — this off-ramp included —
  // so the off-ramp realises pending on-ramps FIFO there (no separate realize call).
  const { recomputeWallet } = await import('#season/recompute')
  await recomputeWallet(wallet, seasonId, { now, skipProjection: true })

  // Realized = whatever the rebuild allocated to this off-ramp's value-out.
  const realizedRes = await deps.query<{ realized: string }>(
    `SELECT COALESCE(SUM(usd), 0) AS realized
       FROM season.score_event
      WHERE season_id = $1 AND verb = 'onramp_used' AND meta->>'valueOut' = $2`,
    [seasonId, eventId]
  )
  return { wallet, usd, realized: Number(realizedRes.rows[0]?.realized ?? 0) }
}

/**
 * Off-ramp completion HOOK (the one the poller calls): guarded + best-effort.
 * A no-op unless SEASON1_ENABLED, never throws — the off-ramp poller must be
 * byte-for-byte unaffected. Wraps applyOfframpCompletion.
 */
export async function onOfframpCompleted(args: {
  orderId: string
  phone: string
  seasonId?: string
}): Promise<void> {
  if (!isSeason1Enabled()) return
  try {
    await applyOfframpCompletion(args)
  } catch (err) {
    logger.warn('[season1] offramp emission hook failed (non-blocking): %o', err)
  }
}

/**
 * /notify-fund corroboration CORE (unguarded). The on-chain projector is the
 * CANONICAL on-ramp signal (not every on-ramp flows through fund.sippy.lat); this
 * just annotates the matching pending on-ramp so the audit trail records that a
 * fund.sippy.lat notify also fired. Purely additive metadata, no scoring effect.
 * Returns the number of pending on-ramp rows annotated (0 if none projected yet).
 */
export async function applyNotifyFundCorroboration(args: {
  txHash: string
  seasonId?: string
}): Promise<number> {
  const seasonId = args.seasonId ?? ACTIVE_SEASON_ID
  const res = await deps.query(
    `UPDATE season.score_event
        SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{notifyFundCorroborated}', 'true')
      WHERE season_id = $1 AND verb = 'onramp' AND tx_hash = $2`,
    [seasonId, args.txHash]
  )
  return res.rowCount ?? 0
}

/**
 * /notify-fund corroboration HOOK (guarded + best-effort). A no-op unless
 * SEASON1_ENABLED, and a no-op when the on-ramp event isn't projected yet (the
 * indexer webhook may lag the notify) — the projector remains the source of truth.
 */
export async function corroborateNotifyFund(args: {
  txHash: string
  seasonId?: string
}): Promise<void> {
  if (!isSeason1Enabled()) return
  try {
    await applyNotifyFundCorroboration(args)
  } catch (err) {
    logger.warn('[season1] notify-fund corroboration failed (non-blocking): %o', err)
  }
}
