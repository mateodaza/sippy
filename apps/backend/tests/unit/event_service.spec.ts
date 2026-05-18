/**
 * Event Service Unit Tests
 *
 * Covers the three service entry points used by the event-onboarding flow:
 *  - getActiveEventBySlug — silent reject (returns null) for unknown,
 *    inactive, or out-of-window events
 *  - linkUserToEvent — idempotent upsert with ON CONFLICT DO NOTHING; the
 *    first contact's linked_at_step wins on re-link
 *  - markPoapClaimed — discriminated outcome ('claimed' | 'already-claimed'
 *    | 'not-linked') so the UI doesn't lie when the user isn't linked
 *
 * Mocking strategy mirrors poll_colurs_movements.spec.ts:
 *  - db.rawQuery monkey-patched to capture SQL + return canned rows
 *  - Event.findBy and UserPreference.findBy monkey-patched
 */

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Event from '#models/event'
import UserPreference from '#models/user_preference'
import { getActiveEventBySlug, linkUserToEvent, markPoapClaimed } from '#services/event.service'

// ── DB mock infrastructure ──────────────────────────────────────────────────────

type RawQueryCall = { sql: string; bindings?: unknown[] }
type RawQueryResponse = { rows?: unknown[]; rowCount?: number }

let rawQueryCalls: RawQueryCall[] = []
let rawQueryHandlers: Array<{ pattern: string; response: RawQueryResponse }> = []
let origRawQuery: typeof db.rawQuery

function installDbMock() {
  rawQueryCalls = []
  rawQueryHandlers = []
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    for (const { pattern, response } of rawQueryHandlers) {
      if (sql.includes(pattern)) return response
    }
    return { rows: [], rowCount: 0 }
  }) as any
}

function restoreDbMock() {
  db.rawQuery = origRawQuery
}

function setQueryResponse(pattern: string, response: RawQueryResponse) {
  rawQueryHandlers.push({ pattern, response })
}

function queriesMatching(pattern: string): RawQueryCall[] {
  return rawQueryCalls.filter((c) => c.sql.includes(pattern))
}

// ── Model mock helpers ──────────────────────────────────────────────────────────

function mockEvent(row: Partial<Event> | null) {
  ;(Event as any).findBy = async (_col: string, _val: string) => row
}

/**
 * Mock UserPreference.findBy. Mirrors resolveUserPrefKey's two lookups:
 * canonical `+<digits>` first, then bare digits as a fallback. Returns a row
 * only when the queried value exactly matches `row.phoneNumber` so the helper
 * doesn't mistakenly strip the `+` for a non-existent bare-digit row.
 */
function mockUserPref(row: { phoneNumber: string } | null) {
  ;(UserPreference as any).findBy = async (_col: string, val: string) => {
    if (!row) return null
    return row.phoneNumber === val ? row : null
  }
}

function restoreModels() {
  delete (Event as any).findBy
  delete (UserPreference as any).findBy
}

function makeEvent(overrides: Partial<Event> = {}): Partial<Event> {
  return {
    id: 'evt-uuid-1',
    slug: 'pizza-day',
    name: 'Pizza Day',
    description: null,
    startsAt: null,
    endsAt: null,
    poapClaimUrl: 'https://poap.example/claim/abc',
    active: true,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// getActiveEventBySlug — silent reject
// ══════════════════════════════════════════════════════════════════════════════

test.group('event.service | getActiveEventBySlug', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(() => {
    restoreDbMock()
    restoreModels()
  })

  test('returns null for unknown slug', async ({ assert }) => {
    mockEvent(null)
    const result = await getActiveEventBySlug('does-not-exist')
    assert.isNull(result)
  })

  test('returns null when event is inactive', async ({ assert }) => {
    mockEvent(makeEvent({ active: false }))
    const result = await getActiveEventBySlug('pizza-day')
    assert.isNull(result)
  })

  test('returns null when current time is before startsAt', async ({ assert }) => {
    mockEvent(makeEvent({ startsAt: DateTime.now().plus({ days: 1 }) }))
    const result = await getActiveEventBySlug('pizza-day')
    assert.isNull(result)
  })

  test('returns null when current time is past endsAt', async ({ assert }) => {
    mockEvent(makeEvent({ endsAt: DateTime.now().minus({ days: 1 }) }))
    const result = await getActiveEventBySlug('pizza-day')
    assert.isNull(result)
  })

  test('returns event when active and inside window', async ({ assert }) => {
    mockEvent(
      makeEvent({
        startsAt: DateTime.now().minus({ days: 1 }),
        endsAt: DateTime.now().plus({ days: 1 }),
      })
    )
    const result = await getActiveEventBySlug('pizza-day')
    assert.isNotNull(result)
    assert.equal(result?.slug, 'pizza-day')
  })

  test('returns event when no window is configured', async ({ assert }) => {
    mockEvent(makeEvent({ startsAt: null, endsAt: null }))
    const result = await getActiveEventBySlug('pizza-day')
    assert.isNotNull(result)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// linkUserToEvent — silent reject + idempotent first-contact-wins
// ══════════════════════════════════════════════════════════════════════════════

test.group('event.service | linkUserToEvent', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(() => {
    restoreDbMock()
    restoreModels()
  })

  test('returns { linked: false } for unknown slug — no INSERT issued', async ({ assert }) => {
    mockEvent(null)
    mockUserPref({ phoneNumber: '+573001234567' })

    const result = await linkUserToEvent('+573001234567', 'unknown-slug')

    assert.deepEqual(result, { linked: false })
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('returns { linked: false } for inactive event — no INSERT issued', async ({ assert }) => {
    mockEvent(makeEvent({ active: false }))
    mockUserPref({ phoneNumber: '+573001234567' })

    const result = await linkUserToEvent('+573001234567', 'pizza-day')

    assert.deepEqual(result, { linked: false })
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('issues idempotent INSERT … ON CONFLICT DO NOTHING with the canonical bindings', async ({
    assert,
  }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    // SELECT readback after the upsert returns the (just inserted) row state
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    await linkUserToEvent('+573001234567', 'pizza-day', 'done', 'qr-booth')

    const inserts = queriesMatching('INSERT INTO user_event_links')
    assert.equal(inserts.length, 1, 'should issue exactly one upsert')
    assert.include(inserts[0].sql, 'ON CONFLICT (phone_number, event_id) DO NOTHING')

    const bindings = inserts[0].bindings as unknown[]
    assert.equal(bindings[0], '+573001234567', 'phone_number binding')
    assert.equal(bindings[1], 'evt-uuid-1', 'event_id binding')
    assert.equal(bindings[2], 'done', 'linked_at_step binding')
    assert.equal(bindings[3], JSON.stringify({ source: 'qr-booth' }), 'metadata binding')
  })

  test('first-contact-wins: re-link returns the original linked_at_step from readback', async ({
    assert,
  }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    // Simulate the row was originally inserted with step='done' at the booth.
    // A later 'returning' re-link should hit ON CONFLICT DO NOTHING and the
    // readback should return the preserved 'done' value.
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    const result = await linkUserToEvent('+573001234567', 'pizza-day', 'returning')

    assert.isTrue(result.linked)
    if (result.linked) {
      assert.equal(
        result.linkedAtStep,
        'done',
        'should preserve original step, not overwrite with the re-link step'
      )
    }
  })

  test('preserves poap_claimed=true from a prior claim on re-link', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: true }],
    })

    const result = await linkUserToEvent('+573001234567', 'pizza-day', 'returning')

    assert.isTrue(result.linked)
    if (result.linked) {
      assert.isTrue(result.poapClaimed, 'should reflect the stored claim state')
    }
  })

  test('actions includes "poap" when event has a poapClaimUrl', async ({ assert }) => {
    mockEvent(makeEvent({ poapClaimUrl: 'https://poap.example/x' }))
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    const result = await linkUserToEvent('+573001234567', 'pizza-day')

    assert.isTrue(result.linked)
    if (result.linked) {
      assert.includeMembers(result.actions, ['poap'])
    }
  })

  test('actions omits "poap" when event has no poapClaimUrl', async ({ assert }) => {
    mockEvent(makeEvent({ poapClaimUrl: null }))
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    const result = await linkUserToEvent('+573001234567', 'pizza-day')

    assert.isTrue(result.linked)
    if (result.linked) {
      assert.notInclude(result.actions, 'poap')
    }
  })

  test('omits metadata when no source is provided', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    await linkUserToEvent('+573001234567', 'pizza-day', 'done')

    const inserts = queriesMatching('INSERT INTO user_event_links')
    const bindings = inserts[0].bindings as unknown[]
    assert.isNull(bindings[3], 'metadata binding should be null when no source')
  })

  // ── Sippy Quest drain hook ────────────────────────────────────────────
  //
  // On `linkedAtStep === 'done'` we drain any pending referral row for
  // this phone into a real attribution. The hook MUST:
  //   - only fire on 'done' (not on 'returning', which is a re-tap of
  //     a deep link by an already-onboarded user — no onboarding event)
  //   - swallow drain errors (a Quest hiccup must never block onboarding)
  //   - run AFTER the upsert succeeds (the FK from referral_attributions
  //     to user_preferences would otherwise be premature)

  test('drain hook: fires DELETE FROM pending_referrals on step=done', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    await linkUserToEvent('+573001234567', 'pizza-day', 'done', 'qr-booth')

    const drains = queriesMatching('DELETE FROM pending_referrals')
    assert.equal(drains.length, 1, 'drain hook must fire exactly once on done')
  })

  test('drain hook: does NOT fire on step=returning', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'returning', poap_claimed: false }],
    })

    await linkUserToEvent('+573001234567', 'pizza-day', 'returning')

    const drains = queriesMatching('DELETE FROM pending_referrals')
    assert.equal(
      drains.length,
      0,
      'returning is a deep-link re-tap, not an onboarding event — drain must not fire'
    )
  })

  test('drain hook: passes the FK-form phone (not the canonical raw input)', async ({ assert }) => {
    // resolveUserPrefKey is mocked so the canonical input is preserved
    // (modern path). The drain hook should reuse that resolved key,
    // not re-derive a different one — otherwise a future bare-row
    // path would have the upsert and the drain looking at different
    // phone forms.
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })

    await linkUserToEvent('+573001234567', 'pizza-day', 'done')

    const drains = queriesMatching('DELETE FROM pending_referrals')
    assert.equal(drains.length, 1)
    // drainPendingReferral builds a CTE with $1 = phone. Last binding
    // of the call is the phone key the drain SQL keys on.
    const bindings = drains[0].bindings as unknown[]
    assert.equal(bindings[0], '+573001234567', 'drain must key on the FK-form phone')
  })

  test('drain hook: a drain failure does NOT break the link result', async ({ assert }) => {
    // Wrap the existing rawQuery mock so DELETE FROM pending_referrals
    // throws while every other call passes. The caller (linkUserToEvent)
    // must still return a successful linked: true response — Quest is a
    // bonus mechanic, never the gate.
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'done', poap_claimed: false }],
    })
    const wrapped = db.rawQuery
    db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
      if (sql.includes('DELETE FROM pending_referrals')) {
        throw new Error('simulated drain failure')
      }
      return wrapped(sql, bindings as any)
    }) as any

    const result = await linkUserToEvent('+573001234567', 'pizza-day', 'done')

    assert.isTrue(result.linked, 'link must still succeed even when drain throws')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// markPoapClaimed — state machine: claimed | already-claimed | not-linked
// ══════════════════════════════════════════════════════════════════════════════

test.group('event.service | markPoapClaimed', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(() => {
    restoreDbMock()
    restoreModels()
  })

  test('returns not-linked for unknown/inactive event without touching the DB', async ({
    assert,
  }) => {
    mockEvent(null)

    const result = await markPoapClaimed('+573001234567', 'unknown-slug')

    assert.deepEqual(result, { status: 'not-linked' })
    assert.equal(queriesMatching('UPDATE user_event_links').length, 0)
  })

  test('returns claimed when the conditional UPDATE flips poap_claimed→true', async ({
    assert,
  }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    // UPDATE … WHERE poap_claimed = FALSE matches → RETURNING yields one row
    setQueryResponse('UPDATE user_event_links', { rows: [{ '?column?': 1 }] })

    const result = await markPoapClaimed('+573001234567', 'pizza-day')

    assert.deepEqual(result, { status: 'claimed' })
    // We shouldn't need the disambiguation SELECT when the UPDATE succeeded
    assert.equal(
      queriesMatching('SELECT 1 FROM user_event_links').length,
      0,
      'no disambiguation SELECT when UPDATE matched'
    )
  })

  test('returns already-claimed when UPDATE misses but the link row exists', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    // UPDATE … RETURNING 1 misses (row exists but poap_claimed is already TRUE)
    setQueryResponse('UPDATE user_event_links', { rows: [] })
    // Disambiguation SELECT finds the existing link row
    setQueryResponse('SELECT 1 FROM user_event_links', { rows: [{ '?column?': 1 }] })

    const result = await markPoapClaimed('+573001234567', 'pizza-day')

    assert.deepEqual(result, { status: 'already-claimed' })
  })

  test('returns not-linked when UPDATE misses and no link row exists', async ({ assert }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })

    setQueryResponse('UPDATE user_event_links', { rows: [] })
    setQueryResponse('SELECT 1 FROM user_event_links', { rows: [] })

    const result = await markPoapClaimed('+573001234567', 'pizza-day')

    assert.deepEqual(result, { status: 'not-linked' })
  })

  test("UPDATE uses COALESCE(poap_claimed_at, now()) so re-flips don't move the timestamp", async ({
    assert,
  }) => {
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('UPDATE user_event_links', { rows: [{ '?column?': 1 }] })

    await markPoapClaimed('+573001234567', 'pizza-day')

    const updates = queriesMatching('UPDATE user_event_links')
    assert.equal(updates.length, 1)
    assert.include(updates[0].sql, 'COALESCE(poap_claimed_at, now())')
    assert.include(updates[0].sql, 'poap_claimed = FALSE', 'UPDATE is conditional on prior false')
    assert.include(
      updates[0].sql,
      'RETURNING 1',
      'uses RETURNING for driver-agnostic row detection'
    )
  })
})
