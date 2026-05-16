/**
 * Special Accounts Util — Unit Tests
 *
 * Covers the three exports used for Quest exclusion (Pizza Day):
 *   - isVendorPhone
 *   - isExchangePhone
 *   - getQuestExcludedPhones
 *
 * Phones are canonicalized to E.164 on both sides of the comparison, so an
 * env entry written as `+57 300 123 4567` still matches an input bare-digit
 * lookup like `573001234567`. Malformed entries in env are dropped silently
 * (with logger.warn) — never throw.
 */

import { test } from '@japa/runner'
import { isVendorPhone, isExchangePhone, getQuestExcludedPhones } from '#utils/special_accounts'

const VENDOR_ENV = 'PIZZA_DAY_VENDOR_PHONES'
const EXCHANGE_ENV = 'PIZZA_DAY_EXCHANGE_PHONES'

function setEnv(name: string, value: string | null) {
  if (value === null) delete process.env[name]
  else process.env[name] = value
}

function withEnv(
  values: Partial<Record<typeof VENDOR_ENV | typeof EXCHANGE_ENV, string | null>>,
  fn: () => void
) {
  const prev: Record<string, string | undefined> = {
    [VENDOR_ENV]: process.env[VENDOR_ENV],
    [EXCHANGE_ENV]: process.env[EXCHANGE_ENV],
  }
  try {
    for (const [k, v] of Object.entries(values)) setEnv(k, v ?? null)
    fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// isVendorPhone
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | isVendorPhone', () => {
  test('returns false when env is unset', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: null }, () => {
      assert.isFalse(isVendorPhone('+573001111111'))
    })
  })

  test('returns true for a phone listed in the env', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111,+573002222222' }, () => {
      assert.isTrue(isVendorPhone('+573001111111'))
      assert.isTrue(isVendorPhone('+573002222222'))
    })
  })

  test('returns false for a phone NOT in the env', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111' }, () => {
      assert.isFalse(isVendorPhone('+573009999999'))
    })
  })

  test('canonicalizes both env entries and lookup input (whitespace, dashes, parens)', ({
    assert,
  }) => {
    withEnv({ [VENDOR_ENV]: '+57 300-111 1111, (57) 300-222.2222' }, () => {
      // Looked up with various formats — all canonicalize to the same E.164
      assert.isTrue(isVendorPhone('+573001111111'))
      assert.isTrue(isVendorPhone('+57 300 111 1111'))
      assert.isTrue(isVendorPhone('+57-300-222-2222'))
    })
  })

  test('lookup with bare digits resolves to E.164 via canonicalization', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111' }, () => {
      // Bare-digit input (no +) → canonicalizePhone adds it back
      assert.isTrue(isVendorPhone('573001111111'))
    })
  })

  test('null/empty/garbage input returns false without throwing', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111' }, () => {
      assert.isFalse(isVendorPhone(null))
      assert.isFalse(isVendorPhone(undefined))
      assert.isFalse(isVendorPhone(''))
      assert.isFalse(isVendorPhone('not-a-phone'))
      assert.isFalse(isVendorPhone('abc'))
    })
  })

  test('malformed env entries are dropped, valid ones still match', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111,garbage,+573002222222' }, () => {
      assert.isTrue(isVendorPhone('+573001111111'))
      assert.isTrue(isVendorPhone('+573002222222'))
      assert.isFalse(isVendorPhone('garbage'))
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// isExchangePhone
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | isExchangePhone', () => {
  test('uses PIZZA_DAY_EXCHANGE_PHONES, NOT vendor env', ({ assert }) => {
    withEnv(
      {
        [VENDOR_ENV]: '+573001111111',
        [EXCHANGE_ENV]: '+573003333333,+573004444444',
      },
      () => {
        // Vendor phone is NOT an exchange phone
        assert.isFalse(isExchangePhone('+573001111111'))
        // Exchange phones are recognized
        assert.isTrue(isExchangePhone('+573003333333'))
        assert.isTrue(isExchangePhone('+573004444444'))
      }
    )
  })

  test('returns false when exchange env is unset even if vendor is populated', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: '+573001111111', [EXCHANGE_ENV]: null }, () => {
      assert.isFalse(isExchangePhone('+573001111111'))
      assert.isFalse(isExchangePhone('+573003333333'))
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// getQuestExcludedPhones
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | getQuestExcludedPhones', () => {
  test('returns the union of vendor + exchange phones', ({ assert }) => {
    withEnv(
      {
        [VENDOR_ENV]: '+573001111111,+573002222222',
        [EXCHANGE_ENV]: '+573003333333,+573004444444,+573005555555',
      },
      () => {
        const excluded = getQuestExcludedPhones()
        assert.includeMembers(excluded, [
          '+573001111111',
          '+573002222222',
          '+573003333333',
          '+573004444444',
          '+573005555555',
        ])
        assert.equal(excluded.length, 5)
      }
    )
  })

  test('returns an empty array when both env vars are unset', ({ assert }) => {
    withEnv({ [VENDOR_ENV]: null, [EXCHANGE_ENV]: null }, () => {
      assert.deepEqual(getQuestExcludedPhones(), [])
    })
  })

  test('dedupes a phone appearing in both vendor and exchange lists', ({ assert }) => {
    // Operator typo case: same phone in both vars. Quest SQL would just see
    // it once via NOT IN; getQuestExcludedPhones should mirror that semantics.
    withEnv(
      {
        [VENDOR_ENV]: '+573001111111',
        [EXCHANGE_ENV]: '+573001111111,+573003333333',
      },
      () => {
        const excluded = getQuestExcludedPhones()
        assert.equal(excluded.length, 2, 'duplicate phone collapsed')
        assert.includeMembers(excluded, ['+573001111111', '+573003333333'])
      }
    )
  })

  test('canonicalizes entries so different formats of the same phone collapse', ({ assert }) => {
    // Operator writes the same phone two different ways across the two vars.
    // Both should collapse to a single canonical E.164 in the output.
    withEnv(
      {
        [VENDOR_ENV]: '+57 300 111 1111',
        [EXCHANGE_ENV]: '+573001111111',
      },
      () => {
        const excluded = getQuestExcludedPhones()
        assert.equal(excluded.length, 1)
        assert.equal(excluded[0], '+573001111111')
      }
    )
  })

  test('ignores empty CSV entries from trailing commas / whitespace', ({ assert }) => {
    withEnv(
      {
        [VENDOR_ENV]: '+573001111111, , +573002222222,',
        [EXCHANGE_ENV]: '',
      },
      () => {
        const excluded = getQuestExcludedPhones()
        assert.equal(excluded.length, 2)
        assert.includeMembers(excluded, ['+573001111111', '+573002222222'])
      }
    )
  })
})
