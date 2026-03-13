/**
 * Set Language Controller Unit Tests
 *
 * Tests the setLanguage() controller method.
 * Mock strategy: stub UserPreference.updateOrCreate (used to save preference)
 * and findUserPrefByPhone / resolveUserPrefKey helpers.
 */

import { test } from '@japa/runner'
import AuthApiController from '#controllers/auth_api_controller'
import UserPreference from '#models/user_preference'

// ── Mock context builder ───────────────────────────────────────────────────────

function buildCtx(opts: { phoneNumber?: string; body?: Record<string, unknown> } = {}) {
  let lastStatus: number | undefined
  let lastBody: unknown

  const ctx = {
    request: {
      body: () => opts.body ?? {},
    },
    response: {
      status(code: number) {
        lastStatus = code
        return {
          json(body: unknown) {
            lastBody = body
            return body
          },
        }
      },
    },
    cdpUser: { phoneNumber: opts.phoneNumber ?? '+573001234567', walletAddress: '0xABC' },
  }

  return {
    ctx,
    getStatus: () => lastStatus,
    getBody: () => lastBody,
  }
}

// ── Stubs ───────────────────────────────────────────────────────────────────────

const origUpdateOrCreate = (UserPreference as any).updateOrCreate
const origFindBy = (UserPreference as any).findBy

let updateOrCreateResult: unknown = { phoneNumber: '+573001234567', preferredLanguage: null }

// ══════════════════════════════════════════════════════════════════════════════
// setLanguage tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('setLanguage | valid language codes', (group) => {
  group.each.setup(() => {
    ;(UserPreference as any).findBy = async (_field: string, _val: string) => null
    ;(UserPreference as any).updateOrCreate = async (
      _key: Record<string, unknown>,
      _attrs: Record<string, unknown>
    ) => updateOrCreateResult
  })
  group.each.teardown(() => {
    ;(UserPreference as any).updateOrCreate = origUpdateOrCreate
    ;(UserPreference as any).findBy = origFindBy
  })

  test('TC-LN-003-U01: language: es → 200 { ok: true }, updateOrCreate called with preferredLanguage: es', async ({ assert }) => {
    let captured: Record<string, unknown> = {}
    ;(UserPreference as any).updateOrCreate = async (
      _key: Record<string, unknown>,
      attrs: Record<string, unknown>
    ) => { captured = attrs; return updateOrCreateResult }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: 'es' } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { ok: true })
    assert.equal(captured.preferredLanguage, 'es')
  })

  test('TC-LN-003-U02: language: pt → 200 { ok: true }, updateOrCreate called with preferredLanguage: pt', async ({ assert }) => {
    let captured: Record<string, unknown> = {}
    ;(UserPreference as any).updateOrCreate = async (
      _key: Record<string, unknown>,
      attrs: Record<string, unknown>
    ) => { captured = attrs; return updateOrCreateResult }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: 'pt' } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { ok: true })
    assert.equal(captured.preferredLanguage, 'pt')
  })

  test('TC-LN-003-U03: language: en → 200 { ok: true }, updateOrCreate called with preferredLanguage: en', async ({ assert }) => {
    let captured: Record<string, unknown> = {}
    ;(UserPreference as any).updateOrCreate = async (
      _key: Record<string, unknown>,
      attrs: Record<string, unknown>
    ) => { captured = attrs; return updateOrCreateResult }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: 'en' } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { ok: true })
    assert.equal(captured.preferredLanguage, 'en')
  })

  test('TC-LN-003-U04: language: null → 200 { ok: true }, updateOrCreate called with preferredLanguage: null', async ({ assert }) => {
    let captured: Record<string, unknown> = {}
    ;(UserPreference as any).updateOrCreate = async (
      _key: Record<string, unknown>,
      attrs: Record<string, unknown>
    ) => { captured = attrs; return updateOrCreateResult }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: null } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { ok: true })
    assert.isNull(captured.preferredLanguage)
  })
})

test.group('setLanguage | invalid language codes', (group) => {
  group.each.setup(() => {
    ;(UserPreference as any).findBy = async (_field: string, _val: string) => null
    ;(UserPreference as any).updateOrCreate = origUpdateOrCreate
  })
  group.each.teardown(() => {
    ;(UserPreference as any).updateOrCreate = origUpdateOrCreate
    ;(UserPreference as any).findBy = origFindBy
  })

  test('TC-LN-003-U05: language: fr (invalid) → 400 { error: invalid_language }', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: 'fr' } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 400)
    assert.deepEqual(getBody(), { error: 'invalid_language' })
  })

  test('TC-LN-003-U06: body field missing entirely → 400 { error: invalid_language }', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: {} })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 400)
    assert.deepEqual(getBody(), { error: 'invalid_language' })
  })
})

test.group('setLanguage | error handling', (group) => {
  group.each.teardown(() => {
    ;(UserPreference as any).updateOrCreate = origUpdateOrCreate
    ;(UserPreference as any).findBy = origFindBy
  })

  test('TC-LN-003-U07: DB throws → 500', async ({ assert }) => {
    ;(UserPreference as any).findBy = async (_field: string, _val: string) => null
    ;(UserPreference as any).updateOrCreate = async () => { throw new Error('DB error') }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { language: 'en' } })
    await controller.setLanguage(ctx as any)

    assert.equal(getStatus(), 500)
    assert.property(getBody() as object, 'error')
  })
})
