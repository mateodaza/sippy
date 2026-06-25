/**
 * #season/onramp — on-ramp pending/realize FIFO accounting + the eligible-balance
 * (source-of-funds) primitive C1's referral unlock depends on.
 *
 * This is the C3 ledger the rest of Phase C builds on. It is a DERIVED, rebuildable
 * view over season.score_event + onchain.transfer — NOT a separate authoritative
 * money ledger and it never holds custody. Like season.score, every value here is
 * reconstructable by replaying the same inputs (same recompute discipline).
 *
 * Three responsibilities:
 *
 *   1. insertOnrampPending() — record an external deposit as a PENDING on-ramp
 *      (verb 'onramp', realized=false, pending_until = ts + windowDays, base 0 —
 *      earns nothing until used). The projector calls this for an external inflow.
 *
 *   2. rebuildOnrampRealization() — the SINGLE owner of onramp_used + pending_remaining
 *      for a wallet. Re-derives the whole realization from scratch: delete every
 *      onramp_used, reset pending_remaining, then replay the wallet's realizable
 *      value-outs (unflagged/external sends + unflagged off-ramps) oldest-first,
 *      consuming pendings FIFO within each one's window. Deterministic → idempotent,
 *      and the ONLY correct way to handle FIFO RE-ALLOCATION when a value-out is
 *      sybil-flagged then cleared (toggling onramp_used flags would double-allocate).
 *      Called by reconcileDerivedEvents on every recompute.
 *
 *   3. computeEligibleBalance() — the source-of-funds primitive. A wallet's running
 *      eligible balance = non-referrer inbound (external on-ramp + P2P that did NOT
 *      come from the referrer) credited, value-outs debited FIFO (floored at 0).
 *      Balance the referrer transferred in — DIRECTLY or relayed through the spender
 *      (referrer→spender→referee) — is NOT eligible. C1 checks that the referee's
 *      qualifying send draws on this bucket, not on referrer funds.
 *
 *   4. expirePendingOnramps() — the season job's expiry pass: a pending still
 *      carrying pending_remaining>0 past pending_until is flagged 'expired_onramp'
 *      (realized stays false, leftover preserved in meta). It never earns. The
 *      window-timestamp condition in the rebuild already prevents an expired pending
 *      from realising a later value-out; this flag is the audit record.
 *
 * No I/O in the FIFO math itself beyond the score_event reads/writes; the verb
 * scoring stays entirely in #season/score. Guarding (SEASON1_ENABLED) lives at the
 * entry points (projector hook, off-ramp hook, season job), so tests call directly.
 */

import db from '@adonisjs/lucid/services/db'
import { query as _query } from '#services/db'
import { getSpenderAddress } from '#season/definitions'

const USDC_DECIMALS = 6

// DI seam (mirrors invite.service.ts / the other #season modules).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

/** Raw USDC units → USD dollars (USDC ≈ USD). Tolerant of a bad value. */
function toUsd(rawAmount: string): number {
  try {
    return Number(BigInt(rawAmount)) / 10 ** USDC_DECIMALS
  } catch {
    return 0
  }
}

/** BigInt-normalized raw-amount key for matching a relay forward leg to its pull. */
function amountKey(raw: string): string {
  try {
    return BigInt(raw).toString()
  } catch {
    return `bad:${raw}` // only ever matches an identical malformed value (never a real amount)
  }
}

/**
 * Record an external deposit as a pending on-ramp. realized=false, base 0 — earns
 * nothing until a value-out realises it within the window. pending_remaining is
 * initialised to the full on-ramp amount. ON CONFLICT DO NOTHING: a pending row is
 * stable once created (a reproject must not reset a partially-realised remaining).
 */
export async function insertOnrampPending(row: {
  id: string // "onramp:{txId}"
  seasonId: string
  wallet: string
  counterparty: string // the external sender
  usd: number
  txHash: string
  timestamp: number
  windowDays: number
}): Promise<void> {
  const pendingUntil = row.timestamp + row.windowDays * 86_400
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
     VALUES ($1, $2, $3, 'onramp', $4, $5, $6, false, $7, $5, false, NULL, '{}'::jsonb, $8)
     ON CONFLICT (season_id, id) DO NOTHING`,
    [
      row.id,
      row.seasonId,
      row.wallet,
      row.counterparty,
      row.usd,
      row.txHash,
      pendingUntil,
      row.timestamp,
    ]
  )
}

/** One realizable value-out (a send or off-ramp), in chronological order. */
interface ValueOut {
  id: string // "send:{txId}" | "offramp:{order_id}"
  usd: number
  ts: number
}

/**
 * Rebuild a wallet's ENTIRE on-ramp realization from scratch — the only correct way
 * to keep onramp_used consistent across sybil-flag / clear / reorg. Toggling an
 * onramp_used's flagged state can't capture FIFO RE-ALLOCATION: if send A's $50
 * realization is voided (freeing a pending), send B consumes it; later un-flagging A
 * (a cleared false positive) must NOT restore A's allocation on top of B's, or the
 * same on-ramp scores twice (reviewer's case). So we delete every onramp_used, reset
 * pending_remaining to the original usd, then replay the wallet's REALIZABLE
 * value-outs oldest-first (unflagged / external sends to non-spender + unflagged
 * off-ramps; sybil-voided value-outs are excluded), consuming pendings FIFO within
 * each one's window. Deterministic → idempotent; the whole rebuild runs in one
 * transaction with `SELECT … FOR UPDATE` on the pendings, so concurrent rebuilds of
 * the same wallet serialise. Returns total realised.
 */
export async function rebuildOnrampRealization(args: {
  seasonId: string
  wallet: string
  minActiveUsd: number
  spender: string
}): Promise<number> {
  const w = args.wallet.toLowerCase()
  return db.transaction(async (trx) => {
    const pRes = await trx.rawQuery(
      `SELECT id, usd, timestamp, pending_until
         FROM season.score_event
        WHERE season_id = ? AND wallet = ? AND verb = 'onramp'
        ORDER BY timestamp ASC, id ASC
        FOR UPDATE`,
      [args.seasonId, w]
    )
    const pendings = (
      pRes.rows as { id: string; usd: string; timestamp: number; pending_until: number }[]
    ).map((p) => ({
      id: p.id,
      ts: Number(p.timestamp),
      until: Number(p.pending_until),
      rem: Number(p.usd),
    }))

    // Wipe the wallet's realizations — they're fully re-derived below.
    await trx.rawQuery(
      `DELETE FROM season.score_event WHERE season_id = ? AND wallet = ? AND verb = 'onramp_used'`,
      [args.seasonId, w]
    )

    // Realizable value-outs, chronological. A sybil-voided send (flag_reason 'sybil%')
    // does NOT realize; an external send (counterparty_unverified) still does (real
    // outflow), but the off-ramp PULL to the spender doesn't (the offramp event does).
    const voRes = await trx.rawQuery(
      `SELECT id, usd, timestamp
         FROM season.score_event
        WHERE season_id = ? AND wallet = ? AND usd >= ?
          AND (
            (verb = 'send' AND counterparty <> ?
               AND (flag_reason IS NULL OR flag_reason = 'counterparty_unverified'))
            OR (verb = 'offramp' AND flagged = false)
          )
        ORDER BY timestamp ASC, id ASC`,
      [args.seasonId, w, args.minActiveUsd, args.spender]
    )
    const valueOuts = (voRes.rows as { id: string; usd: string; timestamp: number }[]).map(
      (v): ValueOut => ({ id: v.id, usd: Number(v.usd), ts: Number(v.timestamp) })
    )

    let realizedTotal = 0
    for (const vo of valueOuts) {
      let voRemaining = vo.usd
      for (const p of pendings) {
        if (voRemaining <= 0) break
        if (p.rem <= 0) continue
        if (!(p.ts <= vo.ts && vo.ts <= p.until)) continue // window
        const chunk = Math.min(p.rem, voRemaining)
        if (chunk <= 0) continue
        await trx.rawQuery(
          `INSERT INTO season.score_event
             (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
              pending_until, pending_remaining, flagged, flag_reason, meta, timestamp)
           VALUES (?, ?, ?, 'onramp_used', NULL, ?, NULL, true, NULL, NULL, false, NULL, ?::jsonb, ?)
           ON CONFLICT (season_id, id) DO NOTHING`,
          [
            `onramp_used:${p.id}:${vo.id}`,
            args.seasonId,
            w,
            chunk,
            JSON.stringify({ pendingId: p.id, valueOut: vo.id }),
            vo.ts,
          ]
        )
        p.rem -= chunk
        voRemaining -= chunk
        realizedTotal += chunk
      }
    }

    // Write back each pending's remaining from the freshly-computed allocation.
    for (const p of pendings) {
      await trx.rawQuery(
        `UPDATE season.score_event SET pending_remaining = ? WHERE season_id = ? AND id = ?`,
        [p.rem, args.seasonId, p.id]
      )
    }
    return realizedTotal
  })
}

/**
 * The eligible-balance (source-of-funds) primitive C1 depends on.
 *
 * Folds the referee's on-chain history (oldest first, strictly before the
 * candidate value-out identified by `beforeTs`/`beforeTxId`) into a running
 * eligible balance: credit non-referrer inbound, debit every outflow FIFO (floored
 * at 0). Inbound from the referrer is NOT credited. Returns the eligible balance
 * available just before the candidate send — C1 unlocks only if it covers the send.
 *
 * Relay-aware (load-bearing anti-farm): a referrer can fund the referee THROUGH the
 * spender (referrer→spender→referee), which on-chain shows the inbound forward leg as
 * from=spender — hiding the referrer and (without this) wrongly crediting it as the
 * referee's own funds, defeating the fund-and-bounce guard the moment relayed sends
 * score. We pre-collect every referrer→spender pull and treat a forward leg the
 * referrer relayed in as referrer-funded, exactly like a direct referrer→referee
 * transfer. Outbound legs (a direct send, a relayed send's pull leg, or an off-ramp
 * pull — all show from=referee) debit regardless of the hop, so no special-casing.
 *
 * Derived purely from onchain.transfer + the (stable) referrer/spender wallets, so it
 * reproduces identically on recompute.
 */
export async function computeEligibleBalance(args: {
  refereeWallet: string
  referrerWallet: string
  beforeTs: number
  beforeTxId: string
  /** Spender relay hop; defaults to the configured SIPPY_SPENDER_ADDRESS. */
  spender?: string
}): Promise<number> {
  const referee = args.refereeWallet.toLowerCase()
  const referrer = args.referrerWallet.toLowerCase()
  const spender = (args.spender ?? getSpenderAddress()).toLowerCase()

  // (tx_hash, amount) of every referrer→spender pull — i.e. funds the referrer relayed
  // out. A referee inbound forward leg (spender→referee) matching one of these is
  // referrer-relayed money, so it is NOT eligible (same as a direct referrer transfer).
  const referrerPulls = new Set<string>()
  if (spender) {
    const rp = await deps.query<{ tx_hash: string; amount: string }>(
      `SELECT tx_hash, amount FROM onchain.transfer
        WHERE LOWER("from") = $1 AND LOWER("to") = $2`,
      [referrer, spender]
    )
    for (const r of rp.rows) referrerPulls.add(`${r.tx_hash}|${amountKey(String(r.amount))}`)
  }

  const res = await deps.query<{
    from: string
    to: string
    amount: string
    timestamp: number
    id: string
    tx_hash: string
  }>(
    `SELECT "from", "to", amount, timestamp, id, tx_hash
       FROM onchain.transfer
      WHERE (LOWER("to") = $1 OR LOWER("from") = $1)
        AND (timestamp < $2 OR (timestamp = $2 AND id < $3))
      ORDER BY timestamp ASC, id ASC`,
    [referee, args.beforeTs, args.beforeTxId]
  )

  let eligible = 0
  for (const r of res.rows) {
    const from = r.from.toLowerCase()
    const to = r.to.toLowerCase()
    const usd = toUsd(String(r.amount))
    if (to === referee && from !== referee) {
      // Inbound. Resolve the real source across the spender relay: a forward leg
      // (from=spender) the referrer relayed in counts as referrer-funded.
      const relayedFromReferrer =
        from === spender && referrerPulls.has(`${r.tx_hash}|${amountKey(String(r.amount))}`)
      const fromReferrer = from === referrer || relayedFromReferrer
      // Non-referrer inflow (external on-ramp or P2P) is eligible; referrer-funded
      // balance (direct OR relayed) is NOT — that's the anti-farm rule.
      if (!fromReferrer) eligible += usd
    } else if (from === referee && to !== referee) {
      // Outbound — debits the eligible bucket FIFO, floored at 0.
      eligible = Math.max(0, eligible - usd)
    }
  }
  return eligible
}

/**
 * Season-job expiry pass: a pending on-ramp still carrying pending_remaining>0 past
 * pending_until → flagged 'expired_onramp' (realized stays false; leftover
 * preserved in meta.expiredPendingRemaining). Idempotent — skips rows already so
 * flagged. Returns the distinct wallets touched, so the caller can recompute them
 * (the expiry doesn't change score — on-ramp base is 0 — but keeps the audit trail
 * and the recomputed set consistent).
 */
export async function expirePendingOnramps(seasonId: string, now: number): Promise<string[]> {
  const res = await deps.query<{ wallet: string }>(
    `UPDATE season.score_event
        SET flagged = true,
            flag_reason = 'expired_onramp',
            meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{expiredPendingRemaining}',
                             to_jsonb(pending_remaining))
      WHERE season_id = $1 AND verb = 'onramp' AND realized = false
        AND pending_remaining > 0 AND pending_until < $2
        AND flag_reason IS DISTINCT FROM 'expired_onramp'
      RETURNING wallet`,
    [seasonId, now]
  )
  return Array.from(new Set(res.rows.map((r) => r.wallet)))
}
