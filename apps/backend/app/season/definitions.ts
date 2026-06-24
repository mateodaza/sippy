/**
 * #season/definitions — TWO deliberately-separate definitions of usage. Read the
 * SPLIT note below before touching anything: re-merging them is the one mistake
 * this module exists to prevent.
 *
 * ── THE SPLIT (load-bearing — do not re-merge) ───────────────────────────────
 *
 * Smoke-testing the live dashboard against real prod data exposed why one
 * definition can't serve both jobs. Prod is an on-ramp → spend-out product, not
 * user-to-user P2P: verified→verified ("Sippy→Sippy") sends are ~$0, while
 * verified users send ~thousands OUT to non-Sippy recipients and off-ramps. A
 * strict "verified→verified" floor therefore zeroes the entire dashboard, even
 * though real verified users really moved real money. So:
 *
 *   • DASHBOARD / NETWORK aggregates (loose "value-out") — the believable proof
 *     number + the grant "transacted volume" KPI. Counts value moved OUT by a
 *     verified SENDER to ANYONE real (recipient NOT required to be verified; only
 *     the sender itself, the spender, and operator wallets are excluded). Built on
 *     a RELAY-AWARE source (`valueOutCtes()` → the `value_out` CTE): SpendPermission
 *     batches every embedded send into one tx of two USDC legs (user→spender, then
 *     spender→recipient), so the raw transfer table never holds a direct user→
 *     recipient row. The `logical_transfer` CTE collapses each relay pair back into
 *     one logical user→recipient send; off-ramp pulls (which resolve to recipient =
 *     spender) are added from offramp_orders. A naive "exclude any spender row"
 *     filter erased the entire core send path — this is the fix. Functions:
 *     transactedVolume, maw (→ maw30, the 7d active-this-week window, and the
 *     all-time activated count), retention, dailyTransactedVolume; the
 *     onchainTransactions KPI count reads the same `logical_transfer` source.
 *
 *   • SCORE-ENGINE per-wallet functions (strict "verified counterparty") — the
 *     sybil floor for the reputation engine. UNCHANGED, and must stay that way:
 *     a qualifying value-out still requires a VERIFIED recipient. Functions:
 *     isActive (imported by #season/referral promoteRetainedReferrals), isRetained,
 *     distinctVerifiedCounterparties (the Regular/Fiel-tier gate),
 *     getVerifiedWalletSet (the projector's per-transfer counterpartyVerified
 *     source). distinctCounterpartiesNetwork stays strict too — it is the P2P
 *     breadth metric, intentionally ~0 for a ramp product (its dashboard tile is
 *     dropped rather than loosened). All of #season/{projector,score,referral,
 *     recompute,onramp,emissions} read these strict definitions and must not move.
 *
 * "One definition for dashboard + grant" still holds: BOTH read the now-loose
 * dashboard functions, so a single edit moves every reported number in lockstep.
 * The score engine is simply its own, separate, stricter definition — never the
 * dashboard's. A guard test (season_definitions.spec) asserts the strict side
 * still requires a verified recipient, so the two can never silently re-merge.
 *
 * "Verified" floor (both sides) — Phase A: phone-verified + wallet-linked via
 * phone_registry, EXCEPT event operator wallets (and Phase C vendor/exchange
 * wallets); the Sippy spender and self are excluded at each comparison site. The
 * SEAM for Phase C sybil tightening is `verifiedWalletCte()` + the `flag_reason`
 * column on score_event — tighten there, not by forking a third definition.
 *
 * Everything is derived from onchain.transfer (the source of truth), so these
 * hold even before the score projector has run.
 */

import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { query as _query } from '#services/db'
import { loadParams } from '#season/params'
import { getQuestExcludedPhones } from '#utils/special_accounts'

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
 * Phase C (C2) adds vendor/exchange exclusion at this seam: exchange-staff / vendor
 * wallets, resolved from `special_accounts.getQuestExcludedPhones()` (env-driven
 * phones) → wallets via phone_registry. The graph rules (circular / star / cluster)
 * live in #season/sybil and reuse THIS CTE (exported) so the verified floor is
 * defined exactly once. The spender is still excluded at each comparison site.
 */
export async function excludedVendorAddrs(): Promise<string[]> {
  const phones = await getQuestExcludedPhones()
  if (phones.length === 0) return []
  // Match both canonical E.164 and legacy bare-digit phone_registry rows.
  const bare = phones.map((p) => p.replace(/^\+/, ''))
  const res = await deps.query<{ addr: string }>(
    `SELECT DISTINCT LOWER(wallet_address) AS addr
       FROM phone_registry
      WHERE wallet_address IS NOT NULL
        AND (phone_number = ANY($1::text[]) OR phone_number = ANY($2::text[]))`,
    [phones, bare]
  )
  // Format-validate so the addresses are safe to inline as SQL literals below.
  return res.rows.map((r) => r.addr).filter((a) => /^0x[0-9a-f]{40}$/.test(a))
}

/**
 * The verified-wallet CTE, async because the Phase C vendor exclusion resolves
 * env-driven exchange/vendor phones → wallets. Returns SQL `verified(addr)` for
 * embedding in `WITH ${await verifiedWalletCte()} ...`. When no vendor phones are
 * configured (the default), this degrades to the exact Phase A floor (phone_registry
 * MINUS operator wallets), so existing behaviour and numbers are unchanged.
 */
export async function verifiedWalletCte(): Promise<string> {
  const vendors = await excludedVendorAddrs()
  const vendorExcept = vendors.length
    ? `EXCEPT
      SELECT addr FROM (VALUES ${vendors.map((a) => `('${a}')`).join(', ')}) AS vendor(addr)`
    : ''
  return `
    verified AS (
      SELECT LOWER(wallet_address) AS addr
        FROM phone_registry
       WHERE wallet_address IS NOT NULL
      EXCEPT
      SELECT LOWER(wallet_address) AS addr
        FROM event_operator_wallets
      ${vendorExcept}
    )
  `
}

/**
 * The NORMALIZED logical on-chain transfer source — the crux of the relay-aware
 * dashboard, and the load-bearing fix. SpendPermission batches every embedded
 * send into ONE tx that emits TWO USDC Transfer logs — user→spender (the pull)
 * then spender→recipient (the forward), SAME tx_hash and SAME amount (see
 * embedded_wallet.service). onchain.transfer stores those legs as separate rows,
 * so a naive "exclude any spender row" filter erases the entire core send path.
 *
 * This sync helper emits `operator_addrs(addr)` PLUS a `logical_transfer(sender,
 * recipient, amount, tx_hash, ts, id)` CTE (sender/recipient lowercased) that:
 *   • COLLAPSES each relay pair (user→spender JOIN spender→recipient on tx_hash +
 *     amount) back into a single logical user→recipient send, keyed by the user
 *     leg's id; and
 *   • passes through genuinely DIRECT transfers (no spender leg) untouched —
 *     inflows, P2P, direct-mode sends.
 * Off-ramp pulls resolve to recipient = spender (the spend forwards to the spender
 * itself) and are dropped here (relay branch excludes `s.to = spender`); they are
 * added back from offramp_orders in `value_out`.
 *
 * The spender is bound as `$1` at EVERY call site — all consumers MUST pass it
 * first. Operator exclusion and the verified/min-amount filters are applied by
 * each consumer downstream (so the same CTE serves the loose value-out, the
 * transaction count, and the public feed).
 */
function logicalTransferCteSql(): string {
  return `operator_addrs AS (
      SELECT LOWER(wallet_address) AS addr
        FROM event_operator_wallets
       WHERE wallet_address IS NOT NULL
    ),
    logical_transfer AS (
      SELECT LOWER(u."from") AS sender, LOWER(s."to") AS recipient, u.amount AS amount,
             u.tx_hash AS tx_hash, u.timestamp AS ts, u.id AS id
        FROM onchain.transfer u
        JOIN onchain.transfer s
          ON s.tx_hash = u.tx_hash AND s.amount = u.amount AND s.id <> u.id
         AND LOWER(s."from") = $1 AND LOWER(s."to") <> $1
       WHERE LOWER(u."to") = $1 AND LOWER(u."from") <> $1
      UNION ALL
      SELECT LOWER(t."from"), LOWER(t."to"), t.amount, t.tx_hash, t.timestamp, t.id
        FROM onchain.transfer t
       WHERE LOWER(t."from") <> $1 AND LOWER(t."to") <> $1
    )`
}

/**
 * Shared CTE chain for the LOOSE dashboard VALUE-OUT metrics. Builds `verified`
 * (sender floor) + `operator_addrs` + `logical_transfer` (above) + a
 * `value_out(wallet, usd_raw, ts)` CTE that is the SINGLE source every
 * value-movement rollup reads, so transactedVolume / maw / retention / daily can
 * never drift apart. `value_out` =
 *   (a) on-chain: a VERIFIED sender moved ≥ $minActiveUsd OUT via a logical
 *       transfer to a real recipient (not self / spender / operator — the
 *       recipient need NOT be verified, that is the loosening); PLUS
 *   (b) off-ramps: a verified wallet's COMPLETED cash-out (offramp_orders, USDC
 *       pulled), whose on-chain user→spender leg the relay collapse can't pair.
 *
 * Binds `$1` = spender, `$2` = minRaw (raw USDC units). Consumers continue at $3.
 */
async function valueOutCtes(): Promise<string> {
  return `${await verifiedWalletCte()},
    ${logicalTransferCteSql()},
    value_out AS (
      SELECT lt.sender AS wallet, lt.amount AS usd_raw, lt.ts AS ts
        FROM logical_transfer lt
       WHERE lt.amount >= $2::numeric
         AND lt.sender IN (SELECT addr FROM verified)
         AND lt.recipient <> lt.sender
         AND lt.recipient <> $1
         AND lt.recipient NOT IN (SELECT addr FROM operator_addrs)
      UNION ALL
      SELECT LOWER(pr.wallet_address) AS wallet,
             ROUND(o.amount_usdc * 1000000) AS usd_raw, -- dollars(6dp) → integer raw units
             EXTRACT(EPOCH FROM o.updated_at)::bigint AS ts
        FROM offramp_orders o
        JOIN phone_registry pr
          ON (pr.phone_number = o.phone_number OR pr.phone_number = LTRIM(o.phone_number, '+'))
       WHERE o.status = 'completed' AND o.pull_tx_hash IS NOT NULL
         AND (o.amount_usdc * 1000000) >= $2::numeric
         AND LOWER(pr.wallet_address) IN (SELECT addr FROM verified)
    )`
}

/**
 * The relay-aware logical-transfer CTE for callers OUTSIDE the value-out metrics
 * (the public feed + the onchain-transactions KPI count). Same `logical_transfer`
 * source as the dashboard, WITHOUT the verified/value_out gating — it mirrors the
 * public chain (relay legs collapsed) rather than the value-out set. Spender = $1.
 */
export function logicalTransfersFeedCte(): string {
  return logicalTransferCteSql()
}

/** Raw-USDC-unit threshold for a qualifying value-out (e.g. $1 → 1_000_000). */
async function minRawUnits(): Promise<string> {
  const params = await loadParams()
  return BigInt(Math.round(params.minActiveUsd * 10 ** USDC_DECIMALS)).toString()
}

/**
 * STRICT (score engine — do NOT loosen). Active in a period: ≥1 qualifying
 * value-out (send/off-ramp ≥ $1 to a VERIFIED counterparty) with this wallet as
 * the sender, within [start, end). Imported by #season/referral
 * (promoteRetainedReferrals); the verified-recipient requirement is the sybil
 * floor for retention/scoring. This is the per-wallet sibling of the dashboard's
 * loose `maw` — the two intentionally disagree (see the SPLIT note up top).
 */
export async function isActive(wallet: string, period: Period): Promise<boolean> {
  const w = wallet.toLowerCase()
  const minRaw = await minRawUnits()
  const res = await deps.query<{ active: boolean }>(
    `WITH ${await verifiedWalletCte()}
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
 * STRICT + RELAY-AWARE active check (score engine). Same sybil floor as `isActive`
 * — a qualifying value-out (≥ $minActiveUsd) to a VERIFIED counterparty (not self /
 * spender / operator) — but it reads the relay-collapsed `logical_transfer` source
 * instead of raw onchain.transfer, so a send routed through the spender
 * (user→spender→recipient) counts for the real recipient. `isActive` stays raw and
 * relay-BLIND on purpose (the SPLIT-guard + stats-polish specs pin that), so this is
 * a separate sibling rather than a change to it. Used by #season/referral
 * promoteRetainedReferrals, where missing a relayed send would wrongly drop a still-
 * active referee from retention. NOT a dashboard loosening: the verified-RECIPIENT
 * requirement is kept (that is what keeps it strict), only the relay blindness is fixed.
 */
export async function isActiveLogical(wallet: string, period: Period): Promise<boolean> {
  const w = wallet.toLowerCase()
  const minRaw = await minRawUnits()
  const res = await deps.query<{ active: boolean }>(
    `WITH ${await verifiedWalletCte()},
     ${logicalTransferCteSql()}
     SELECT EXISTS (
       SELECT 1 FROM logical_transfer lt
        WHERE lt.sender = $2
          AND lt.ts >= $3 AND lt.ts < $4
          AND lt.amount >= $5::numeric
          AND lt.recipient IN (SELECT addr FROM verified)
          AND lt.recipient <> $1
          AND lt.recipient <> lt.sender
     ) AS active`,
    [SPENDER_ADDRESS, w, period.start, period.end, minRaw]
  )
  return res.rows[0]?.active === true
}

/**
 * MAW (LOOSE dashboard aggregate — value-out). Distinct verified Sippy wallets
 * that moved ≥ $minActiveUsd OUT in the period (a relay-collapsed send to a real
 * recipient, or a completed off-ramp). Defaults to the trailing 30 days (the
 * grant KPI). The un-strict twin of `isActive`: on a ramp product where users
 * spend OUT to non-Sippy recipients, this is > 0 while the strict verified→
 * verified count is ~0. Reads the shared `value_out` source. See the SPLIT note.
 */
export async function maw(period: Period): Promise<number> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ maw: string }>(
    `WITH ${await valueOutCtes()}
     SELECT COUNT(DISTINCT wallet) AS maw
       FROM value_out
      WHERE ts >= $3 AND ts < $4`,
    [SPENDER_ADDRESS, minRaw, period.start, period.end]
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
 * STRICT (score engine — do NOT loosen). Distinct VERIFIED counterparties this
 * wallet has sent ≥ $1 to (network reach / breadth). All-time within the season
 * — drives the Regular/Fiel tier gate, so the verified-recipient requirement is
 * the sybil floor and must stay.
 */
export async function distinctVerifiedCounterparties(wallet: string): Promise<number> {
  const w = wallet.toLowerCase()
  const minRaw = await minRawUnits()
  const res = await deps.query<{ n: string }>(
    `WITH ${await verifiedWalletCte()}
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
// definitions — never re-derived in the controller. Per the SPLIT note up top,
// the value-movement rollups (transactedVolume / maw / retention /
// dailyTransactedVolume) read the LOOSE, relay-aware value-out source (valueOutCtes → value_out),
// while distinctCounterpartiesNetwork stays on the STRICT verified floor because
// it measures P2P breadth. The dashboard and grant report both import these, so a
// single edit moves every reported number in lockstep.

/**
 * Transacted volume (hero — LOOSE dashboard aggregate). Total VALUE-OUT in raw
 * USDC units: SUM over the shared `value_out` source — a verified Sippy wallet
 * moving ≥ $minActiveUsd OUT via a relay-collapsed logical send to a real
 * recipient, plus completed off-ramps. This is the un-blend: deposits/receives
 * are NOT in it, and — unlike the strict score floor — the recipient does NOT have
 * to be a Sippy user. On a ramp product this is the believable proof number
 * (users really sending money out + cashing out), whereas verified→verified reads
 * ~$0.
 *
 * With no `period` it's all-time (cumulative value moved), which is the grant
 * figure; pass a period to window it. Returned as a raw-units string
 * (NUMERIC(78,0) precision preserved) for the web layer to divide by 10^6.
 */
export async function transactedVolume(period?: Period): Promise<string> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ total: string }>(
    `WITH ${await valueOutCtes()}
     SELECT COALESCE(SUM(usd_raw), 0)::text AS total
       FROM value_out
      ${period ? 'WHERE ts >= $3 AND ts < $4' : ''}`,
    period ? [SPENDER_ADDRESS, minRaw, period.start, period.end] : [SPENDER_ADDRESS, minRaw]
  )
  return res.rows[0]?.total ?? '0'
}

/**
 * Network retention (LOOSE dashboard aggregate). How many verified wallets moved
 * value OUT (≥1 qualifying value-out, loose recipient rule) in BOTH the previous
 * and the current trailing-30d windows, plus that count over the previous-window
 * active base as a percentage. Same two windows as the per-wallet `isRetained`,
 * but over the loose value-out predicate (so it tracks the loose `maw`, not the
 * strict score floor) and computed once for the whole network.
 */
export async function retention(now: number): Promise<{ retained: number; retentionRate: number }> {
  const minRaw = await minRawUnits()
  const prevStart = now - 60 * 86_400
  const mid = now - 30 * 86_400
  const res = await deps.query<{ prev_active: string; retained: string }>(
    `WITH ${await valueOutCtes()},
     prev AS (SELECT DISTINCT wallet AS w FROM value_out WHERE ts >= $3 AND ts < $4),
     curr AS (SELECT DISTINCT wallet AS w FROM value_out WHERE ts >= $4 AND ts < $5)
     SELECT
       (SELECT COUNT(*) FROM prev) AS prev_active,
       (SELECT COUNT(*) FROM prev p WHERE EXISTS (SELECT 1 FROM curr c WHERE c.w = p.w)) AS retained`,
    [SPENDER_ADDRESS, minRaw, prevStart, mid, now]
  )
  const prevActive = Number(res.rows[0]?.prev_active ?? 0)
  const retained = Number(res.rows[0]?.retained ?? 0)
  const retentionRate = prevActive > 0 ? Math.round((retained / prevActive) * 100) : 0
  return { retained, retentionRate }
}

/**
 * STRICT (P2P breadth — deliberately NOT loosened). Distinct verified
 * counterparties network-wide — the rollup of `distinctVerifiedCounterparties`:
 * the number of distinct directed (sender → recipient) VERIFIED pairs that have
 * moved ≥ $minActiveUsd all-time. It measures real Sippy↔Sippy breadth, which is
 * near-zero while Sippy is used as a ramp — so its dashboard tile is DROPPED
 * (hidden as a zero) rather than loosened into the value-out predicate. Kept here
 * (and kept strict) so the metric still exists for when P2P picks up.
 */
export async function distinctCounterpartiesNetwork(): Promise<number> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ n: string }>(
    `WITH ${await verifiedWalletCte()}
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
 * Daily value-out for the trailing `days`, bucketed by UTC date (LOOSE dashboard
 * aggregate). The series behind the dashboard chart — same loose value-out
 * predicate as `transactedVolume`, so the chart and the hero can never drift
 * apart. Returns ascending rows of { date 'YYYY-MM-DD', volume (raw units), count }.
 */
export async function dailyTransactedVolume(
  days: number,
  now: number
): Promise<{ date: string; volume: string; count: number }[]> {
  const minRaw = await minRawUnits()
  const start = now - days * 86_400
  const res = await deps.query<{ date: string; volume: string; count: string }>(
    `WITH ${await valueOutCtes()}
     SELECT
       to_char(to_timestamp(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(usd_raw), 0)::text AS volume,
       COUNT(*)::text AS count
       FROM value_out
      WHERE ts >= $3
      GROUP BY 1
      ORDER BY 1 ASC`,
    [SPENDER_ADDRESS, minRaw, start]
  )
  return res.rows.map((r) => ({ date: r.date, volume: String(r.volume), count: Number(r.count) }))
}

/**
 * Onchain transaction count (LOOSE dashboard aggregate — the grant "200–400
 * onchain transactions" KPI). Counts REAL Sippy transactions live from the
 * relay-aware `logical_transfer` source, consistent with the live feed: ONE count
 * per logical transaction (relay pairs collapsed to a single user→recipient), with
 * operator legs, self-transfers, and sub-$1 dust dropped. Deliberately NOT
 * verified-sender gated — like the feed it mirrors the public chain minus
 * plumbing, so it counts inflows + spend-outs + P2P, not just value-out. (Because
 * it includes inflows, the UI labels it "transfers/transactions", never "sends".)
 *
 * Completed off-ramps are DELIBERATELY NOT counted here (they ARE in the value-out
 * `value_out` source). The grant framing is that every counted transaction is
 * clickable through to Arbiscan FROM THE FEED, and an off-ramp's on-chain leg is a
 * user→spender pull collapsed away as plumbing — it has no user→recipient feed row.
 * So this count stays feed-consistent; off-ramps grow VOLUME, not the tx count.
 */
export async function onchainTransactionCount(): Promise<number> {
  const minRaw = await minRawUnits()
  const res = await deps.query<{ n: string }>(
    `WITH ${logicalTransferCteSql()}
     SELECT COUNT(*) AS n
       FROM logical_transfer lt
      WHERE lt.amount >= $2::numeric
        AND lt.sender <> lt.recipient
        AND lt.sender   NOT IN (SELECT addr FROM operator_addrs)
        AND lt.recipient NOT IN (SELECT addr FROM operator_addrs)`,
    [SPENDER_ADDRESS, minRaw]
  )
  return Number(res.rows[0]?.n ?? 0)
}

/**
 * The verified-wallet set as a JS Set of lowercased addresses — used by the
 * score projector to decide, per transfer, whether a counterparty is verified
 * (and so whether a send/receive earns or is flagged). Uses the live `db`
 * handle (batch read, not the DI seam) to match onchain_writer's style.
 */
export async function getVerifiedWalletSet(): Promise<Set<string>> {
  const res = await db.rawQuery(`WITH ${await verifiedWalletCte()} SELECT addr FROM verified`)
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
