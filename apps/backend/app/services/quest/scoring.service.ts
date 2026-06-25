/**
 * Sippy Quest — scoring service
 *
 * Derives per-user entries and the leaderboard from the source-of-truth
 * tables (referral_attributions + user_event_links) at query time. The
 * write paths in `referral.service.ts` stay permissive (record every
 * attribution, even if the referrer hasn't checked in yet); eligibility
 * rules live here so the same numbers power both the in-WhatsApp `mi
 * quest` reply and the public leaderboard.
 *
 * Entry model (Pizza Day inauguration):
 *   • +1 for the user themselves having `linked_at_step = 'done'` on the
 *     event (they finished onboarding AND attended). This is the
 *     "activity" component.
 *   • +1 per referee they brought who is ALSO `linked_at_step = 'done'`.
 *     A pending referral that never converts contributes 0 — keeps the
 *     mechanic honest. This is the "referrals" component.
 *   • Total capped at QUEST_MAX_ENTRIES_PER_USER (env, default 5).
 *
 * Why `done` instead of any `user_event_links` row: the schema records
 * 'done' (finished onboarding at the booth) and 'returning' (deep-link
 * tap from someone who was already onboarded). Counting 'returning'
 * here would let a user farm entries by tapping the event link without
 * physically showing up. 'done' is the attendance proxy.
 *
 * Ranks are computed with SQL `RANK()` over (entries DESC, phone ASC)
 * so ties land on the same rank and the next rank skips. Predictable +
 * deterministic — important when we display "estás en #3 con 4 entradas"
 * and don't want the number flipping on every refresh.
 *
 * Phone forms: every join keys on `phone_number` as written by the
 * writers (FK-key form via `resolveUserPrefKey`). DO NOT canonicalize
 * here — the inputs to the joins were stored in FK-key form and a
 * canonical-vs-bare mismatch on the join would silently drop entries.
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query } from '#services/db'
import { canonicalizePhone, maskPhone } from '#utils/phone'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'

// ── Config ──────────────────────────────────────────────────────────────

const DEFAULT_ENTRY_CAP = 5

/**
 * Allowlist of `metadata->>'source'` values that mean "user physically
 * attended the event" — used to credit the +1 activity entry to
 * already-onboarded users who scan a venue QR (linked_at_step =
 * 'returning'). Without this allowlist a returning user who shows up
 * earns nothing for attending: 'returning' is the bracket-dispatcher
 * default for any existing user that hits a deep link, including from
 * Twitter or SMS — counting all 'returning' would let someone tap a
 * social link from home and earn an attendance entry without being
 * present.
 *
 * The single source today is 'venue', written by
 * `qr_sheets_controller` on auto-provision of the per-event physical
 * QR. The companion migration backfills the pre-existing event-kind
 * qr_links rows whose source_tag was NULL (pre-2026-05-18).
 *
 * Keep this list narrow: only tags that represent IN-PERSON scans at
 * the venue. Adding 'twitter' or 'tg-channel-1' here would re-open
 * the farming hole this allowlist exists to close.
 */
export const VENUE_ATTENDANCE_SOURCES = ['venue'] as const

/**
 * Read the per-user entry cap from env. Single read site so both the
 * scoring math and any caller that needs to display the ceiling (e.g.
 * `mi codigo` formatter) agree on the same number.
 */
export function getEntryCap(): number {
  const v = env.get('QUEST_MAX_ENTRIES_PER_USER')
  if (v === undefined) return DEFAULT_ENTRY_CAP
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ENTRY_CAP
  return Math.floor(n)
}

// ── Public types ────────────────────────────────────────────────────────

export interface UserQuestStatus {
  /** Total capped entries the user currently has for this event. */
  entries: number
  /** Cap applied (so callers can show "3/5"). */
  cap: number
  /** 1 if the user attended (linked_at_step='done'), else 0. */
  activity: 0 | 1
  /** Raw count of attributed referees who attended (uncapped). */
  referrals: number
  /** 1-indexed rank among users with entries > 0. `null` when entries=0. */
  rank: number | null
  /** Population the rank is computed against. */
  totalRanked: number
}

export interface LeaderboardRow {
  /** FK-key phone form; mask before serving to public consumers. */
  phone: string
  entries: number
  activity: 0 | 1
  referrals: number
  rank: number
}

// ── Shared SQL ──────────────────────────────────────────────────────────

/**
 * CTE prefix that derives per-user entries for an event. Used by
 * `getUserQuestStatus`, `getLeaderboard`, and `getQuestStats` so the
 * math has one home — if we add a new entry source (e.g. weekly tasks),
 * only this block changes and all three call sites pick it up.
 *
 * Bind params:
 *   $1 = event slug
 *   $2 = entry cap (LEAST applied per-user)
 *   $3 = venue-attendance source allowlist (text[]) — credits 'returning'
 *        scans as activity ONLY when source matches. See
 *        VENUE_ATTENDANCE_SOURCES for the allowlist; passing an empty
 *        array effectively reverts to "only 'done' counts".
 *
 * Activity branch:
 *   • linked_at_step = 'done' (new user finished onboarding at the event), OR
 *   • linked_at_step = 'returning' AND source in venue-allowlist (existing
 *     user physically scanned a venue QR — printed sheet, not a social
 *     link). The source allowlist closes the farming hole that would
 *     otherwise let a Twitter-link tap from home earn attendance credit.
 */
const ENTRIES_CTE = `
  WITH parts AS (
    SELECT uel.phone_number, 1 AS c, 1 AS activity, 0 AS refs
    FROM user_event_links uel
    JOIN events e ON e.id = uel.event_id
    WHERE e.slug = $1
      AND (
        uel.linked_at_step = 'done'
        OR (
          uel.linked_at_step = 'returning'
          AND uel.metadata->>'source' = ANY($3::text[])
        )
      )

    UNION ALL

    -- Referee credit: any attribution row counts, no attendance check.
    -- Product rule (2026-05-18): friends count when they JOIN SIPPY
    -- through your link, whether or not they attend the event. Sippy
    -- benefits more from a new user joining anywhere than from someone
    -- showing up to a single event — the viral acquisition reward is
    -- the point. The FK from referral_attributions to user_preferences
    -- already enforces "the referee is a real Sippy user."
    --
    -- Self-referrals are blocked at capture time (PK + service guard);
    -- vendor/exchange phones naturally don't accumulate referrals
    -- because they aren't in the referral graph. No exclusion list
    -- needed here.
    SELECT ra.referrer_phone AS phone_number, 1 AS c, 0 AS activity, 1 AS refs
    FROM referral_attributions ra
    WHERE ra.event_slug = $1
  ),
  agg AS (
    SELECT phone_number,
           SUM(c)::int AS raw_entries,
           MAX(activity)::int AS activity,
           SUM(refs)::int AS referrals
    FROM parts
    GROUP BY phone_number
  ),
  capped AS (
    SELECT phone_number,
           LEAST(raw_entries, $2) AS entries,
           activity,
           referrals
    FROM agg
    WHERE raw_entries > 0
  ),
  ranked AS (
    SELECT phone_number, entries, activity, referrals,
           RANK() OVER (ORDER BY entries DESC, phone_number ASC) AS rank,
           COUNT(*) OVER () AS total_ranked
    FROM capped
  )
`

// ── getUserQuestStatus ──────────────────────────────────────────────────

/**
 * Compute the entries + rank for a single user. Returns a zero/null
 * status when the user has no entries yet (rather than `null`) so the
 * `mi quest` reply can render "0/5 entries" instead of erroring.
 *
 * Phone handling: canonicalize to reject garbage, then resolve to FK
 * form — same two-tier rule used by referral.service.ts. The joins in
 * ENTRIES_CTE key on FK-form phones written by linkUserToEvent and
 * captureReferral, so we must match that form on lookup.
 */
export async function getUserQuestStatus(args: {
  phone: string
  eventSlug: string
}): Promise<UserQuestStatus> {
  const cap = getEntryCap()
  const canon = canonicalizePhone(args.phone)
  if (!canon) {
    return { entries: 0, cap, activity: 0, referrals: 0, rank: null, totalRanked: 0 }
  }
  const fkKey = await resolveUserPrefKey(canon)

  const venueSources = [...VENUE_ATTENDANCE_SOURCES]
  const res = await query<{
    entries: number
    activity: number
    referrals: number
    rank: string
    total_ranked: string
  }>(
    `${ENTRIES_CTE}
     SELECT entries, activity, referrals, rank, total_ranked
     FROM ranked
     WHERE phone_number = $4`,
    [args.eventSlug, cap, venueSources, fkKey]
  )

  // Even when the user has zero entries we still need `totalRanked` so
  // the reply can render "tu eres el unico" vs "Top 47 — anda invitando".
  // Cheap second query, only fires on miss.
  if (res.rows.length === 0) {
    const totalRes = await query<{ total_ranked: string }>(
      `${ENTRIES_CTE}
       SELECT COALESCE(MAX(total_ranked), 0) AS total_ranked FROM ranked`,
      [args.eventSlug, cap, venueSources]
    )
    const totalRanked = Number(totalRes.rows[0]?.total_ranked ?? 0)
    return { entries: 0, cap, activity: 0, referrals: 0, rank: null, totalRanked }
  }

  const r = res.rows[0]
  return {
    entries: Number(r.entries),
    cap,
    activity: r.activity === 1 ? 1 : 0,
    referrals: Number(r.referrals),
    rank: Number(r.rank),
    totalRanked: Number(r.total_ranked),
  }
}

// ── getLeaderboard ──────────────────────────────────────────────────────

const DEFAULT_LEADERBOARD_LIMIT = 20

/**
 * Top-N leaderboard for an event, ordered by entries DESC then phone
 * ASC (deterministic tiebreaker). Caller is responsible for masking
 * phones before serving — this returns the raw FK-form so admin
 * surfaces can show full numbers if needed.
 */
export async function getLeaderboard(args: {
  eventSlug: string
  limit?: number
}): Promise<LeaderboardRow[]> {
  const cap = getEntryCap()
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LEADERBOARD_LIMIT, 1), 100)
  const venueSources = [...VENUE_ATTENDANCE_SOURCES]
  try {
    const res = await query<{
      phone_number: string
      entries: number
      activity: number
      referrals: number
      rank: string
    }>(
      `${ENTRIES_CTE}
       SELECT phone_number, entries, activity, referrals, rank
       FROM ranked
       ORDER BY rank ASC, phone_number ASC
       LIMIT $4`,
      [args.eventSlug, cap, venueSources, limit]
    )
    return res.rows.map((r) => ({
      phone: r.phone_number,
      entries: Number(r.entries),
      activity: r.activity === 1 ? 1 : 0,
      referrals: Number(r.referrals),
      rank: Number(r.rank),
    }))
  } catch (err) {
    logger.error({ err, eventSlug: args.eventSlug }, 'quest.scoring: leaderboard query failed')
    return []
  }
}

// ── getQuestStats ───────────────────────────────────────────────────────

export interface QuestStats {
  /** Number of distinct users with >= 1 entry (= leaderboard population). */
  totalEntrants: number
  /** Sum of capped entries across all entrants (= total entries in the draw). */
  totalEntries: number
}

/**
 * Aggregate counters for the public leaderboard header ("X personas, Y
 * entradas en juego"). One query, same CTE as the per-user/leaderboard
 * paths so all three surfaces stay in sync — if the entry math changes
 * in one place, these counters can't drift.
 *
 * Returns zeros on DB error so the public page renders an empty-state
 * header instead of failing the SSR. The leaderboard list below uses
 * the same error-swallow pattern in `getLeaderboard`.
 */
export async function getQuestStats(eventSlug: string): Promise<QuestStats> {
  const cap = getEntryCap()
  const venueSources = [...VENUE_ATTENDANCE_SOURCES]
  try {
    const res = await query<{ entrants: string; entries: string }>(
      `${ENTRIES_CTE}
       SELECT COUNT(*)::int AS entrants, COALESCE(SUM(entries), 0)::int AS entries
       FROM ranked`,
      [eventSlug, cap, venueSources]
    )
    const row = res.rows[0]
    return {
      totalEntrants: Number(row?.entrants ?? 0),
      totalEntries: Number(row?.entries ?? 0),
    }
  } catch (err) {
    logger.error({ err, eventSlug }, 'quest.scoring: stats query failed')
    return { totalEntrants: 0, totalEntries: 0 }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Phone mask suitable for the public leaderboard ("+57 *** 4567"). We
 * intentionally do not expose first-name or contact details — the
 * leaderboard is competitive, not social, and revealing identity from
 * a phone alone would be a privacy leak.
 */
export function maskLeaderboardPhone(phone: string): string {
  return maskPhone(phone)
}
