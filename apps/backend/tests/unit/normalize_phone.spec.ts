/**
 * normalizePhone Unit Tests
 *
 * Tests the phone normalization helper directly (no HTTP, no services).
 */

import { test } from '@japa/runner'
import { normalizePhone } from '#controllers/auth_api_controller'

test.group('normalizePhone', () => {
  test('TC-U1: already clean E.164 number passes through', ({ assert }) => {
    assert.equal(normalizePhone('+15555555555'), '+15555555555')
  })

  test('TC-U2: spaces are stripped', ({ assert }) => {
    assert.equal(normalizePhone('+1 555 555 5555'), '+15555555555')
  })

  test('TC-U3: dashes are stripped', ({ assert }) => {
    assert.equal(normalizePhone('+1-555-555-5555'), '+15555555555')
  })

  test('TC-U4: parentheses, spaces, and dashes are stripped', ({ assert }) => {
    assert.equal(normalizePhone('+1 (555) 555-5555'), '+15555555555')
  })

  test('TC-U5: dots are stripped', ({ assert }) => {
    assert.equal(normalizePhone('+1.555.555.5555'), '+15555555555')
  })

  test('TC-U6: string without + prefix returns null', ({ assert }) => {
    assert.isNull(normalizePhone('not-a-number'))
  })

  test('TC-U7: non-digit chars remaining after strip returns null', ({ assert }) => {
    assert.isNull(normalizePhone('+1abc'))
  })

  test('TC-U8: too short after country code returns null', ({ assert }) => {
    assert.isNull(normalizePhone('+1'))
  })

  test('TC-U9: leading zero after + is invalid E.164', ({ assert }) => {
    assert.isNull(normalizePhone('+0123456789'))
  })

  test('TC-U10: empty string returns null', ({ assert }) => {
    assert.isNull(normalizePhone(''))
  })

  test('TC-U11: Colombian number is valid', ({ assert }) => {
    assert.equal(normalizePhone('+573001234567'), '+573001234567')
  })
})
