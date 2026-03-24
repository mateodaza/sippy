/**
 * Privacy Controller Unit Tests
 *
 * Directly instantiates EmbeddedWalletController and invokes setPrivacy /
 * privacyStatus with a mock HttpContext. UserPreference model methods are
 * replaced with stubs inside each test.
 *
 * EmbeddedWalletController is loaded via dynamic import so that fake CDP env
 * vars can be set first (the module has a top-level `new CdpClient()` call that
 * throws if credentials are absent).
 */

import { test } from '@japa/runner'
import UserPreference from '#models/user_preference'

let ControllerClass: new () => any

async function ensureController() {
  if (ControllerClass) return
  // Set fake credentials so CdpClient() doesn't throw at module-load time.
  process.env.CDP_API_KEY_ID ??= 'test-fake-key-id'
  process.env.CDP_API_KEY_SECRET ??= 'test-fake-key-secret'
  const mod = await import('#controllers/embedded_wallet_controller')
  ControllerClass = mod.default
}

// ── Mock context builder ────────────────────────────────────────────────────

interface MockRes {
  statusCode: number
  body: unknown
}

interface MockHttpContext {
  cdpUser: { phoneNumber: string; walletAddress: string }
  request: { body: () => unknown }
  response: {
    status: (code: number) => MockHttpContext['response']
    json: (data: unknown) => MockHttpContext['response']
  }
  _res: MockRes
}

function buildCtx(phone: string, body: unknown): MockHttpContext {
  const res: MockRes = { statusCode: 200, body: {} }
  const ctx: MockHttpContext = {
    cdpUser: { phoneNumber: phone, walletAddress: '0x0' },
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

// ── Stub helpers ─────────────────────────────────────────────────────────────

type FindByResult = { phoneVisible: boolean } | null

const originalFindBy = UserPreference.findBy.bind(UserPreference)
const originalUpdateOrCreate = UserPreference.updateOrCreate.bind(UserPreference)

function stubFindBy(result: FindByResult) {
  ;(UserPreference as any).findBy = async (_key: unknown, _value: unknown) => result
}

function stubUpdateOrCreate() {
  ;(UserPreference as any).updateOrCreate = async (_search: unknown, _data: unknown) => ({})
}

function restoreUserPreference() {
  ;(UserPreference as any).findBy = originalFindBy
  ;(UserPreference as any).updateOrCreate = originalUpdateOrCreate
}

// ── setPrivacy tests ─────────────────────────────────────────────────────────

test.group('EmbeddedWalletController | setPrivacy', (group) => {
  group.setup(async () => {
    await ensureController()
  })

  group.each.teardown(() => {
    restoreUserPreference()
  })

  test('TC-PV-001-U-SP01: phoneVisible: true → 200 { success: true }', async ({ assert }) => {
    stubFindBy(null) // resolveEmbeddedUserPrefKey: no bare-digit row exists
    stubUpdateOrCreate()
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', { phoneVisible: true })

    await controller.setPrivacy(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true })
  })

  test('TC-PV-001-U-SP02: phoneVisible: false → 200 { success: true }', async ({ assert }) => {
    stubFindBy(null)
    stubUpdateOrCreate()
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', { phoneVisible: false })

    await controller.setPrivacy(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { success: true })
  })

  test('TC-PV-001-U-SP03: missing phoneVisible → 422', async ({ assert }) => {
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', {})

    await controller.setPrivacy(ctx as any)

    assert.equal(ctx._res.statusCode, 422)
    assert.deepEqual(ctx._res.body, { error: 'phoneVisible must be a boolean' })
  })

  test('TC-PV-001-U-SP04: phoneVisible is string "yes" → 422', async ({ assert }) => {
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', { phoneVisible: 'yes' })

    await controller.setPrivacy(ctx as any)

    assert.equal(ctx._res.statusCode, 422)
    assert.deepEqual(ctx._res.body, { error: 'phoneVisible must be a boolean' })
  })
})

// ── privacyStatus tests ──────────────────────────────────────────────────────

test.group('EmbeddedWalletController | privacyStatus', (group) => {
  group.setup(async () => {
    await ensureController()
  })

  group.each.teardown(() => {
    restoreUserPreference()
  })

  test('TC-PV-001-U-PS01: no existing pref row → 200 { phoneVisible: true }', async ({
    assert,
  }) => {
    stubFindBy(null)
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', {})

    await controller.privacyStatus(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { phoneVisible: true })
  })

  test('TC-PV-001-U-PS02: pref row with phoneVisible: false → 200 { phoneVisible: false }', async ({
    assert,
  }) => {
    stubFindBy({ phoneVisible: false })
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', {})

    await controller.privacyStatus(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { phoneVisible: false })
  })

  test('TC-PV-001-U-PS03: pref row with phoneVisible: true → 200 { phoneVisible: true }', async ({
    assert,
  }) => {
    stubFindBy({ phoneVisible: true })
    const controller = new ControllerClass()
    const ctx = buildCtx('+15551234567', {})

    await controller.privacyStatus(ctx as any)

    assert.equal(ctx._res.statusCode, 200)
    assert.deepEqual(ctx._res.body, { phoneVisible: true })
  })
})
