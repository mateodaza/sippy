/**
 * Email Auth Controller Unit Tests
 *
 * Tests sendEmailCode, verifyEmailCode, and emailStatus controller methods.
 * Mocks emailService, UserPreference, and sets EMAIL_ENCRYPTION_KEY for crypto helpers.
 */

import { test } from '@japa/runner'
import AuthApiController from '#controllers/auth_api_controller'
import { emailService } from '#services/email_service'
import { jwtService } from '#services/jwt_service'
import app from '@adonisjs/core/services/app'
import UserPreference from '#models/user_preference'

// ── Test env setup ─────────────────────────────────────────────────────────────

// Valid 64-hex test key for email_crypto helpers
process.env.EMAIL_ENCRYPTION_KEY = 'abcdef1234567890'.repeat(4)

const PHONE = '+573001234567'
const DB_PHONE = '+573001234567'
const OTHER_PHONE = '+573009999999'
const VALID_EMAIL = 'user@example.com'

// ── Mock context builder ───────────────────────────────────────────────────────

function buildCtx(opts: { body?: Record<string, unknown>; phoneNumber?: string } = {}) {
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
    cdpUser: { phoneNumber: opts.phoneNumber ?? PHONE, walletAddress: '0xABC' },
  }

  return {
    ctx,
    getStatus: () => lastStatus,
    getBody: () => lastBody,
  }
}

// ── Chainable query builder mock ───────────────────────────────────────────────

function makeQueryMock(firstResult: unknown) {
  const builder: Record<string, unknown> = {}
  builder['whereNotNull'] = () => builder
  builder['where'] = () => builder
  builder['whereNot'] = () => builder
  builder['whereNotIn'] = () => builder
  builder['first'] = async () => firstResult
  builder['update'] = async () => 0
  return builder
}

// ── Save-able pref mock ────────────────────────────────────────────────────────

interface PrefMock {
  phoneNumber: string
  emailHash: string | null
  emailEncrypted: string | null
  emailVerified: boolean
  emailVerifiedAt: unknown
  preferredLanguage: string | null
  saveCalls: number
  save: () => Promise<void>
  [key: string]: unknown
}

function makePrefMock(fields: Record<string, unknown> = {}): PrefMock {
  const pref: PrefMock = {
    phoneNumber: PHONE,
    emailHash: null,
    emailEncrypted: null,
    emailVerified: false,
    emailVerifiedAt: null,
    preferredLanguage: null,
    saveCalls: 0,
    save: async () => {
      pref.saveCalls++
    },
    ...fields,
  }
  return pref
}

// ── Spy helpers ────────────────────────────────────────────────────────────────

type UpdateOrCreateCall = {
  searchPayload: Record<string, unknown>
  updatePayload: Record<string, unknown>
}

function makeUpdateOrCreateSpy() {
  const calls: UpdateOrCreateCall[] = []
  const fn = async (
    searchPayload: Record<string, unknown>,
    updatePayload: Record<string, unknown>
  ) => {
    calls.push({ searchPayload, updatePayload })
  }
  return { calls, fn }
}

// ── Original refs for restore ──────────────────────────────────────────────────

const origSendEmailCode = emailService.sendEmailCode.bind(emailService)
const origVerifyEmailCode = emailService.verifyEmailCode.bind(emailService)
const origSignToken = jwtService.signToken.bind(jwtService)
const origContainerMake = app.container.make.bind(app.container)
const origFindBy = UserPreference.findBy.bind(UserPreference)
const origUpdateOrCreate = (UserPreference as any).updateOrCreate
const origQuery = UserPreference.query.bind(UserPreference)

function restoreAll() {
  ;(emailService as any).sendEmailCode = origSendEmailCode
  ;(emailService as any).verifyEmailCode = origVerifyEmailCode
  ;(jwtService as any).signToken = origSignToken
  ;(app.container as any).make = origContainerMake
  ;(UserPreference as any).findBy = origFindBy
  ;(UserPreference as any).updateOrCreate = origUpdateOrCreate
  ;(UserPreference as any).query = origQuery
}

// Mock rate limit service — always allowed by default
const mockRateLimitAllowed = { checkIpResolveThrottle: () => ({ allowed: true }) }
const mockRateLimitBlocked = { checkIpResolveThrottle: () => ({ allowed: false, retryAfter: 30 }) }

function mockContainer(rls: unknown = mockRateLimitAllowed) {
  ;(app.container as any).make = async (name: string) => {
    if (name === 'rateLimitService') return rls
    return origContainerMake(name)
  }
}

/** Build a mock HttpContext for public endpoints (no cdpUser, has ip()) */
function buildPublicCtx(opts: { body?: Record<string, unknown>; ip?: string } = {}) {
  let lastStatus: number | undefined
  let lastBody: unknown

  const ctx = {
    request: {
      body: () => opts.body ?? {},
      ip: () => opts.ip ?? '127.0.0.1',
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
  }

  return {
    ctx,
    getStatus: () => lastStatus,
    getBody: () => lastBody,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// sendEmailCode tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('sendEmailCode | success', (group) => {
  group.each.teardown(restoreAll)

  test('valid email, no prior link, send succeeds → updateOrCreate called with iv:encrypted, emailVerified=false, returns { success: true }', async ({
    assert,
  }) => {
    ;(UserPreference as any).query = () => makeQueryMock(null)
    ;(UserPreference as any).findBy = async () => null
    const spy = makeUpdateOrCreateSpy()
    ;(UserPreference as any).updateOrCreate = spy.fn
    ;(emailService as any).sendEmailCode = async () => ({ success: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { success: true })
    assert.lengthOf(spy.calls, 1)
    assert.equal(spy.calls[0].searchPayload['phoneNumber'], DB_PHONE)
    const update = spy.calls[0].updatePayload
    assert.isString(update['emailEncrypted'])
    assert.match(update['emailEncrypted'] as string, /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
    assert.equal(update['emailVerified'], false)
    assert.isNull(update['emailVerifiedAt'])
  })

  test('same user re-sends (hash matches own phone) → send fires, overwrites, returns { success: true }', async ({
    assert,
  }) => {
    // query returns null (no OTHER user has this hash)
    ;(UserPreference as any).query = () => makeQueryMock(null)
    ;(UserPreference as any).findBy = async () => makePrefMock({ emailHash: 'anyhash' })
    const spy = makeUpdateOrCreateSpy()
    ;(UserPreference as any).updateOrCreate = spy.fn
    ;(emailService as any).sendEmailCode = async () => ({ success: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { success: true })
    assert.lengthOf(spy.calls, 1)
  })
})

test.group('sendEmailCode | validation errors', (group) => {
  group.each.teardown(restoreAll)

  test('missing email → 422, sendEmailCode NOT called, updateOrCreate NOT called', async ({
    assert,
  }) => {
    let sendCalled = false
    let updateCalled = false
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }
    ;(UserPreference as any).updateOrCreate = async () => {
      updateCalled = true
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: {} })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid email' })
    assert.isFalse(sendCalled)
    assert.isFalse(updateCalled)
  })

  test('non-string email → 422, sendEmailCode NOT called, updateOrCreate NOT called', async ({
    assert,
  }) => {
    let sendCalled = false
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }

    const controller = new AuthApiController()
    const { ctx, getStatus } = buildCtx({ body: { email: 123 } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.isFalse(sendCalled)
  })

  test('invalid email format (no @) → 422, sendEmailCode NOT called, updateOrCreate NOT called', async ({
    assert,
  }) => {
    let sendCalled = false
    let updateCalled = false
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }
    ;(UserPreference as any).updateOrCreate = async () => {
      updateCalled = true
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: 'notanemail' } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid email' })
    assert.isFalse(sendCalled)
    assert.isFalse(updateCalled)
  })
})

test.group('sendEmailCode | duplicate check', (group) => {
  group.each.teardown(restoreAll)

  test('email hash linked to different user → 409 email_already_linked, sendEmailCode NOT called, updateOrCreate NOT called', async ({
    assert,
  }) => {
    ;(UserPreference as any).query = () => makeQueryMock({ phoneNumber: OTHER_PHONE })
    let sendCalled = false
    let updateCalled = false
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }
    ;(UserPreference as any).updateOrCreate = async () => {
      updateCalled = true
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'email_already_linked' })
    assert.isFalse(sendCalled)
    assert.isFalse(updateCalled)
  })
})

test.group('sendEmailCode | send failures', (group) => {
  group.each.teardown(restoreAll)

  test('emailService returns rate_limited → 429, updateOrCreate NOT called', async ({ assert }) => {
    ;(UserPreference as any).query = () => makeQueryMock(null)
    ;(UserPreference as any).findBy = async () => null
    let updateCalled = false
    ;(UserPreference as any).updateOrCreate = async () => {
      updateCalled = true
    }
    ;(emailService as any).sendEmailCode = async () => ({ error: 'rate_limited' })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 429)
    assert.deepEqual(getBody(), { error: 'rate_limited' })
    assert.isFalse(updateCalled)
  })

  test('emailService returns other error → 500, updateOrCreate NOT called', async ({ assert }) => {
    ;(UserPreference as any).query = () => makeQueryMock(null)
    ;(UserPreference as any).findBy = async () => null
    let updateCalled = false
    ;(UserPreference as any).updateOrCreate = async () => {
      updateCalled = true
    }
    ;(emailService as any).sendEmailCode = async () => ({ error: 'Connection refused' })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailCode(ctx as any)

    assert.equal(getStatus(), 500)
    assert.deepEqual(getBody(), { error: 'Internal server error' })
    assert.isFalse(updateCalled)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailCode tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyEmailCode | success', (group) => {
  group.each.teardown(restoreAll)

  test('valid email + correct code + stored hash matches → emailVerified=true, emailVerifiedAt set, returns { success: true }', async ({
    assert,
  }) => {
    // We need the hash of the normalized email to pre-populate the pref
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    const pref = makePrefMock({ emailHash: hash, emailVerified: false })
    ;(UserPreference as any).findBy = async () => pref
    ;(UserPreference as any).query = () => makeQueryMock(null)
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { success: true })
    assert.isTrue(pref.emailVerified as boolean)
    assert.isNotNull(pref.emailVerifiedAt)
    assert.equal(pref.saveCalls, 1)
  })
})

test.group('verifyEmailCode | validation errors', (group) => {
  group.each.teardown(restoreAll)

  test('missing email → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { code: '123456' } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid email' })
  })

  test('non-string email → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus } = buildCtx({ body: { email: 42, code: '123456' } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
  })

  test('invalid email format → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: 'bademail', code: '123456' } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid email' })
  })

  test('missing code → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid code' })
  })

  test('code with letters (not 6 digits) → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL, code: 'abc123' } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid code' })
  })

  test('code too short → 422', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { email: VALID_EMAIL, code: '1234' } })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 422)
    assert.deepEqual(getBody(), { error: 'Invalid code' })
  })
})

test.group('verifyEmailCode | ownership check', (group) => {
  group.each.teardown(restoreAll)

  test('no UserPreference row → 409 email_mismatch, verifyEmailCode NOT called', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => null
    let verifyCalled = false
    ;(emailService as any).verifyEmailCode = async () => {
      verifyCalled = true
      return { valid: true }
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'email_mismatch' })
    assert.isFalse(verifyCalled)
  })

  test('stored emailHash differs from submitted hash → 409 email_mismatch, verifyEmailCode NOT called', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => makePrefMock({ emailHash: 'differenthash' })
    let verifyCalled = false
    ;(emailService as any).verifyEmailCode = async () => {
      verifyCalled = true
      return { valid: true }
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'email_mismatch' })
    assert.isFalse(verifyCalled)
  })

  test('ownership check passes but verifyEmailCode returns { valid: false } → 401 invalid_or_expired_code', async ({
    assert,
  }) => {
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(UserPreference as any).findBy = async () => makePrefMock({ emailHash: hash })
    ;(emailService as any).verifyEmailCode = async () => ({ valid: false })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailCode(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), { error: 'invalid_or_expired_code' })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// emailStatus tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('emailStatus', (group) => {
  group.each.teardown(restoreAll)

  test('no UserPreference row → { hasEmail: false, verified: false }', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => null

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.emailStatus(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { hasEmail: false, verified: false, maskedEmail: null })
  })

  test('row exists, emailHash is null → { hasEmail: false, verified: false }', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => makePrefMock({ emailHash: null })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.emailStatus(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { hasEmail: false, verified: false, maskedEmail: null })
  })

  test('row exists, emailHash set, emailVerified=false → { hasEmail: true, verified: false }', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () =>
      makePrefMock({ emailHash: 'somehash', emailVerified: false })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.emailStatus(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { hasEmail: true, verified: false, maskedEmail: null })
  })

  test('row exists, emailHash set, emailVerified=true → { hasEmail: true, verified: true }', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () =>
      makePrefMock({ emailHash: 'somehash', emailVerified: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.emailStatus(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { hasEmail: true, verified: true, maskedEmail: null })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// sendEmailLogin tests (public, no JWT)
// ══════════════════════════════════════════════════════════════════════════════

const GENERIC_SEND_RESPONSE = { message: 'If this email is registered, you will receive a code' }

test.group('sendEmailLogin | enumeration resistance', (group) => {
  group.each.teardown(restoreAll)

  test('valid email with verified account → 200 generic (success)', async ({ assert }) => {
    mockContainer()
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(UserPreference as any).query = () =>
      makeQueryMock(makePrefMock({ emailHash: hash, emailVerified: true }))
    ;(emailService as any).sendEmailCode = async () => ({ success: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })

  test('email not found → 200 generic (same as success)', async ({ assert }) => {
    mockContainer()
    ;(UserPreference as any).query = () => makeQueryMock(null)

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: 'unknown@example.com' } })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })

  test('invalid email format → 200 generic (same as success)', async ({ assert }) => {
    mockContainer()

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: 'notanemail' } })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })

  test('missing email → 200 generic (same as success)', async ({ assert }) => {
    mockContainer()

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: {} })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })

  test('IP rate limited → 200 generic (no 429 leaked)', async ({ assert }) => {
    mockContainer(mockRateLimitBlocked)

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })

  test('emailService send failure → 200 generic (no 500 leaked)', async ({ assert }) => {
    mockContainer()
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(UserPreference as any).query = () =>
      makeQueryMock(makePrefMock({ emailHash: hash, emailVerified: true }))
    ;(emailService as any).sendEmailCode = async () => ({ error: 'Connection refused' })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: VALID_EMAIL } })
    await controller.sendEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), GENERIC_SEND_RESPONSE)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailLogin tests (public, no JWT)
// ══════════════════════════════════════════════════════════════════════════════

const GENERIC_VERIFY_ERROR = { error: 'Invalid or expired code' }

test.group('verifyEmailLogin | success', (group) => {
  group.each.teardown(restoreAll)

  test('valid code + verified email → 200 with JWT', async ({ assert }) => {
    mockContainer()
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })
    ;(UserPreference as any).query = () =>
      makeQueryMock(makePrefMock({ phoneNumber: PHONE, emailHash: hash, emailVerified: true }))
    ;(jwtService as any).signToken = async () => 'mock-jwt-token'

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 200)
    const body = getBody() as { token: string; expiresIn: number }
    assert.equal(body.token, 'mock-jwt-token')
    assert.equal(body.expiresIn, 3600)
  })

  test('JWT sub is phone from UserPreference (not email)', async ({ assert }) => {
    mockContainer()
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })
    ;(UserPreference as any).query = () =>
      makeQueryMock(makePrefMock({ phoneNumber: PHONE, emailHash: hash, emailVerified: true }))

    let signedPhone: string | undefined
    ;(jwtService as any).signToken = async (phone: string) => {
      signedPhone = phone
      return 'jwt'
    }

    const controller = new AuthApiController()
    const { ctx } = buildPublicCtx({ body: { email: VALID_EMAIL, code: '123456' } })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(signedPhone, PHONE)
  })

  test('response does NOT contain phone (privacy)', async ({ assert }) => {
    mockContainer()
    const { hashEmail, normalizeEmail } = await import('#utils/email_crypto')
    const hash = hashEmail(normalizeEmail(VALID_EMAIL))
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })
    ;(UserPreference as any).query = () =>
      makeQueryMock(makePrefMock({ phoneNumber: PHONE, emailHash: hash, emailVerified: true }))
    ;(jwtService as any).signToken = async () => 'jwt'

    const controller = new AuthApiController()
    const { ctx, getBody } = buildPublicCtx({ body: { email: VALID_EMAIL, code: '123456' } })
    await controller.verifyEmailLogin(ctx as any)

    const body = getBody() as Record<string, unknown>
    assert.notProperty(body, 'phone')
    assert.notProperty(body, 'phoneNumber')
  })
})

test.group('verifyEmailLogin | enumeration resistance', (group) => {
  group.each.teardown(restoreAll)

  test('invalid code → 401 generic', async ({ assert }) => {
    mockContainer()
    ;(emailService as any).verifyEmailCode = async () => ({ valid: false })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({
      body: { email: VALID_EMAIL, code: '000000' },
    })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), GENERIC_VERIFY_ERROR)
  })

  test('invalid email format → 401 generic (same as bad code)', async ({ assert }) => {
    mockContainer()

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({
      body: { email: 'notanemail', code: '123456' },
    })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), GENERIC_VERIFY_ERROR)
  })

  test('missing code → 401 generic (same as bad code)', async ({ assert }) => {
    mockContainer()

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({ body: { email: VALID_EMAIL } })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), GENERIC_VERIFY_ERROR)
  })

  test('code valid but no verified pref → 401 generic (same as bad code)', async ({ assert }) => {
    mockContainer()
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })
    ;(UserPreference as any).query = () => makeQueryMock(null)

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), GENERIC_VERIFY_ERROR)
  })

  test('IP rate limited → 401 generic (no 429 leaked)', async ({ assert }) => {
    mockContainer(mockRateLimitBlocked)

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildPublicCtx({
      body: { email: VALID_EMAIL, code: '123456' },
    })
    await controller.verifyEmailLogin(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), GENERIC_VERIFY_ERROR)
  })
})
