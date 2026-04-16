/**
 * pollColursMovements Unit Tests
 *
 * Tests the offramp polling job that checks Colurs exchange movement statuses
 * and transitions offramp_orders accordingly.
 *
 * Mocking strategy:
 *  - db.rawQuery is monkey-patched to capture SQL calls and return canned rows
 *  - global.fetch is replaced so colursGet (called by getMovement) returns
 *    controlled responses without hitting the network
 *  - Colurs env vars are set so the auth service doesn't throw on missing config
 *
 * Coverage:
 *  1. stuck pulling_usdc orders (>5 min) → needs_reconciliation
 *  2. pending_fx + Colurs movement completed → order completed
 *  3. pending_fx + Colurs movement failed/rejected → needs_reconciliation
 *  4. max-poll timeout (poll_count >= 10080) → needs_reconciliation
 *  5. non-terminal Colurs status (e.g. processing) → increments poll_count only
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { pollColursMovements } from '#jobs/poll_colurs_movements'

// ── Types ───────────────────────────────────────────────────────────────────────

type RawQueryCall = { sql: string; bindings?: unknown[] }

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Build a mock fetch that handles Colurs auth (login) and movement GET requests.
 * The auth endpoint always returns a fake JWT so colursHeaders() succeeds.
 */
function makeMockFetch(movementStatus: string) {
  // Fake JWT with a far-future exp so auth doesn't try to refresh mid-test.
  // Payload: { "exp": 9999999999 }
  const fakeJwt = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url'),
    'sig',
  ].join('.')

  return async (url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString()

    // Auth login
    if (urlStr.includes('/token/') && init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access: fakeJwt, refresh: 'refresh-tok' }),
        json: async () => ({ access: fakeJwt, refresh: 'refresh-tok' }),
      } as Response
    }

    // Movement GET
    if (urlStr.includes('/v2/exchange/movements/')) {
      const body = { sale_crypto_id: 'mov-uuid-1', quote_id: 'q-1', status: movementStatus }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
        json: async () => body,
      } as Response
    }

    return { ok: false, status: 404, text: async () => '{}', json: async () => ({}) } as Response
  }
}

// ── DB mock infrastructure ──────────────────────────────────────────────────────

let rawQueryCalls: RawQueryCall[] = []
let rawQueryResponses: Map<string, { rows: unknown[] }> = new Map()
let origRawQuery: typeof db.rawQuery

function installDbMock() {
  rawQueryCalls = []
  rawQueryResponses = new Map()
  origRawQuery = db.rawQuery

  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    for (const [pattern, response] of rawQueryResponses) {
      if (sql.includes(pattern)) return response
    }
    return { rows: [] }
  }) as any
}

function restoreDbMock() {
  db.rawQuery = origRawQuery
}

/** Return calls whose SQL contains `pattern`. */
function queriesMatching(pattern: string): RawQueryCall[] {
  return rawQueryCalls.filter((c) => c.sql.includes(pattern))
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. stuck pulling_usdc → needs_reconciliation
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | stuck pulling_usdc recovery', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('processing') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('orders stuck in pulling_usdc >5min are moved to needs_reconciliation', async ({
    assert,
  }) => {
    // recoverStuckPullingOrders SELECT returns one stuck order
    rawQueryResponses.set("status = 'pulling_usdc'", {
      rows: [{ id: 'order-1', external_id: 'ext-1' }],
    })

    // pending_fx SELECT returns nothing — we only care about the recovery path
    rawQueryResponses.set("status = 'pending_fx'", { rows: [] })

    await pollColursMovements()

    // Should have issued the SELECT for pulling_usdc orders
    const selects = queriesMatching("status = 'pulling_usdc'")
    assert.isTrue(selects.length >= 1, 'should query for stuck pulling_usdc orders')

    // Should have issued an UPDATE to needs_reconciliation
    const updates = queriesMatching("SET status = 'needs_reconciliation'").filter((c) =>
      c.sql.includes("status = 'pulling_usdc'")
    )
    assert.equal(updates.length, 1, 'should update stuck order to needs_reconciliation')
    assert.equal(updates[0].bindings?.[1], 'order-1')
    assert.isTrue(
      (updates[0].bindings?.[0] as string).includes('Manual reconciliation'),
      'error message should mention manual reconciliation'
    )
  })

  test('no stuck orders means no recovery UPDATEs', async ({ assert }) => {
    // Both queries return empty
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", { rows: [] })

    await pollColursMovements()

    const updates = queriesMatching('UPDATE offramp_orders SET status')
    assert.equal(updates.length, 0, 'should not issue any UPDATEs when nothing is stuck')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. pending_fx + Colurs completed → order completed
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | completed movement', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('completed') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('pending_fx order is marked completed when Colurs movement is completed', async ({
    assert,
  }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-2',
          external_id: 'ext-2',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573001234567',
          poll_count: 5,
        },
      ],
    })

    await pollColursMovements()

    // Should have incremented poll_count
    const pollUpdates = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollUpdates.length, 1, 'should increment poll_count')
    assert.equal(pollUpdates[0].bindings?.[0], 'order-2')

    // Should have set status to completed
    const completedUpdates = queriesMatching("status = 'completed'")
    assert.equal(completedUpdates.length, 1, 'should mark order as completed')
    assert.equal(completedUpdates[0].bindings?.[0], 'order-2')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. pending_fx + Colurs failed/rejected → needs_reconciliation
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | failed movement', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('failed') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('pending_fx order is marked needs_reconciliation when Colurs movement is failed', async ({
    assert,
  }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-3',
          external_id: 'ext-3',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573009876543',
          poll_count: 20,
        },
      ],
    })

    await pollColursMovements()

    // Should increment poll_count first
    const pollUpdates = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollUpdates.length, 1)

    // Should set status to needs_reconciliation with error describing the failure
    const reconUpdates = queriesMatching("status = 'needs_reconciliation'").filter(
      (c) => c.bindings && (c.bindings[0] as string).includes('Movement failed')
    )
    assert.equal(reconUpdates.length, 1, 'should mark order as needs_reconciliation')
    assert.equal(reconUpdates[0].bindings?.[1], 'order-3')
  })
})

test.group('pollColursMovements | rejected movement', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('rejected') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('pending_fx order is marked needs_reconciliation when Colurs movement is rejected', async ({
    assert,
  }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-4',
          external_id: 'ext-4',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573005551234',
          poll_count: 100,
        },
      ],
    })

    await pollColursMovements()

    const reconUpdates = queriesMatching("status = 'needs_reconciliation'").filter(
      (c) => c.bindings && (c.bindings[0] as string).includes('Movement rejected')
    )
    assert.equal(reconUpdates.length, 1, 'should mark order as needs_reconciliation on rejection')
    assert.equal(reconUpdates[0].bindings?.[1], 'order-4')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. max-poll timeout → needs_reconciliation
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | max poll timeout', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    // Movement status doesn't matter because the max-poll check runs first
    global.fetch = makeMockFetch('processing') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('order with poll_count >= 10080 is moved to needs_reconciliation without calling Colurs', async ({
    assert,
  }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-5',
          external_id: 'ext-5',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573001111111',
          poll_count: 10080, // exactly at the threshold
        },
      ],
    })

    let fetchCallCount = 0
    const baseFetch = global.fetch
    global.fetch = (async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString()
      if (urlStr.includes('/v2/exchange/movements/')) {
        fetchCallCount++
      }
      return baseFetch(url, init)
    }) as any

    await pollColursMovements()

    // Should NOT have called the movements endpoint (short-circuits before getMovement)
    assert.equal(fetchCallCount, 0, 'should not call Colurs API when poll_count >= MAX_POLLS')

    // Should have set status to needs_reconciliation
    const reconUpdates = queriesMatching("status = 'needs_reconciliation'").filter(
      (c) =>
        c.sql.includes("status NOT IN ('completed', 'needs_reconciliation')") &&
        c.bindings?.[0] === 'order-5'
    )
    assert.equal(reconUpdates.length, 1, 'should move timed-out order to needs_reconciliation')

    // Should NOT have incremented poll_count (returns before the poll_count bump)
    const pollBumps = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollBumps.length, 0, 'should not increment poll_count for timed-out order')
  })

  test('order with poll_count well above threshold is still caught', async ({ assert }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-6',
          external_id: 'ext-6',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573002222222',
          poll_count: 20000,
        },
      ],
    })

    await pollColursMovements()

    const reconUpdates = queriesMatching("status = 'needs_reconciliation'").filter((c) =>
      c.sql.includes("status NOT IN ('completed', 'needs_reconciliation')")
    )
    assert.equal(reconUpdates.length, 1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. non-terminal status → just increments poll_count, no status change
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | non-terminal status (processing)', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('processing') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('processing status only increments poll_count, does not change order status', async ({
    assert,
  }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-7',
          external_id: 'ext-7',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573003333333',
          poll_count: 42,
        },
      ],
    })

    await pollColursMovements()

    // Should have incremented poll_count
    const pollUpdates = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollUpdates.length, 1, 'should increment poll_count')
    assert.equal(pollUpdates[0].bindings?.[0], 'order-7')

    // Should NOT have changed status to completed or needs_reconciliation
    const statusChanges = rawQueryCalls.filter(
      (c) =>
        (c.sql.includes("status = 'completed'") ||
          c.sql.includes("status = 'needs_reconciliation'")) &&
        !c.sql.includes("status = 'pulling_usdc'") && // exclude the recovery SELECT
        !c.sql.includes('status NOT IN') && // exclude max-poll guard
        !c.sql.includes('SELECT') // exclude all SELECTs
    )
    assert.equal(statusChanges.length, 0, 'should not change order status for non-terminal status')
  })

  test('initiated status also treated as non-terminal', async ({ assert }) => {
    // Override fetch to return initiated
    global.fetch = makeMockFetch('initiated') as any

    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-8',
          external_id: 'ext-8',
          colurs_movement_id: 'mov-uuid-1',
          phone_number: '+573004444444',
          poll_count: 1,
        },
      ],
    })

    await pollColursMovements()

    // Should increment poll_count
    const pollUpdates = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollUpdates.length, 1)

    // Should NOT issue any status-change UPDATE (only poll_count bump)
    const statusUpdates = rawQueryCalls.filter(
      (c) =>
        c.sql.includes('UPDATE') &&
        (c.sql.includes("status = 'completed'") ||
          (c.sql.includes("status = 'needs_reconciliation'") && !c.sql.includes('SELECT')))
    )
    assert.equal(statusUpdates.length, 0, 'should not change status for initiated movement')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// isRunning guard — sequential calls are fine because finally resets it
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | isRunning guard', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('processing') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('sequential calls both execute (isRunning resets in finally)', async ({ assert }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", { rows: [] })

    await pollColursMovements()
    const firstCallCount = rawQueryCalls.length

    // Reset call tracker
    rawQueryCalls = []
    await pollColursMovements()
    const secondCallCount = rawQueryCalls.length

    // Both runs should have executed (at minimum the two SELECT queries)
    assert.isAbove(firstCallCount, 0, 'first call should execute queries')
    assert.isAbove(secondCallCount, 0, 'second call should also execute queries')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Multiple orders in a single poll tick
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollColursMovements | multiple orders', (group) => {
  let origFetch: typeof global.fetch

  group.each.setup(() => {
    origFetch = global.fetch
    global.fetch = makeMockFetch('completed') as any
    process.env.COLURS_BASE_URL = 'https://test.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
    installDbMock()
  })

  group.each.teardown(() => {
    global.fetch = origFetch
    restoreDbMock()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('all pending_fx orders are processed in a single tick', async ({ assert }) => {
    rawQueryResponses.set("status = 'pulling_usdc'", { rows: [] })
    rawQueryResponses.set("status = 'pending_fx'", {
      rows: [
        {
          id: 'order-a',
          external_id: 'ext-a',
          colurs_movement_id: 'mov-a',
          phone_number: '+573001111111',
          poll_count: 5,
        },
        {
          id: 'order-b',
          external_id: 'ext-b',
          colurs_movement_id: 'mov-b',
          phone_number: '+573002222222',
          poll_count: 10,
        },
      ],
    })

    await pollColursMovements()

    // Both orders should get poll_count incremented
    const pollBumps = queriesMatching('poll_count = poll_count + 1')
    assert.equal(pollBumps.length, 2, 'should bump poll_count for both orders')

    // Both orders should be marked completed
    const completedUpdates = queriesMatching("status = 'completed'")
    assert.equal(completedUpdates.length, 2, 'should mark both orders as completed')
  })
})
