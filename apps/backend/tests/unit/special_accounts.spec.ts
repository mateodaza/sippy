/**
 * Special Accounts Util — Unit Tests
 *
 * Covers Quest exclusion semantics:
 *   - isExchangePhone           — env-based (PIZZA_DAY_EXCHANGE_PHONES)
 *   - getQuestExcludedPhones    — async, merchants (from qr_links) ∪ exchange env
 *
 * Merchant exclusion is derived from `SELECT DISTINCT owner_phone_number FROM
 * qr_links WHERE kind='pay' AND status='active'` — issuance is the merchant
 * declaration. The `kind='pay'` link itself replaces the older
 * PIZZA_DAY_VENDOR_PHONES env list (now deleted).
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
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

// ── db.rawQuery mock (matches the bracket_token_service.spec pattern) ───────

let rawQueryCalls: Array<{ sql: string; bindings?: unknown[] }> = []
let mockedMerchantRows: Array<{ owner_phone_number: string }> = []
let origRawQuery: typeof db.rawQuery

function installDbMock() {
  rawQueryCalls = []
  mockedMerchantRows = []
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    if (sql.includes('FROM qr_links') && sql.includes("kind = 'pay'")) {
      return { rows: mockedMerchantRows, rowCount: mockedMerchantRows.length }
    }
    return { rows: [], rowCount: 0 }
  }) as any
}

function restoreDbMock() {
  db.rawQuery = origRawQuery
}

function setMerchants(phones: string[]) {
  mockedMerchantRows = phones.map((p) => ({ owner_phone_number: p }))
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
// getQuestExcludedPhones — merchants (qr_links) ∪ exchange (env)
// ══════════════════════════════════════════════════════════════════════════════

test.group('special_accounts | getQuestExcludedPhones', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)

  test('returns merchants from qr_links unioned with exchange env', async ({ assert }) => {
    setMerchants(['+573001111111', '+573002222222'])
    await withEnv('+573003333333,+573004444444', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.includeMembers(excluded, [
        '+573001111111',
        '+573002222222',
        '+573003333333',
        '+573004444444',
      ])
      assert.equal(excluded.length, 4)
    })
  })

  test('returns empty array when no merchants and no exchange env', async ({ assert }) => {
    setMerchants([])
    await withEnv(null, async () => {
      assert.deepEqual(await getQuestExcludedPhones(), [])
    })
  })

  test('dedupes a phone appearing as both merchant and exchange', async ({ assert }) => {
    // Operator typo case: a phone with an active pay-QR is also listed in
    // exchange env. SQL NOT IN would see it once; output mirrors that.
    setMerchants(['+573001111111'])
    await withEnv('+573001111111,+573003333333', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.equal(excluded.length, 2, 'duplicate phone collapsed')
      assert.includeMembers(excluded, ['+573001111111', '+573003333333'])
    })
  })

  test('canonicalizes both sides so different formats collapse', async ({ assert }) => {
    // Merchant phone stored bare-digit; same phone listed differently in env.
    setMerchants(['573001111111'])
    await withEnv('+57 300 111 1111', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.equal(excluded.length, 1)
      assert.equal(excluded[0], '+573001111111')
    })
  })

  test('queries qr_links with kind=pay AND status=active', async ({ assert }) => {
    setMerchants(['+573001111111'])
    await withEnv(null, async () => {
      await getQuestExcludedPhones()
      const qrLinkQueries = rawQueryCalls.filter((c) => c.sql.includes('FROM qr_links'))
      assert.equal(qrLinkQueries.length, 1, 'one read against qr_links')
      assert.include(qrLinkQueries[0].sql, "kind = 'pay'")
      assert.include(qrLinkQueries[0].sql, "status = 'active'")
      assert.include(qrLinkQueries[0].sql, 'DISTINCT')
    })
  })

  test('DB failure degrades to exchange-only exclusion (no throw)', async ({ assert }) => {
    // Override rawQuery to throw to simulate a DB outage
    const orig = db.rawQuery
    ;(db as any).rawQuery = async () => {
      throw new Error('simulated DB outage')
    }
    try {
      await withEnv('+573003333333', async () => {
        const excluded = await getQuestExcludedPhones()
        // Merchants unavailable, exchange still works
        assert.deepEqual(excluded, ['+573003333333'])
      })
    } finally {
      ;(db as any).rawQuery = orig
    }
  })

  test('ignores empty CSV entries from trailing commas / whitespace in exchange env', async ({
    assert,
  }) => {
    setMerchants([])
    await withEnv('+573003333333, , +573004444444,', async () => {
      const excluded = await getQuestExcludedPhones()
      assert.equal(excluded.length, 2)
      assert.includeMembers(excluded, ['+573003333333', '+573004444444'])
    })
  })
})
