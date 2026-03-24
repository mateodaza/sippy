/**
 * Support Controller Unit Tests
 *
 * Tests both authenticated (create) and public (createPublic) ticket endpoints.
 * Mocks zohoDesk.createTicket (singleton), UserPreference.findBy, and uses
 * real email crypto with a test encryption key.
 */

import { test } from '@japa/runner'
import SupportController from '#controllers/support_controller'
import { zohoDesk } from '#services/zoho_desk.service'
import UserPreference from '#models/user_preference'
import { encryptEmail } from '#utils/email_crypto'

// ── Test env ──────────────────────────────────────────────────────────────────

process.env.EMAIL_ENCRYPTION_KEY = 'abcdef1234567890'.repeat(4)

const PHONE = '+573001234567'
const VERIFIED_EMAIL = 'user@example.com'
const FAKE_TICKET = {
  id: 'z-123',
  ticketNumber: 'TK-001',
  subject: 'Test',
  status: 'Open',
  createdTime: '2026-03-24T00:00:00Z',
}

// Encrypt with real crypto so resolveVerifiedEmail works end-to-end
const { encrypted, iv } = encryptEmail(VERIFIED_EMAIL)
const ENCRYPTED_EMAIL = `${iv}:${encrypted}`

const VALID_BODY = {
  subject: 'Cannot send money',
  description: 'I tried to send money but the transaction failed after 5 minutes of waiting.',
  email: 'submitted@evil.com',
  category: 'payments',
}

// ── Mock context builder ──────────────────────────────────────────────────────

function buildCtx(opts: { body?: Record<string, unknown>; phoneNumber?: string | null }) {
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
    cdpUser:
      opts.phoneNumber === null
        ? undefined
        : { phoneNumber: opts.phoneNumber ?? PHONE, walletAddress: '0xABC' },
  }

  return {
    ctx,
    getStatus: () => lastStatus,
    getBody: () => lastBody as Record<string, unknown>,
  }
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

const origCreateTicket = zohoDesk.createTicket.bind(zohoDesk)
const origFindBy = UserPreference.findBy.bind(UserPreference)

function stubUserPref(opts: { verified: boolean } | null) {
  if (opts) {
    ;(UserPreference as any).findBy = async () => ({
      emailVerified: opts.verified,
      emailEncrypted: opts.verified ? ENCRYPTED_EMAIL : null,
    })
  } else {
    ;(UserPreference as any).findBy = async () => null
  }
}

function stubCreateTicket(result: typeof FAKE_TICKET | Error = FAKE_TICKET) {
  ;(zohoDesk as any).createTicket = async () => {
    if (result instanceof Error) throw result
    return result
  }
}

function restoreAll() {
  ;(zohoDesk as any).createTicket = origCreateTicket
  ;(UserPreference as any).findBy = origFindBy
}

// ── Authenticated endpoint: create ────────────────────────────────────────────

test.group('SupportController.create (authenticated)', (group) => {
  const controller = new SupportController()

  group.each.teardown(() => restoreAll())

  test('returns 401 when no cdpUser', async ({ assert }) => {
    stubUserPref({ verified: true })
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({ body: VALID_BODY, phoneNumber: null })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 401)
    assert.deepEqual(getBody(), { error: 'Unauthorized' })
  })

  test('returns 403 when no verified email', async ({ assert }) => {
    stubUserPref(null)
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({ body: VALID_BODY })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 403)
    assert.isTrue((getBody()?.error as string).includes('verified email'))
  })

  test('returns 403 when email exists but not verified', async ({ assert }) => {
    stubUserPref({ verified: false })
    stubCreateTicket()
    const { ctx, getStatus } = buildCtx({ body: VALID_BODY })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 403)
  })

  test('ignores submitted email and uses DB-resolved verified email', async ({ assert }) => {
    stubUserPref({ verified: true })
    let capturedEmail: string | undefined
    ;(zohoDesk as any).createTicket = async (input: any) => {
      capturedEmail = input.email
      return FAKE_TICKET
    }

    const { ctx, getStatus } = buildCtx({
      body: { ...VALID_BODY, email: 'attacker@evil.com' },
    })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 201)
    assert.equal(capturedEmail, VERIFIED_EMAIL)
  })

  test('returns 400 for invalid category', async ({ assert }) => {
    stubUserPref({ verified: true })
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { ...VALID_BODY, category: 'hacked' },
    })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 400)
    assert.deepEqual(getBody(), { error: 'Invalid category' })
  })

  test('accepts valid category', async ({ assert }) => {
    stubUserPref({ verified: true })
    let capturedCategory: string | undefined
    ;(zohoDesk as any).createTicket = async (input: any) => {
      capturedCategory = input.category
      return FAKE_TICKET
    }

    const { ctx, getStatus } = buildCtx({
      body: { ...VALID_BODY, category: 'account' },
    })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 201)
    assert.equal(capturedCategory, 'account')
  })

  test('returns 201 with ticket info on success', async ({ assert }) => {
    stubUserPref({ verified: true })
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({ body: VALID_BODY })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 201)
    assert.deepEqual(getBody(), {
      success: true,
      ticketNumber: 'TK-001',
      ticketId: 'z-123',
    })
  })

  test('returns 502 when Zoho fails without leaking internals', async ({ assert }) => {
    stubUserPref({ verified: true })
    stubCreateTicket(new Error('Zoho API rate limited'))
    const { ctx, getStatus, getBody } = buildCtx({ body: VALID_BODY })
    await controller.create(ctx as any)
    assert.equal(getStatus(), 502)
    assert.equal(getBody()?.error, 'Unable to create support ticket. Please try again later.')
    assert.isUndefined((getBody() as any)?.stack)
  })
})

// ── Public endpoint: createPublic ─────────────────────────────────────────────

test.group('SupportController.createPublic (public)', (group) => {
  const controller = new SupportController()

  group.each.teardown(() => restoreAll())

  test('returns 400 when subject is missing', async ({ assert }) => {
    stubCreateTicket()
    const { ctx, getStatus } = buildCtx({
      body: { description: VALID_BODY.description, email: 'a@b.com' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('returns 400 when description is too short', async ({ assert }) => {
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { subject: 'Help', description: 'short', email: 'a@b.com' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 400)
    assert.isTrue((getBody()?.error as string).includes('20 characters'))
  })

  test('returns 400 when email is invalid', async ({ assert }) => {
    stubCreateTicket()
    const { ctx, getStatus } = buildCtx({
      body: { subject: 'Help', description: VALID_BODY.description, email: 'not-an-email' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 400)
  })

  test('returns 400 for invalid category', async ({ assert }) => {
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { ...VALID_BODY, category: 'xss<script>' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 400)
    assert.deepEqual(getBody(), { error: 'Invalid category' })
  })

  test('returns 201 on valid public submission', async ({ assert }) => {
    stubCreateTicket()
    const { ctx, getStatus, getBody } = buildCtx({
      body: { ...VALID_BODY, email: 'legit@user.com' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 201)
    assert.deepEqual(getBody(), {
      success: true,
      ticketNumber: 'TK-001',
      ticketId: 'z-123',
    })
  })

  test('returns 502 when Zoho fails without leaking internals', async ({ assert }) => {
    stubCreateTicket(new Error('Network timeout'))
    const { ctx, getStatus, getBody } = buildCtx({
      body: { ...VALID_BODY, email: 'legit@user.com' },
    })
    await controller.createPublic(ctx as any)
    assert.equal(getStatus(), 502)
    assert.equal(getBody()?.error, 'Unable to create support ticket. Please try again later.')
    assert.isUndefined((getBody() as any)?.stack)
  })
})
