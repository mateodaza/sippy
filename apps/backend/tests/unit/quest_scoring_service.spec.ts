/**
 * Sippy Quest — scoring service tests
 *
 * The scoring service is the single source of truth for "how many
 * entries does this user have" and "who's at the top". Both the
 * in-WhatsApp `mi quest` reply and the public leaderboard derive from
 * the same SQL. These tests pin:
 *
 *   getUserQuestStatus
 *     • returns zero-state (entries=0, rank=null) when the user has
 *       no contributing row — must NOT throw or surface as a NaN-y reply
 *     • passes the entry cap into LEAST() so capped totals never exceed
 *       QUEST_MAX_ENTRIES_PER_USER even when raw entries do
 *     • forwards the FK-form phone key into bindings (canonical/bare
 *       drift would silently mismatch the joins and report 0)
 *     • returns rank + totalRanked from the ranked CTE on a hit
 *   getLeaderboard
 *     • SELECT ordered by rank ASC and limited per request
 *     • returns empty array on DB error (best-effort, never throws)
 *
 * Pattern mirrors quest_referral_service.spec.ts: stub `db.rawQuery`,
 * drive responses by SQL substring, capture bindings for assertions.
 * UserPreference.findBy stub mirrors resolveUserPrefKey behavior.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import UserPreference from '#models/user_preference'
import {
  getUserQuestStatus,
  getLeaderboard,
  getQuestStats,
  getEntryCap,
  VENUE_ATTENDANCE_SOURCES,
} from '#services/quest/scoring.service'

const PHONE = '+573001234567'
const EVENT = 'pizza-day-ctg-2026'

// ── DB mock infrastructure ──────────────────────────────────────────────

interface RawQueryCall {
  sql: string
  bindings?: unknown[]
}
interface MockResponse {
  rows: Record<string, unknown>[]
  rowCount?: number
}

let rawQueryCalls: RawQueryCall[] = []
let mockResponder: (sql: string, bindings?: unknown[]) => MockResponse | Promise<MockResponse>
let origRawQuery: typeof db.rawQuery

function installDbMock() {
  rawQueryCalls = []
  mockResponder = () => ({ rows: [] })
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    return mockResponder(sql, bindings)
  }) as unknown as typeof db.rawQuery
}
function restoreDbMock() {
  db.rawQuery = origRawQuery
}

// ── UserPreference mock (mirrors resolveUserPrefKey behavior) ───────────

let origFindBy: typeof UserPreference.findBy
function installPrefMock() {
  origFindBy = UserPreference.findBy
  ;(
    UserPreference as unknown as { findBy: (col: string, val: string) => Promise<unknown> }
  ).findBy = async () => null
}
function restorePrefMock() {
  UserPreference.findBy = origFindBy
}

// ══════════════════════════════════════════════════════════════════════════════
// getEntryCap
// ══════════════════════════════════════════════════════════════════════════════

test.group('quest.scoring | getEntryCap', () => {
  test('returns a positive integer (env default or override)', ({ assert }) => {
    const cap = getEntryCap()
    assert.isAbove(cap, 0)
    assert.equal(cap, Math.floor(cap), 'cap should be a whole number')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// getUserQuestStatus — zero state + cap + bindings
// ══════════════════════════════════════════════════════════════════════════════

test.group('quest.scoring | getUserQuestStatus | zero state', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns entries=0 / rank=null when user has no contributing row', async ({ assert }) => {
    // Both queries miss: per-user lookup returns no row, then the fallback
    // SELECT MAX(total_ranked) returns 0. Service must return a clean
    // zero-state object instead of throwing.
    mockResponder = (sql: string) => {
      if (sql.includes('WHERE phone_number = ?')) return { rows: [] }
      if (sql.includes('MAX(total_ranked)')) return { rows: [{ total_ranked: '0' }] }
      return { rows: [] }
    }

    const status = await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    assert.equal(status.entries, 0)
    assert.equal(status.activity, 0)
    assert.equal(status.referrals, 0)
    assert.isNull(status.rank)
    assert.equal(status.totalRanked, 0)
    assert.isAbove(status.cap, 0, 'cap should still be reported')
  })

  test('returns totalRanked from the fallback aggregate when user themselves has no row', async ({
    assert,
  }) => {
    // User has no entries, but the leaderboard has 47 other users —
    // the reply uses this to show "you're not on the board yet (47 people are)".
    mockResponder = (sql: string) => {
      if (sql.includes('WHERE phone_number = ?')) return { rows: [] }
      if (sql.includes('MAX(total_ranked)')) return { rows: [{ total_ranked: '47' }] }
      return { rows: [] }
    }

    const status = await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    assert.equal(status.entries, 0)
    assert.isNull(status.rank)
    assert.equal(status.totalRanked, 47)
  })

  test('returns zero-state on invalid phone (no DB query issued)', async ({ assert }) => {
    // canonicalizePhone rejects "abc" → service short-circuits without
    // running any SQL. Important: a malformed phone must NOT produce a
    // confusing "0/5" reply via the DB path.
    const status = await getUserQuestStatus({ phone: 'abc', eventSlug: EVENT })

    assert.equal(status.entries, 0)
    assert.isNull(status.rank)
    assert.equal(rawQueryCalls.length, 0, 'invalid phone must short-circuit before any SQL')
  })
})

test.group('quest.scoring | getUserQuestStatus | bindings + cap', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('passes event slug, cap, venue-source allowlist, and phone in that order', async ({
    assert,
  }) => {
    mockResponder = () => ({ rows: [] })

    await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    const userCall = rawQueryCalls.find((c) => c.sql.includes('WHERE phone_number = ?'))
    assert.exists(userCall, 'should issue the per-user lookup')
    const bindings = userCall!.bindings as unknown[]
    assert.equal(bindings[0], EVENT, '$1 = event slug')
    assert.equal(bindings[1], getEntryCap(), '$2 = entry cap — drives LEAST() in SQL')
    assert.deepEqual(
      bindings[2],
      ['venue'],
      '$3 = venue-attendance source allowlist (array binding)'
    )
    assert.equal(bindings[3], PHONE, '$4 = FK-form phone')
  })

  test('returns rank + entries + breakdown from the ranked CTE on hit', async ({ assert }) => {
    mockResponder = (sql: string) => {
      if (sql.includes('WHERE phone_number = ?')) {
        return {
          rows: [
            {
              entries: 3,
              activity: 1,
              referrals: 2,
              rank: '4',
              total_ranked: '120',
            },
          ],
        }
      }
      return { rows: [] }
    }

    const status = await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    assert.equal(status.entries, 3)
    assert.equal(status.activity, 1)
    assert.equal(status.referrals, 2)
    assert.equal(status.rank, 4)
    assert.equal(status.totalRanked, 120)
  })

  test('SQL constrains the referee branch to the SAME event as the attribution', async ({
    assert,
  }) => {
    // Audit P1 (2026-05-18): without the `JOIN events e ON ... AND e.slug = $1`
    // on the referee side, a referee who showed up at event B but was
    // referred under event A would still count toward event-A entries.
    // Single-event Pizza Day MVP can't hit this, but the constraint
    // must stay in the SQL so a future second event doesn't break the math.
    mockResponder = () => ({ rows: [] })

    await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    const userCall = rawQueryCalls.find((c) => c.sql.includes('WHERE phone_number = ?'))
    assert.exists(userCall, 'should issue per-user lookup')
    // The referee branch must JOIN events with e.slug = $1 — pin the
    // exact shape so a refactor that drops it fails this test.
    assert.include(
      userCall!.sql,
      'JOIN events e ON e.id = uel.event_id AND e.slug = ?',
      'referee branch must constrain uel to the same event as the attribution'
    )
  })

  test('SQL uses LEAST(raw_entries, $2) so caller cannot exceed the cap', async ({ assert }) => {
    // Structural assertion — we're not testing Postgres here, we're
    // testing that the SQL the service emits actually applies LEAST().
    // Otherwise a referrer with 12 attributed-and-attended referees
    // would report 13 entries instead of being capped to 5.
    mockResponder = () => ({ rows: [] })

    await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    const userCall = rawQueryCalls.find((c) => c.sql.includes('WHERE phone_number = ?'))
    assert.exists(userCall, 'should issue per-user lookup')
    assert.include(
      userCall!.sql,
      'LEAST(raw_entries, ?)',
      'SQL must cap entries via LEAST() bound to the cap param'
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// VENUE_ATTENDANCE_SOURCES + activity branch SQL shape
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit P2 (2026-05-18): existing onboarded users who scan the physical
// event QR get `linked_at_step='returning'`. The activity branch must
// credit them ONLY when the link's metadata->>'source' appears in the
// venue allowlist — never for arbitrary 'returning' rows (which would
// include Twitter / SMS social deep-link taps from home → farming).
//
// These tests pin both halves of the contract:
//   1. The constant exists, is non-empty, and is intentionally narrow.
//   2. The CTE SQL applies it via `metadata->>'source' = ANY($N::text[])`
//      on BOTH branches (activity + referee-attendance) so a regression
//      that drops it from one branch fails here.

test.group('quest.scoring | VENUE_ATTENDANCE_SOURCES constant', () => {
  test('exposes the venue source allowlist (named export)', ({ assert }) => {
    assert.isArray(
      VENUE_ATTENDANCE_SOURCES as unknown as unknown[],
      'must be importable for downstream callers / migration alignment'
    )
    assert.isAbove(VENUE_ATTENDANCE_SOURCES.length, 0, 'allowlist must not be empty')
  })

  test('includes "venue" — matches the qr_sheets auto-provision tag', ({ assert }) => {
    // Drift guard: if either side renames the tag and the other doesn't,
    // attendance scoring silently breaks. This test pins them together.
    assert.include(
      VENUE_ATTENDANCE_SOURCES as unknown as readonly string[],
      'venue',
      'allowlist must include "venue" — the source tag written by qr_sheets_controller'
    )
  })

  test('intentionally narrow: does NOT include social / campaign sources', ({ assert }) => {
    // Anti-farming guard. Adding 'twitter', 'tg-channel-1', 'qr-booth',
    // etc. would let a remote tap earn attendance credit. If a future
    // change needs to add a tag, it must be physical-scan-only.
    const FORBIDDEN = ['twitter', 'tg-channel-1', 'qr-booth', 'sms', '']
    for (const tag of FORBIDDEN) {
      assert.notInclude(
        VENUE_ATTENDANCE_SOURCES as unknown as readonly string[],
        tag,
        `allowlist must NOT include "${tag}" — opens attendance farming`
      )
    }
  })
})

test.group('quest.scoring | activity branch SQL shape', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('activity branch accepts done OR returning+venue (not bare returning)', async ({
    assert,
  }) => {
    mockResponder = () => ({ rows: [] })

    await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    const userCall = rawQueryCalls.find((c) => c.sql.includes('WHERE phone_number = ?'))
    assert.exists(userCall, 'should issue per-user lookup')
    const sql = userCall!.sql
    // Pin the activity branch shape — both clauses must be present.
    assert.include(
      sql,
      "uel.linked_at_step = 'done'",
      'activity branch must credit done (new-user onboarding)'
    )
    assert.include(
      sql,
      "uel.linked_at_step = 'returning'",
      'activity branch must also credit returning (existing-user re-scan)'
    )
    assert.include(
      sql,
      "uel.metadata->>'source' = ANY(?::text[])",
      "returning must be gated on the venue allowlist via metadata->>'source'"
    )
  })

  test('referee branch ALSO requires attendance (done OR returning+venue)', async ({ assert }) => {
    // The referee-attendance gate is symmetric with the activity gate.
    // If a referee shows up only via Twitter deep-link, the referrer
    // shouldn't earn an entry from them. Symmetry test: the same
    // `linked_at_step = 'returning' AND metadata->>'source' = ANY(...)`
    // clause must appear at least twice in the CTE.
    mockResponder = () => ({ rows: [] })

    await getUserQuestStatus({ phone: PHONE, eventSlug: EVENT })

    const sql = rawQueryCalls.find((c) => c.sql.includes('WHERE phone_number = ?'))!.sql
    const occurrences = sql.split("uel.linked_at_step = 'returning'").length - 1
    assert.equal(
      occurrences,
      2,
      "both activity and referee branches must gate 'returning' on venue source"
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// getLeaderboard — limit, ordering, error swallow
// ══════════════════════════════════════════════════════════════════════════════

test.group('quest.scoring | getLeaderboard', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('forwards limit as $4 binding (after venue allowlist) and orders by rank ASC', async ({
    assert,
  }) => {
    mockResponder = () => ({ rows: [] })

    await getLeaderboard({ eventSlug: EVENT, limit: 10 })

    assert.equal(rawQueryCalls.length, 1, 'leaderboard issues exactly one query')
    const call = rawQueryCalls[0]
    assert.include(call.sql, 'ORDER BY rank ASC')
    const bindings = call.bindings as unknown[]
    assert.deepEqual(bindings[2], ['venue'], '$3 = venue source allowlist')
    assert.equal(bindings[3], 10, '$4 = limit')
  })

  test('clamps the limit to [1, 100] to prevent unbounded reads', async ({ assert }) => {
    mockResponder = () => ({ rows: [] })

    await getLeaderboard({ eventSlug: EVENT, limit: 500 })
    let bindings = rawQueryCalls[0].bindings as unknown[]
    assert.equal(bindings[3], 100, 'limit > 100 clamps to 100')

    rawQueryCalls = []
    await getLeaderboard({ eventSlug: EVENT, limit: 0 })
    bindings = rawQueryCalls[0].bindings as unknown[]
    assert.equal(bindings[3], 1, 'limit <= 0 clamps to 1')
  })

  test('uses default limit of 20 when caller omits it', async ({ assert }) => {
    mockResponder = () => ({ rows: [] })

    await getLeaderboard({ eventSlug: EVENT })

    const bindings = rawQueryCalls[0].bindings as unknown[]
    assert.equal(bindings[3], 20, 'default limit should be 20')
  })

  test('returns rows shaped as LeaderboardRow', async ({ assert }) => {
    mockResponder = () => ({
      rows: [
        {
          phone_number: '+573009999999',
          entries: 5,
          activity: 1,
          referrals: 4,
          rank: '1',
        },
        {
          phone_number: '+573008888888',
          entries: 3,
          activity: 1,
          referrals: 2,
          rank: '2',
        },
      ],
    })

    const rows = await getLeaderboard({ eventSlug: EVENT, limit: 20 })

    assert.lengthOf(rows, 2)
    assert.equal(rows[0].phone, '+573009999999')
    assert.equal(rows[0].entries, 5)
    assert.equal(rows[0].rank, 1)
    assert.equal(rows[0].activity, 1)
    assert.equal(rows[0].referrals, 4)
  })

  test('swallows DB errors and returns empty array (best-effort)', async ({ assert }) => {
    // Leaderboard is a read-only display surface; a transient DB hiccup
    // should NOT bubble up and break the whole web page. The service
    // logs and returns [] so the page renders an empty board instead
    // of a 500.
    mockResponder = () => {
      throw new Error('connection refused')
    }

    const rows = await getLeaderboard({ eventSlug: EVENT, limit: 20 })

    assert.deepEqual(rows, [])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// getQuestStats — counters for the public page header
// ══════════════════════════════════════════════════════════════════════════════

test.group('quest.scoring | getQuestStats', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns counts straight from the aggregate query', async ({ assert }) => {
    mockResponder = () => ({ rows: [{ entrants: '47', entries: '128' }] })

    const stats = await getQuestStats(EVENT)

    assert.equal(stats.totalEntrants, 47)
    assert.equal(stats.totalEntries, 128)
  })

  test('returns zeros when the aggregate query returns no rows', async ({ assert }) => {
    // COALESCE in the SQL guarantees a single row with 0s on an empty
    // leaderboard, but pin the zero-fallback so a SQL refactor that
    // drops COALESCE can't silently propagate undefined into the page.
    mockResponder = () => ({ rows: [] })

    const stats = await getQuestStats(EVENT)

    assert.equal(stats.totalEntrants, 0)
    assert.equal(stats.totalEntries, 0)
  })

  test('returns zeros on DB error (page renders empty header, not 500)', async ({ assert }) => {
    mockResponder = () => {
      throw new Error('connection refused')
    }

    const stats = await getQuestStats(EVENT)

    assert.equal(stats.totalEntrants, 0)
    assert.equal(stats.totalEntries, 0)
  })

  test('uses the entry cap binding + venue allowlist (matches CTE bindings)', async ({
    assert,
  }) => {
    mockResponder = () => ({ rows: [{ entrants: '0', entries: '0' }] })

    await getQuestStats(EVENT)

    assert.equal(rawQueryCalls.length, 1, 'stats issues exactly one query')
    const bindings = rawQueryCalls[0].bindings as unknown[]
    assert.equal(bindings[0], EVENT, '$1 = event slug')
    assert.equal(bindings[1], getEntryCap(), '$2 = cap — must match LEAST() bound')
    assert.deepEqual(bindings[2], ['venue'], '$3 = venue source allowlist')
  })
})
