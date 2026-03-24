/**
 * User Language Controller Unit Tests
 *
 * Tests the userLanguage() controller method.
 * Mock strategy: stub UserPreference.findBy (used by findUserPrefByPhone).
 * getLanguageForPhone is tested via real phone number inputs.
 */

import { test } from '@japa/runner'
import AuthApiController from '#controllers/auth_api_controller'
import UserPreference from '#models/user_preference'

// ── Mock context builder ───────────────────────────────────────────────────────

function buildCtx(opts: { phoneNumber?: string } = {}) {
  let lastStatus: number | undefined
  let lastBody: unknown

  const ctx = {
    request: {
      body: () => ({}),
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

// ── UserPreference.findBy stub ─────────────────────────────────────────────────

let findByResult: UserPreference | null = null
const origFindBy = (UserPreference as any).findBy

// ══════════════════════════════════════════════════════════════════════════════
// userLanguage tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('userLanguage | DB preference wins', (group) => {
  group.each.setup(() => {
    ;(UserPreference as any).findBy = async (_field: string, _val: string) => findByResult
  })
  group.each.teardown(() => {
    ;(UserPreference as any).findBy = origFindBy
    findByResult = null
  })

  test('TC-LN-002-U01: preferredLanguage = es → { language: es, source: preference }', async ({
    assert,
  }) => {
    findByResult = { preferredLanguage: 'es' } as any
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+573001234567' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'es', source: 'preference' })
  })

  test('TC-LN-002-U02: preferredLanguage = pt → { language: pt, source: preference }', async ({
    assert,
  }) => {
    findByResult = { preferredLanguage: 'pt' } as any
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+5511999' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'pt', source: 'preference' })
  })

  test('TC-LN-002-U03: preferredLanguage = en → { language: en, source: preference }', async ({
    assert,
  }) => {
    findByResult = { preferredLanguage: 'en' } as any
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+15551234567' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'en', source: 'preference' })
  })
})

test.group('userLanguage | phone fallback', (group) => {
  group.each.setup(() => {
    ;(UserPreference as any).findBy = async (_field: string, _val: string) => findByResult
  })
  group.each.teardown(() => {
    ;(UserPreference as any).findBy = origFindBy
    findByResult = null
  })

  test('TC-LN-002-U04: no DB row, Brazilian phone → { language: pt, source: phone }', async ({
    assert,
  }) => {
    findByResult = null
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+5511999' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'pt', source: 'phone' })
  })

  test('TC-LN-002-U05: row exists, preferredLanguage null, US phone → { language: en, source: phone }', async ({
    assert,
  }) => {
    findByResult = { preferredLanguage: null } as any
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+15551234567' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'en', source: 'phone' })
  })

  test('TC-LN-002-U06: preferredLanguage = fr (unknown), Colombian phone → { language: es, source: phone }', async ({
    assert,
  }) => {
    findByResult = { preferredLanguage: 'fr' } as any
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+573001234567' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { language: 'es', source: 'phone' })
  })
})

test.group('userLanguage | error handling', (group) => {
  group.each.teardown(() => {
    ;(UserPreference as any).findBy = origFindBy
    findByResult = null
  })

  test('TC-LN-002-U07: DB throws → 500', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => {
      throw new Error('DB error')
    }
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ phoneNumber: '+573001234567' })
    await controller.userLanguage(ctx as any)

    assert.equal(getStatus(), 500)
    assert.property(getBody() as object, 'error')
  })
})
