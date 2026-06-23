/**
 * #season/definitions — the ONE shared definition of "active", MAW, retained,
 * and distinct verified counterparties.
 *
 * The dashboard (Phase B) and the grant report BOTH import this module — there
 * is never a second definition. If the number on the dashboard and the number
 * in the grant report ever disagree, it's a bug here, not a difference of
 * opinion. Everything is derived from onchain.transfer (the source of truth)
 * under the verified-counterparty floor, so these hold even before the score
 * projector has run.
 *
 * "Verified counterparty" (spec §2) — Phase A floor only:
 *   phone-verified + wallet-linked via phone_registry, excluding the Sippy
 *   spender and event operator wallets, and excluding self.
 * The full sybil graph (same phone/device/IP/funding cluster, vendor lists,
 * circular/star detection) is Phase C. The SEAM is `verifiedWalletCte()` +
 * the `flag_reason` column on score_event — tighten there, not by forking a
 * second definition.
 *
 * Value-out (spec §2): a send OR off-ramp of ≥ $minActiveUsd to a verified
 * counterparty. Receiving alone, or depositing alone, does NOT count as active.
 * (Off-ramp isn't emitted as on-chain transfer volume in Phase A, so in
 * practice this resolves to verified Sippy→Sippy sends today — see the backfill
 * sanity-check note.)
 */

import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { query as _query } from '#services/db'
import { loadParams } from '#season/params'

const SPENDER_ADDRESS = (env.get('SIPPY_SPENDER_ADDRESS', '') || '').toLowerCase().trim()
const USDC_DECIMALS = 6

// DI seam (mirrors invite.service.ts).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

export interface Period {
  start: number // unix seconds, inclusive
  end: number // unix seconds, exclusive
}

/** Trailing window of `days` ending at `now` (unix seconds). */
export function trailing(days: number, now: number): Period {
  return { start: now - days * 86_400, end: now }
}

/**
 * SQL CTE defining the verified-wallet set = phone-linked wallets MINUS operator
 * float wallets. Emits a CTE `verified(addr)` of lowercased addresses; the
 * spender is excluded at each comparison site (so callers keep stable $N
 * numbering). This is the single seam for Phase C sybil tightening.
 *
 * Deliberately `phone_registry` ONLY — NOT `∪ wallet_aliases`. wallet_aliases is
 * a legacy, non-phone-linked attribution set (public_stats / analytics use it to
 * answer "is this address ours?"). The verified-counterparty floor is a
 * *personhood* gate (spec §2: phone-verified + wallet-linked), so non-phone
 * legacy/internal addresses must NOT count as verified — folding them in here
 * would WIDEN the sybil surface, not narrow it. Keep the two sets distinct: the
 * dashboard's "onboarded / volume" tiles may use the broad set, but "active /
 * MAW / distinct counterparties" use this strict floor.
 *
 * Phase C adds two more exclusions at this seam: exchange-staff / vendor wallets
 * (resolve `special_accounts.getQuestExcludedPhones()` → wallets via
 * phone_registry — note those are PHONES today, not in event_operator_wallets)
 * and the graph rules (circular / star / cluster). Until then the floor is
 * operator-float + spender only.
 */
function verifiedWalletCte(): string {
  return `
    verified AS (
      SELECT LOWER(wallet_address) AS addr
        FROM phone_registry
       WHERE wallet_address IS NOT NULL
      EXCEPT
      SELECT LOWER(wallet_address) AS addr
        FROM event_operator_wallets
    )
  `
}

/** Raw-USDC-unit threshold for a qualifying value-out (e.g. $1 → 1_000_000). */
async function minRawUnits(): Promise<string> {
  const params = await loadParams()
  return BigInt(Math.round(params.minActiveUsd * 10 ** USDC_DECIMALS)).toString()
}

/**
 * Active in a period: ≥1 qualifying value-out (send/off-ramp ≥ $1 to a
 * verified counterparty) with this wallet as the sender, within [start, end).
 */
export async function isActive(wallet: string, period: Period): Promise<boolean> {
  const w = wallet.toLowerCase()
  const minRaw = await minRawUnits()
  const res = await deps.query<{ active: boolean }>(
    `WITH ${verifiedWalletCte()}
     SELECT EXISTS (
       SELECT 1 FROM onchain.transfer t
        WHERE LOWER(t."from") = $1
          AND t.timestamp >= $2 AND t.timestamp < $3
          AND t.amount >= $4::numeric
          AND LOWER(t."to") IN (SELECT addr FROM verified)
          AND LOWER(t."to") <> $5
          AND LOWER(t."to") <> $1
     ) AS active`,
    [w, period.start, period.end, minRaw, SPENDER_ADDRESS]
  )
  return res.rows[0]?.active === true
}

/**
 * MAW — distinct verified Sippy wallets that performed ≥1 qualifying value-out
 * in the period. Defaults to the trailing 30 days (the grant KPI). The sender
 * must itself be a verified wallet, so an external depositor paying into a
 * Sippy wallet is never miscounted as "active".
 */
export async function maw(period: Period): Promise<number> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ maw: string }>(
    `WITH ${verifiedWalletCte()}
     SELECT COUNT(DISTINCT LOWER(t."from")) AS maw
       FROM onchain.transfer t
      WHERE t.timestamp >= $1 AND t.timestamp < $2
        AND t.amount >= $3::numeric
        AND LOWER(t."from") IN (SELECT addr FROM verified)
        AND LOWER(t."to")   IN (SELECT addr FROM verified)
        AND LOWER(t."to") <> $4
        AND LOWER(t."from") <> LOWER(t."to")`,
    [period.start, period.end, minRaw, SPENDER_ADDRESS]
  )
  return Number(res.rows[0]?.maw ?? 0)
}

/** Convenience: MAW over the trailing 30 days from `now`. */
export function maw30(now: number): Promise<number> {
  return maw(trailing(30, now))
}

/**
 * Retained: active in TWO consecutive 30-day periods ending at `now`
 * — i.e. active in [now-60d, now-30d) AND in [now-30d, now).
 */
export async function isRetained(wallet: string, now: number): Promise<boolean> {
  const prev = { start: now - 60 * 86_400, end: now - 30 * 86_400 }
  const curr = trailing(30, now)
  const [a, b] = await Promise.all([isActive(wallet, prev), isActive(wallet, curr)])
  return a && b
}

/**
 * Distinct verified counterparties this wallet has sent ≥ $1 to (network
 * reach / breadth). All-time within the season — drives the Regular tier gate.
 */
export async function distinctVerifiedCounterparties(wallet: string): Promise<number> {
  const w = wallet.toLowerCase()
  const minRaw = await minRawUnits()
  const res = await deps.query<{ n: string }>(
    `WITH ${verifiedWalletCte()}
     SELECT COUNT(DISTINCT LOWER(t."to")) AS n
       FROM onchain.transfer t
      WHERE LOWER(t."from") = $1
        AND t.amount >= $2::numeric
        AND LOWER(t."to") IN (SELECT addr FROM verified)
        AND LOWER(t."to") <> $3
        AND LOWER(t."to") <> $1`,
    [w, minRaw, SPENDER_ADDRESS]
  )
  return Number(res.rows[0]?.n ?? 0)
}

// ── Network-wide aggregates (Phase B dashboard) ──────────────────────────────
//
// The per-wallet definitions above answer "is THIS wallet active / retained /
// how many counterparties". The dashboard needs the network rollups, and the
// load-bearing rule (audit) is that they live HERE, beside the per-wallet
// definitions and over the SAME verified floor — never re-derived in the
// controller. The grant report and the dashboard both import these, so a single
// edit to verifiedWalletCte() moves every number in lockstep.

/**
 * Transacted volume (hero) — total verified VALUE-OUT in raw USDC units, i.e.
 * SUM(amount) over the exact predicate `maw` counts the senders of: a verified
 * Sippy wallet sending ≥ $minActiveUsd to a verified counterparty (excluding the
 * spender and self). This is the un-blend: deposits/receives are NOT in it.
 *
 * Off-ramp value-out isn't emitted on-chain in Phase A, so today this resolves
 * to verified Sippy→Sippy sends — the same scope as `maw`/`isActive`. With no
 * `period` it's all-time (cumulative value moved), which is the grant figure;
 * pass a period to window it. Returned as a raw-units string (NUMERIC(78,0)
 * precision preserved) for the web layer to divide by 10^6.
 */
export async function transactedVolume(period?: Period): Promise<string> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ total: string }>(
    `WITH ${verifiedWalletCte()}
     SELECT COALESCE(SUM(t.amount), 0)::text AS total
       FROM onchain.transfer t
      WHERE t.amount >= $1::numeric
        AND LOWER(t."from") IN (SELECT addr FROM verified)
        AND LOWER(t."to")   IN (SELECT addr FROM verified)
        AND LOWER(t."to") <> $2
        AND LOWER(t."from") <> LOWER(t."to")
        ${period ? 'AND t.timestamp >= $3 AND t.timestamp < $4' : ''}`,
    period ? [minRaw, SPENDER_ADDRESS, period.start, period.end] : [minRaw, SPENDER_ADDRESS]
  )
  return res.rows[0]?.total ?? '0'
}

/**
 * Network retention — the aggregate of `isRetained`: how many verified wallets
 * were active (≥1 qualifying value-out) in BOTH the previous and the current
 * trailing-30d windows, plus that count over the previous-window active base as
 * a percentage. Same two windows `isRetained(wallet, now)` uses, computed once
 * for the whole network instead of per wallet.
 */
export async function retention(now: number): Promise<{ retained: number; retentionRate: number }> {
  const minRaw = await minRawUnits()
  const prevStart = now - 60 * 86_400
  const mid = now - 30 * 86_400
  const res = await deps.query<{ prev_active: string; retained: string }>(
    `WITH ${verifiedWalletCte()},
     prev AS (
       SELECT DISTINCT LOWER(t."from") AS w
         FROM onchain.transfer t
        WHERE t.timestamp >= $1 AND t.timestamp < $2
          AND t.amount >= $5::numeric
          AND LOWER(t."from") IN (SELECT addr FROM verified)
          AND LOWER(t."to")   IN (SELECT addr FROM verified)
          AND LOWER(t."to") <> $6
          AND LOWER(t."from") <> LOWER(t."to")
     ),
     curr AS (
       SELECT DISTINCT LOWER(t."from") AS w
         FROM onchain.transfer t
        WHERE t.timestamp >= $3 AND t.timestamp < $4
          AND t.amount >= $5::numeric
          AND LOWER(t."from") IN (SELECT addr FROM verified)
          AND LOWER(t."to")   IN (SELECT addr FROM verified)
          AND LOWER(t."to") <> $6
          AND LOWER(t."from") <> LOWER(t."to")
     )
     SELECT
       (SELECT COUNT(*) FROM prev) AS prev_active,
       (SELECT COUNT(*) FROM prev p WHERE EXISTS (SELECT 1 FROM curr c WHERE c.w = p.w)) AS retained`,
    [prevStart, mid, mid, now, minRaw, SPENDER_ADDRESS]
  )
  const prevActive = Number(res.rows[0]?.prev_active ?? 0)
  const retained = Number(res.rows[0]?.retained ?? 0)
  const retentionRate = prevActive > 0 ? Math.round((retained / prevActive) * 100) : 0
  return { retained, retentionRate }
}

/**
 * Distinct verified counterparties network-wide — the rollup of
 * `distinctVerifiedCounterparties`: the number of distinct directed
 * (sender → recipient) verified pairs that have moved ≥ $minActiveUsd all-time.
 * Equals the sum of every wallet's distinct-counterparty count, so it measures
 * real P2P breadth (the metric that's near-zero while Sippy is used as a ramp).
 */
export async function distinctCounterpartiesNetwork(): Promise<number> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ n: string }>(
    `WITH ${verifiedWalletCte()}
     SELECT COUNT(*) AS n FROM (
       SELECT DISTINCT LOWER(t."from") AS f, LOWER(t."to") AS tt
         FROM onchain.transfer t
        WHERE t.amount >= $1::numeric
          AND LOWER(t."from") IN (SELECT addr FROM verified)
          AND LOWER(t."to")   IN (SELECT addr FROM verified)
          AND LOWER(t."to") <> $2
          AND LOWER(t."from") <> LOWER(t."to")
     ) pairs`,
    [minRaw, SPENDER_ADDRESS]
  )
  return Number(res.rows[0]?.n ?? 0)
}

/**
 * Daily verified value-out for the trailing `days`, bucketed by UTC date. The
 * value-out series behind the dashboard chart — same predicate as
 * `transactedVolume`, so the chart can never drift back into blended movement.
 * Returns ascending rows of { date 'YYYY-MM-DD', volume (raw units), count }.
 */
export async function dailyTransactedVolume(
  days: number,
  now: number
): Promise<{ date: string; volume: string; count: number }[]> {
  const minRaw = await minRawUnits()
  const start = now - days * 86_400
  const res = await deps.query<{ date: string; volume: string; count: string }>(
    `WITH ${verifiedWalletCte()}
     SELECT
       to_char(to_timestamp(t.timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(t.amount), 0)::text AS volume,
       COUNT(*)::text AS count
       FROM onchain.transfer t
      WHERE t.timestamp >= $1
        AND t.amount >= $2::numeric
        AND LOWER(t."from") IN (SELECT addr FROM verified)
        AND LOWER(t."to")   IN (SELECT addr FROM verified)
        AND LOWER(t."to") <> $3
        AND LOWER(t."from") <> LOWER(t."to")
      GROUP BY 1
      ORDER BY 1 ASC`,
    [start, minRaw, SPENDER_ADDRESS]
  )
  return res.rows.map((r) => ({ date: r.date, volume: String(r.volume), count: Number(r.count) }))
}

/**
 * The verified-wallet set as a JS Set of lowercased addresses — used by the
 * score projector to decide, per transfer, whether a counterparty is verified
 * (and so whether a send/receive earns or is flagged). Uses the live `db`
 * handle (batch read, not the DI seam) to match onchain_writer's style.
 */
export async function getVerifiedWalletSet(): Promise<Set<string>> {
  const res = await db.rawQuery(`WITH ${verifiedWalletCte()} SELECT addr FROM verified`)
  const set = new Set<string>()
  for (const row of res.rows as { addr: string }[]) {
    if (row.addr && row.addr !== SPENDER_ADDRESS) set.add(row.addr)
  }
  return set
}

/** Lowercased Sippy spender address (excluded everywhere). Empty string if unset. */
export function getSpenderAddress(): string {
  return SPENDER_ADDRESS
}
