/**
 * Bracket-Token Service Unit Tests
 *
 * Covers the two pure entry points used by the WhatsApp bracket-handler:
 *
 *  - extractBracketToken — pure regex extraction; never touches DB
 *  - dispatchBracketToken — full event-link dispatch:
 *      * unknown short-id → not_found (caller falls through)
 *      * revoked link → revoked (caller falls through)
 *      * unsupported kind (pay/referral) → fall through
 *      * onboarded user + active event → event_linked, link row written
 *      * NOT onboarded user + active event → event_needs_onboarding,
 *        NO link row written (FK would fail), setup URL replies
 *
 * DB / model mocking strategy mirrors event_service.spec.ts.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Event from '#models/event'
import UserPreference from '#models/user_preference'
import { extractBracketToken, dispatchBracketToken } from '#services/bracket_token.service'

// ── DB mock infrastructure ──────────────────────────────────────────────────────

type RawQueryCall = { sql: string; bindings?: unknown[] }
type RawQueryResponse = { rows?: unknown[]; rowCount?: number }

let rawQueryCalls: RawQueryCall[] = []
let rawQueryHandlers: Array<{ pattern: string; response: RawQueryResponse }> = []
let origRawQuery: typeof db.rawQuery

/** Normalize whitespace so substring-matchers don't break on a stray
 *  newline/indent change in the underlying SQL string. */
function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function installDbMock() {
  rawQueryCalls = []
  rawQueryHandlers = []
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    const normalized = normalizeSql(sql)
    rawQueryCalls.push({ sql: normalized, bindings })
    for (const { pattern, response } of rawQueryHandlers) {
      if (normalized.includes(normalizeSql(pattern))) return response
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
  const needle = normalizeSql(pattern)
  return rawQueryCalls.filter((c) => c.sql.includes(needle))
}

// ── Model mock helpers ──────────────────────────────────────────────────────────

function mockEvent(row: Partial<Event> | null) {
  ;(Event as any).findBy = async (_col: string, _val: string) => row
}

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
    slug: 'pizza-day-ctg-2026',
    name: 'Pizza Day Cartagena 2026',
    description: null,
    startsAt: null,
    endsAt: null,
    poapClaimUrl: 'https://poap.example/x',
    active: true,
    ...overrides,
  }
}

interface QrLinkRow {
  short_id: string
  kind: 'event' | 'pay' | 'referral'
  status: 'active' | 'revoked'
  owner_phone_number: string
  event_slug: string | null
  source_tag: string | null
  display_name: string | null
}

function mockQrLink(row: QrLinkRow | null) {
  setQueryResponse('FROM qr_links WHERE short_id', {
    rows: row ? [row] : [],
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// extractBracketToken — pure extraction
// ══════════════════════════════════════════════════════════════════════════════

test.group('bracket_token.service | extractBracketToken', () => {
  test('returns null shortId when text has no bracket', ({ assert }) => {
    const r = extractBracketToken('hola sippy quiero saldo')
    assert.isNull(r.shortId)
    assert.equal(r.stripped, 'hola sippy quiero saldo')
  })

  test('extracts a Crockford-style 8-char token and strips it from text', ({ assert }) => {
    const r = extractBracketToken('Hola Sippy! [ABC23XYZ]')
    assert.equal(r.shortId, 'ABC23XYZ')
    assert.equal(r.stripped, 'Hola Sippy!')
  })

  test('strips the bracket from the middle of the message and collapses whitespace', ({
    assert,
  }) => {
    const r = extractBracketToken('hola   [ABC23XYZ]   balance')
    assert.equal(r.shortId, 'ABC23XYZ')
    assert.equal(r.stripped, 'hola balance')
  })

  test('first match wins — a second token cannot override the first', ({ assert }) => {
    const r = extractBracketToken('[ABC23XYZ] then [DEF45WPQ]')
    assert.equal(r.shortId, 'ABC23XYZ')
    // Second bracket left intact — we only strip the matched one.
    assert.include(r.stripped, '[DEF45WPQ]')
  })

  test('rejects lowercase (alphabet is uppercase-only per qr_short_id spec)', ({ assert }) => {
    const r = extractBracketToken('Hola [abc23xyz]')
    assert.isNull(r.shortId)
    assert.equal(r.stripped, 'Hola [abc23xyz]')
  })

  test('rejects forbidden Crockford chars (0, 1, I, L, O)', ({ assert }) => {
    // Token contains '0' — should not match
    assert.isNull(extractBracketToken('[ABC23X0Z]').shortId)
    // Token contains 'I'
    assert.isNull(extractBracketToken('[ABC23XIZ]').shortId)
    // Token contains 'O'
    assert.isNull(extractBracketToken('[ABC23XOZ]').shortId)
    // Token contains 'L'
    assert.isNull(extractBracketToken('[ABC23XLZ]').shortId)
    // Token contains '1'
    assert.isNull(extractBracketToken('[ABC23X1Z]').shortId)
  })

  test('rejects wrong length tokens', ({ assert }) => {
    assert.isNull(extractBracketToken('[ABC23X]').shortId, 'too short')
    assert.isNull(extractBracketToken('[ABC23XYZQ]').shortId, 'too long')
  })

  test('handles empty input safely', ({ assert }) => {
    const r = extractBracketToken('')
    assert.isNull(r.shortId)
    assert.equal(r.stripped, '')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// dispatchBracketToken — full DB-backed dispatch
// ══════════════════════════════════════════════════════════════════════════════

test.group('bracket_token.service | dispatchBracketToken', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(() => {
    restoreDbMock()
    restoreModels()
  })

  test('returns not_found when shortId has no matching qr_links row', async ({ assert }) => {
    mockQrLink(null)

    const r = await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'not_found')
    assert.isNull(r.reply)
    // Should NOT have issued an INSERT against user_event_links
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('returns revoked with a reply when the qr_links row is status=revoked', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'revoked',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })

    const r = await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'revoked')
    assert.isNotNull(r.reply, 'reply tells the user the QR is dead instead of silent fall-through')
    assert.include(r.reply!, 'organizador', 'Spanish "ask an organizer" copy')
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('pay QR returns pay_prompt_for_amount with vendor framing + payRecipient', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'PAYZ23XY',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: null,
      source_tag: null,
      display_name: 'Carolina Pizza',
    })

    const r = await dispatchBracketToken({
      shortId: 'PAYZ23XY',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_prompt_for_amount')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, 'Carolina Pizza')
    assert.include(r.reply!, 'comercio')
    assert.equal(r.payRecipient, '+573000000000', 'vendor phone returned for partial-send stash')
    assert.equal(r.payDisplayName, 'Carolina Pizza')
    // No event-link writes for pay-kind dispatch
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('pay QR with sender === owner returns pay_self_send (no payRecipient)', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'SELFPAY1',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '+573001234567',
      event_slug: null,
      source_tag: null,
      display_name: 'Carolina Pizza',
    })

    const r = await dispatchBracketToken({
      shortId: 'SELFPAY1',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_self_send')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, 'tu propio')
    assert.isUndefined(r.payRecipient, 'no recipient stash on self-send')
  })

  test('pay QR self-send guard canonicalizes bare-digit owner vs E.164 sender', async ({
    assert,
  }) => {
    // Legacy bare-digit owner vs canonical E.164 sender from the WhatsApp
    // webhook. Raw string compare would miss this and the sender would be
    // awkwardly prompted to pay themselves.
    mockQrLink({
      short_id: 'SELFPAY2',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '573001234567', // bare digits
      event_slug: null,
      source_tag: null,
      display_name: 'Carolina Pizza',
    })

    const r = await dispatchBracketToken({
      shortId: 'SELFPAY2',
      phoneNumber: '+573001234567', // canonical E.164
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_self_send', 'canonicalize matches bare to +')
  })

  test('pay QR self-send guard matches when both stored as bare digits', async ({ assert }) => {
    // Belt-and-suspenders — both sides bare (impossible in current code but
    // protects against a future regression where the webhook stops
    // canonicalizing the sender).
    mockQrLink({
      short_id: 'SELFPAY3',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '573001234567',
      event_slug: null,
      source_tag: null,
      display_name: 'X',
    })

    const r = await dispatchBracketToken({
      shortId: 'SELFPAY3',
      phoneNumber: '573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_self_send')
  })

  test('pay QR self-send guard canonicalizes formatted owner (whitespace, dashes)', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'SELFPAY4',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '+57 300-123 4567', // human-formatted
      event_slug: null,
      source_tag: null,
      display_name: 'X',
    })

    const r = await dispatchBracketToken({
      shortId: 'SELFPAY4',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_self_send', 'normalization strips whitespace + dashes')
  })

  test('pay QR with unparseable owner phone surfaces inactive-QR reply', async ({ assert }) => {
    // Owner phone is corrupt (failed canonicalization). The data-integrity
    // guard at bracket_token.service.ts treats this as a dead QR rather
    // than letting the flow proceed — the self-send check is otherwise
    // unsafe and an attendee could be prompted to pay a malformed-phone
    // vendor.
    mockQrLink({
      short_id: 'BADOWN23',
      kind: 'pay',
      status: 'active',
      owner_phone_number: 'not-a-phone',
      event_slug: null,
      source_tag: null,
      display_name: 'Glitched Vendor',
    })

    const r = await dispatchBracketToken({
      shortId: 'BADOWN23',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'revoked', 'corrupt owner row treated as dead QR')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, 'organizador', 'inactive-QR copy')
    // Must NOT prompt the payer for an amount
    assert.notEqual(r.outcome, 'pay_prompt_for_amount')
  })

  test('pay QR falls back to masked phone when display_name is null', async ({ assert }) => {
    mockQrLink({
      short_id: 'PAYZNULL',
      kind: 'pay',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: null,
      source_tag: null,
      display_name: null,
    })

    const r = await dispatchBracketToken({
      shortId: 'PAYZNULL',
      phoneNumber: '+573009999999',
      lang: 'es',
    })

    assert.equal(r.outcome, 'pay_prompt_for_amount')
    // Masked vendor phone surfaces in reply when displayName is missing
    assert.include(r.reply!, '+57', 'mask retains country code')
    assert.equal(r.payDisplayName?.startsWith('+57'), true)
  })

  test('referral kind still falls through as unsupported_kind', async ({ assert }) => {
    mockQrLink({
      short_id: 'REFRAL23',
      kind: 'referral',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: null,
      source_tag: null,
      display_name: null,
    })

    const r = await dispatchBracketToken({
      shortId: 'REFRAL23',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'unsupported_kind')
    assert.isNull(r.reply)
  })

  test('returns revoked with a reply when the event row is inactive (admin revoked / endsAt passed)', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })
    // Event lookup returns inactive. Bracket dispatcher should treat this
    // like a revoked QR — reply so the user knows, don't silently fall
    // through with an empty stripped message.
    mockEvent(makeEvent({ active: false }))

    const r = await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'revoked')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, 'organizador')
    assert.equal(queriesMatching('INSERT INTO user_event_links').length, 0)
  })

  test('linkUserToEvent throw bubbles up instead of silently sending a lying welcome', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    // Force the INSERT to throw — simulates an FK race or DB outage during
    // the link write. Old behavior swallowed and still replied "checked in"
    // (attendee invisible to operator dashboard, no POAP). New behavior
    // re-throws so the webhook's outer catch surfaces a generic error and
    // Meta retries the message — idempotent insert succeeds on retry.
    setQueryResponse('INSERT INTO user_event_links', {
      rows: [],
    })
    // Override the mock to actually throw for this query
    const origRq = db.rawQuery
    ;(db as any).rawQuery = async (sql: string, bindings?: unknown[]) => {
      if (sql.includes('INSERT INTO user_event_links')) {
        throw new Error('simulated FK race')
      }
      return origRq.call(db, sql, bindings as any)
    }

    try {
      await assert.rejects(
        () =>
          dispatchBracketToken({
            shortId: 'ABC23XYZ',
            phoneNumber: '+573001234567',
            lang: 'es',
          }),
        'simulated FK race'
      )
    } finally {
      ;(db as any).rawQuery = origRq
    }
  })

  test('event + onboarded user → event_linked, inserts user_event_links with step=returning', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    // Readback after the upsert
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'returning', poap_claimed: false }],
    })

    const r = await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'event_linked')
    assert.equal(r.eventSlug, 'pizza-day-ctg-2026')
    assert.equal(r.sourceTag, 'asst-carolina')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, 'Pizza Day Cartagena 2026')

    const inserts = queriesMatching('INSERT INTO user_event_links')
    assert.equal(inserts.length, 1, 'one upsert against user_event_links')
    assert.include(inserts[0].sql, 'ON CONFLICT (phone_number, event_id) DO NOTHING')

    const bindings = inserts[0].bindings as unknown[]
    assert.equal(bindings[0], '+573001234567', 'phone_number')
    assert.equal(bindings[1], 'evt-uuid-1', 'event_id')
    assert.equal(bindings[2], 'returning', 'linked_at_step')
    assert.equal(
      bindings[3],
      JSON.stringify({ source: 'asst-carolina' }),
      'metadata.source preserved'
    )
  })

  test('event + NOT onboarded user → event_needs_onboarding, NO link row written', async ({
    assert,
  }) => {
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })
    mockEvent(makeEvent())
    // No user_preferences row → FK would fail; dispatcher must short-circuit
    mockUserPref(null)

    const r = await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573009999999',
      lang: 'es',
    })

    assert.equal(r.outcome, 'event_needs_onboarding')
    assert.isNotNull(r.reply)
    assert.include(r.reply!, '/setup?')
    assert.include(r.reply!, 'event=pizza-day-ctg-2026')
    assert.include(r.reply!, 'source=asst-carolina')
    assert.equal(
      queriesMatching('INSERT INTO user_event_links').length,
      0,
      'no link row — would violate FK to user_preferences'
    )
  })

  test('uses UPDATE on qr_scans (not INSERT) so /q/ scan analytics are not double-counted', async ({
    assert,
  }) => {
    // The scan-dedup contract: /q/<id> already INSERTed a qr_scans row when
    // the user scanned the QR in the browser. The bracket-handler must UPDATE
    // that row with the resolved phone — NOT insert a second row, which
    // would double-count scans + leave the original row unresolved forever.
    mockQrLink({
      short_id: 'ABC23XYZ',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: 'asst-carolina',
      display_name: 'Carolina',
    })
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'returning', poap_claimed: false }],
    })

    await dispatchBracketToken({
      shortId: 'ABC23XYZ',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    const inserts = queriesMatching('INSERT INTO qr_scans')
    assert.equal(inserts.length, 0, 'no INSERT against qr_scans — would double-count')

    const updates = queriesMatching('UPDATE qr_scans')
    assert.equal(updates.length, 1, 'exactly one UPDATE to resolve the prior /q/ scan')
    assert.include(updates[0].sql, 'SET resolved_to_phone_number')
    assert.include(updates[0].sql, 'resolved_to_phone_number IS NULL')
    assert.include(updates[0].sql, 'ORDER BY scanned_at DESC')
    assert.include(updates[0].sql, 'LIMIT 1', 'only the most-recent unresolved row is updated')

    const bindings = updates[0].bindings as unknown[]
    assert.equal(bindings[0], '+573001234567', 'phoneNumber binding')
    assert.equal(bindings[1], 'ABC23XYZ', 'shortId binding')
  })

  test('not_found / revoked / unsupported_kind all UPDATE qr_scans, never INSERT', async ({
    assert,
  }) => {
    // Same dedup invariant for the non-success outcomes — the /q/ controller
    // already logged the scan with its own outcome (not_found/revoked/etc),
    // we just resolve the phone on the existing row.
    for (const scenario of [
      { name: 'not_found', link: null },
      {
        name: 'revoked',
        link: {
          short_id: 'ABC23XYZ',
          kind: 'event' as const,
          status: 'revoked' as const,
          owner_phone_number: '+573000000000',
          event_slug: 'pizza-day-ctg-2026',
          source_tag: 'asst-carolina',
          display_name: 'Carolina',
        },
      },
      {
        name: 'unsupported_kind',
        link: {
          short_id: 'PAYZ23XY',
          kind: 'pay' as const,
          status: 'active' as const,
          owner_phone_number: '+573000000000',
          event_slug: null,
          source_tag: null,
          display_name: 'Carolina Pizza',
        },
      },
    ]) {
      // Reset between scenarios
      rawQueryCalls = []
      rawQueryHandlers = []
      mockQrLink(scenario.link as any)

      await dispatchBracketToken({
        shortId: 'ABC23XYZ',
        phoneNumber: '+573001234567',
        lang: 'es',
      })

      assert.equal(
        queriesMatching('INSERT INTO qr_scans').length,
        0,
        `${scenario.name}: no INSERT into qr_scans`
      )
      assert.equal(
        queriesMatching('UPDATE qr_scans').length,
        1,
        `${scenario.name}: exactly one UPDATE`
      )
    }
  })

  test('event with no source tag → event_linked, metadata is null', async ({ assert }) => {
    mockQrLink({
      short_id: 'NOTAG23X',
      kind: 'event',
      status: 'active',
      owner_phone_number: '+573000000000',
      event_slug: 'pizza-day-ctg-2026',
      source_tag: null,
      display_name: null,
    })
    mockEvent(makeEvent())
    mockUserPref({ phoneNumber: '+573001234567' })
    setQueryResponse('SELECT linked_at_step, poap_claimed', {
      rows: [{ linked_at_step: 'returning', poap_claimed: false }],
    })

    const r = await dispatchBracketToken({
      shortId: 'NOTAG23X',
      phoneNumber: '+573001234567',
      lang: 'es',
    })

    assert.equal(r.outcome, 'event_linked')
    const inserts = queriesMatching('INSERT INTO user_event_links')
    assert.equal(inserts.length, 1)
    assert.isNull((inserts[0].bindings as unknown[])[3], 'metadata null when no source')
  })
})
