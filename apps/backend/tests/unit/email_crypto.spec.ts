/**
 * ER-008 Email Crypto Unit Tests
 *
 * Tests for encryptEmail, decryptEmail, hashEmail, normalizeEmail
 */

process.env.EMAIL_ENCRYPTION_KEY = 'abcdef1234567890'.repeat(4)

import { test } from '@japa/runner'
import { encryptEmail, decryptEmail, hashEmail, normalizeEmail } from '#utils/email_crypto'

// ══════════════════════════════════════════════════════════════════════════════
// encryptEmail / decryptEmail | roundtrip
// ══════════════════════════════════════════════════════════════════════════════

test.group('encryptEmail / decryptEmail | roundtrip', () => {
  test('decryptEmail(encrypted, iv) returns original email', ({ assert }) => {
    const enc = encryptEmail('user@example.com')
    assert.equal(decryptEmail(enc.encrypted, enc.iv), 'user@example.com')
  })

  test('roundtrip with Unicode email', ({ assert }) => {
    const enc = encryptEmail('üser@example.com')
    assert.equal(decryptEmail(enc.encrypted, enc.iv), 'üser@example.com')
  })

  test('roundtrip with long email (254 chars)', ({ assert }) => {
    const local = 'a'.repeat(242)
    const longEmail = `${local}@example.com`
    assert.equal(longEmail.length, 254)
    const enc = encryptEmail(longEmail)
    assert.equal(decryptEmail(enc.encrypted, enc.iv), longEmail)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// encryptEmail | different IVs per call
// ══════════════════════════════════════════════════════════════════════════════

test.group('encryptEmail | different IVs per call', () => {
  test('two encryptions of same email produce different iv values', ({ assert }) => {
    const enc1 = encryptEmail('user@example.com')
    const enc2 = encryptEmail('user@example.com')
    assert.notEqual(enc1.iv, enc2.iv)
  })

  test('two encryptions produce different encrypted values', ({ assert }) => {
    const enc1 = encryptEmail('user@example.com')
    const enc2 = encryptEmail('user@example.com')
    assert.notEqual(enc1.encrypted, enc2.encrypted)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// hashEmail | deterministic
// ══════════════════════════════════════════════════════════════════════════════

test.group('hashEmail | deterministic', () => {
  test('same input produces same hash', ({ assert }) => {
    assert.equal(hashEmail('user@example.com'), hashEmail('user@example.com'))
  })

  test('output is 64-character hex string', ({ assert }) => {
    const hash = hashEmail('user@example.com')
    assert.match(hash, /^[0-9a-f]{64}$/)
  })

  test('different emails produce different hashes', ({ assert }) => {
    assert.notEqual(hashEmail('a@b.com'), hashEmail('c@d.com'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// hashEmail | normalized
// ══════════════════════════════════════════════════════════════════════════════

test.group('hashEmail | normalized', () => {
  test('mixed-case normalizes: User@Example.COM === user@example.com hash', ({ assert }) => {
    assert.equal(hashEmail('User@Example.COM'), hashEmail('user@example.com'))
  })

  test('leading/trailing whitespace stripped', ({ assert }) => {
    assert.equal(hashEmail(' user@example.com '), hashEmail('user@example.com'))
  })

  test('all uppercase normalizes', ({ assert }) => {
    assert.equal(hashEmail('USER@EXAMPLE.COM'), hashEmail('user@example.com'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// normalizeEmail
// ══════════════════════════════════════════════════════════════════════════════

test.group('normalizeEmail', () => {
  test('lowercases', ({ assert }) => {
    assert.equal(normalizeEmail('USER@EX.COM'), 'user@ex.com')
  })

  test('trims whitespace', ({ assert }) => {
    assert.equal(normalizeEmail('  a@b.com  '), 'a@b.com')
  })
})
