/**
 * Admin Events Controller — Unit Tests
 *
 * Covers the live-monitoring endpoint:
 *   GET /admin/events/:slug/attendees
 *
 * The controller mixes Lucid query-builder calls (step counts, POAP split,
 * paginated list) with one raw SQL query (the JSONB source-tag breakdown).
 * Tests monkey-patch `db.rawQuery` for the JSONB query and stub the chained
 * builder for the others — same mocking strategy as event_service.spec.ts.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Event from '#models/event'
import EventsController from '#controllers/admin/events_controller'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

// ── DB rawQuery mock (used only by the bySource JSONB query) ────────────────────

type RawQueryCall = { sql: string; bindings?: unknown[] }
type RawQueryResponse = { rows?: unknown[]; rowCount?: number }

let rawQueryCalls: RawQueryCall[] = []
let rawQueryHandlers: Array<{ pattern: string; response: RawQueryResponse }> = []
let origRawQuery: typeof db.rawQuery

function installRawQueryMock() {
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

function restoreRawQueryMock() {
  db.rawQuery = origRawQuery
}

function setQueryResponse(pattern: string, response: RawQueryResponse) {
  rawQueryHandlers.push({ pattern, response })
}

// ── Query-builder stub ──────────────────────────────────────────────────────────
//
// db.from() returns a chainable builder. The controller calls four distinct
// shapes against `user_event_links`. We stub by intercepting db.from and
// returning a hand-rolled chainable whose `then`/await resolves to the
// configured payload for whichever shape was built. The matcher uses a
// fingerprint of methods called so a test can declare:
//
//   stubQuery({ select: ['linked_at_step'], groupBy: 'linked_at_step' }, rows)
//
// and that shape will be returned only when the controller builds exactly
// that chain. Keeps the stubs precise — a typo in the controller (wrong
// column selected) fails the test rather than silently returning fake data.

interface QueryShape {
  select?: string[]
  groupBy?: string
  countAlias?: boolean
  poapFiltered?: boolean
  paginate?: boolean
  first?: boolean
}

interface QueryStubEntry {
  match: (s: QueryShape) => boolean
  rows: unknown
}

let queryStubs: QueryStubEntry[] = []
let origFrom: typeof db.from

function installFromStub() {
  queryStubs = []
  origFrom = db.from.bind(db)
  ;(db as any).from = (_table: string) => makeBuilder()
}

function restoreFromStub() {
  ;(db as any).from = origFrom
}

function stubQuery(match: (s: QueryShape) => boolean, rows: unknown) {
  queryStubs.push({ match, rows })
}

function makeBuilder() {
  const shape: QueryShape = { select: [] }

  const builder: any = {
    where: () => builder,
    select: (...args: any[]) => {
      shape.select = (shape.select ?? []).concat(args.flat().map(String))
      return builder
    },
    count: (alias: string) => {
      shape.countAlias = alias === '* as count'
      return builder
    },
    groupBy: (col: any) => {
      shape.groupBy = typeof col === 'string' ? col : 'raw'
      return builder
    },
    orderBy: () => builder,
    limit: () => builder,
    offset: () => {
      shape.paginate = true
      return builder
    },
    first: async () => {
      shape.first = true
      // Run match against accumulated shape; first() returns the first row.
      for (const stub of queryStubs) {
        if (stub.match(shape)) {
          const rows = stub.rows as any[]
          return rows[0]
        }
      }
      return null
    },
    // Make the builder awaitable. Lucid's builder is thenable; tests await it.
    then: (resolve: (rows: unknown) => void, reject?: (err: Error) => void) => {
      try {
        for (const stub of queryStubs) {
          if (stub.match(shape)) return resolve(stub.rows)
        }
        // Default: empty array — controller is robust to this.
        return resolve([])
      } catch (e) {
        reject?.(e as Error)
      }
    },
  }

  // Catch raw-builder usage in select() — `db.raw(...)` returns an object that
  // ends up as the only select arg. We don't introspect it; the count
  // aggregator is enough to fingerprint this shape.
  return builder
}

// ── Event model stub ────────────────────────────────────────────────────────────

function mockEvent(row: Partial<Event> | null) {
  ;(Event as any).findBy = async (_col: string, _val: string) => row
}

function restoreModels() {
  delete (Event as any).findBy
}

function makeEvent(overrides: Partial<Event> = {}): Partial<Event> {
  return {
    id: 'evt-uuid-1',
    slug: 'pizza-day-ctg-2026',
    name: 'Pizza Day Cartagena 2026',
    description: null,
    startsAt: null,
    endsAt: DateTime.fromISO('2026-05-22T22:00:00.000Z'),
    poapClaimUrl: 'https://poap.example/x',
    active: true,
    ...overrides,
  }
}

// ── HttpContext fake ────────────────────────────────────────────────────────────
//
// The controller only touches: params.slug, request.input(), request.accepts(),
// response.notFound/badRequest/ok, and inertia.render. Stub each minimally
// and capture what the controller hands back.

interface FakeResponse {
  notFound: (body: unknown) => unknown
  badRequest: (body: unknown) => unknown
  ok: (body: unknown) => unknown
}

interface CapturedCall {
  type: 'inertia' | 'json' | 'notFound' | 'badRequest'
  component?: string
  payload?: unknown
}

function makeCtx(args: {
  slug: string | undefined
  inputs?: Record<string, string | number>
  accepts?: 'html' | 'json'
}): { ctx: HttpContext; captured: CapturedCall[] } {
  const captured: CapturedCall[] = []
  const response: FakeResponse = {
    notFound: (body) => {
      captured.push({ type: 'notFound', payload: body })
      return body
    },
    badRequest: (body) => {
      captured.push({ type: 'badRequest', payload: body })
      return body
    },
    ok: (body) => {
      captured.push({ type: 'json', payload: body })
      return body
    },
  }
  const request = {
    input: (key: string, dflt?: unknown) =>
      args.inputs && key in args.inputs ? args.inputs[key] : (dflt ?? undefined),
    accepts: (_: string[]) => args.accepts ?? 'html',
  }
  const inertia = {
    render: async (component: string, payload: unknown) => {
      captured.push({ type: 'inertia', component, payload })
      return { component, payload }
    },
  }
  const params: Record<string, unknown> = {}
  if (args.slug !== undefined) params.slug = args.slug
  return {
    ctx: { params, request, response, inertia } as unknown as HttpContext,
    captured,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('admin/events_controller | attendees', (group) => {
  group.each.setup(() => {
    installRawQueryMock()
    installFromStub()
  })
  group.each.teardown(() => {
    restoreRawQueryMock()
    restoreFromStub()
    restoreModels()
  })

  test('400 when :slug param is empty', async ({ assert }) => {
    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({ slug: '   ' })
    await ctrl.attendees(ctx)
    assert.equal(captured.length, 1)
    assert.equal(captured[0].type, 'badRequest')
  })

  test('404 when the event slug is not found', async ({ assert }) => {
    mockEvent(null)
    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({ slug: 'does-not-exist' })
    await ctrl.attendees(ctx)
    assert.equal(captured[0].type, 'notFound')
  })

  test('renders Inertia page with computed counts when Accept is HTML', async ({ assert }) => {
    mockEvent(makeEvent())

    // linked_at_step breakdown
    stubQuery(
      (s) => s.groupBy === 'linked_at_step',
      [
        { linked_at_step: 'done', count: 7 },
        { linked_at_step: 'returning', count: 3 },
      ]
    )

    // POAP split — uses .first(), filtered aggregates
    stubQuery((s) => s.first === true, [{ claimed: 4, unclaimed: 6 }])

    // Paginated list — has .offset() called
    stubQuery(
      (s) => s.paginate === true,
      [
        {
          phone_number: '+573001234567',
          linked_at_step: 'done',
          poap_claimed: true,
          poap_claimed_at: '2026-05-22T19:32:11.000Z',
          metadata: { source: 'asst-carolina' },
          created_at: '2026-05-22T19:30:01.000Z',
        },
        {
          phone_number: '+573009999999',
          linked_at_step: 'returning',
          poap_claimed: false,
          poap_claimed_at: null,
          metadata: null,
          created_at: '2026-05-22T19:25:00.000Z',
        },
      ]
    )

    // bySource — raw SQL path
    setQueryResponse(`metadata->>'source' AS source`, {
      rows: [
        { source: 'asst-carolina', count: 5 },
        { source: null, count: 5 },
      ],
    })

    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({ slug: 'pizza-day-ctg-2026', accepts: 'html' })
    await ctrl.attendees(ctx)

    assert.equal(captured.length, 1)
    assert.equal(captured[0].type, 'inertia')
    assert.equal(captured[0].component, 'admin/event_attendees')

    const props = captured[0].payload as any
    assert.equal(props.event.slug, 'pizza-day-ctg-2026')
    assert.equal(props.event.name, 'Pizza Day Cartagena 2026')
    assert.equal(props.counts.total, 10, 'total = sum of step buckets')
    assert.equal(props.counts.byStep.done, 7)
    assert.equal(props.counts.byStep.returning, 3)
    assert.equal(props.counts.byStep.unknown, 0)
    assert.equal(props.counts.poap.claimed, 4)
    assert.equal(props.counts.poap.unclaimed, 6)
    assert.deepEqual(props.counts.bySource, [
      { source: 'asst-carolina', count: 5 },
      { source: null, count: 5 },
    ])
    assert.equal(props.attendees.data.length, 2)
    // Phones are masked server-side so the JSON payload never exposes raw
    // E.164 to viewer-role admins. maskPhone keeps country code + last 2.
    assert.equal(props.attendees.data[0].phoneNumber, '+57********67')
    assert.equal(props.attendees.data[0].source, 'asst-carolina')
    assert.isTrue(props.attendees.data[0].poapClaimed)
    assert.isNull(props.attendees.data[1].source, 'null metadata.source surfaces as null')
  })

  test('returns JSON when Accept is application/json', async ({ assert }) => {
    mockEvent(makeEvent())
    stubQuery((s) => s.groupBy === 'linked_at_step', [{ linked_at_step: 'done', count: 2 }])
    stubQuery((s) => s.first === true, [{ claimed: 1, unclaimed: 1 }])
    stubQuery((s) => s.paginate === true, [])
    setQueryResponse(`metadata->>'source' AS source`, { rows: [] })

    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({ slug: 'pizza-day-ctg-2026', accepts: 'json' })
    await ctrl.attendees(ctx)

    assert.equal(captured.length, 1)
    assert.equal(captured[0].type, 'json', 'no Inertia render on JSON Accept')
    const payload = captured[0].payload as any
    assert.equal(payload.counts.total, 2)
    assert.equal(payload.counts.byStep.done, 2)
  })

  test('pagination meta reflects ?page= and ?perPage=', async ({ assert }) => {
    mockEvent(makeEvent())
    stubQuery((s) => s.groupBy === 'linked_at_step', [{ linked_at_step: 'done', count: 47 }])
    stubQuery((s) => s.first === true, [{ claimed: 19, unclaimed: 28 }])
    stubQuery((s) => s.paginate === true, [])
    setQueryResponse(`metadata->>'source' AS source`, { rows: [] })

    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({
      slug: 'pizza-day-ctg-2026',
      inputs: { page: '3', perPage: '10' },
      accepts: 'json',
    })
    await ctrl.attendees(ctx)

    const payload = captured[0].payload as any
    assert.equal(payload.attendees.meta.page, 3)
    assert.equal(payload.attendees.meta.perPage, 10)
    assert.equal(payload.attendees.meta.total, 47)
    assert.equal(payload.attendees.meta.lastPage, 5, 'ceil(47/10) = 5')
  })

  test('perPage is capped at MAX_PER_PAGE (200) and floored at 1', async ({ assert }) => {
    mockEvent(makeEvent())
    stubQuery((s) => s.groupBy === 'linked_at_step', [])
    stubQuery((s) => s.first === true, [{ claimed: 0, unclaimed: 0 }])
    stubQuery((s) => s.paginate === true, [])
    setQueryResponse(`metadata->>'source' AS source`, { rows: [] })

    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({
      slug: 'pizza-day-ctg-2026',
      inputs: { perPage: '10000' }, // way over cap
      accepts: 'json',
    })
    await ctrl.attendees(ctx)
    assert.equal((captured[0].payload as any).attendees.meta.perPage, 200)

    const { ctx: ctx2, captured: cap2 } = makeCtx({
      slug: 'pizza-day-ctg-2026',
      inputs: { perPage: '0' }, // under floor
      accepts: 'json',
    })
    await ctrl.attendees(ctx2)
    assert.equal((cap2[0].payload as any).attendees.meta.perPage, 1)
  })

  test('unknown linked_at_step values bucket into "unknown"', async ({ assert }) => {
    // Future-proofing: if a row escapes the CHECK constraint, we want it
    // visible in the dashboard rather than silently dropped from counts.
    mockEvent(makeEvent())
    stubQuery(
      (s) => s.groupBy === 'linked_at_step',
      [
        { linked_at_step: 'done', count: 5 },
        { linked_at_step: 'weird_value', count: 2 },
        { linked_at_step: null, count: 1 },
      ]
    )
    stubQuery((s) => s.first === true, [{ claimed: 0, unclaimed: 8 }])
    stubQuery((s) => s.paginate === true, [])
    setQueryResponse(`metadata->>'source' AS source`, { rows: [] })

    const ctrl = new EventsController()
    const { ctx, captured } = makeCtx({ slug: 'pizza-day-ctg-2026', accepts: 'json' })
    await ctrl.attendees(ctx)

    const props = captured[0].payload as any
    assert.equal(props.counts.byStep.done, 5)
    assert.equal(props.counts.byStep.returning, 0)
    assert.equal(props.counts.byStep.unknown, 3, 'unknown + null roll up together')
    assert.equal(props.counts.total, 8)
  })
})
