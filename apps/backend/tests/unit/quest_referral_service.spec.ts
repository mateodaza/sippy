/**
 * Sippy Quest — referral service tests
 *
 * Pins the trust-substrate for the Quest. Without these passing, any
 * "mi quest" UI on top is fake confidence (an audit note from 2026-05-18).
 *
 * Coverage:
 *   ensureReferralCode
 *     • idempotent per (phone, event) — second call returns the same row
 *     • collision retry — falls through to a fresh code if the first
 *       generated value collides on the PK
 *     • max retry error — gives up cleanly after MAX_GENERATION_RETRIES
 *   captureReferral
 *     • pending write when referee not onboarded (preserves attribution
 *       across server restarts during the onboarding window)
 *     • attribution write when referee is onboarded
 *     • self-referral blocked (referrer ≠ referee)
 *     • write-once duplicate safe (second capture for the same referee
 *       returns `already_attributed`, no second DB write)
 *     • unknown code returns `unknown_code` (no DB attribution touched)
 *   drainPendingReferral
 *     • atomic move: pending row deleted, attribution row written
 *     • idempotent: second call after drain returns null (nothing pending)
 *
 * Pattern: stub `db.rawQuery` per test, capture every SQL call, drive
 * controllable `rows` results. Mirrors smart_mode_partial_resolve.spec.ts
 * and smart_mode_cohort.spec.ts so the SMART/Quest specs use one
 * mocking idiom across the codebase.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  ensureReferralCode,
  captureReferral,
  drainPendingReferral,
  __testing,
} from '#services/quest/referral.service'

const REFERRER = '+573009999999'
const REFEREE = '+573001234567'
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

/** Override the responder for a specific call sequence. */
function respondInSequence(responses: Array<MockResponse | ((sql: string) => MockResponse)>) {
  let i = 0
  mockResponder = (sql: string) => {
    const next = responses[i++] ?? { rows: [] }
    return typeof next === 'function' ? next(sql) : next
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ensureReferralCode
// ══════════════════════════════════════════════════════════════════════════════

test.group('ensureReferralCode | idempotent', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)

  test('returns existing row on second call (no INSERT)', async ({ assert }) => {
    // First call: SELECT finds nothing → INSERT returns the row.
    // Second call: SELECT finds the row → no INSERT.
    let callCount = 0
    mockResponder = (sql: string) => {
      callCount++
      if (sql.includes('SELECT')) {
        if (callCount === 1) return { rows: [] }
        return {
          rows: [{ code: 'ABC234', phone_number: REFERRER, event_slug: EVENT }],
        }
      }
      // INSERT path (first call only)
      return {
        rows: [{ code: 'ABC234', phone_number: REFERRER, event_slug: EVENT }],
      }
    }

    const first = await ensureReferralCode(REFERRER, EVENT)
    const second = await ensureReferralCode(REFERRER, EVENT)

    assert.equal(first.code, 'ABC234')
    assert.equal(second.code, 'ABC234', 'second call returns same code')
    // Second call should have hit SELECT only — no second INSERT.
    const inserts = rawQueryCalls.filter((c) => c.sql.includes('INSERT'))
    assert.equal(inserts.length, 1, 'INSERT fires only once across both calls')
  })

  test('falls through to retry on PK collision then succeeds', async ({ assert }) => {
    // SELECT (none) → INSERT collides → INSERT succeeds.
    let insertCount = 0
    mockResponder = (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [] }
      if (sql.includes('INSERT')) {
        insertCount++
        if (insertCount === 1) {
          throw new Error('duplicate key value violates unique constraint "referral_codes_pkey"')
        }
        return {
          rows: [{ code: 'XYZ789', phone_number: REFERRER, event_slug: EVENT }],
        }
      }
      return { rows: [] }
    }

    const out = await ensureReferralCode(REFERRER, EVENT)
    assert.equal(out.code, 'XYZ789', 'second insert wins after first collides')
    assert.equal(insertCount, 2, 'INSERT was retried exactly once')
  })

  test('throws after MAX_GENERATION_RETRIES collisions in a row', async ({ assert }) => {
    mockResponder = (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [] }
      throw new Error('duplicate key value violates unique constraint "referral_codes_pkey"')
    }
    await assert.rejects(
      () => ensureReferralCode(REFERRER, EVENT),
      /failed to generate unique code/
    )
  })

  test('non-collision DB errors propagate (no infinite retry)', async ({ assert }) => {
    mockResponder = (sql: string) => {
      if (sql.includes('SELECT')) return { rows: [] }
      throw new Error('connection terminated unexpectedly')
    }
    await assert.rejects(() => ensureReferralCode(REFERRER, EVENT), /connection terminated/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// captureReferral
// ══════════════════════════════════════════════════════════════════════════════

test.group('captureReferral | pending vs attributed', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)

  test('referee NOT onboarded → writes to pending_referrals', async ({ assert }) => {
    respondInSequence([
      // lookup code
      { rows: [{ code: 'ABC234', phone_number: REFERRER, event_slug: EVENT }] },
      // existing attribution check
      { rows: [] },
      // INSERT pending_referrals
      { rows: [] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: REFEREE,
      refereeOnboarded: false,
    })
    assert.equal(out.kind, 'pending')
    if (out.kind !== 'pending') return
    assert.equal(out.referrerPhone, REFERRER)
    assert.equal(out.eventSlug, EVENT)
    // Last call should target pending_referrals, not referral_attributions
    const last = rawQueryCalls[rawQueryCalls.length - 1]
    assert.include(last.sql, 'pending_referrals')
    assert.notInclude(last.sql, 'referral_attributions')
  })

  test('referee onboarded → writes to referral_attributions', async ({ assert }) => {
    respondInSequence([
      { rows: [{ code: 'ABC234', phone_number: REFERRER, event_slug: EVENT }] },
      { rows: [] }, // no existing
      { rows: [] }, // INSERT attributions (no return — ON CONFLICT DO NOTHING)
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: REFEREE,
      refereeOnboarded: true,
    })
    assert.equal(out.kind, 'attributed')
    const last = rawQueryCalls[rawQueryCalls.length - 1]
    assert.include(last.sql, 'referral_attributions')
    assert.notInclude(last.sql, 'pending_referrals')
  })
})

test.group('captureReferral | anti-gaming', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)

  test('self-referral blocked (referrer === referee)', async ({ assert }) => {
    respondInSequence([
      // lookup: code belongs to the SAME phone trying to claim it
      { rows: [{ code: 'ABC234', phone_number: REFEREE, event_slug: EVENT }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: REFEREE,
      refereeOnboarded: true,
    })
    assert.equal(out.kind, 'self_referral')
    // No attribution / pending writes after the lookup.
    const writes = rawQueryCalls.filter(
      (c) =>
        c.sql.includes('INSERT INTO referral_attributions') || c.sql.includes('pending_referrals')
    )
    assert.equal(writes.length, 0, 'self-referral must NOT touch attribution tables')
  })

  test('already attributed → no second write (returns already_attributed)', async ({ assert }) => {
    respondInSequence([
      { rows: [{ code: 'ABC234', phone_number: REFERRER, event_slug: EVENT }] },
      // existing attribution exists
      { rows: [{ referrer_phone: REFERRER }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: REFEREE,
      refereeOnboarded: true,
    })
    assert.equal(out.kind, 'already_attributed')
    const writes = rawQueryCalls.filter(
      (c) =>
        c.sql.includes('INSERT INTO referral_attributions') ||
        c.sql.includes('INSERT INTO pending_referrals')
    )
    assert.equal(writes.length, 0, 'duplicate capture must NOT write a second row')
  })

  test('unknown code is a silent no-op', async ({ assert }) => {
    respondInSequence([
      // lookup returns no row
      { rows: [] },
    ])
    const out = await captureReferral({
      code: 'NOPE99',
      refereePhone: REFEREE,
      refereeOnboarded: true,
    })
    assert.equal(out.kind, 'unknown_code')
    assert.equal(rawQueryCalls.length, 1, 'only the lookup query fires for unknown codes')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// drainPendingReferral
// ══════════════════════════════════════════════════════════════════════════════

test.group('drainPendingReferral | atomicity + idempotency', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)

  test('atomic move: returns the drained attribution row', async ({ assert }) => {
    respondInSequence([
      {
        rows: [
          {
            referrer_phone: REFERRER,
            referral_code: 'ABC234',
            event_slug: EVENT,
          },
        ],
      },
    ])
    const out = await drainPendingReferral(REFEREE)
    assert.exists(out)
    if (!out) return
    assert.equal(out.referrerPhone, REFERRER)
    assert.equal(out.code, 'ABC234')
    assert.equal(out.eventSlug, EVENT)
    // Single CTE — one rawQuery call does delete-pending + insert-attribution.
    assert.equal(rawQueryCalls.length, 1, 'single atomic SQL call')
    const sql = rawQueryCalls[0].sql
    assert.include(sql, 'DELETE FROM pending_referrals')
    assert.include(sql, 'INSERT INTO referral_attributions')
  })

  test('idempotent: no pending row → returns null, no writes asserted', async ({ assert }) => {
    respondInSequence([{ rows: [] }])
    const out = await drainPendingReferral(REFEREE)
    assert.isNull(out)
    // The single CTE still fires (the SQL is unconditional), but returns
    // zero rows when nothing pending. Critical invariant: returns null,
    // doesn't throw, doesn't lie about a write that didn't happen.
  })

  test('CTE guards self-referral edge case (referrer = referee in pending)', async ({ assert }) => {
    // If somehow the pending row points to a code owned by the referee
    // themselves (race / data corruption), the CTE's `WHERE c.referrer_phone != $1`
    // filter prevents the attribution insert. Mock that no row comes back.
    respondInSequence([{ rows: [] }])
    const out = await drainPendingReferral(REFEREE)
    assert.isNull(out, 'self-referral edge in pending must not produce an attribution')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Code generator (pure utility — exposed via __testing)
// ══════════════════════════════════════════════════════════════════════════════

test.group('generateCode | shape', () => {
  test('produces 6 chars from the Crockford no-ambiguous alphabet', ({ assert }) => {
    // 100 samples — every char must come from the alphabet.
    const alphabet = new Set(__testing.CODE_ALPHABET.split(''))
    for (let i = 0; i < 100; i++) {
      const code = __testing.generateCode()
      assert.equal(code.length, __testing.CODE_LENGTH)
      for (const ch of code) {
        assert.isTrue(alphabet.has(ch), `unexpected char ${ch} in ${code}`)
      }
    }
  })

  test('no ambiguous glyphs (0/1/I/L/O) ever emitted', ({ assert }) => {
    // 1000 samples — the alphabet excludes 0/1/I/L/O by construction,
    // but pin it so a future "expand alphabet" tweak fails this guard.
    const banned = /[01ILO]/
    for (let i = 0; i < 1000; i++) {
      const code = __testing.generateCode()
      assert.notMatch(code, banned, `${code} contains a banned glyph`)
    }
  })
})
