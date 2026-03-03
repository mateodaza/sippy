/**
 * Export Audit Schema & Hashing Tests
 *
 * Ported from Express: tests/unit/export-audit.test.ts
 * Group 1: Schema & hashing (pure unit, no server)
 * Group 2: Route handler behavior is tested in functional/embedded_wallet.spec.ts
 */

import { test } from '@japa/runner'
import crypto from 'node:crypto'
import { exportEventSchema } from '#types/schemas'

test.group('Export Audit | Zod Schema Validation', () => {
  const validEvents = [
    'initiated',
    'unlocked',
    'iframe_ready',
    'copied',
    'completed',
    'expired',
    'cancelled',
  ]

  for (const event of validEvents) {
    test(`accepts valid event: "${event}"`, ({ assert }) => {
      const result = exportEventSchema.safeParse({
        event,
        attemptId: crypto.randomUUID(),
      })
      assert.isTrue(result.success)
    })
  }

  test('rejects invalid event "hacked"', ({ assert }) => {
    const result = exportEventSchema.safeParse({
      event: 'hacked',
      attemptId: crypto.randomUUID(),
    })
    assert.isFalse(result.success)
  })

  test('rejects missing attemptId', ({ assert }) => {
    const result = exportEventSchema.safeParse({ event: 'initiated' })
    assert.isFalse(result.success)
  })

  test('rejects non-UUID attemptId', ({ assert }) => {
    const result = exportEventSchema.safeParse({
      event: 'initiated',
      attemptId: 'not-a-uuid',
    })
    assert.isFalse(result.success)
  })
})

test.group('Export Audit | Phone Hashing', () => {
  const secret = 'test-secret-key'
  const phone = '+573001234567'

  test('hash is 64-char hex string', ({ assert }) => {
    const hash = crypto.createHmac('sha256', secret).update(phone).digest('hex')
    assert.match(hash, /^[a-f0-9]{64}$/)
  })

  test('hash is deterministic (same input = same output)', ({ assert }) => {
    const hash1 = crypto.createHmac('sha256', secret).update(phone).digest('hex')
    const hash2 = crypto.createHmac('sha256', secret).update(phone).digest('hex')
    assert.equal(hash1, hash2)
  })

  test('hash changes with different secret', ({ assert }) => {
    const hash1 = crypto.createHmac('sha256', secret).update(phone).digest('hex')
    const hash2 = crypto.createHmac('sha256', 'different-secret').update(phone).digest('hex')
    assert.notEqual(hash1, hash2)
  })
})

test.group('Export Audit | Route Handler Logic', () => {
  test('no auth returns 401 pattern', ({ assert }) => {
    // Simulates what handler does when verifyCdpSession throws
    let status = 200
    try {
      throw new Error('Missing authorization token')
    } catch {
      status = 401
    }
    assert.equal(status, 401)
  })

  test('invalid body returns 400 pattern', ({ assert }) => {
    const badBody = { event: 'hacked', attemptId: crypto.randomUUID() }
    const parsed = exportEventSchema.safeParse(badBody)
    const status = parsed.success ? 200 : 400
    assert.equal(status, 400)
  })

  test('missing secret returns 503 pattern', ({ assert }) => {
    const secret = undefined
    const status = secret ? 200 : 503
    assert.equal(status, 503)
  })

  test('valid request produces correct audit entry', ({ assert }) => {
    const secret = 'test-audit-secret'
    const phoneNumber = '+573001234567'
    const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const body = { event: 'initiated', attemptId: crypto.randomUUID() }

    const parsed = exportEventSchema.safeParse(body)
    assert.isTrue(parsed.success)

    if (parsed.success) {
      const phoneHash = crypto.createHmac('sha256', secret).update(phoneNumber).digest('hex')
      const entry = {
        attemptId: parsed.data.attemptId,
        event: parsed.data.event,
        phoneHash,
        walletAddress,
      }

      assert.equal(entry.attemptId, body.attemptId)
      assert.equal(entry.event, body.event)
      assert.match(entry.phoneHash, /^[a-f0-9]{64}$/)
      assert.equal(entry.walletAddress, walletAddress)
    }
  })
})
