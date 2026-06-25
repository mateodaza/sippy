/**
 * #season/projector — the score projector off onchain.transfer.
 *
 * A SEPARATE, idempotent consumer of the transfer feed (plan open-decision #2):
 * it does NOT modify onchain_writer.service — onchain.transfer stays the single
 * source of truth, and this projector derives season.score_event rows from it
 * with deterministic ids, exactly like onchain_writer derives its aggregates.
 *
 * Transfer-derived verbs emitted here:
 *   • send     (id "send:{txId}")       — for a tracked sender wallet
 *   • receive  (id "receive:{txId}")    — for a tracked receiver wallet
 *   • first_send (id "first_send:{season}:{wallet}") — once per wallet/season,
 *     emitted only for a verified send ≥ minActiveUsd (activation = first REAL send)
 *   • onramp   (id "onramp:{txId}", Phase C) — a verified wallet's external inflow,
 *     PENDING (realized=false, earns 0) until used; #season/onramp realises it FIFO.
 *   • onramp_used (Phase C) — emitted by #season/onramp when a qualifying value-out
 *     (a send here; off-ramps realise via #season/emissions) consumes a pending.
 *   • new_counterparty (id "new_counterparty:{season}:{wallet}:{cp}", Phase C) —
 *     first ≥$1 verified send to a never-before-paid counterparty.
 *
 * offramp / referral_* / active_week are emitted by their own idempotent paths
 * (#season/emissions, #season/referral, the season job), not by this projector.
 *
 * Verified-counterparty floor (spec §2, Phase A): a send/receive earns only if
 * the counterparty is a verified Sippy wallet (see #season/definitions). Sends
 * to / receives from a non-verified address are still RECORDED — flagged, not
 * deleted — with flag_reason='counterparty_unverified', and earn 0. Same
 * flagged-not-deleted discipline as the onchain aggregates.
 *
 * Spender relay collapse (load-bearing): a Sippy embedded send is ONE tx of two
 * USDC legs — user→spender (the SpendPermission pull) then spender→recipient (the
 * forward), same tx_hash + amount (embedded_wallet.service). Projecting those legs
 * raw would score the pull as a 0-earning send to the (unverified) spender and the
 * forward as a receive from the spender — so a user's REAL send wouldn't score,
 * activate, or unlock referrals. resolveRelayLeg() pairs the two legs and projects
 * them as the logical user→recipient send (the same collapse the dashboard does in
 * logicalTransferCteSql) — the pull's send is attributed to the real recipient, the
 * forward's receive to the real sender. Off-ramp pulls (forward → the spender
 * itself, or none) stay UNcollapsed: a flagged send-to-spender earning 0, whose
 * value-out is realised from offramp_orders, never double-counted here.
 *
 * Idempotency + recomputability: score_event's PK is composite (season_id, id),
 * so the same transfer projects independently per season. send/receive insert
 * ON CONFLICT (season_id, id) DO UPDATE the verification-derived flag fields
 * (flagged / flag_reason) — that's what keeps the projection RECOMPUTABLE: when
 * the verified set or operator list changes, a reproject refreshes stale flags
 * instead of freezing whatever was true at first sight. first_send merges
 * timestamp = LEAST(existing, incoming) so replaying transfers in ANY order
 * converges activation to the earliest verified send — deterministic.
 *
 * Reorgs: a transfer dropped from onchain.transfer must also drop its derived
 * score_event rows, or the reorged-out send keeps earning. onTransfersReorged()
 * is the live hook for that (the webhook calls it on log.removed).
 */

import logger from '@adonisjs/core/services/logger'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID, isSeason1Enabled } from '#season/guard'
import { getVerifiedWalletSet, getSpenderAddress } from '#season/definitions'
import { loadParams } from '#season/params'
import { insertOnrampPending } from '#season/onramp'
import { detectReferralUnlock, reconcileReferralStages } from '#season/referral'

const USDC_DECIMALS = 6

export interface TransferRow {
  id: string // "{txHash}-{logIndex}" — onchain.transfer.id
  from: string
  to: string
  amount: string // raw USDC units (NUMERIC(78,0) source)
  timestamp: number // unix seconds
  txHash: string
}

export interface ProjectContext {
  verified: Set<string>
  spender: string
  seasonId: string
  /** Activation floor: first_send is only emitted for a verified send ≥ this (spec §2). */
  minActiveUsd: number
  /** Pending on-ramp window (days) — pending_until = inflow ts + this (Phase C). */
  onrampRealizeWindowDays: number
  /** Referral unlock thresholds (Phase C / C1) — min qualifying send + window. */
  unlockMinSend: number
  unlockWindowDays: number
}

// DI seam (mirrors invite.service.ts).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

/** Build the projection context (verified set + spender) for the active season. */
export async function buildContext(seasonId: string = ACTIVE_SEASON_ID): Promise<ProjectContext> {
  const [verified, params] = await Promise.all([getVerifiedWalletSet(), loadParams(seasonId)])
  return {
    verified,
    spender: getSpenderAddress(),
    seasonId,
    minActiveUsd: params.minActiveUsd,
    onrampRealizeWindowDays: params.onrampRealizeWindowDays,
    unlockMinSend: params.referral.unlockMinSend,
    unlockWindowDays: params.referral.unlockWindowDays,
  }
}

/** Raw USDC units → USD dollars (USDC ≈ USD), as a number for the NUMERIC(20,6) column. */
function toUsd(rawAmount: string): number {
  try {
    return Number(BigInt(rawAmount)) / 10 ** USDC_DECIMALS
  } catch {
    return 0
  }
}

async function insertTransferEvent(row: {
  id: string
  seasonId: string
  wallet: string
  verb: 'send' | 'receive'
  counterparty: string
  usd: number
  txHash: string
  flagged: boolean
  flagReason: string | null
  timestamp: number
  rawAmount: string
}): Promise<void> {
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, flagged, flag_reason, meta, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, NULL, $8, $9, $10::jsonb, $11)
     ON CONFLICT (season_id, id) DO UPDATE
       SET flag_reason = CASE WHEN COALESCE(season.score_event.flag_reason, '') LIKE 'sybil%'
                              THEN season.score_event.flag_reason ELSE EXCLUDED.flag_reason END,
           flagged = (COALESCE(season.score_event.flag_reason, '') LIKE 'sybil%') OR EXCLUDED.flagged`,
    [
      row.id,
      row.seasonId,
      row.wallet,
      row.verb,
      row.counterparty,
      row.usd,
      row.txHash,
      row.flagged,
      row.flagReason,
      JSON.stringify({ rawAmount: row.rawAmount }),
      row.timestamp,
    ]
  )
}

/**
 * new_counterparty (Phase C): the first ≥$1 send from `wallet` to a verified
 * counterparty it has never paid before this season (+8, capped in #season/score).
 * One row per (wallet, counterparty); LEAST(timestamp) on conflict so replaying
 * transfers in any order converges to the earliest qualifying send — deterministic.
 * Its flagged state (when the underlying sends are sybil-voided) is reconciled by
 * #season/recompute.reconcileDerivedEvents, not here.
 */
async function upsertNewCounterparty(row: {
  seasonId: string
  wallet: string
  counterparty: string
  usd: number
  txHash: string
  timestamp: number
}): Promise<void> {
  const id = `new_counterparty:${row.seasonId}:${row.wallet}:${row.counterparty}`
  await deps.query(
    `INSERT INTO season.score_event
       (id, season_id, wallet, verb, counterparty, usd, tx_hash, realized,
        pending_until, flagged, flag_reason, meta, timestamp)
     VALUES ($1, $2, $3, 'new_counterparty', $4, $5, $6, true, NULL, false, NULL, '{}'::jsonb, $7)
     ON CONFLICT (season_id, id) DO UPDATE
       SET timestamp = LEAST(season.score_event.timestamp, EXCLUDED.timestamp)`,
    [id, row.seasonId, row.wallet, row.counterparty, row.usd, row.txHash, row.timestamp]
  )
}

/**
 * What a single onchain.transfer leg resolves to once the spender relay is
 * collapsed: the pull leg of a relayed send (→ the real recipient), or the
 * forward leg (→ the real sender). `null` = a plain direct transfer / off-ramp
 * pull that must NOT be collapsed.
 */
type RelayResolution = { role: 'pull'; recipient: string } | { role: 'forward'; sender: string }

/** Lexicographic-safe USDC raw amount key (BigInt-normalized) for pairing equality. */
function amountKey(raw: string): string {
  try {
    return BigInt(raw).toString()
  } catch {
    return `bad:${raw}` // only ever matches an identical malformed value (never a real amount)
  }
}

/** Log index from an onchain.transfer id ("{txHash}-{logIndex}"); 0 if unparseable. */
function logIndexOf(id: string): number {
  const dash = id.lastIndexOf('-')
  if (dash < 0) return 0
  const n = Number(id.slice(dash + 1))
  return Number.isFinite(n) ? n : 0
}

/**
 * Pair the relay legs WITHIN one tx, the same rule logicalTransferCteSql() uses on
 * the dashboard side: a user→spender pull matches a spender→recipient forward of the
 * SAME amount in the SAME tx. Done in log-index order with greedy 1:1 matching, so a
 * batch tx carrying multiple equal-amount pairs pairs each leg exactly once instead of
 * cross-joining (the dashboard CTE's known same-amount-batch over-count). Off-ramp
 * pulls (forward goes to the spender itself, or no forward at all) stay UNpaired and
 * are absent from the map — the caller then leaves them as a flagged send-to-spender,
 * exactly as before (their value-out is realised via offramp_orders, not here).
 */
function pairRelayLegs(
  rows: { id: string; from: string; to: string; amount: string }[],
  spender: string
): Map<string, RelayResolution> {
  const sorted = [...rows].sort(
    (a, b) => logIndexOf(a.id) - logIndexOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
  const out = new Map<string, RelayResolution>()
  const openPulls: { id: string; from: string; amount: string }[] = []
  for (const r of sorted) {
    const from = r.from.toLowerCase()
    const to = r.to.toLowerCase()
    const amount = amountKey(r.amount)
    if (to === spender && from !== spender) {
      // user→spender (a pull leg, or an off-ramp pull until a forward claims it)
      openPulls.push({ id: r.id, from, amount })
    } else if (from === spender && to !== spender) {
      // spender→recipient — claim the oldest open pull of equal amount (FIFO == adjacency
      // for the consecutive pull-then-forward log layout the indexer emits).
      const idx = openPulls.findIndex((p) => p.amount === amount)
      if (idx >= 0) {
        const pull = openPulls.splice(idx, 1)[0]
        out.set(pull.id, { role: 'pull', recipient: to })
        out.set(r.id, { role: 'forward', sender: pull.from })
      }
    }
  }
  return out
}

/**
 * Resolve whether `t` is one leg of a spender relay pair, and to whom it logically
 * flows. Only spender-touching legs trigger the (indexed) tx-sibling lookup; plain
 * direct transfers short-circuit to `null` with no query. onchain.transfer is the
 * source of truth and is written before the projector runs (webhook + tests both
 * insert first), so the sibling leg is always visible here.
 */
async function resolveRelayLeg(
  t: TransferRow,
  ctx: ProjectContext
): Promise<RelayResolution | null> {
  const spender = ctx.spender
  if (!spender) return null
  const from = t.from.toLowerCase()
  const to = t.to.toLowerCase()
  const touchesSpenderAsLeg =
    (to === spender && from !== spender) || (from === spender && to !== spender)
  if (!touchesSpenderAsLeg) return null

  const res = await deps.query<{ id: string; from: string; to: string; amount: string }>(
    `SELECT id, "from", "to", amount FROM onchain.transfer WHERE tx_hash = $1`,
    [t.txHash]
  )
  return pairRelayLegs(res.rows, spender).get(t.id) ?? null
}

/**
 * Project one transfer into score_event rows. Idempotent. Returns the set of
 * wallets whose score may have changed (so the caller can recompute them).
 *
 * Relay-aware: Sippy embedded sends route through the spender as ONE tx of two USDC
 * legs (user→spender pull, then spender→recipient forward; same tx_hash + amount —
 * embedded_wallet.service). We collapse that pair so the SCORE side sees the real
 * user→recipient send (the same collapse the dashboard's logicalTransferCteSql does),
 * instead of scoring the pull as a 0-earning send to the (unverified) spender.
 */
export async function projectTransfer(t: TransferRow, ctx: ProjectContext): Promise<string[]> {
  const from = t.from.toLowerCase()
  const to = t.to.toLowerCase()
  const usd = toUsd(t.amount)
  const affected: string[] = []
  const relay = await resolveRelayLeg(t, ctx)

  // SEND — only for a tracked Sippy sender (a direct send, or the pull leg of a
  // relayed send). For a relayed send the real counterparty is the forward leg's
  // recipient, NOT the spender. Flagged (earns 0) if that counterparty isn't a
  // verified wallet (external, operator, spender, self).
  if (ctx.verified.has(from)) {
    const recipient = relay?.role === 'pull' ? relay.recipient : to
    const counterpartyVerified =
      ctx.verified.has(recipient) && recipient !== from && recipient !== ctx.spender
    await insertTransferEvent({
      id: `send:${t.id}`,
      seasonId: ctx.seasonId,
      wallet: from,
      verb: 'send',
      counterparty: recipient,
      usd,
      txHash: t.txHash,
      flagged: !counterpartyVerified,
      flagReason: counterpartyVerified ? null : 'counterparty_unverified',
      timestamp: t.timestamp,
      rawAmount: t.amount,
    })
    affected.push(from)
    // Activation (first_send) is no longer emitted here — it is re-derived from the
    // earliest UNFLAGGED qualifying send by reconcileDerivedEvents (#season/recompute)
    // so a send later voided by C2 sybil can't keep the wallet activated. Here we only
    // emit the new_counterparty bonus row for a verified send to a never-paid cp; its
    // flagged state is reconciled there too.
    if (counterpartyVerified && usd >= ctx.minActiveUsd) {
      await upsertNewCounterparty({
        seasonId: ctx.seasonId,
        wallet: from,
        counterparty: recipient,
        usd,
        txHash: t.txHash,
        timestamp: t.timestamp,
      })
    }
    // On-ramp realization is NOT done inline here anymore: it's rebuilt per wallet by
    // reconcileDerivedEvents (#season/recompute) on every recompute, from the current
    // realizable value-out set — the only way a sybil flag/clear can't double-allocate
    // a pending. The recompute that follows this projection performs it.

    // Referral unlock (Phase C / C1): if this sender is a pending referee and this
    // send is the qualifying, OWN-funded send, fire the two-sided unlock. The
    // source-of-funds check inside makes the fund-and-bounce farm a no-op. Any
    // referrer/referee whose score changes is added to `affected` for recompute.
    const unlocked = await detectReferralUnlock({
      seasonId: ctx.seasonId,
      sender: from,
      recipient,
      recipientVerified: counterpartyVerified,
      usd,
      txId: t.id,
      txTs: t.timestamp,
      unlockMinSend: ctx.unlockMinSend,
      unlockWindowDays: ctx.unlockWindowDays,
    })
    for (const w of unlocked) affected.push(w)
  }

  // RECEIVE — only for a tracked Sippy receiver (a direct receive, or the forward leg
  // of a relayed send). For a relayed send the real counterparty is the pull leg's
  // sender, NOT the spender. Flagged if that sender is unverified.
  if (ctx.verified.has(to)) {
    const sender = relay?.role === 'forward' ? relay.sender : from
    const counterpartyVerified = ctx.verified.has(sender) && sender !== to && sender !== ctx.spender
    await insertTransferEvent({
      id: `receive:${t.id}`,
      seasonId: ctx.seasonId,
      wallet: to,
      verb: 'receive',
      counterparty: sender,
      usd,
      txHash: t.txHash,
      flagged: !counterpartyVerified,
      flagReason: counterpartyVerified ? null : 'counterparty_unverified',
      timestamp: t.timestamp,
      rawAmount: t.amount,
    })
    affected.push(to)
    // On-ramp (Phase C): a verified wallet receiving from a non-verified, external
    // address is a deposit → emit a PENDING on-ramp (earns 0 until used within the
    // window; #season/onramp realises it FIFO on a later value-out). This on-chain
    // detection is canonical — /notify-fund only corroborates — because not all
    // on-ramps flow through fund.sippy.lat. Self-deposit vs inbound-P2P is
    // indistinguishable on-chain, which is acceptable precisely because on-ramp
    // realises nothing until a real value-out consumes it (spec §4). A relay forward
    // leg is an in-app transfer initiated by another Sippy wallet, never an external
    // deposit, so it is excluded — as is the spender as an internal address.
    const isExternalInflow =
      relay?.role !== 'forward' && !ctx.verified.has(from) && from !== ctx.spender && from !== to
    if (isExternalInflow) {
      await insertOnrampPending({
        id: `onramp:${t.id}`,
        seasonId: ctx.seasonId,
        wallet: to,
        counterparty: from,
        usd,
        txHash: t.txHash,
        timestamp: t.timestamp,
        windowDays: ctx.onrampRealizeWindowDays,
      })
    }
  }

  return affected
}

/** Map an onchain.transfer DB row to a TransferRow. */
function mapTransferRow(r: {
  id: string
  from: string
  to: string
  amount: string
  timestamp: number | string
  tx_hash: string
}): TransferRow {
  return {
    id: r.id,
    from: r.from,
    to: r.to,
    amount: String(r.amount),
    timestamp: Number(r.timestamp),
    txHash: r.tx_hash,
  }
}

/**
 * Project every onchain.transfer row (oldest first) into score_event.
 * Idempotent — safe to run repeatedly. Returns counts + the affected wallet set.
 */
export async function projectAllTransfers(
  ctx: ProjectContext
): Promise<{ transfers: number; affected: Set<string> }> {
  const res = await deps.query<{
    id: string
    from: string
    to: string
    amount: string
    timestamp: number
    tx_hash: string
  }>(
    `SELECT id, "from", "to", amount, timestamp, tx_hash
       FROM onchain.transfer
      ORDER BY timestamp ASC, id ASC`
  )
  const affected = new Set<string>()
  for (const r of res.rows) {
    const wallets = await projectTransfer(mapTransferRow(r), ctx)
    for (const w of wallets) affected.add(w)
  }
  return { transfers: res.rows.length, affected }
}

/** Project just the transfers touching `wallet` (either side). Idempotent. */
export async function projectWalletTransfers(
  wallet: string,
  ctx: ProjectContext
): Promise<Set<string>> {
  const w = wallet.toLowerCase()
  const res = await deps.query<{
    id: string
    from: string
    to: string
    amount: string
    timestamp: number
    tx_hash: string
  }>(
    `SELECT id, "from", "to", amount, timestamp, tx_hash
       FROM onchain.transfer
      WHERE LOWER("from") = $1 OR LOWER("to") = $1
      ORDER BY timestamp ASC, id ASC`,
    [w]
  )
  const affected = new Set<string>()
  for (const r of res.rows) {
    const wallets = await projectTransfer(mapTransferRow(r), ctx)
    for (const wl of wallets) affected.add(wl)
  }
  return affected
}

/**
 * Project a freshly-ingested transfer batch, then recompute each affected
 * wallet's score. The shared core of the live webhook path (onTransfersIngested
 * runs it under the SEASON1_ENABLED guard); also driven directly in tests.
 *
 * Because the batch is projected here, the per-wallet recompute runs with
 * `skipProjection`: it rebuilds from the score_event rows just written (plus
 * everything earlier batches already wrote) and never re-scans onchain.transfer.
 * That keeps a webhook event O(batch), not O(each affected wallet's full
 * history). Returns the set of recomputed wallets.
 */
export async function projectAndRecompute(
  transfers: TransferRow[],
  ctx: ProjectContext,
  opts: { now?: number } = {}
): Promise<Set<string>> {
  const affected = new Set<string>()
  for (const t of transfers) {
    const wallets = await projectTransfer(t, ctx)
    for (const w of wallets) affected.add(w)
  }
  // Imported lazily to avoid a static import cycle (recompute → projector).
  const { recomputeWallet } = await import('#season/recompute')
  for (const w of affected) {
    await recomputeWallet(w, ctx.seasonId, { now: opts.now, skipProjection: true })
  }
  return affected
}

/**
 * Live consumer hook for the webhook ingestion path. Best-effort and fully
 * guarded: a no-op unless SEASON1_ENABLED, never throws (must not affect the
 * bot / webhook response). Projects the just-inserted transfers, then
 * recomputes the affected wallets' scores in shadow mode.
 */
export async function onTransfersIngested(transfers: TransferRow[]): Promise<void> {
  if (!isSeason1Enabled() || transfers.length === 0) return
  try {
    const ctx = await buildContext()
    await projectAndRecompute(transfers, ctx)
  } catch (err) {
    logger.warn('[season1] projector hook failed (non-blocking): %o', err)
  }
}

/**
 * Core reorg cleanup (unguarded; the shared core of onTransfersReorged, also
 * driven directly in tests — mirrors projectAndRecompute vs onTransfersIngested).
 *
 * For each removed transfer, delete its transfer-keyed derived rows (send / receive
 * / onramp); then, for the affected wallets, drop the wallet-keyed derived events the
 * reproject must rebuild (first_send, new_counterparty) and FULL-reproject them (no
 * skipProjection) so everything re-derives from whatever transfers remain. A
 * reorged-out first send correctly de-activates the wallet; a reorged-out inflow
 * drops its on-ramp; offramp / referral events are left intact (not transfer-derived).
 * The recompute's reconcileDerivedEvents rebuilds on-ramp realization (onramp_used +
 * pending_remaining) from scratch. Scoped to ctx.seasonId. Returns the recomputed set.
 */
export async function reprojectAfterReorg(
  transferIds: string[],
  ctx: ProjectContext,
  opts: { now?: number } = {}
): Promise<Set<string>> {
  const affected = new Set<string>()
  for (const tid of transferIds) {
    const res = await deps.query<{ wallet: string }>(
      `DELETE FROM season.score_event
        WHERE season_id = $1 AND id IN ($2, $3, $4)
        RETURNING wallet`,
      [ctx.seasonId, `send:${tid}`, `receive:${tid}`, `onramp:${tid}`]
    )
    for (const r of res.rows) affected.add(r.wallet.toLowerCase())
  }
  if (affected.size === 0) return affected
  // Drop the per-wallet derived events the reproject re-derives from what remains:
  // activation (first_send) and new_counterparty. on-ramp realization (onramp_used +
  // pending_remaining) is fully rebuilt by reconcileDerivedEvents during the recompute
  // below, so no explicit cleanup is needed for it here.
  for (const w of affected) {
    await deps.query(`DELETE FROM season.score_event WHERE season_id = $1 AND id = $2`, [
      ctx.seasonId,
      `first_send:${ctx.seasonId}:${w}`,
    ])
    await deps.query(
      `DELETE FROM season.score_event
        WHERE season_id = $1 AND wallet = $2 AND verb = 'new_counterparty'`,
      [ctx.seasonId, w]
    )
  }
  const { recomputeWallet } = await import('#season/recompute')
  for (const w of affected) {
    await recomputeWallet(w, ctx.seasonId, { ctx, now: opts.now })
  }
  // A reorged-out send may have been a referral's qualifying send — revert any
  // unlock/retained whose qualifying send is now gone (P1b), then re-score them.
  const reverted = await reconcileReferralStages(ctx.seasonId)
  for (const w of reverted) {
    await recomputeWallet(w, ctx.seasonId, { now: opts.now, skipProjection: true })
    affected.add(w)
  }
  return affected
}

/**
 * Live consumer hook for reorg removals (webhook log.removed). A transfer
 * deleted from onchain.transfer must also drop its derived score_event rows, or
 * the reorged-out send keeps earning and the score stops being a faithful
 * projection of the chain. Guarded + best-effort like onTransfersIngested.
 */
export async function onTransfersReorged(transferIds: string[]): Promise<void> {
  if (!isSeason1Enabled() || transferIds.length === 0) return
  try {
    const ctx = await buildContext()
    await reprojectAfterReorg(transferIds, ctx)
  } catch (err) {
    logger.warn('[season1] reorg hook failed (non-blocking): %o', err)
  }
}
