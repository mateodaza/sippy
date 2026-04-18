/**
 * Colurs User Service — Pure Function Unit Tests
 *
 * No mocking needed: tests only the pure functions that have no I/O dependencies.
 */

import { test } from '@japa/runner'
import { deriveColursPassword } from '#services/colurs_user.service'

// ── deriveColursPassword ───────────────────────────────────────────────────────

test.group('deriveColursPassword', (group) => {
  group.each.setup(() => {
    process.env.COLURS_USER_PASSWORD_SECRET = 'test-hmac-secret-at-least-32-chars!!'
  })
  group.each.teardown(() => {
    delete process.env.COLURS_USER_PASSWORD_SECRET
  })

  test('returns a string of exactly 32 characters', ({ assert }) => {
    const pw = deriveColursPassword('+573001234567')
    assert.isString(pw)
    assert.equal(pw.length, 32)
  })

  test('is deterministic — same phone always produces same password', ({ assert }) => {
    const a = deriveColursPassword('+573001234567')
    const b = deriveColursPassword('+573001234567')
    assert.equal(a, b)
  })

  test('different phone numbers produce different passwords', ({ assert }) => {
    const a = deriveColursPassword('+573001234567')
    const b = deriveColursPassword('+573009876543')
    assert.notEqual(a, b)
  })

  test('output is base64url safe (no +, /, = characters)', ({ assert }) => {
    for (let i = 0; i < 20; i++) {
      const pw = deriveColursPassword(`+5730000${String(i).padStart(5, '0')}`)
      assert.notMatch(pw, /[+/=]/)
    }
  })

  test('works with non-Colombian phone numbers', ({ assert }) => {
    const pw = deriveColursPassword('+12125550001')
    assert.equal(pw.length, 32)
  })
})

// Note: idTypeToDocumentTypeId was removed — /profile_documents/ uses the
// TypeDocumentProfile.id enum (resolved via GET /type_documents/), not the
// /user/ document_type enum. See resolveProfileDocumentTypeId.
