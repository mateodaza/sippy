/**
 * Special Accounts Util — Unit Tests
 *
 * Quest exclusion semantics:
 *   - isExchangePhone           — env-based (PIZZA_DAY_EXCHANGE_PHONES)
 *   - getQuestExcludedPhones    — async, exchange env only
 *
 * Merchant exclusion is deliberately NOT derived from `qr_links` because
 * pay-QRs are universal (any user can mint one). When real vendor mode
 * lands, wire that signal in here.
 */

import { test } from '@japa/runner'
import { isExchangePhone, getQuestExcludedPhones } from '#utils/special_accounts'

const EXCHANGE_ENV = 'PIZZA_DAY_EXCHANGE_PHONES'

function setEnv(name: string, value: string | null) {
  if (value === null) delete process.env[name]
  else process.env[name] = value
}

function withEnv(value: string | null, fn: () => void | Promise<void>): Promise<void> {
  const prev = process.env[EXCHANGE_ENV]
  setEnv(EXCHANGE_ENV, value)
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env[EXCHANGE_ENV]
    else process.env[EXCHANGE_ENV] = prev
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// isExchangePhone
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | isExchangePhone', () => {
  test('returns false when env is unset', ({ assert }) =>
    withEnv(null, () => {
      assert.isFalse(isExchangePhone('+573003333333'))
    }))

  test('returns true for a phone listed in the env', ({ assert }) =>
    withEnv('+573003333333,+573004444444', () => {
      assert.isTrue(isExchangePhone('+573003333333'))
      assert.isTrue(isExchangePhone('+573004444444'))
    }))

  test('returns false for a phone NOT in the env', ({ assert }) =>
    withEnv('+573003333333', () => {
      assert.isFalse(isExchangePhone('+573009999999'))
    }))

  test('canonicalizes both env entries and lookup input', ({ assert }) =>
    withEnv('+57 300-333 3333, (57) 300-444.4444', () => {
      assert.isTrue(isExchangePhone('+573003333333'))
      assert.isTrue(isExchangePhone('+57 300 444 4444'))
    }))

  test('null/empty/garbage input returns false without throwing', ({ assert }) =>
    withEnv('+573003333333', () => {
      assert.isFalse(isExchangePhone(null))
      assert.isFalse(isExchangePhone(undefined))
      assert.isFalse(isExchangePhone(''))
      assert.isFalse(isExchangePhone('not-a-phone'))
    }))
})

// ══════════════════════════════════════════════════════════════════════════════
// getQuestExcludedPhones — exchange env only (no merchant inference)
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | getQuestExcludedPhones', () => {
  test('returns the exchange phones', async ({ assert }) => {
    await withEnv('+573003333333,+573004444444', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.includeMembers(excluded, ['+573003333333', '+573004444444'])
      assert.equal(excluded.length, 2)
    })
  })

  test('returns empty array when env is unset', async ({ assert }) => {
    await withEnv(null, async () => {
      assert.deepEqual(await getQuestExcludedPhones(), [])
    })
  })

  test('canonicalizes formatted entries', async ({ assert }) => {
    await withEnv('+57 300 333 3333', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.deepEqual(excluded, ['+573003333333'])
    })
  })

  test('ignores empty CSV entries from trailing commas / whitespace', async ({ assert }) => {
    await withEnv('+573003333333, , +573004444444,', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.equal(excluded.length, 2)
      assert.includeMembers(excluded, ['+573003333333', '+573004444444'])
    })
  })

  test('does NOT query qr_links — universal pay-QR semantics mean owner != merchant', async ({
    assert,
  }) => {
    // Regression guard: an earlier version excluded all active `kind='pay'`
    // owners, which would silently drop personal-pay-QR users from the
    // Quest leaderboard once they exist.
    await withEnv('+573003333333', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.deepEqual(excluded, ['+573003333333'], 'only exchange phones, no merchant inference')
    })
  })
})
