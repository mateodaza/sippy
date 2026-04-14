/**
 * Colurs User Service — Pure Function Unit Tests
 *
 * No mocking needed: tests only the pure functions that have no I/O dependencies.
 */

import { test } from '@japa/runner'
import { deriveColursPassword, idTypeToDocumentTypeId } from '#services/colurs_user.service'

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

// ── idTypeToDocumentTypeId ─────────────────────────────────────────────────────

test.group('idTypeToDocumentTypeId', () => {
  test('CC maps to 1', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('CC'), 1)
  })

  test('CE maps to 2', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('CE'), 2)
  })

  test('PA maps to 3', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('PA'), 3)
  })

  test('NIT maps to 4', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('NIT'), 4)
  })

  test('unknown type falls back to 1 (CC)', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('UNKNOWN'), 1)
  })

  test('lowercase input is handled', ({ assert }) => {
    assert.equal(idTypeToDocumentTypeId('cc'), 1)
    assert.equal(idTypeToDocumentTypeId('ce'), 2)
  })
})
