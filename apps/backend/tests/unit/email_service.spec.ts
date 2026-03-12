/**
 * ER-007 Gate Token Tests
 *
 * Tests for:
 * - EmailService.issueGateToken / consumeGateToken
 * - POST /api/auth/send-gate-code (AuthApiController.sendGateCode)
 * - POST /api/auth/verify-gate-code (AuthApiController.verifyGateCode)
 * - POST /api/revoke-permission gate enforcement (EmbeddedWalletController.revokePermission)
 */

process.env.EMAIL_ENCRYPTION_KEY = 'abcdef1234567890'.repeat(4)

import { test } from '@japa/runner'
import EmailService from '#services/email_service'
import { emailService } from '#services/email_service'
import AuthApiController from '#controllers/auth_api_controller'
import UserPreference from '#models/user_preference'

const PHONE = '+573001234567'
const DB_PHONE = '573001234567'

// ── Context builder ────────────────────────────────────────────────────────────

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
      json(body: unknown) {
        lastStatus = lastStatus ?? 200
        lastBody = body
        return body
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

// ── Pref mock ──────────────────────────────────────────────────────────────────

interface PrefMock {
  phoneNumber: string
  emailHash: string | null
  emailEncrypted: string | null
  emailVerified: boolean
  emailVerifiedAt: unknown
  saveCalls: number
  save: () => Promise<void>
  [key: string]: unknown
}

function makePrefMock(fields: Record<string, unknown> = {}): PrefMock {
  const pref: PrefMock = {
    phoneNumber: DB_PHONE,
    emailHash: null,
    emailEncrypted: null,
    emailVerified: false,
    emailVerifiedAt: null,
    saveCalls: 0,
    save: async () => { pref.saveCalls++ },
    ...fields,
  }
  return pref
}

// ── Original refs for restore ──────────────────────────────────────────────────

const origFindBy = UserPreference.findBy.bind(UserPreference)
const origSendEmailCode = emailService.sendEmailCode.bind(emailService)
const origVerifyEmailCode = emailService.verifyEmailCode.bind(emailService)

function restoreAll() {
  ;(UserPreference as any).findBy = origFindBy
  ;(emailService as any).sendEmailCode = origSendEmailCode
  ;(emailService as any).verifyEmailCode = origVerifyEmailCode
}

// ══════════════════════════════════════════════════════════════════════════════
// EmailService gate token unit tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('EmailService gate tokens', () => {
  test('issueGateToken + consumeGateToken → true; second consume → false', ({ assert }) => {
    const svc = new EmailService()
    const token = svc.issueGateToken('phone1')
    assert.isString(token)
    assert.isTrue(svc.consumeGateToken('phone1', token))
    assert.isFalse(svc.consumeGateToken('phone1', token))
  })

  test('consumeGateToken expired token → false', async ({ assert }) => {
    const svc = new EmailService()
    const token = svc.issueGateToken('phone2')
    // Force expiry by overwriting the entry with a past expiresAt
    ;(svc as any).gateTokens.set('phone2', { token, expiresAt: Date.now() - 1 })
    assert.isFalse(svc.consumeGateToken('phone2', token))
  })

  test('consumeGateToken wrong token → false', ({ assert }) => {
    const svc = new EmailService()
    svc.issueGateToken('phone3')
    assert.isFalse(svc.consumeGateToken('phone3', 'wrongtoken'))
  })

  test('issueGateToken replaces previous token for same phone', ({ assert }) => {
    const svc = new EmailService()
    const token1 = svc.issueGateToken('phone4')
    const token2 = svc.issueGateToken('phone4')
    // Two consecutive issues must generate different tokens
    assert.notEqual(token1, token2)
    // Only the latest token is valid
    assert.isTrue(svc.consumeGateToken('phone4', token2))
    // After consumption, the token is gone
    assert.isFalse(svc.consumeGateToken('phone4', token2))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// sendGateCode controller tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('sendGateCode', (group) => {
  group.each.teardown(restoreAll)

  test('user with verified email → sends code, returns 200, emailVerified unchanged', async ({ assert }) => {
    const { encryptEmail, normalizeEmail, hashEmail } = await import('#utils/email_crypto')
    const normalized = normalizeEmail('user@example.com')
    const hash = hashEmail(normalized)
    const { encrypted, iv } = encryptEmail(normalized)
    const combined = `${iv}:${encrypted}`

    const pref = makePrefMock({ emailHash: hash, emailEncrypted: combined, emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).sendEmailCode = async () => ({ success: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.sendGateCode(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { success: true })
    // emailVerified must remain unchanged
    assert.isTrue(pref.emailVerified as boolean)
    assert.equal(pref.saveCalls, 0)
  })

  test('user with no email → returns 409 no_verified_email', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => null
    let sendCalled = false
    ;(emailService as any).sendEmailCode = async () => { sendCalled = true; return { success: true } }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.sendGateCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
    assert.isFalse(sendCalled)
  })

  test('user with unverified email → returns 409 no_verified_email', async ({ assert }) => {
    const pref = makePrefMock({ emailHash: 'somehash', emailEncrypted: 'iv:enc', emailVerified: false })
    ;(UserPreference as any).findBy = async () => pref
    let sendCalled = false
    ;(emailService as any).sendEmailCode = async () => { sendCalled = true; return { success: true } }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.sendGateCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
    assert.isFalse(sendCalled)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyGateCode controller tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyGateCode', (group) => {
  group.each.teardown(restoreAll)

  test('valid code → returns { success: true, gateToken: string }, emailVerified stays true', async ({ assert }) => {
    const { encryptEmail, normalizeEmail, hashEmail } = await import('#utils/email_crypto')
    const normalized = normalizeEmail('user@example.com')
    const hash = hashEmail(normalized)
    const { encrypted, iv } = encryptEmail(normalized)
    const combined = `${iv}:${encrypted}`

    const pref = makePrefMock({ emailHash: hash, emailEncrypted: combined, emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).verifyEmailCode = async () => ({ valid: true })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { code: '123456' } })
    await controller.verifyGateCode(ctx as any)

    assert.equal(getStatus(), 200)
    const body = getBody() as { success: boolean; gateToken: string }
    assert.isTrue(body.success)
    assert.isString(body.gateToken)
    assert.isAbove(body.gateToken.length, 0)
    // emailVerified must remain true and unchanged
    assert.isTrue(pref.emailVerified as boolean)
    assert.equal(pref.saveCalls, 0)
  })

  test('invalid code → returns 401 invalid_or_expired_code', async ({ assert }) => {
    const { encryptEmail, normalizeEmail, hashEmail } = await import('#utils/email_crypto')
    const normalized = normalizeEmail('user@example.com')
    const hash = hashEmail(normalized)
    const { encrypted, iv } = encryptEmail(normalized)
    const combined = `${iv}:${encrypted}`

    const pref = makePrefMock({ emailHash: hash, emailEncrypted: combined, emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).verifyEmailCode = async () => ({ valid: false })

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { code: '000000' } })
    await controller.verifyGateCode(ctx as any)

    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), { error: 'invalid_or_expired_code' })
  })

  test('no verified email → returns 409 no_verified_email', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => null

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { code: '123456' } })
    await controller.verifyGateCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// revokePermission gate enforcement tests
// ══════════════════════════════════════════════════════════════════════════════

// EmbeddedWalletController imports CdpClient which requires CDP env vars at
// module load time. We use dynamic import AFTER setting the env vars so that
// the module initialisation sees the credentials.
//
// Note: ESM live bindings for '#services/db'.query are read-only, so we cannot
// mock the DB query in these unit tests. For gate-enforcement tests (403 paths),
// the function returns before hitting the DB. For pass-through paths (gate check
// passes), we verify the gate decision rather than the DB outcome.

const origConsumeGateToken = emailService.consumeGateToken.bind(emailService)
function restoreGateToken() {
  ;(emailService as any).consumeGateToken = origConsumeGateToken
}

test.group('revokePermission gate enforcement', (group) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let EmbeddedWalletController: any

  group.setup(async () => {
    // Set fake CDP credentials so the module-level `new CdpClient()` doesn't throw
    process.env.CDP_API_KEY_ID = 'test-api-key-id'
    process.env.CDP_API_KEY_SECRET = 'test-api-key-secret'
    process.env.CDP_WALLET_SECRET = 'test-wallet-secret'
    const mod = await import('#controllers/embedded_wallet_controller')
    EmbeddedWalletController = mod.default
  })

  group.each.teardown(() => {
    restoreAll()
    restoreGateToken()
  })

  test('user with verified email, valid gateToken → consumeGateToken called, gate passes (no 403)', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    let consumeCalled = false
    let consumePhone = ''
    let consumeToken = ''
    ;(emailService as any).consumeGateToken = (phone: string, token: string) => {
      consumeCalled = true
      consumePhone = phone
      consumeToken = token
      return true
    }

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus } = buildCtx({ body: { gateToken: 'validtoken123' } })
    await controller.revokePermission(ctx as any)

    // consumeGateToken must have been called with correct args
    assert.isTrue(consumeCalled)
    assert.equal(consumePhone, DB_PHONE)
    assert.equal(consumeToken, 'validtoken123')
    // Gate passed — status is NOT 403 (may be 500 if no DB in test env, which is expected)
    assert.notEqual(getStatus(), 403)
  })

  test('user with verified email, expired gateToken → returns 403 gate_required', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).consumeGateToken = () => false

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'expiredtoken' } })
    await controller.revokePermission(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('user with verified email, no gateToken → returns 403 gate_required', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus, getBody } = buildCtx({ body: {} })
    await controller.revokePermission(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('user with verified email, wrong gateToken → returns 403 gate_required', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).consumeGateToken = () => false

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'wrongtoken' } })
    await controller.revokePermission(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('user with no verified email, no gateToken → gate not triggered (no 403)', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => null
    let consumeCalled = false
    ;(emailService as any).consumeGateToken = () => { consumeCalled = true; return false }

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus } = buildCtx({ body: {} })
    await controller.revokePermission(ctx as any)

    // consumeGateToken should NOT have been called (no verified email)
    assert.isFalse(consumeCalled)
    // Gate not triggered — status is NOT 403
    assert.notEqual(getStatus(), 403)
  })

  test('user with unverified email (emailVerified=false), no gateToken → gate not triggered (no 403)', async ({ assert }) => {
    const pref = makePrefMock({ emailHash: 'somehash', emailEncrypted: 'iv:enc', emailVerified: false })
    ;(UserPreference as any).findBy = async () => pref
    let consumeCalled = false
    ;(emailService as any).consumeGateToken = () => { consumeCalled = true; return false }

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus } = buildCtx({ body: {} })
    await controller.revokePermission(ctx as any)

    // consumeGateToken should NOT have been called (email not verified)
    assert.isFalse(consumeCalled)
    // Gate not triggered — status is NOT 403
    assert.notEqual(getStatus(), 403)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// validateExportGate controller tests
// ══════════════════════════════════════════════════════════════════════════════

test.group('validateExportGate', (group) => {
  group.each.teardown(() => {
    restoreAll()
    restoreGateToken()
  })

  test('valid gateToken + verified email → consumes token, returns 200', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    let consumeCalled = false
    let consumePhone = ''
    let consumeToken = ''
    ;(emailService as any).consumeGateToken = (phone: string, token: string) => {
      consumeCalled = true
      consumePhone = phone
      consumeToken = token
      return true
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'validtoken123' } })
    await controller.validateExportGate(ctx as any)

    assert.equal(getStatus(), 200)
    assert.deepEqual(getBody(), { success: true })
    assert.isTrue(consumeCalled)
    assert.equal(consumePhone, DB_PHONE)
    assert.equal(consumeToken, 'validtoken123')
  })

  test('missing gateToken → returns 403 gate_required', async ({ assert }) => {
    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: {} })
    await controller.validateExportGate(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('expired or wrong gateToken → returns 403 gate_required', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).consumeGateToken = () => false

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'badtoken' } })
    await controller.validateExportGate(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('user with no verified email → returns 409 no_verified_email', async ({ assert }) => {
    ;(UserPreference as any).findBy = async () => null

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'sometoken' } })
    await controller.validateExportGate(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
  })

  test('user with unverified email → returns 409 no_verified_email', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: false })
    ;(UserPreference as any).findBy = async () => pref

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'sometoken' } })
    await controller.validateExportGate(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
  })

  test('gate token is single-use — second call with same token returns 403', async ({ assert }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref

    const token = emailService.issueGateToken(DB_PHONE)

    const controller = new AuthApiController()

    // First call: should succeed
    const { ctx: ctx1, getStatus: getStatus1, getBody: getBody1 } = buildCtx({ body: { gateToken: token } })
    await controller.validateExportGate(ctx1 as any)
    assert.equal(getStatus1(), 200)
    assert.deepEqual(getBody1(), { success: true })

    // Second call with same token: should fail
    const { ctx: ctx2, getStatus: getStatus2, getBody: getBody2 } = buildCtx({ body: { gateToken: token } })
    await controller.validateExportGate(ctx2 as any)
    assert.equal(getStatus2(), 403)
    assert.deepEqual(getBody2(), { error: 'gate_required' })
  })
})
