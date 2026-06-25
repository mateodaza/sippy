/**
 * #season/flags — the admin review-queue operations over season.flag.
 *
 * Thin, testable DB layer the admin moderation endpoints call. A flag moves
 * open → confirmed | cleared; confirm/clear stamp reviewed_at + reviewed_by so the
 * decision is auditable (who + when). Confirmed flags withhold (future) redeemable
 * perks but NEVER block a normal send (spec §5). Nothing here ever exposes raw PII —
 * detail is written masked by #season/sybil and returned as-is.
 */

import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'

let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

export interface FlagRow {
  id: number
  season_id: string
  subject: string
  kind: string
  status: string
  detail: Record<string, unknown>
  created_at: string
  updated_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export type ReviewStatus = 'confirmed' | 'cleared'

/** List flags for a season, optionally filtered by status, newest first. */
export async function listFlags(
  status?: string,
  seasonId: string = ACTIVE_SEASON_ID,
  limit = 200
): Promise<FlagRow[]> {
  const res = status
    ? await deps.query<FlagRow>(
        `SELECT * FROM season.flag WHERE season_id = $1 AND status = $2
          ORDER BY created_at DESC LIMIT $3`,
        [seasonId, status, limit]
      )
    : await deps.query<FlagRow>(
        `SELECT * FROM season.flag WHERE season_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [seasonId, limit]
      )
  return res.rows
}

export interface ReviewResult {
  flag: FlagRow
  /** Wallets whose enforcement changed (cleared flags only) — caller must recompute. */
  affectedWallets: string[]
}

/**
 * Lift sybil enforcement for a cleared flag (P2): un-flag the offending send rows
 * and un-void any referral on the subject's wallets, so a recompute restores the
 * suppressed points. The next scan won't re-enforce (it skips cleared flags) UNLESS
 * a different open flag still covers the same edges, in which case that flag re-voids
 * — correct convergence. Returns the wallets to recompute.
 */
async function liftSybilEnforcement(
  seasonId: string,
  subject: string,
  kind: string
): Promise<string[]> {
  const parts = subject.split(':')
  const affected = new Set<string>(parts)

  // Un-flag the sends this flag suppressed. A star's offending sends are funder→*
  // (recipients aren't in the subject); pair/cluster sends are between subject members.
  const unflagged =
    kind === 'star'
      ? await deps.query<{ wallet: string; counterparty: string }>(
          `UPDATE season.score_event SET flagged = false, flag_reason = NULL
            WHERE season_id = $1 AND verb = 'send' AND wallet = $2 AND flag_reason LIKE 'sybil%'
            RETURNING wallet, counterparty`,
          [seasonId, parts[0]]
        )
      : await deps.query<{ wallet: string; counterparty: string }>(
          `UPDATE season.score_event SET flagged = false, flag_reason = NULL
            WHERE season_id = $1 AND verb = 'send' AND flag_reason LIKE 'sybil%'
              AND wallet = ANY($2::text[]) AND counterparty = ANY($2::text[])
            RETURNING wallet, counterparty`,
          [seasonId, parts]
        )
  for (const r of unflagged.rows) {
    affected.add(r.wallet)
    affected.add(r.counterparty)
  }

  // Un-void referrals on the subject's wallets so they can re-unlock (a still-open
  // flag will re-void on the next scan). Recompute then re-evaluates the stage.
  await deps.query(
    `UPDATE season.referral SET stage = 'pending', updated_at = NOW()
      WHERE season_id = $1 AND stage = 'void'
        AND (referee_wallet = ANY($2::text[]) OR referrer_wallet = ANY($2::text[]))`,
    [seasonId, [...affected]]
  )
  return [...affected]
}

/**
 * Confirm or clear a flag — stamps status + reviewed_at (now) + reviewed_by. Only an
 * 'open' flag transitions, so a re-review is a no-op (returns null) — the original
 * decision + reviewer stand. Clearing also LIFTS enforcement (un-flags the sends,
 * un-voids the referrals) and returns the wallets the caller must recompute so the
 * restored points actually land.
 */
export async function reviewFlag(
  flagId: number,
  status: ReviewStatus,
  reviewedBy: string,
  seasonId: string = ACTIVE_SEASON_ID
): Promise<ReviewResult | null> {
  const res = await deps.query<FlagRow>(
    `UPDATE season.flag
        SET status = $3, reviewed_at = NOW(), reviewed_by = $4, updated_at = NOW()
      WHERE id = $1 AND season_id = $2 AND status = 'open'
      RETURNING *`,
    [flagId, seasonId, status, reviewedBy]
  )
  const flag = res.rows[0]
  if (!flag) return null
  const affectedWallets =
    status === 'cleared' ? await liftSybilEnforcement(seasonId, flag.subject, flag.kind) : []
  return { flag, affectedWallets }
}
