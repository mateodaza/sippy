/**
 * OfframpController Unit Tests
 *
 * Tests controller validation and status query logic.
 * Service calls (colurs_fx, colurs_bank, embedded_wallet) are named ESM exports
 * and cannot be mocked without a module interception framework — those paths are
 * covered by integration/functional tests.
 *
 * Coverage (pure validation — no service calls):
 *  - quote: missing/invalid amountUsdc → 400
 *  - initiate: 401 (no auth), missing quoteId → 400, missing bankAccountId → 400
 *  - addBankAccount: 401, each required-field validation → 400
 *
 * Coverage (OfframpOrder model mocked):
 *  - status: 401 (no auth), 404 (not found), 200 (found)
 */

import { test } from '@japa/runner'
import OfframpController from '#controllers/offramp_controller'
import OfframpOrder from '#models/offramp_order'

// ── Context builders ───────────────────────────────────────────────────────────

function buildCtx(
  opts: {
    phoneNumber?: string
    walletAddress?: string
    body?: Record<string, unknown>
    params?: Record<string, string>
  } = {}
) {
  let capturedStatus: number | undefined
  let capturedBody: unknown

  const ctx = {
    request: { body: () => opts.body ?? {} },
    response: {
      status(code: number) {
        capturedStatus = code
        return {
          json(body: unknown) {
            capturedBody = body
            return body
          },
        }
      },
      json(body: unknown) {
        capturedBody = body
        return body
      },
    },
    params: opts.params ?? {},
    cdpUser: {
      phoneNumber: opts.phoneNumber ?? '+573001234567',
      walletAddress: opts.walletAddress ?? '0xABCDEF1234567890',
    },
  }

  return {
    ctx,
    getStatus: () => capturedStatus,
    getBody: () => capturedBody as Record<string, unknown>,
  }
}

function unauthCtx(body: Record<string, unknown> = {}) {
  let capturedStatus: number | undefined
  let capturedBody: unknown

  return {
    ctx: {
      request: { body: () => body },
      response: {
        status(code: number) {
          capturedStatus = code
          return {
            json(b: unknown) {
              capturedBody = b
              return b
            },
          }
        },
        json(b: unknown) {
          capturedBody = b
          return b
        },
      },
      params: {},
      cdpUser: undefined,
    },
    getStatus: () => capturedStatus,
    getBody: () => capturedBody as Record<string, unknown>,
  }
}

// ── Model mock helpers ─────────────────────────────────────────────────────────

function mockOfframpQuery(row: Record<string, unknown> | null) {
  ;(OfframpOrder as any).query = () => {
    const builder: any = {}
    builder.where = () => builder
    builder.whereNotIn = () => builder
    builder.first = async () => row
    builder.update = async () => {}
    return builder
  }
}

function restoreOfframpModel() {
  delete (OfframpOrder as any).query
}

// ══════════════════════════════════════════════════════════════════════════════
// quote — validation
// ══════════════════════════════════════════════════════════════════════════════

test.group('OfframpController | quote — validation', () => {
  test('400 when amountUsdc is missing', async ({ assert }) => {
    const { ctx, getStatus, getBody } = buildCtx({ body: {} })
    const controller = new OfframpController()
    await controller.quote(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'amountUsdc')
  })

  test('400 when amountUsdc is a string', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ body: { amountUsdc: '100' } })
    const controller = new OfframpController()
    await controller.quote(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('400 when amountUsdc is negative', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ body: { amountUsdc: -10 } })
    const controller = new OfframpController()
    await controller.quote(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('400 when amountUsdc is zero', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({ body: { amountUsdc: 0 } })
    const controller = new OfframpController()
    await controller.quote(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('400 when amountUsdc is below minimum $50', async ({ assert }) => {
    const { ctx, getStatus, getBody } = buildCtx({ body: { amountUsdc: 49 } })
    const controller = new OfframpController()
    await controller.quote(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, '50')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// initiate — early validation (no service calls)
// ══════════════════════════════════════════════════════════════════════════════

test.group('OfframpController | initiate — validation', () => {
  test('401 when no cdpUser', async ({ assert }) => {
    const { ctx, getStatus } = unauthCtx()
    const controller = new OfframpController()
    await controller.initiate(ctx as any)
    assert.equal(getStatus(), 401)
  })

  test('400 when quoteId is missing', async ({ assert }) => {
    const { ctx, getStatus, getBody } = buildCtx({
      body: { bankAccountId: 1 },
    })
    const controller = new OfframpController()
    await controller.initiate(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'quoteId')
  })

  test('400 when quoteId is not a string', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({
      body: { quoteId: 42, bankAccountId: 1 },
    })
    const controller = new OfframpController()
    await controller.initiate(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('400 when bankAccountId is missing', async ({ assert }) => {
    const { ctx, getStatus, getBody } = buildCtx({
      body: { quoteId: 'q-abc123' },
    })
    const controller = new OfframpController()
    await controller.initiate(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'bankAccountId')
  })

  test('400 when bankAccountId is a string instead of number', async ({ assert }) => {
    const { ctx, getStatus } = buildCtx({
      body: { quoteId: 'q-abc123', bankAccountId: '5' },
    })
    const controller = new OfframpController()
    await controller.initiate(ctx as any)
    assert.equal(getStatus(), 400)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// status
// ══════════════════════════════════════════════════════════════════════════════

test.group('OfframpController | status', (group) => {
  group.each.teardown(restoreOfframpModel)

  test('401 when no cdpUser', async ({ assert }) => {
    const { ctx, getStatus } = unauthCtx()
    const controller = new OfframpController()
    await controller.status(ctx as any)
    assert.equal(getStatus(), 401)
  })

  test('404 when order not found', async ({ assert }) => {
    mockOfframpQuery(null)
    const { ctx, getStatus } = buildCtx({ params: { orderId: 'order-x' } })
    const controller = new OfframpController()
    await controller.status(ctx as any)
    assert.equal(getStatus(), 404)
  })

  test('returns order when found', async ({ assert }) => {
    mockOfframpQuery({
      id: 'order-1',
      phoneNumber: '+573001234567',
      status: 'pending_fx',
      amountUsdc: '100',
      amountCop: '420000',
    })
    const { ctx, getBody } = buildCtx({ params: { orderId: 'order-1' } })
    const controller = new OfframpController()
    await controller.status(ctx as any)
    // response.json() is called directly (no .status(200)), so check body content
    assert.equal((getBody() as any).status, 'pending_fx')
    assert.equal((getBody() as any).id, 'order-1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// addBankAccount — validation
// ══════════════════════════════════════════════════════════════════════════════

test.group('OfframpController | addBankAccount — validation', () => {
  const validBody = {
    holderName: 'Juan Perez',
    documentType: 'CC',
    documentNumber: '12345678',
    accountNumber: '987654321',
    accountType: 'savings',
    bankId: 10,
  }

  test('401 when no cdpUser', async ({ assert }) => {
    const { ctx, getStatus } = unauthCtx()
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 401)
  })

  test('400 when holderName is missing', async ({ assert }) => {
    const body = { ...validBody, holderName: undefined }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'holderName')
  })

  test('400 when documentType is invalid', async ({ assert }) => {
    const body = { ...validBody, documentType: 'PASSPORT' }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'documentType')
  })

  test('400 when documentNumber is missing', async ({ assert }) => {
    const body = { ...validBody, documentNumber: undefined }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'documentNumber')
  })

  test('400 when accountNumber is missing', async ({ assert }) => {
    const body = { ...validBody, accountNumber: undefined }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'accountNumber')
  })

  test('400 when accountType is invalid', async ({ assert }) => {
    const body = { ...validBody, accountType: 'investment' }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'accountType')
  })

  test('400 when bankId is not a number', async ({ assert }) => {
    const body = { ...validBody, bankId: 'BANCOLOMBIA' }
    const { ctx, getStatus, getBody } = buildCtx({ body })
    const controller = new OfframpController()
    await controller.addBankAccount(ctx as any)
    assert.equal(getStatus(), 400)
    assert.include(getBody().error as string, 'bankId')
  })
})
