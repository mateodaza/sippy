/**
 * WebhookColursController Unit Tests
 *
 * Tests controller logic with mocked DB and model methods.
 * The AdonisJS app is fully booted by the test runner (bin/test.ts), so
 * env.get() reads from process.env and db/model methods can be patched by
 * setting own properties that shadow the prototype chain.
 *
 * Coverage:
 *  - handle(): 503 (no secret), 401 (bad sig), 400 (no event.type), 200 (unknown event)
 *  - payment.failed: missing external_id, guard (not in pending), success
 *  - withdrawal.completed: missing external_id, not found, success
 *  - withdrawal.failed: missing external_id, terminal state guard, success
 *  - payment.completed: missing external_id, claim fails (not found / past state / initiating_bridge),
 *                       claim succeeds → bridge env missing → bridge_failed
 */

import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'
import WebhookColursController from '#controllers/webhook_colurs_controller'
import db from '@adonisjs/lucid/services/db'
import OnrampOrder from '#models/onramp_order'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-webhook-secret-abc123'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(rawBody: string): string {
  return createHmac('sha256', TEST_SECRET).update(rawBody, 'utf8').digest('hex')
}

/** Build a fake HttpContext for the webhook handler */
function buildCtx(
  event: { type: string; data?: Record<string, unknown> },
  opts: { badSig?: boolean } = {}
) {
  const body = { event }
  const rawBody = JSON.stringify(body)
  const sig = opts.badSig ? 'deadbeef' : sign(rawBody)

  let capturedStatus: number | undefined
  let capturedBody: unknown

  const ctx = {
    request: {
      raw: () => rawBody,
      header: (name: string) => (name === 'x-colurs-signature' ? sig : ''),
      body: () => body,
    },
    response: {
      status(code: number) {
        capturedStatus = code
        return {
          json(b: unknown) {
            capturedBody = b
          },
        }
      },
    },
  }

  return {
    ctx,
    getStatus: () => capturedStatus,
    getBody: () => capturedBody as Record<string, unknown>,
  }
}

// ── DB mock helpers ────────────────────────────────────────────────────────────
// Patch `db.from` on the singleton instance.
// Each call to `.update()` pops the next response from the queue.

type DbRow = Record<string, unknown>

function mockDbFrom(...responseSets: DbRow[][]) {
  let callIndex = 0
  ;(db as any).from = () => {
    const builder: any = {}
    builder.where = () => builder
    builder.whereIn = () => builder
    builder.whereNotIn = () => builder
    builder.update = () => {
      const result = responseSets[callIndex] ?? []
      callIndex++
      return Promise.resolve(result)
    }
    return builder
  }
}

/**
 * Mock db.rawQuery() with a sequence of responses.
 * Each call pops the next response; extra calls return { rows: [] }.
 */
function mockDbRawQuery(...responses: { rows: DbRow[] }[]) {
  let callIndex = 0
  ;(db as any).rawQuery = async () => {
    const result = responses[callIndex] ?? { rows: [] }
    callIndex++
    return result
  }
}

function restoreDb() {
  delete (db as any).from
  delete (db as any).rawQuery
}

// ── Model mock helpers ─────────────────────────────────────────────────────────

function mockOnrampQuery(row: Record<string, unknown> | null) {
  ;(OnrampOrder as any).query = () => {
    const builder: any = {}
    builder.where = () => builder
    builder.first = async () => row
    builder.update = async () => {}
    return builder
  }
}

function restoreOnrampModel() {
  delete (OnrampOrder as any).query
}

// ══════════════════════════════════════════════════════════════════════════════
// handle() — infrastructure guards
// ══════════════════════════════════════════════════════════════════════════════

test.group('WebhookColursController | handle — infrastructure', (group) => {
  group.each.setup(() => {
    process.env.COLURS_WEBHOOK_SECRET = TEST_SECRET
  })
  group.each.teardown(() => {
    delete process.env.COLURS_WEBHOOK_SECRET
  })

  test('503 when COLURS_WEBHOOK_SECRET is not set', async ({ assert }) => {
    delete process.env.COLURS_WEBHOOK_SECRET
    const { ctx, getStatus } = buildCtx({ type: 'payment.completed' })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 503)
  })

  test('401 when signature is invalid', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ type: 'payment.completed' }, { badSig: true })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 401)
  })

  test('400 when event.type is missing', async ({ assert }) => {
    // Build context with a body that has no event.type
    const rawBody = JSON.stringify({ event: {} })
    const sig = sign(rawBody)
    let capturedStatus: number | undefined
    const ctx = {
      request: {
        raw: () => rawBody,
        header: (name: string) => (name === 'x-colurs-signature' ? sig : ''),
        body: () => ({ event: {} }),
      },
      response: {
        status(code: number) {
          capturedStatus = code
          return { json(_b: unknown) {} }
        },
      },
    }
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(capturedStatus, 400)
  })

  test('200 for unknown event type — ignored gracefully', async ({ assert }) => {
    const { ctx, getStatus, getBody } = buildCtx({ type: 'some.unknown.event' })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
    assert.equal(getBody().ok, true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// payment.failed
// ══════════════════════════════════════════════════════════════════════════════

test.group('WebhookColursController | payment.failed', (group) => {
  group.each.setup(() => {
    process.env.COLURS_WEBHOOK_SECRET = TEST_SECRET
  })
  group.each.teardown(() => {
    delete process.env.COLURS_WEBHOOK_SECRET
    restoreDb()
  })

  test('200 when external_id is missing — silently ignored', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ type: 'payment.failed', data: { reason: 'timeout' } })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when order is not in pending — duplicate/late event skipped', async ({ assert }) => {
    // UPDATE WHERE status = 'pending' returns no rows (order already past pending)
    mockDbFrom([])
    const { ctx, getStatus } = buildCtx({
      type: 'payment.failed',
      data: { external_id: 'ext-001', reason: 'declined' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when order was in pending — marked failed', async ({ assert }) => {
    // UPDATE returns 1 row (order was in pending, now marked failed)
    mockDbFrom([{ id: 'order-1' }])
    const { ctx, getStatus } = buildCtx({
      type: 'payment.failed',
      data: { external_id: 'ext-002', reason: 'insufficient funds' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// withdrawal.completed
// ══════════════════════════════════════════════════════════════════════════════

test.group('WebhookColursController | withdrawal.completed', (group) => {
  group.each.setup(() => {
    process.env.COLURS_WEBHOOK_SECRET = TEST_SECRET
  })
  group.each.teardown(() => {
    delete process.env.COLURS_WEBHOOK_SECRET
    restoreDb()
  })

  test('200 when external_id is missing — silently ignored', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ type: 'withdrawal.completed', data: {} })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when offramp order not found — logs warning', async ({ assert }) => {
    // UPDATE returns no rows (order not found)
    mockDbFrom([])
    const { ctx, getStatus } = buildCtx({
      type: 'withdrawal.completed',
      data: { external_id: 'ext-wd-001' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when offramp order found — marked completed', async ({ assert }) => {
    // UPDATE returns the updated row
    mockDbFrom([
      { id: 'offramp-1', phone_number: '+573001234567', amount_cop: 100000, bank_account_id: 5 },
    ])
    const { ctx, getStatus } = buildCtx({
      type: 'withdrawal.completed',
      data: { external_id: 'ext-wd-002' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// withdrawal.failed
// ══════════════════════════════════════════════════════════════════════════════

test.group('WebhookColursController | withdrawal.failed', (group) => {
  group.each.setup(() => {
    process.env.COLURS_WEBHOOK_SECRET = TEST_SECRET
  })
  group.each.teardown(() => {
    delete process.env.COLURS_WEBHOOK_SECRET
    restoreDb()
  })

  test('200 when external_id is missing — silently ignored', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ type: 'withdrawal.failed', data: {} })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when order is in terminal state — late failure event skipped', async ({ assert }) => {
    // UPDATE WHERE NOT IN ('completed', 'needs_reconciliation', 'failed') returns no rows
    mockDbFrom([])
    const { ctx, getStatus } = buildCtx({
      type: 'withdrawal.failed',
      data: { external_id: 'ext-wd-003', reason: 'bank rejected' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when order is in transitionable state — marked failed', async ({ assert }) => {
    // UPDATE returns a row (order was in, e.g., 'processing')
    mockDbFrom([{ id: 'offramp-2', phone_number: '+573001234567' }])
    const { ctx, getStatus } = buildCtx({
      type: 'withdrawal.failed',
      data: { external_id: 'ext-wd-004', reason: 'bank timeout' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// payment.completed
// ══════════════════════════════════════════════════════════════════════════════

test.group('WebhookColursController | payment.completed', (group) => {
  group.each.setup(() => {
    process.env.COLURS_WEBHOOK_SECRET = TEST_SECRET
  })
  group.each.teardown(() => {
    delete process.env.COLURS_WEBHOOK_SECRET
    restoreDb()
    restoreOnrampModel()
  })

  test('200 when external_id is missing — silently ignored', async ({ assert }) => {
    // No DB calls — early return
    const { ctx, getStatus } = buildCtx({ type: 'payment.completed', data: {} })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when atomic claim fails and order not found', async ({ assert }) => {
    // Claim UPDATE returns [] (claim fails)
    mockDbFrom([])
    // OnrampOrder.query().where().first() returns null (order doesn't exist)
    mockOnrampQuery(null)

    const { ctx, getStatus } = buildCtx({
      type: 'payment.completed',
      data: { external_id: 'ext-pc-001' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when atomic claim fails and order already past pending state', async ({ assert }) => {
    // Claim UPDATE returns [] (claim fails)
    mockDbFrom([])
    // OnrampOrder.query().where().first() returns order in 'completed' state with a tx hash
    mockOnrampQuery({ status: 'completed', lifiTxHash: '0xabc', phoneNumber: '+573001234567' })

    const { ctx, getStatus } = buildCtx({
      type: 'payment.completed',
      data: { external_id: 'ext-pc-002' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when order stuck in initiating_bridge — marked bridge_failed, no bridge retry', async ({
    assert,
  }) => {
    // Claim UPDATE returns [] (claim fails)
    mockDbFrom([])
    // OnrampOrder.query() used for: (1) existing check → stuck in initiating_bridge, (2) bridge_failed UPDATE
    mockOnrampQuery({ status: 'initiating_bridge', lifiTxHash: null, phoneNumber: '+573001234567' })

    const { ctx, getStatus } = buildCtx({
      type: 'payment.completed',
      data: { external_id: 'ext-pc-003' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when claim succeeds but bridge env not configured — order marked bridge_failed', async ({
    assert,
  }) => {
    // Ensure no SIPPY_ETH_DEPOSIT_ADDRESS (bridge will throw after fetchOrder succeeds)
    delete process.env.SIPPY_ETH_DEPOSIT_ADDRESS

    // db.from() calls: (1) paid claim succeeds, (2) bridge_failed update
    mockDbFrom(
      [{ id: 'order-x', phone_number: '+573001234567' }], // paid claim
      [] // bridge_failed update
    )
    // db.rawQuery(): second atomic claim paid → initiating_bridge succeeds
    mockDbRawQuery({ rows: [{ id: 'order-x' }] })

    // OnrampOrder.query() used inside triggerBridge (fetchOrder)
    mockOnrampQuery({
      phoneNumber: '+573001234567',
      amountCop: '200000',
      amountUsdt: null,
      externalId: 'ext-pc-004',
    })

    const { ctx, getStatus } = buildCtx({
      type: 'payment.completed',
      // No amount_usdt — skips the amountUsdt update branch
      data: { external_id: 'ext-pc-004' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })

  test('200 when second bridge claim returns no rows — duplicate webhook skipped', async ({
    assert,
  }) => {
    // db.from(): paid claim succeeds
    mockDbFrom([{ id: 'order-y', phone_number: '+573001234567' }])
    // db.rawQuery(): second claim paid → initiating_bridge returns no rows (already claimed)
    mockDbRawQuery({ rows: [] })
    // No OnrampOrder mock needed — triggerBridge is never called

    const { ctx, getStatus } = buildCtx({
      type: 'payment.completed',
      data: { external_id: 'ext-pc-005' },
    })
    const controller = new WebhookColursController()
    await controller.handle(ctx as any)
    assert.equal(getStatus(), 200)
  })
})
