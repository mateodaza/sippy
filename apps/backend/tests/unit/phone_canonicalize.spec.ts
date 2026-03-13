/**
 * canonicalizePhone Unit Tests
 */

import { test } from '@japa/runner'
import { canonicalizePhone } from '#utils/phone'

test.group('canonicalizePhone | already E.164', () => {
  test('TC-C1: +573001234567 passes through', ({ assert }) => {
    assert.equal(canonicalizePhone('+573001234567'), '+573001234567')
  })

  test('TC-C2: +15551234567 passes through', ({ assert }) => {
    assert.equal(canonicalizePhone('+15551234567'), '+15551234567')
  })
})

test.group('canonicalizePhone | missing + but has country code in number', () => {
  test('TC-C3: 573001234567 (12 digits, no +) → +573001234567', ({ assert }) => {
    assert.equal(canonicalizePhone('573001234567'), '+573001234567')
  })

  test('TC-C4: 15551234567 (11 digits, no +) → +15551234567', ({ assert }) => {
    assert.equal(canonicalizePhone('15551234567'), '+15551234567')
  })
})

test.group('canonicalizePhone | 00-prefix international', () => {
  test('TC-C5: 0057 300 123-4567 → +573001234567', ({ assert }) => {
    assert.equal(canonicalizePhone('0057 300 123-4567'), '+573001234567')
  })
})

test.group('canonicalizePhone | formatting stripped', () => {
  test('TC-C6: +1 (555) 123-4567 → +15551234567', ({ assert }) => {
    assert.equal(canonicalizePhone('+1 (555) 123-4567'), '+15551234567')
  })

  test('TC-C7: +57.300.123.4567 → +573001234567', ({ assert }) => {
    assert.equal(canonicalizePhone('+57.300.123.4567'), '+573001234567')
  })
})

test.group('canonicalizePhone | DEFAULT_COUNTRY_CODE local expansion', (group) => {
  group.each.setup(() => {
    process.env.DEFAULT_COUNTRY_CODE = '57'
    return () => {
      delete process.env.DEFAULT_COUNTRY_CODE
    }
  })

  test('TC-C8: (300) 123-4567 with DEFAULT_COUNTRY_CODE=57 → +573001234567', ({ assert }) => {
    assert.equal(canonicalizePhone('(300) 123-4567'), '+573001234567')
  })

  test('TC-C9: 3001234567 with DEFAULT_COUNTRY_CODE=57 → +573001234567', ({ assert }) => {
    assert.equal(canonicalizePhone('3001234567'), '+573001234567')
  })
})

test.group('canonicalizePhone | invalid → null', (group) => {
  group.each.setup(() => {
    delete process.env.DEFAULT_COUNTRY_CODE
    return () => {}
  })

  test('TC-C10: empty string → null', ({ assert }) => {
    assert.isNull(canonicalizePhone(''))
  })

  test('TC-C11: 123456789 (9 digits) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('123456789'))
  })

  test('TC-C12: +0123456789 → null (starts with 0 after +)', ({ assert }) => {
    assert.isNull(canonicalizePhone('+0123456789'))
  })

  test('TC-C13: +1234567890123456 (16 digits after +) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+1234567890123456'))
  })

  test('TC-C14: abc → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('abc'))
  })

  test('TC-C15: +1abc → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+1abc'))
  })

  test('TC-C16: 3001234567 with no DEFAULT_COUNTRY_CODE → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('3001234567'))
  })
})
