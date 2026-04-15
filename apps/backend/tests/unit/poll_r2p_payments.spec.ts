/**
 * poll_r2p_payments — Unit Tests
 *
 * Tests the R2P payment poller and its internal recovery sweep.
 * All DB and external HTTP calls are mocked via monkey-patching:
 *   - db.rawQuery: patched on the singleton, responses keyed by SQL substring
 *   - db.from():   patched to return a builder chain mock
 *   - OnrampOrder.query(): patched on the class
 *   - global.fetch: replaced to intercept colursGet (used by getPaymentStatus)
 *
 * Coverage:
 *  1. Orphaned initiating_payment (null colurs_payment_id, >2min) → needs_reconciliation
 *  2. Stuck paid order → atomic claim → triggers bridge
 *  3. Stuck initiating_bridge with no lifi_tx_hash → bridge_failed
 *  4. Stuck bridging with hash older than 2h → needs_reconciliation
 *  5. Succeeded payment persists amountUsdt when present
 *  6. Duplicate/already-advanced statuses do nothing
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import OnrampOrder from '#models/onramp_order'
import { pollR2pPayments } from '#jobs/poll_r2p_payments'

// ── Tracking state ───────────────────────────────────────────────────────────

let rawQueryCalls: { sql: string; bindings?: unknown[] }[] = []
let rawQueryResponses: Map<string, { rows: unknown[] }> = new Map()

let fromCalls: { table: string; method: string; args: unknown[] }[] = []
let fromUpdateResult: unknown[] = []

let onrampQueryCalls: { method: string; args: unknown[] }[] = []
let onrampQueryFirstResult: Record<string, unknown> | null = null
let onrampQueryUpdateCalled = false

// ── Originals ────────────────────────────────────────────────────────────────

let origRawQuery: typeof db.rawQuery
let origFrom: typeof db.from
let origFetch: typeof global.fetch

// ── Mock setup / teardown ────────────────────────────────────────────────────

function setupMocks() {
  // Save originals
  origRawQuery = db.rawQuery.bind(db)
  origFrom = db.from.bind(db)
  origFetch = global.fetch

  // Reset tracking
  rawQueryCalls = []
  rawQueryResponses = new Map()
  fromCalls = []
  fromUpdateResult = []
  onrampQueryCalls = []
  onrampQueryFirstResult = null
  onrampQueryUpdateCalled = false

  // Patch db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    for (const [pattern, response] of rawQueryResponses) {
      if (sql.includes(pattern)) return response
    }
    return { rows: [] }
  }) as any

  // Patch db.from — returns a builder chain
  db.from = ((table: string) => {
    const chain = {
      where: (...args: unknown[]) => {
        fromCalls.push({ table, method: 'where', args })
        return chain
      },
      whereIn: (...args: unknown[]) => {
        fromCalls.push({ table, method: 'whereIn', args })
        return chain
      },
      update: async (...args: unknown[]) => {
        fromCalls.push({ table, method: 'update', args })
        return fromUpdateResult
      },
    }
    return chain
  }) as any

  // Patch OnrampOrder.query()
  ;(OnrampOrder as any).query = () => {
    const chain = {
      where: (...args: unknown[]) => {
        onrampQueryCalls.push({ method: 'where', args })
        return chain
      },
      first: async () => {
        onrampQueryCalls.push({ method: 'first', args: [] })
        return onrampQueryFirstResult
      },
      update: async (data: unknown) => {
        onrampQueryCalls.push({ method: 'update', args: [data] })
        onrampQueryUpdateCalled = true
        return 1
      },
    }
    return chain
  }

  // Default fetch mock — returns 404 unless overridden
  global.fetch = (async () => ({
    ok: false,
    status: 404,
    text: async () => '{"error":"not mocked"}',
    json: async () => ({ error: 'not mocked' }),
  })) as any
}

function teardownMocks() {
  db.rawQuery = origRawQuery
  db.from = origFrom
  global.fetch = origFetch
  delete (OnrampOrder as any).query
}

// ── JWT helper ──────────────────────────────────────────────────────────────

/** Build a JWT with a far-future exp so the Colurs auth service accepts it */
function fakeJwt(): string {
  const header = Buffer.from('{"alg":"HS256"}').toString('base64url')
  const payload = Buffer.from(`{"exp":${Math.floor(Date.now() / 1000) + 3600}}`).toString(
    'base64url'
  )
  return `${header}.${payload}.fakesig`
}

// ── Fetch mock factory ───────────────────────────────────────────────────────

type MockRoute = { url: string | RegExp; response: unknown; status?: number }

function makeMockFetch(routes: MockRoute[]) {
  return async (url: string | URL, _init?: RequestInit) => {
    const urlStr = url.toString()
    const route = routes.find((r) =>
      typeof r.url === 'string' ? urlStr.includes(r.url) : r.url.test(urlStr)
    )
    const status = route?.status ?? (route ? 200 : 404)
    const body = route?.response ?? { error: 'not mocked' }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as Response
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Orphaned initiating_payment → needs_reconciliation
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | orphaned initiating_payment', (group) => {
  group.each.setup(setupMocks)
  group.each.teardown(teardownMocks)

  test('marks order needs_reconciliation when null colurs_payment_id and >2min old', async ({
    assert,
  }) => {
    // Recovery sweep: orphaned query returns one row
    rawQueryResponses.set("status = 'initiating_payment'", {
      rows: [{ id: 'order-1', external_id: 'ext-orphan-1' }],
    })
    // Stuck bridge query returns nothing (isolate this test)
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })
    // Main poll loop: no pending orders (use colurs_payment_id IS NOT NULL to uniquely match)
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', { rows: [] })

    await pollR2pPayments()

    // Find the UPDATE call that sets needs_reconciliation for the orphaned order
    const updateCall = rawQueryCalls.find(
      (c) =>
        c.sql.includes('needs_reconciliation') && c.sql.includes("status = 'initiating_payment'")
    )
    assert.exists(updateCall, 'should have issued UPDATE to needs_reconciliation')
    assert.include(updateCall!.bindings as unknown[], 'order-1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. Stuck paid order → atomic claim → triggers bridge
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | stuck paid → bridge', (group) => {
  group.each.setup(setupMocks)
  group.each.teardown(teardownMocks)

  test('atomically claims paid → initiating_bridge and attempts bridge', async ({ assert }) => {
    // Recovery sweep: no orphaned orders
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    // Stuck bridge query: one paid order
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", {
      rows: [{ external_id: 'ext-paid-1', status: 'paid', lifi_tx_hash: null }],
    })
    // Atomic claim UPDATE ... RETURNING id — succeeds
    rawQueryResponses.set("SET status = 'initiating_bridge'", {
      rows: [{ id: 'order-2' }],
    })
    // Main poll loop: no pending orders (use colurs_payment_id IS NOT NULL to uniquely match)
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', { rows: [] })

    await pollR2pPayments()

    // Verify the atomic claim was attempted
    const claimCall = rawQueryCalls.find(
      (c) =>
        c.sql.includes("status = 'initiating_bridge'") &&
        c.sql.includes("status = 'paid'") &&
        c.sql.includes('RETURNING id')
    )
    assert.exists(claimCall, 'should have issued atomic claim UPDATE paid → initiating_bridge')
    assert.include(claimCall!.bindings as unknown[], 'ext-paid-1')
  })

  test('sets bridge_failed if triggerBridge throws', async ({ assert }) => {
    // Recovery sweep: no orphaned orders
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    // Stuck bridge query: one paid order
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", {
      rows: [{ external_id: 'ext-paid-fail', status: 'paid', lifi_tx_hash: null }],
    })
    // Atomic claim succeeds
    rawQueryResponses.set("SET status = 'initiating_bridge'", {
      rows: [{ id: 'order-3' }],
    })
    // bridge_failed UPDATE (will be matched after triggerBridge fails)
    rawQueryResponses.set("status = 'bridge_failed'", { rows: [{ id: 'order-3' }] })
    // Main poll loop: no pending orders
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', { rows: [] })

    // triggerBridge is dynamically imported — it will fail because the service
    // depends on env vars / real DB. The catch block should set bridge_failed.
    await pollR2pPayments()

    const failCall = rawQueryCalls.find(
      (c) =>
        c.sql.includes("status = 'bridge_failed'") && c.sql.includes("status = 'initiating_bridge'")
    )
    assert.exists(failCall, 'should mark bridge_failed when triggerBridge throws')
    assert.include(failCall!.bindings as unknown[], 'ext-paid-fail')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. Stuck initiating_bridge with no hash → bridge_failed
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | stuck initiating_bridge → bridge_failed', (group) => {
  group.each.setup(setupMocks)
  group.each.teardown(teardownMocks)

  test('marks bridge_failed when initiating_bridge with no lifi_tx_hash', async ({ assert }) => {
    // Recovery sweep: no orphaned orders
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    // Stuck bridge query: one initiating_bridge order with no hash
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", {
      rows: [{ external_id: 'ext-no-hash', status: 'initiating_bridge', lifi_tx_hash: null }],
    })
    // Main poll loop: no pending orders
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', { rows: [] })

    await pollR2pPayments()

    const failCall = rawQueryCalls.find(
      (c) =>
        c.sql.includes("status = 'bridge_failed'") &&
        c.sql.includes("status = 'initiating_bridge'") &&
        c.sql.includes('lifi_tx_hash IS NULL')
    )
    assert.exists(failCall, 'should UPDATE to bridge_failed for hashless initiating_bridge')
    assert.include(failCall!.bindings as unknown[], 'ext-no-hash')
    // Verify the error message explains the situation
    const errorMsg = (failCall!.bindings as string[])[0]
    assert.include(errorMsg, 'Bridge broadcast may have occurred')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Stuck bridging with hash older than 2h → needs_reconciliation
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | stuck bridging → needs_reconciliation', (group) => {
  group.each.setup(setupMocks)
  group.each.teardown(teardownMocks)

  test('marks needs_reconciliation when bridging with hash is >2h old', async ({ assert }) => {
    // Recovery sweep: no orphaned orders
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    // Stuck bridge query: one bridging order with a hash
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", {
      rows: [
        {
          external_id: 'ext-bridging-old',
          status: 'bridging',
          lifi_tx_hash: '0xdeadbeef1234',
        },
      ],
    })
    // Main poll loop: no pending orders
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', { rows: [] })

    await pollR2pPayments()

    const reconCall = rawQueryCalls.find(
      (c) =>
        c.sql.includes("status = 'needs_reconciliation'") && c.sql.includes("status = 'bridging'")
    )
    assert.exists(reconCall, 'should UPDATE to needs_reconciliation for old bridging order')
    assert.include(reconCall!.bindings as unknown[], 'ext-bridging-old')
    // Verify the error message includes the tx hash
    const errorMsg = (reconCall!.bindings as string[])[0]
    assert.include(errorMsg, '0xdeadbeef1234')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. Succeeded payment persists amountUsdt
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | succeeded persists amountUsdt', (group) => {
  group.each.setup(() => {
    setupMocks()
    // Colurs auth needs these env vars BEFORE any fetch call (isConfigured check)
    process.env.COLURS_BASE_URL = 'https://sandbox.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
  })
  group.each.teardown(() => {
    teardownMocks()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('persists amountUsdt from payment response on succeeded', async ({ assert }) => {
    // Recovery sweep: nothing to recover
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })

    // Main poll loop: one pending order with colurs_payment_id
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', {
      rows: [
        {
          id: 'order-usdt',
          external_id: 'ext-usdt-1',
          colurs_payment_id: 'mm-123',
          phone_number: '+573001234567',
          poll_count: 0,
        },
      ],
    })

    rawQueryResponses.set('polled_at = now()', { rows: [] })
    rawQueryResponses.set("SET status = 'initiating_bridge'", {
      rows: [{ id: 'order-usdt' }],
    })
    rawQueryResponses.set("status = 'bridge_failed'", { rows: [] })
    fromUpdateResult = [{ id: 'order-usdt' }]

    // Mock fetch: Colurs auth (/token/) + payment status
    const jwt = fakeJwt()
    global.fetch = makeMockFetch([
      { url: '/token/', response: { access: jwt, refresh: 'fake-refresh' } },
      {
        url: '/api/reload/r2p/status/mm-123/',
        response: {
          money_movement_id: 'mm-123',
          status: 'succeeded',
          amount_usdt: 48.75,
        },
      },
    ]) as any

    await pollR2pPayments()

    const updateCall = onrampQueryCalls.find(
      (c) => c.method === 'update' && JSON.stringify(c.args).includes('amountUsdt')
    )
    assert.exists(updateCall, 'should persist amountUsdt via OnrampOrder.query().update()')
    const updateData = updateCall!.args[0] as Record<string, unknown>
    assert.equal(updateData.amountUsdt, '48.75')
  })

  test('persists amountUsdt from amount_usd fallback field', async ({ assert }) => {
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })

    rawQueryResponses.set('colurs_payment_id IS NOT NULL', {
      rows: [
        {
          id: 'order-usd-fb',
          external_id: 'ext-usd-fb',
          colurs_payment_id: 'mm-456',
          phone_number: '+573009999999',
          poll_count: 0,
        },
      ],
    })

    rawQueryResponses.set('polled_at = now()', { rows: [] })
    rawQueryResponses.set("SET status = 'initiating_bridge'", { rows: [{ id: 'order-usd-fb' }] })
    rawQueryResponses.set("status = 'bridge_failed'", { rows: [] })
    fromUpdateResult = [{ id: 'order-usd-fb' }]

    const jwt = fakeJwt()
    global.fetch = makeMockFetch([
      { url: '/token/', response: { access: jwt, refresh: 'fake-refresh' } },
      {
        url: '/api/reload/r2p/status/mm-456/',
        response: {
          money_movement_id: 'mm-456',
          status: 'succeeded',
          amount_usd: 100.5,
        },
      },
    ]) as any

    await pollR2pPayments()

    const updateCall = onrampQueryCalls.find(
      (c) => c.method === 'update' && JSON.stringify(c.args).includes('amountUsdt')
    )
    assert.exists(updateCall, 'should persist amountUsdt from amount_usd fallback')
    const updateData = updateCall!.args[0] as Record<string, unknown>
    assert.equal(updateData.amountUsdt, '100.5')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. Duplicate / already-advanced statuses — no re-processing
// ══════════════════════════════════════════════════════════════════════════════

test.group('pollR2pPayments | already-advanced statuses skip re-processing', (group) => {
  group.each.setup(() => {
    setupMocks()
    process.env.COLURS_BASE_URL = 'https://sandbox.colurs.com'
    process.env.COLURS_API_KEY = 'test-key'
    process.env.COLURS_USERNAME = 'test-user'
    process.env.COLURS_PASSWORD = 'test-pass'
  })
  group.each.teardown(() => {
    teardownMocks()
    delete process.env.COLURS_BASE_URL
    delete process.env.COLURS_API_KEY
    delete process.env.COLURS_USERNAME
    delete process.env.COLURS_PASSWORD
  })

  test('completed order is not re-processed on succeeded payment', async ({ assert }) => {
    // Recovery sweep: nothing
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })

    // Main poll loop: one pending order
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', {
      rows: [
        {
          id: 'order-completed',
          external_id: 'ext-already-done',
          colurs_payment_id: 'mm-done',
          phone_number: '+573001234567',
          poll_count: 0,
        },
      ],
    })
    rawQueryResponses.set('polled_at = now()', { rows: [] })

    // db.from() claim returns empty — order already past pending
    fromUpdateResult = []

    // OnrampOrder.query().where().first() returns a completed order
    onrampQueryFirstResult = {
      status: 'completed',
      lifiTxHash: '0xfinished',
      externalId: 'ext-already-done',
    }

    // Mock fetch for getPaymentStatus — returns succeeded
    global.fetch = makeMockFetch([
      {
        url: '/reload/r2p/status/mm-done/',
        response: { money_movement_id: 'mm-done', status: 'succeeded' },
      },
      { url: '/token/', response: { access: fakeJwt(), refresh: 'fake-refresh' } },
    ]) as any

    await pollR2pPayments()

    // Should NOT have attempted bridge claim (no SET status = 'initiating_bridge' after the
    // from() claim failed) because onPaymentSucceeded returns early for completed orders
    const bridgeClaimCalls = rawQueryCalls.filter(
      (c) => c.sql.includes("SET status = 'initiating_bridge'") && c.sql.includes('RETURNING id')
    )
    assert.equal(
      bridgeClaimCalls.length,
      0,
      'should not attempt bridge claim for already-completed order'
    )
    assert.isFalse(onrampQueryUpdateCalled, 'should not call update on completed order')
  })

  test('bridging order with hash is not re-processed on succeeded payment', async ({ assert }) => {
    // Recovery sweep: nothing
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })

    // Main poll loop: one pending order
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', {
      rows: [
        {
          id: 'order-bridging',
          external_id: 'ext-bridging',
          colurs_payment_id: 'mm-bridging',
          phone_number: '+573001234567',
          poll_count: 0,
        },
      ],
    })
    rawQueryResponses.set('polled_at = now()', { rows: [] })

    // db.from() claim returns empty — order already past pending
    fromUpdateResult = []

    // OnrampOrder.query().where().first() returns a bridging order with hash
    onrampQueryFirstResult = {
      status: 'bridging',
      lifiTxHash: '0xbridging-hash',
      externalId: 'ext-bridging',
    }

    global.fetch = makeMockFetch([
      {
        url: '/reload/r2p/status/mm-bridging/',
        response: { money_movement_id: 'mm-bridging', status: 'succeeded' },
      },
      { url: '/token/', response: { access: fakeJwt(), refresh: 'fake-refresh' } },
    ]) as any

    await pollR2pPayments()

    // Should early-return with "already in status 'bridging'" log
    const bridgeClaimCalls = rawQueryCalls.filter(
      (c) => c.sql.includes("SET status = 'initiating_bridge'") && c.sql.includes('RETURNING id')
    )
    assert.equal(bridgeClaimCalls.length, 0, 'should not attempt bridge for already-bridging order')
  })

  test('non-terminal payment status (processing) does not trigger any state change', async ({
    assert,
  }) => {
    // Recovery sweep: nothing
    rawQueryResponses.set("status = 'initiating_payment'", { rows: [] })
    rawQueryResponses.set("status IN ('paid', 'initiating_bridge')", { rows: [] })

    // Main poll loop: one pending order
    rawQueryResponses.set('colurs_payment_id IS NOT NULL', {
      rows: [
        {
          id: 'order-processing',
          external_id: 'ext-processing',
          colurs_payment_id: 'mm-processing',
          phone_number: '+573001234567',
          poll_count: 5,
        },
      ],
    })
    rawQueryResponses.set('polled_at = now()', { rows: [] })

    // Payment status is 'processing' — not terminal
    global.fetch = makeMockFetch([
      {
        url: '/reload/r2p/status/mm-processing/',
        response: { money_movement_id: 'mm-processing', status: 'processing' },
      },
      { url: '/token/', response: { access: fakeJwt(), refresh: 'fake-refresh' } },
    ]) as any

    await pollR2pPayments()

    // Should only have the poll_count increment UPDATE plus the recovery sweep queries.
    // No status change UPDATE should be present.
    const statusChangeCalls = rawQueryCalls.filter(
      (c) => c.sql.includes('SET status =') && !c.sql.includes('polled_at')
    )
    assert.equal(statusChangeCalls.length, 0, 'non-terminal status should not trigger state change')
    assert.equal(fromCalls.length, 0, 'should not call db.from() for non-terminal status')
  })
})
