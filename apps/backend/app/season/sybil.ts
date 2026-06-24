/**
 * #season/sybil — the C2 anti-sybil graph engine.
 *
 * Graph rules over onchain.transfer (restricted to the verified floor — the SAME
 * exported verifiedWalletCte() the rest of the season uses, so vendor/operator/
 * spender exclusion is defined once) → write season.flag + zero the offending
 * score_events (flagged-not-deleted) + void any referral on the flagged pair.
 *
 * Rules (LENIENT launch defaults + a review queue — open decision #2; tighten on
 * data once false positives on real families/shared-device cases are measured):
 *   • circular   — A→B and B→A both exist (wash/ping-pong). Zero both sends.
 *   • roundtrip  — a circular pair whose return leg lands within ROUNDTRIP_WINDOW
 *                  (an immediate bounce — a stronger signal; the sends are already
 *                  zeroed by the circular rule, so this just adds the flag).
 *   • star       — one funder seeding ≥ STAR_MIN_RECIPIENTS sole-funded wallets
 *                  (a funnel). Zero the funder→recipient sends.
 *   • cluster    — a 3-cycle A→B→C→A. Zero the cyclic sends.
 *
 * Privacy + data-source boundary (spec §5): existing signals only — NO new raw
 * identifiers. Velocity/device caps reuse the existing invite daily-limit + the
 * funding-graph star rule; per-device/IP is deliberately NOT persisted here because
 * the schema carries no device/IP and the privacy rule forbids storing raw ones.
 * season.flag.detail carries only MASKED addresses + counts — never a phone/IP.
 *
 * Idempotent: UNIQUE(season_id, subject, kind) + ON CONFLICT, and zeroing/voiding
 * set flags rather than deleting, so a re-scan never duplicates or double-acts.
 * Bounded: each detector caps candidates at MAX_CANDIDATES and logs if it truncates
 * (no silent caps).
 */

import logger from '@adonisjs/core/services/logger'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'
import { verifiedWalletCte } from '#season/definitions'
import { voidReferral } from '#season/referral'

const ROUNDTRIP_WINDOW_SECS = 3600 // an A→B→A bounce within 1h is "immediate"
const STAR_MIN_RECIPIENTS = 5 // one funder seeding ≥5 sole-funded wallets = funnel
const MAX_CANDIDATES = 500 // per-detector bound; truncation is logged

// DI seam (mirrors the other #season modules).
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

/** Mask an address for flag.detail (subject keeps the full address; detail never does). */
function mask(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

export interface SybilScanResult {
  flags: number
  eventsZeroed: number
  referralsVoided: number
  walletsAffected: string[]
}

/**
 * Upsert a flag. ON CONFLICT only refreshes detail/updated_at while the flag is
 * still 'open' — an admin's confirm/cleared decision (and its reviewed_by/at) is
 * never clobbered by a re-scan. Returns 1 if a row was inserted/refreshed.
 */
async function upsertFlag(
  seasonId: string,
  subject: string,
  kind: string,
  detail: Record<string, unknown>
): Promise<number> {
  const res = await deps.query(
    `INSERT INTO season.flag (season_id, subject, kind, status, detail)
     VALUES ($1, $2, $3, 'open', $4::jsonb)
     ON CONFLICT (season_id, subject, kind) DO UPDATE
       SET detail = EXCLUDED.detail, updated_at = NOW()
     WHERE season.flag.status = 'open'`,
    [seasonId, subject, kind, JSON.stringify(detail)]
  )
  return res.rowCount ?? 0
}

/** Zero a directed send edge: flag send events wallet=from, counterparty=to. */
async function flagSendEdge(
  seasonId: string,
  from: string,
  to: string,
  reason: string
): Promise<number> {
  const res = await deps.query(
    `UPDATE season.score_event
        SET flagged = true, flag_reason = $4
      WHERE season_id = $1 AND verb IN ('send', 'new_counterparty')
        AND wallet = $2 AND counterparty = $3 AND flagged = false`,
    [seasonId, from, to, reason]
  )
  return res.rowCount ?? 0
}

/**
 * Run all graph detectors for the season. Returns counts + the affected wallet set
 * (so the caller recomputes their scores — a zeroed send / voided referral changes
 * the score). Idempotent; safe to run every season-job pass.
 */
export async function runSybilScan(seasonId: string = ACTIVE_SEASON_ID): Promise<SybilScanResult> {
  const cte = await verifiedWalletCte()
  const affected = new Set<string>()
  let flags = 0
  let eventsZeroed = 0
  let referralsVoided = 0

  // Flags an admin has CLEARED (false positives) — never re-enforce them (P2). The
  // set is keyed `${kind}:${subject}`; a candidate matching one is skipped entirely.
  const cleared = new Set<string>()
  const clearedRows = await deps.query<{ subject: string; kind: string }>(
    `SELECT subject, kind FROM season.flag WHERE season_id = $1 AND status = 'cleared'`,
    [seasonId]
  )
  for (const r of clearedRows.rows) cleared.add(`${r.kind}:${r.subject}`)

  const act = async (a: string, b: string, reason: string) => {
    eventsZeroed += await flagSendEdge(seasonId, a, b, reason)
    eventsZeroed += await flagSendEdge(seasonId, b, a, reason)
    affected.add(a)
    affected.add(b)
    for (const w of [a, b]) {
      const voided = await voidReferral(seasonId, w, reason)
      if (voided.length) {
        referralsVoided += 1
        voided.forEach((x) => affected.add(x.toLowerCase()))
      }
    }
  }

  // ── circular: A↔B (both directions exist) ──────────────────────────────────
  const circular = await deps.query<{ a: string; b: string }>(
    `WITH ${cte}
     SELECT DISTINCT LEAST(LOWER(t1."from"), LOWER(t1."to")) AS a,
                     GREATEST(LOWER(t1."from"), LOWER(t1."to")) AS b
       FROM onchain.transfer t1
       JOIN onchain.transfer t2
         ON LOWER(t2."from") = LOWER(t1."to") AND LOWER(t2."to") = LOWER(t1."from")
      WHERE LOWER(t1."from") IN (SELECT addr FROM verified)
        AND LOWER(t1."to")   IN (SELECT addr FROM verified)
        AND LOWER(t1."from") <> LOWER(t1."to")
      LIMIT ${MAX_CANDIDATES + 1}`
  )
  if (circular.rows.length > MAX_CANDIDATES) {
    logger.warn('[season1] sybil circular hit MAX_CANDIDATES=%d — truncated', MAX_CANDIDATES)
  }
  for (const r of circular.rows.slice(0, MAX_CANDIDATES)) {
    if (cleared.has(`circular:${r.a}:${r.b}`)) continue
    flags += await upsertFlag(seasonId, `${r.a}:${r.b}`, 'circular', {
      a: mask(r.a),
      b: mask(r.b),
    })
    await act(r.a, r.b, 'sybil_circular')
  }

  // ── roundtrip: a circular pair bouncing back within the window (extra signal) ─
  const roundtrip = await deps.query<{ a: string; b: string }>(
    `WITH ${cte}
     SELECT DISTINCT LEAST(LOWER(t1."from"), LOWER(t1."to")) AS a,
                     GREATEST(LOWER(t1."from"), LOWER(t1."to")) AS b
       FROM onchain.transfer t1
       JOIN onchain.transfer t2
         ON LOWER(t2."from") = LOWER(t1."to") AND LOWER(t2."to") = LOWER(t1."from")
        AND t2.timestamp >= t1.timestamp
        AND t2.timestamp - t1.timestamp <= ${ROUNDTRIP_WINDOW_SECS}
      WHERE LOWER(t1."from") IN (SELECT addr FROM verified)
        AND LOWER(t1."to")   IN (SELECT addr FROM verified)
        AND LOWER(t1."from") <> LOWER(t1."to")
      LIMIT ${MAX_CANDIDATES + 1}`
  )
  if (roundtrip.rows.length > MAX_CANDIDATES) {
    logger.warn('[season1] sybil roundtrip hit MAX_CANDIDATES=%d — truncated', MAX_CANDIDATES)
  }
  for (const r of roundtrip.rows.slice(0, MAX_CANDIDATES)) {
    if (cleared.has(`roundtrip:${r.a}:${r.b}`)) continue
    flags += await upsertFlag(seasonId, `${r.a}:${r.b}`, 'roundtrip', {
      a: mask(r.a),
      b: mask(r.b),
      withinSecs: ROUNDTRIP_WINDOW_SECS,
    })
    // sends already zeroed by the circular pass; keep the affected set consistent.
    affected.add(r.a)
    affected.add(r.b)
  }

  // ── star: one funder → ≥N sole-funded recipients (funnel) ───────────────────
  const star = await deps.query<{ funder: string; recipients: string[] }>(
    `WITH ${cte},
     edges AS (
       SELECT DISTINCT LOWER(t."from") AS funder, LOWER(t."to") AS recipient
         FROM onchain.transfer t
        WHERE LOWER(t."from") IN (SELECT addr FROM verified)
          AND LOWER(t."to")   IN (SELECT addr FROM verified)
          AND LOWER(t."from") <> LOWER(t."to")
     ),
     sole AS (
       SELECT recipient, MIN(funder) AS funder
         FROM edges GROUP BY recipient HAVING COUNT(*) = 1
     )
     SELECT funder, array_agg(recipient) AS recipients
       FROM sole GROUP BY funder HAVING COUNT(*) >= ${STAR_MIN_RECIPIENTS}
      LIMIT ${MAX_CANDIDATES + 1}`
  )
  if (star.rows.length > MAX_CANDIDATES) {
    logger.warn('[season1] sybil star hit MAX_CANDIDATES=%d — truncated', MAX_CANDIDATES)
  }
  for (const r of star.rows.slice(0, MAX_CANDIDATES)) {
    if (cleared.has(`star:${r.funder}`)) continue
    flags += await upsertFlag(seasonId, r.funder, 'star', {
      funder: mask(r.funder),
      fanout: r.recipients.length,
    })
    affected.add(r.funder)
    for (const recipient of r.recipients) {
      eventsZeroed += await flagSendEdge(seasonId, r.funder, recipient, 'sybil_star')
      affected.add(recipient)
      const voided = await voidReferral(seasonId, recipient, 'sybil_star')
      if (voided.length) {
        referralsVoided += 1
        voided.forEach((x) => affected.add(x.toLowerCase()))
      }
    }
  }

  // ── cluster: a 3-cycle A→B→C→A ──────────────────────────────────────────────
  const cluster = await deps.query<{ a: string; b: string; c: string }>(
    `WITH ${cte}
     SELECT DISTINCT s[1] AS a, s[2] AS b, s[3] AS c FROM (
       SELECT (
         SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[
           LOWER(t1."from"), LOWER(t1."to"), LOWER(t2."to")
         ]) AS x
       ) AS s
         FROM onchain.transfer t1
         JOIN onchain.transfer t2 ON LOWER(t2."from") = LOWER(t1."to")
         JOIN onchain.transfer t3
           ON LOWER(t3."from") = LOWER(t2."to") AND LOWER(t3."to") = LOWER(t1."from")
        WHERE LOWER(t1."from") <> LOWER(t1."to")
          AND LOWER(t1."to")   <> LOWER(t2."to")
          AND LOWER(t2."to")   <> LOWER(t1."from")
          AND LOWER(t1."from") IN (SELECT addr FROM verified)
          AND LOWER(t1."to")   IN (SELECT addr FROM verified)
          AND LOWER(t2."to")   IN (SELECT addr FROM verified)
     ) cyc
      LIMIT ${MAX_CANDIDATES + 1}`
  )
  if (cluster.rows.length > MAX_CANDIDATES) {
    logger.warn('[season1] sybil cluster hit MAX_CANDIDATES=%d — truncated', MAX_CANDIDATES)
  }
  for (const r of cluster.rows.slice(0, MAX_CANDIDATES)) {
    if (cleared.has(`cluster:${r.a}:${r.b}:${r.c}`)) continue
    flags += await upsertFlag(seasonId, `${r.a}:${r.b}:${r.c}`, 'cluster', {
      members: [mask(r.a), mask(r.b), mask(r.c)],
    })
    // Zero every directed send among the three (any direction that exists).
    for (const [x, y] of [
      [r.a, r.b],
      [r.b, r.c],
      [r.c, r.a],
      [r.b, r.a],
      [r.c, r.b],
      [r.a, r.c],
    ]) {
      eventsZeroed += await flagSendEdge(seasonId, x, y, 'sybil_cluster')
    }
    for (const w of [r.a, r.b, r.c]) {
      affected.add(w)
      const voided = await voidReferral(seasonId, w, 'sybil_cluster')
      if (voided.length) {
        referralsVoided += 1
        voided.forEach((x) => affected.add(x.toLowerCase()))
      }
    }
  }

  return {
    flags,
    eventsZeroed,
    referralsVoided,
    walletsAffected: Array.from(affected),
  }
}
