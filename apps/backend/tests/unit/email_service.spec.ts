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
const DB_PHONE = '+573001234567'

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
    save: async () => {
      pref.saveCalls++
    },
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

  test('user with verified email → sends code, returns 200, emailVerified unchanged', async ({
    assert,
  }) => {
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
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }

    const controller = new AuthApiController()
    const { ctx, getStatus, getBody } = buildCtx()
    await controller.sendGateCode(ctx as any)

    assert.equal(getStatus(), 409)
    assert.deepEqual(getBody(), { error: 'no_verified_email' })
    assert.isFalse(sendCalled)
  })

  test('user with unverified email → returns 409 no_verified_email', async ({ assert }) => {
    const pref = makePrefMock({
      emailHash: 'somehash',
      emailEncrypted: 'iv:enc',
      emailVerified: false,
    })
    ;(UserPreference as any).findBy = async () => pref
    let sendCalled = false
    ;(emailService as any).sendEmailCode = async () => {
      sendCalled = true
      return { success: true }
    }

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

  test('valid code → returns { success: true, gateToken: string }, emailVerified stays true', async ({
    assert,
  }) => {
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

  test('user with verified email, valid gateToken → consumeGateToken called, gate passes (no 403)', async ({
    assert,
  }) => {
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

  test('user with verified email, expired gateToken → returns 403 gate_required', async ({
    assert,
  }) => {
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

  test('user with verified email, wrong gateToken → returns 403 gate_required', async ({
    assert,
  }) => {
    const pref = makePrefMock({ emailVerified: true })
    ;(UserPreference as any).findBy = async () => pref
    ;(emailService as any).consumeGateToken = () => false

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus, getBody } = buildCtx({ body: { gateToken: 'wrongtoken' } })
    await controller.revokePermission(ctx as any)

    assert.equal(getStatus(), 403)
    assert.deepEqual(getBody(), { error: 'gate_required' })
  })

  test('user with no verified email, no gateToken → gate not triggered (no 403)', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => null
    let consumeCalled = false
    ;(emailService as any).consumeGateToken = () => {
      consumeCalled = true
      return false
    }

    const controller = new EmbeddedWalletController()
    const { ctx, getStatus } = buildCtx({ body: {} })
    await controller.revokePermission(ctx as any)

    // consumeGateToken should NOT have been called (no verified email)
    assert.isFalse(consumeCalled)
    // Gate not triggered — status is NOT 403
    assert.notEqual(getStatus(), 403)
  })

  test('user with unverified email (emailVerified=false), no gateToken → gate not triggered (no 403)', async ({
    assert,
  }) => {
    const pref = makePrefMock({
      emailHash: 'somehash',
      emailEncrypted: 'iv:enc',
      emailVerified: false,
    })
    ;(UserPreference as any).findBy = async () => pref
    let consumeCalled = false
    ;(emailService as any).consumeGateToken = () => {
      consumeCalled = true
      return false
    }

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
// sendEmailCode — code generation
// ══════════════════════════════════════════════════════════════════════════════

test.group('sendEmailCode | code generation', (group) => {
  group.each.teardown(() => {})

  test('returns { success: true } on first send', async ({ assert }) => {
    const calls: { to: string; subject: string; text: string }[] = []
    const svc = new EmailService(async (to, subject, text) => {
      calls.push({ to, subject, text })
    })
    const result = await svc.sendEmailCode('user@example.com')
    assert.deepEqual(result, { success: true })
  })

  test('code stored in codeStore is exactly 6 digits', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    assert.match(entry.code, /^\d{6}$/)
    const n = Number(entry.code)
    assert.isAtLeast(n, 100000)
    assert.isAtMost(n, 999999)
  })

  test('TTL is ~10 minutes', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    const before = Date.now()
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    const expected = before + 10 * 60 * 1000
    assert.isAtMost(Math.abs(entry.expiresAt - expected), 1000)
  })

  test('attempts initialised to 0', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    assert.equal(entry.attempts, 0)
  })

  test('sender called with correct to and body containing 6-digit code', async ({ assert }) => {
    const calls: { to: string; subject: string; text: string }[] = []
    const svc = new EmailService(async (to, subject, text) => {
      calls.push({ to, subject, text })
    })
    await svc.sendEmailCode('user@example.com')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].to, 'user@example.com')
    assert.match(calls[0].text, /\d{6}/)
  })

  test('default lang (undefined) resolves to es — subject contains Tu código', async ({
    assert,
  }) => {
    const calls: { to: string; subject: string; text: string }[] = []
    const svc = new EmailService(async (to, subject, text) => {
      calls.push({ to, subject, text })
    })
    await svc.sendEmailCode('user@example.com', undefined)
    assert.equal(calls[0].subject, 'Sippy: Tu código de verificación')
  })

  test('lang=en subject is English', async ({ assert }) => {
    const calls: { to: string; subject: string; text: string }[] = []
    const svc = new EmailService(async (to, subject, text) => {
      calls.push({ to, subject, text })
    })
    await svc.sendEmailCode('user@example.com', 'en')
    assert.equal(calls[0].subject, 'Sippy: Your verification code')
  })

  test('lang=pt subject is Portuguese', async ({ assert }) => {
    const calls: { to: string; subject: string; text: string }[] = []
    const svc = new EmailService(async (to, subject, text) => {
      calls.push({ to, subject, text })
    })
    await svc.sendEmailCode('user@example.com', 'pt')
    assert.equal(calls[0].subject, 'Sippy: Seu código de verificação')
  })

  test('sender throws → returns { error: message }, codeStore NOT updated', async ({ assert }) => {
    const svc = new EmailService(async () => {
      throw new Error('network failure')
    })
    const result = await svc.sendEmailCode('fail@example.com')
    assert.isTrue('error' in result)
    assert.equal((result as any).error, 'network failure')
    assert.isFalse((svc as any).codeStore.has('fail@example.com'))
  })

  test('re-send for same email replaces entry, attempts reset to 0', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    // Capture a property of the first entry to prove it was replaced
    const entry1 = (svc as any).codeStore.get('user@example.com')
    entry1.attempts = 2
    // Send again — must produce a new entry (new code, attempts = 0)
    await svc.sendEmailCode('user@example.com')
    const entry2 = (svc as any).codeStore.get('user@example.com')
    // The stored object must be a new entry with attempts reset (code may coincidentally repeat)
    assert.notStrictEqual(entry2, entry1, 'entry should be a new object, not the same reference')
    assert.equal(entry2.attempts, 0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// sendEmailCode — rate limiting
// ══════════════════════════════════════════════════════════════════════════════

test.group('sendEmailCode | rate limiting', () => {
  test('first 3 sends for same email all return { success: true }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    const r1 = await svc.sendEmailCode('a@example.com')
    const r2 = await svc.sendEmailCode('a@example.com')
    const r3 = await svc.sendEmailCode('a@example.com')
    assert.deepEqual(r1, { success: true })
    assert.deepEqual(r2, { success: true })
    assert.deepEqual(r3, { success: true })
  })

  test('4th send returns { error: rate_limited }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('b@example.com')
    await svc.sendEmailCode('b@example.com')
    await svc.sendEmailCode('b@example.com')
    const result = await svc.sendEmailCode('b@example.com')
    assert.equal((result as { error: string }).error, 'rate_limited')
  })

  test('sender NOT called on 4th (rate check fires before send)', async ({ assert }) => {
    const calls: number[] = []
    const svc = new EmailService(async () => {
      calls.push(1)
    })
    await svc.sendEmailCode('c@example.com')
    await svc.sendEmailCode('c@example.com')
    await svc.sendEmailCode('c@example.com')
    await svc.sendEmailCode('c@example.com')
    assert.equal(calls.length, 3)
  })

  test('different emails are independent', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    // Exhaust rate limit for emailA
    await svc.sendEmailCode('emailA@example.com')
    await svc.sendEmailCode('emailA@example.com')
    await svc.sendEmailCode('emailA@example.com')
    const resultA4 = await svc.sendEmailCode('emailA@example.com') // 4th for A — must be rate limited
    assert.equal(
      (resultA4 as { error: string }).error,
      'rate_limited',
      'emailA must be rate limited on 4th send'
    )
    // emailB is on first send — should still succeed independently
    const resultB = await svc.sendEmailCode('emailB@example.com')
    assert.deepEqual(resultB, { success: true })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailCode — correct code
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyEmailCode | correct code', () => {
  test('correct code returns { valid: true }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    const result = await svc.verifyEmailCode('user@example.com', entry.code)
    assert.deepEqual(result, { valid: true })
  })

  test('entry deleted from codeStore after success', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    await svc.verifyEmailCode('user@example.com', entry.code)
    assert.isFalse((svc as any).codeStore.has('user@example.com'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailCode — wrong code
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyEmailCode | wrong code', () => {
  test('1st wrong attempt returns { valid: false }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const result = await svc.verifyEmailCode('user@example.com', '000000')
    assert.equal(result.valid, false)
  })

  test('attempts counter increments after first wrong', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    await svc.verifyEmailCode('user@example.com', '000000')
    const entry = (svc as any).codeStore.get('user@example.com')
    assert.equal(entry.attempts, 1)
  })

  test('2nd wrong attempt increments to 2', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    await svc.verifyEmailCode('user@example.com', '000000')
    await svc.verifyEmailCode('user@example.com', '000000')
    const entry = (svc as any).codeStore.get('user@example.com')
    assert.equal(entry.attempts, 2)
  })

  test('3rd wrong attempt (= MAX_VERIFY_ATTEMPTS) deletes entry', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    await svc.verifyEmailCode('user@example.com', '000000')
    await svc.verifyEmailCode('user@example.com', '000000')
    await svc.verifyEmailCode('user@example.com', '000000')
    assert.isFalse((svc as any).codeStore.has('user@example.com'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailCode — expired code
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyEmailCode | expired code', () => {
  test('expired entry returns { valid: false }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    entry.expiresAt = Date.now() - 1
    const result = await svc.verifyEmailCode('user@example.com', entry.code)
    assert.equal(result.valid, false)
  })

  test('expired entry is deleted', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    entry.expiresAt = Date.now() - 1
    await svc.verifyEmailCode('user@example.com', entry.code)
    assert.isFalse((svc as any).codeStore.has('user@example.com'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// verifyEmailCode — unknown email
// ══════════════════════════════════════════════════════════════════════════════

test.group('verifyEmailCode | unknown email', () => {
  test('no entry → { valid: false }', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    const result = await svc.verifyEmailCode('noone@example.com', '123456')
    assert.deepEqual(result, { valid: false })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// cleanup timer
// ══════════════════════════════════════════════════════════════════════════════

test.group('cleanup timer', () => {
  test('expired codeStore entries are purged by cleanup()', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const entry = (svc as any).codeStore.get('user@example.com')
    entry.expiresAt = Date.now() - 1
    ;(svc as any).cleanup()
    assert.isFalse((svc as any).codeStore.has('user@example.com'))
  })

  test('expired sendRateLimitMap entries are purged by cleanup()', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    const bucket = (svc as any).sendRateLimitMap.get('user@example.com')
    bucket.resetAt = Date.now() - 1
    ;(svc as any).cleanup()
    assert.isFalse((svc as any).sendRateLimitMap.has('user@example.com'))
  })

  test('active entries are preserved after cleanup', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    await svc.sendEmailCode('user@example.com')
    ;(svc as any).cleanup()
    assert.isTrue((svc as any).codeStore.has('user@example.com'))
  })

  test('startCleanupTimer / stopCleanupTimer do not throw', ({ assert }) => {
    const svc = new EmailService(async () => {})
    assert.doesNotThrow(() => svc.startCleanupTimer())
    assert.doesNotThrow(() => svc.stopCleanupTimer())
  })

  test('stopCleanupTimer is idempotent', ({ assert }) => {
    const svc = new EmailService(async () => {})
    svc.startCleanupTimer()
    assert.doesNotThrow(() => svc.stopCleanupTimer())
    assert.doesNotThrow(() => svc.stopCleanupTimer())
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// codeStore capacity cap
// ══════════════════════════════════════════════════════════════════════════════

test.group('codeStore capacity cap', () => {
  const MAX_MAP_ENTRIES = 50_000

  test('at 50,000 all unexpired → oldest evicted, new entry added', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    const store: Map<string, { code: string; expiresAt: number; attempts: number }> = (svc as any)
      .codeStore
    const oldestEmail = 'oldest@example.com'
    store.set(oldestEmail, { code: '111111', expiresAt: Date.now() + 99999, attempts: 0 })
    for (let i = 1; i < MAX_MAP_ENTRIES; i++) {
      store.set(`fill${i}@example.com`, {
        code: '222222',
        expiresAt: Date.now() + 99999,
        attempts: 0,
      })
    }
    const newEmail = 'newentry@example.com'
    await svc.sendEmailCode(newEmail)
    assert.isAtMost(store.size, MAX_MAP_ENTRIES)
    assert.isTrue(store.has(newEmail))
    assert.isFalse(store.has(oldestEmail))
  })

  test('at 50,000 all expired → expired purged, store size = 1', async ({ assert }) => {
    const svc = new EmailService(async () => {})
    const store: Map<string, { code: string; expiresAt: number; attempts: number }> = (svc as any)
      .codeStore
    for (let i = 0; i < MAX_MAP_ENTRIES; i++) {
      store.set(`expired${i}@example.com`, {
        code: '333333',
        expiresAt: Date.now() - 1,
        attempts: 0,
      })
    }
    const newEmail = 'newonly@example.com'
    await svc.sendEmailCode(newEmail)
    assert.equal(store.size, 1)
    assert.isTrue(store.has(newEmail))
  })

  test('re-send for existing email at capacity → no eviction of unrelated entries', async ({
    assert,
  }) => {
    const svc = new EmailService(async () => {})
    const store: Map<string, { code: string; expiresAt: number; attempts: number }> = (svc as any)
      .codeStore
    const existingEmail = 'existing@example.com'
    store.set(existingEmail, { code: '444444', expiresAt: Date.now() + 99999, attempts: 0 })
    const oldestEmail = 'oldest2@example.com'
    store.set(oldestEmail, { code: '555555', expiresAt: Date.now() + 99999, attempts: 0 })
    for (let i = 2; i < MAX_MAP_ENTRIES; i++) {
      store.set(`fill2-${i}@example.com`, {
        code: '666666',
        expiresAt: Date.now() + 99999,
        attempts: 0,
      })
    }
    // Re-send for existing email — codeStore already has it, no eviction needed
    await svc.sendEmailCode(existingEmail)
    assert.isTrue(store.has(oldestEmail))
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
    const {
      ctx: ctx1,
      getStatus: getStatus1,
      getBody: getBody1,
    } = buildCtx({ body: { gateToken: token } })
    await controller.validateExportGate(ctx1 as any)
    assert.equal(getStatus1(), 200)
    assert.deepEqual(getBody1(), { success: true })

    // Second call with same token: should fail
    const {
      ctx: ctx2,
      getStatus: getStatus2,
      getBody: getBody2,
    } = buildCtx({ body: { gateToken: token } })
    await controller.validateExportGate(ctx2 as any)
    assert.equal(getStatus2(), 403)
    assert.deepEqual(getBody2(), { error: 'gate_required' })
  })
})
