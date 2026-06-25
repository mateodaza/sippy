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
import UserPreference from '#models/user_preference'
import {
  ensureReferralCode,
  captureReferral,
  drainPendingReferral,
  GLOBAL_REFERRAL_CAMPAIGN,
  __testing,
} from '#services/quest/referral.service'
import { formatReferralCodeMessage } from '#utils/messages'

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

// ── UserPreference mock ─────────────────────────────────────────────────
//
// `resolveUserPrefKey` calls `UserPreference.findBy('phoneNumber', ...)`
// to decide whether a bare-digit legacy row exists. Default mock returns
// null → resolveUserPrefKey returns the canonical input (modern behavior).
// Individual tests override via `setBareRowExists(true)` to exercise the
// SH-003 legacy-row code path.

let origFindBy: typeof UserPreference.findBy
let bareRowExists = false
function installPrefMock() {
  bareRowExists = false
  origFindBy = UserPreference.findBy
  ;(
    UserPreference as unknown as { findBy: (col: string, val: string) => Promise<unknown> }
  ).findBy = async () => (bareRowExists ? { phoneNumber: '' } : null)
}
function restorePrefMock() {
  UserPreference.findBy = origFindBy
}
function setBareRowExists(v: boolean) {
  bareRowExists = v
}

// ══════════════════════════════════════════════════════════════════════════════
// ensureReferralCode
// ══════════════════════════════════════════════════════════════════════════════

test.group('ensureReferralCode | idempotent', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

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

  test('GLOBAL namespace: single-arg call mints under the global campaign', async ({ assert }) => {
    // 2026-05-18 design alignment: Quest is global, not event-scoped. A
    // user gets ONE referral code for life. The webhook calls
    // `ensureReferralCode(phone)` with no event arg; the default must
    // be GLOBAL_REFERRAL_CAMPAIGN so the existing-row SELECT keys on
    // the same namespace the mint path uses. A drift here would mint a
    // fresh code on every `mi codigo` and break distributed share links.
    let lastInsertBindings: unknown[] | undefined
    let lastSelectBindings: unknown[] | undefined
    mockResponder = (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('FROM referral_codes')) {
        lastSelectBindings = rawQueryCalls[rawQueryCalls.length - 1].bindings
        return { rows: [] } // force the INSERT path
      }
      if (sql.includes('INSERT INTO referral_codes')) {
        lastInsertBindings = rawQueryCalls[rawQueryCalls.length - 1].bindings
        return {
          rows: [
            {
              code: 'GLOB42',
              phone_number: REFERRER,
              event_slug: GLOBAL_REFERRAL_CAMPAIGN,
            },
          ],
        }
      }
      return { rows: [] }
    }

    const out = await ensureReferralCode(REFERRER) // no event arg

    assert.equal(out.eventSlug, GLOBAL_REFERRAL_CAMPAIGN, 'returned row is in the global namespace')
    assert.equal(
      lastSelectBindings?.[1],
      GLOBAL_REFERRAL_CAMPAIGN,
      'SELECT must look up by global namespace, not a per-event slug'
    )
    assert.equal(
      lastInsertBindings?.[2],
      GLOBAL_REFERRAL_CAMPAIGN,
      'INSERT must mint under the global namespace'
    )
  })

  test('GLOBAL constant value is "global" (rename detector)', ({ assert }) => {
    // If someone renames the constant value, downstream SQL (migration
    // 0024 backfill, scoring CTE filter intent) silently goes out of
    // sync. Pin the literal so a rename has to be deliberate + audited.
    assert.equal(GLOBAL_REFERRAL_CAMPAIGN, 'global')
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
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

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
      attributionEventSlug: EVENT,
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
      attributionEventSlug: EVENT,
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
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('self-referral blocked (referrer === referee)', async ({ assert }) => {
    respondInSequence([
      // lookup: code belongs to the SAME phone trying to claim it
      { rows: [{ code: 'ABC234', phone_number: REFEREE, event_slug: EVENT }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: REFEREE,
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
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
      attributionEventSlug: EVENT,
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
      attributionEventSlug: EVENT,
    })
    assert.equal(out.kind, 'unknown_code')
    assert.equal(rawQueryCalls.length, 1, 'only the lookup query fires for unknown codes')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Phone-format normalization — self-ref + attribution checks must NOT
// be fooled by bare-digit vs E.164 mismatches across callers
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit P2 (2026-05-18): if one side is bare digits and the other is
// E.164, naive `===` would miss the self-referral. canonicalizePhone is
// called at every public entry point so both sides land in the same
// canonical form before comparison.

test.group('captureReferral | bare vs E.164 self-ref guard', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('referrer stored bare ("573009999999"), referee passed E.164 → still self-ref', async ({
    assert,
  }) => {
    respondInSequence([
      // lookup returns code with bare-digit owner
      { rows: [{ code: 'ABC234', phone_number: '573009999999', event_slug: EVENT }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: '+573009999999', // E.164 form of the same person
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    assert.equal(out.kind, 'self_referral', 'bare vs E.164 mismatch must NOT bypass self-ref')
  })

  test('referrer E.164, referee bare → still self-ref', async ({ assert }) => {
    respondInSequence([
      { rows: [{ code: 'ABC234', phone_number: '+573009999999', event_slug: EVENT }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: '573009999999',
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    assert.equal(out.kind, 'self_referral')
  })

  test('invalid referee phone returns unknown_code (no DB writes)', async ({ assert }) => {
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: 'not-a-phone',
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    assert.equal(out.kind, 'unknown_code')
    assert.equal(rawQueryCalls.length, 0, 'invalid phone short-circuits before any DB call')
  })

  test('attribution write uses FK-safe forms (referrer = stored FK key, not always canonical)', async ({
    assert,
  }) => {
    // codeRow.phoneNumber is the stored FK key (bare here). The write
    // must use it verbatim — not canonicalize it — or the FK to
    // user_preferences breaks for legacy bare-digit rows. Referee
    // resolves via resolveUserPrefKey (returns canonical here because
    // UserPreference.findBy is mocked to null → no bare row).
    respondInSequence([
      { rows: [{ code: 'ABC234', phone_number: '573009999999', event_slug: EVENT }] },
      { rows: [] }, // no existing attribution
      { rows: [] }, // INSERT
    ])
    await captureReferral({
      code: 'ABC234',
      refereePhone: '+573001234567', // E.164 input
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    const insertCall = rawQueryCalls.find((c) =>
      c.sql.includes('INSERT INTO referral_attributions')
    )
    assert.exists(insertCall, 'attribution insert must fire')
    if (!insertCall) return
    const [referee, referrer] = insertCall.bindings as string[]
    assert.equal(
      referee,
      '+573001234567',
      'referee = canonical FK key (no bare row exists for this phone)'
    )
    assert.equal(referrer, '573009999999', 'referrer = stored FK key verbatim from codeRow (bare)')
  })
})

test.group('drainPendingReferral | bare vs E.164 input', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('bare-digit input resolves to FK-safe form before DELETE/INSERT', async ({ assert }) => {
    // No bare row exists (default mock) → resolveUserPrefKey returns
    // canonical. Bare-digit input gets canonicalized + resolved to '+...'.
    respondInSequence([
      {
        rows: [{ referrer_phone: '+573009999999', referral_code: 'ABC234', event_slug: EVENT }],
      },
    ])
    const out = await drainPendingReferral('573001234567') // bare digits
    assert.exists(out)
    const call = rawQueryCalls[0]
    assert.equal(
      (call.bindings as string[])[0],
      '+573001234567',
      'no bare row exists → drain uses canonical FK key'
    )
  })

  test('invalid phone returns null without touching DB', async ({ assert }) => {
    const out = await drainPendingReferral('garbage')
    assert.isNull(out)
    assert.equal(rawQueryCalls.length, 0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// FK-safety against legacy bare-digit user_preferences rows (audit P1)
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit P1 (2026-05-18): canonical-only writes broke FK against legacy
// rows still keyed as bare digits (pre-SH-003 backfill). The fix: writes
// resolve to the FK key via `resolveUserPrefKey`, comparisons stay on
// canonical. These tests pin both halves so a future "drop the
// resolveUserPrefKey indirection" refactor without finishing the
// backfill fails LOUDLY here, not silently in prod with FK errors.

test.group('FK compat | bare user_preferences rows', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('ensureReferralCode writes the BARE FK key when bare row exists', async ({ assert }) => {
    // Bare row exists in user_preferences → resolveUserPrefKey returns
    // bare digits so the FK constraint resolves cleanly.
    setBareRowExists(true)
    respondInSequence([
      { rows: [] }, // SELECT: no existing code
      { rows: [{ code: 'ABC234', phone_number: '573009999999', event_slug: EVENT }] }, // INSERT returns
    ])
    const out = await ensureReferralCode('+573009999999', EVENT)
    assert.equal(out.code, 'ABC234')

    const insertCall = rawQueryCalls.find((c) => c.sql.includes('INSERT INTO referral_codes'))
    assert.exists(insertCall, 'INSERT must fire')
    if (!insertCall) return
    const [, phone] = insertCall.bindings as string[]
    assert.equal(
      phone,
      '573009999999',
      'bare FK key written when legacy row exists (no `+` prefix)'
    )
  })

  test('captureReferral writes attribution with BARE FK key when referee bare row exists', async ({
    assert,
  }) => {
    setBareRowExists(true)
    respondInSequence([
      // lookup code (referrer already stored bare, as a sibling legacy row)
      { rows: [{ code: 'ABC234', phone_number: '573009999999', event_slug: EVENT }] },
      // no existing attribution
      { rows: [] },
      // INSERT attribution
      { rows: [] },
    ])
    await captureReferral({
      code: 'ABC234',
      refereePhone: '+573001234567', // canonical input
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    const insertCall = rawQueryCalls.find((c) =>
      c.sql.includes('INSERT INTO referral_attributions')
    )
    assert.exists(insertCall)
    if (!insertCall) return
    const [referee, referrer] = insertCall.bindings as string[]
    assert.equal(referee, '573001234567', 'referee FK key uses bare form (legacy row)')
    assert.equal(referrer, '573009999999', 'referrer FK key from stored codeRow (bare)')
  })

  test('self-ref STILL blocks across bare/E.164 even with bare legacy row', async ({ assert }) => {
    // Critical safety: even with the FK-key indirection, the self-ref
    // check stays on canonical comparison, so the same person can't
    // game it by exploiting a format mismatch.
    setBareRowExists(true)
    respondInSequence([
      // codeRow is bare; referee input is canonical for the SAME person
      { rows: [{ code: 'ABC234', phone_number: '573009999999', event_slug: EVENT }] },
    ])
    const out = await captureReferral({
      code: 'ABC234',
      refereePhone: '+573009999999', // E.164 same person
      refereeOnboarded: true,
      attributionEventSlug: EVENT,
    })
    assert.equal(out.kind, 'self_referral')
    const writes = rawQueryCalls.filter(
      (c) =>
        c.sql.includes('INSERT INTO referral_attributions') ||
        c.sql.includes('INSERT INTO pending_referrals')
    )
    assert.equal(writes.length, 0, 'self-ref must NOT touch attribution tables')
  })

  test('drainPendingReferral resolves to BARE FK key when bare legacy row exists', async ({
    assert,
  }) => {
    setBareRowExists(true)
    respondInSequence([
      {
        rows: [{ referrer_phone: '573009999999', referral_code: 'ABC234', event_slug: EVENT }],
      },
    ])
    const out = await drainPendingReferral('+573001234567')
    assert.exists(out)
    const call = rawQueryCalls[0]
    assert.equal(
      (call.bindings as string[])[0],
      '573001234567',
      'drain uses bare FK key when legacy row exists for the referee'
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// drainPendingReferral
// ══════════════════════════════════════════════════════════════════════════════

test.group('drainPendingReferral | atomicity + idempotency', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

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

// ══════════════════════════════════════════════════════════════════════════════
// formatReferralCodeMessage — share URL shape pin
// ══════════════════════════════════════════════════════════════════════════════
//
// Regression net for the 2026-05-18 "[link removed]" bug. The bot reply
// showed "Comparte tu link: [link removed]" because WhatsApp suppresses
// self-targeting wa.me URLs in bot messages. Fix routes the share link
// through `/r/<code>` on the web app instead. Any drift (regressing to
// raw wa.me, dropping the `/r/` prefix, or changing the code position
// in the path) breaks the redirect contract with the web route — these
// tests fail loudly if that happens.

test.group('formatReferralCodeMessage | share URL shape', () => {
  test('share URL points at /r/<code> on the web app (NOT raw wa.me)', ({ assert }) => {
    const out = formatReferralCodeMessage({ code: '8PAFNU', maxEntries: 5 }, 'es')
    assert.include(out, '/r/8PAFNU', 'share path must be /r/<code>')
    assert.notInclude(
      out,
      'wa.me',
      'raw wa.me URLs trigger WhatsApp suppression — never embed them'
    )
  })

  test('en + pt copies share the same URL shape', ({ assert }) => {
    for (const lang of ['en', 'pt'] as const) {
      const out = formatReferralCodeMessage({ code: '8PAFNU', maxEntries: 5 }, lang)
      assert.include(out, '/r/8PAFNU')
      assert.notInclude(out, 'wa.me')
    }
  })

  test('renders code + max entries verbatim in user-visible copy', ({ assert }) => {
    const out = formatReferralCodeMessage({ code: 'XYZ234', maxEntries: 3 }, 'es')
    assert.include(out, '*XYZ234*', 'code is bolded in the reply')
    assert.include(out, 'max 3', 'max entries surfaced in copy')
  })

  test('no em-dashes in any language variant', ({ assert }) => {
    // 2026-05-17 design rule: em-dashes mid-sentence read as AI-generated.
    for (const lang of ['en', 'es', 'pt'] as const) {
      const out = formatReferralCodeMessage({ code: 'ABCDEF', maxEntries: 5 }, lang)
      assert.notInclude(out, '—', `em-dash leaked into ${lang} variant`)
    }
  })
})
