/**
 * AC-001: User block/unblock + global pause
 *
 * Unit tests for:
 * 1. ModerationController (block-user, unblock-user, pause, resume)
 * 2. Trilingual messages (suspended + maintenance)
 * 3. isPaused flag export
 */

import { test } from '@japa/runner'
import { formatAccountSuspendedMessage, formatMaintenanceMessage } from '#utils/messages'
import { setIsPaused, getIsPaused } from '#controllers/admin/moderation_controller'
import { isDbAvailable } from '../helpers/skip_without_db.js'

// ── Trilingual message tests ─────────────────────────────────────────────────

test.group('AC-001 | formatAccountSuspendedMessage', () => {
  test('EN', ({ assert }) => {
    assert.equal(
      formatAccountSuspendedMessage('en'),
      'Your account has been temporarily suspended.'
    )
  })

  test('ES', ({ assert }) => {
    assert.equal(
      formatAccountSuspendedMessage('es'),
      'Tu cuenta ha sido suspendida temporalmente.'
    )
  })

  test('PT', ({ assert }) => {
    assert.equal(
      formatAccountSuspendedMessage('pt'),
      'Sua conta foi suspensa temporariamente.'
    )
  })
})

test.group('AC-001 | formatMaintenanceMessage', () => {
  test('EN', ({ assert }) => {
    assert.equal(
      formatMaintenanceMessage('en'),
      'Sippy is undergoing maintenance.'
    )
  })

  test('ES', ({ assert }) => {
    assert.equal(
      formatMaintenanceMessage('es'),
      'Sippy esta en mantenimiento.'
    )
  })

  test('PT', ({ assert }) => {
    assert.equal(
      formatMaintenanceMessage('pt'),
      'Sippy esta em manutencao.'
    )
  })
})

// ── isPaused flag tests ──────────────────────────────────────────────────────

test.group('AC-001 | isPaused flag', (group) => {
  group.each.teardown(() => {
    setIsPaused(false)
  })

  test('defaults to false', ({ assert }) => {
    assert.isFalse(getIsPaused())
  })

  test('setIsPaused(true) sets flag', ({ assert }) => {
    setIsPaused(true)
    assert.isTrue(getIsPaused())
  })

  test('setIsPaused(false) clears flag', ({ assert }) => {
    setIsPaused(true)
    setIsPaused(false)
    assert.isFalse(getIsPaused())
  })
})

// ── ModerationController unit tests ──────────────────────────────────────────

import UserPreference from '#models/user_preference'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ControllerClass: new () => any

async function ensureController() {
  if (ControllerClass) return
  const mod = await import('#controllers/admin/moderation_controller')
  ControllerClass = mod.default
}

interface MockRes {
  statusCode: number
  body: unknown
}

interface MockHttpContext {
  request: { body: () => unknown }
  response: {
    status: (code: number) => MockHttpContext['response']
    json: (data: unknown) => MockHttpContext['response']
  }
  _res: MockRes
}

function buildCtx(body: unknown): MockHttpContext {
  const res: MockRes = { statusCode: 200, body: {} }
  const ctx: MockHttpContext = {
    request: { body: () => body },
    response: {
      status(code: number) {
        res.statusCode = code
        return ctx.response
      },
      json(data: unknown) {
        res.body = data
        return ctx.response
      },
    },
    _res: res,
  }
  return ctx
}

// Stub helpers
const originalUpdateOrCreate = UserPreference.updateOrCreate.bind(UserPreference)
let lastUpdateOrCreateArgs: { search: unknown; data: unknown } | null = null

function stubUpdateOrCreate() {
  lastUpdateOrCreateArgs = null
  ;(UserPreference as any).updateOrCreate = async (search: unknown, data: unknown) => {
    lastUpdateOrCreateArgs = { search, data }
    return {}
  }
}

function restoreUserPreference() {
  ;(UserPreference as any).updateOrCreate = originalUpdateOrCreate
  lastUpdateOrCreateArgs = null
}

test.group('AC-001 | ModerationController.blockUser', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => { await ensureController() })
  group.each.teardown(() => { restoreUserPreference() })

  test('blocks user with valid phone', async ({ assert }) => {
    stubUpdateOrCreate()
    const controller = new ControllerClass()
    const ctx = buildCtx({ phone: '+573001234567', reason: 'spam' })

    await controller.blockUser(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true, phone: '+573001234567', blocked: true })
    assert.deepEqual(lastUpdateOrCreateArgs?.data, { blocked: true })
  })

  test('returns 422 when phone is missing', async ({ assert }) => {
    const controller = new ControllerClass()
    const ctx = buildCtx({ reason: 'spam' })

    await controller.blockUser(ctx as any)

    assert.equal(ctx._res.statusCode, 422)
    assert.deepEqual(ctx._res.body, { error: 'phone is required' })
  })
})

test.group('AC-001 | ModerationController.unblockUser', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => { await ensureController() })
  group.each.teardown(() => { restoreUserPreference() })

  test('unblocks user with valid phone', async ({ assert }) => {
    stubUpdateOrCreate()
    const controller = new ControllerClass()
    const ctx = buildCtx({ phone: '+573001234567' })

    await controller.unblockUser(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true, phone: '+573001234567', blocked: false })
    assert.deepEqual(lastUpdateOrCreateArgs?.data, { blocked: false })
  })

  test('returns 422 when phone is missing', async ({ assert }) => {
    const controller = new ControllerClass()
    const ctx = buildCtx({})

    await controller.unblockUser(ctx as any)

    assert.equal(ctx._res.statusCode, 422)
    assert.deepEqual(ctx._res.body, { error: 'phone is required' })
  })
})

test.group('AC-001 | ModerationController.pause/resume', (group) => {
  group.setup(async () => { await ensureController() })
  group.each.teardown(() => { setIsPaused(false) })

  test('pause sets isPaused to true', async ({ assert }) => {
    const controller = new ControllerClass()
    const ctx = buildCtx({})

    await controller.pause(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true, paused: true })
    // Verify via the exported getter
    const mod = await import('#controllers/admin/moderation_controller')
    assert.isTrue(mod.getIsPaused())
  })

  test('resume sets isPaused to false', async ({ assert }) => {
    setIsPaused(true)
    const controller = new ControllerClass()
    const ctx = buildCtx({})

    await controller.resume(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true, paused: false })
    const mod = await import('#controllers/admin/moderation_controller')
    assert.isFalse(mod.getIsPaused())
  })
})
