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

  test('TC-C11: 123456789 (9 digits) → +123456789 (valid E.164 length)', ({ assert }) => {
    assert.equal(canonicalizePhone('123456789'), '+123456789')
  })

  test('TC-C17: 123456 (6 digits) → null (below E.164 minimum)', ({ assert }) => {
    assert.isNull(canonicalizePhone('123456'))
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

test.group('canonicalizePhone | Mexico legacy mobile prefix stripped', () => {
  test('TC-C24: +5215631751220 (legacy +521) → +525631751220', ({ assert }) => {
    assert.equal(canonicalizePhone('+5215631751220'), '+525631751220')
  })

  test('TC-C25: 5215631751220 (no +, legacy 521) → +525631751220', ({ assert }) => {
    assert.equal(canonicalizePhone('5215631751220'), '+525631751220')
  })

  test('TC-C26: +525631751220 (already correct) → +525631751220', ({ assert }) => {
    assert.equal(canonicalizePhone('+525631751220'), '+525631751220')
  })
})

test.group('canonicalizePhone | FATF/Twilio blocked countries → null', () => {
  test('TC-C18: +850123456789 (North Korea) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+850123456789'))
  })

  test('TC-C19: +989123456789 (Iran) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+989123456789'))
  })

  test('TC-C20: +959123456789 (Myanmar) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+959123456789'))
  })

  test('TC-C21: +963912345678 (Syria) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+963912345678'))
  })

  test('TC-C22: +5312345678 (Cuba) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+5312345678'))
  })

  test('TC-C23: +249912345678 (Sudan) → null', ({ assert }) => {
    assert.isNull(canonicalizePhone('+249912345678'))
  })
})
