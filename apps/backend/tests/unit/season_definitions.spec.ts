/**
 * #season/definitions unit tests — mocked DB via the __setDepsForTest seam.
 *
 * Asserts the shared active / MAW / retained / distinct-counterparty
 * definitions issue the right query and map results correctly. The verified-
 * counterparty floor (phone_registry EXCEPT operator wallets, minus spender) is
 * asserted to be present in the SQL — it's the load-bearing seam for Phase C.
 */

import { test } from '@japa/runner'
import {
  isActive,
  maw,
  maw30,
  isRetained,
  distinctVerifiedCounterparties,
  trailing,
  __setDepsForTest as setDefDeps,
  __resetDeps as resetDefDeps,
} from '#season/definitions'
import {
  DEFAULT_PARAMS,
  __setDepsForTest as setParamsDeps,
  __resetDeps as resetParamsDeps,
} from '#season/params'

type Call = { text: string; params: any[] }

/**
 * Route definition queries by content; params() always returns DEFAULT_PARAMS
 * so minActiveUsd resolves to $1 → 1_000_000 raw units without a real DB.
 */
function installMocks(values: { active?: boolean; maw?: string; distinct?: string }) {
  const calls: Call[] = []
  setParamsDeps({
    query: (async () => ({ rows: [{ params: DEFAULT_PARAMS }], rowCount: 1 })) as any,
  })
  setDefDeps({
    query: (async (text: string, params: any[] = []) => {
      calls.push({ text, params })
      if (text.includes('EXISTS'))
        return { rows: [{ active: values.active ?? false }], rowCount: 1 }
      if (text.includes('COUNT(DISTINCT LOWER(t."from"))'))
        return { rows: [{ maw: values.maw ?? '0' }], rowCount: 1 }
      if (text.includes('COUNT(DISTINCT LOWER(t."to"))'))
        return { rows: [{ n: values.distinct ?? '0' }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }) as any,
  })
  return calls
}

test.group('season/definitions', (group) => {
  group.teardown(() => {
    resetDefDeps()
    resetParamsDeps()
  })

  test('trailing(30, now) is a [now-30d, now) window', ({ assert }) => {
    const now = 1_700_000_000
    assert.deepEqual(trailing(30, now), { start: now - 30 * 86_400, end: now })
  })

  test('isActive returns true and lowercases the wallet + applies the $1 floor', async ({
    assert,
  }) => {
    const calls = installMocks({ active: true })
    const result = await isActive('0xABCDEF', { start: 100, end: 200 })
    assert.isTrue(result)
    const q = calls.find((c) => c.text.includes('EXISTS'))!
    assert.include(q.text, 'onchain.transfer')
    assert.include(q.text, 'verified') // verified-counterparty CTE present
    assert.include(q.text, 'event_operator_wallets') // operator exclusion present
    assert.equal(q.params[0], '0xabcdef') // lowercased
    assert.equal(q.params[1], 100)
    assert.equal(q.params[2], 200)
    assert.equal(q.params[3], '1000000') // $1 in raw USDC units
  })

  test('isActive returns false when no qualifying value-out', async ({ assert }) => {
    installMocks({ active: false })
    assert.isFalse(await isActive('0xabc', { start: 0, end: 1 }))
  })

  test('maw counts distinct verified senders', async ({ assert }) => {
    const calls = installMocks({ maw: '7' })
    assert.equal(await maw({ start: 0, end: 100 }), 7)
    const q = calls.find((c) => c.text.includes('COUNT(DISTINCT LOWER(t."from"))'))!
    // both sides constrained to verified wallets — external depositors never counted
    assert.include(q.text, 'LOWER(t."from") IN (SELECT addr FROM verified)')
    assert.include(q.text, 'LOWER(t."to")   IN (SELECT addr FROM verified)')
  })

  test('maw30 delegates to maw over the trailing 30d', async ({ assert }) => {
    installMocks({ maw: '5' })
    assert.equal(await maw30(1_700_000_000), 5)
  })

  test('isRetained = active in two consecutive 30d windows', async ({ assert }) => {
    installMocks({ active: true })
    assert.isTrue(await isRetained('0xabc', 1_700_000_000))

    installMocks({ active: false })
    assert.isFalse(await isRetained('0xabc', 1_700_000_000))
  })

  test('distinctVerifiedCounterparties maps the count', async ({ assert }) => {
    const calls = installMocks({ distinct: '3' })
    assert.equal(await distinctVerifiedCounterparties('0xABC'), 3)
    const q = calls.find((c) => c.text.includes('COUNT(DISTINCT LOWER(t."to"))'))!
    assert.equal(q.params[0], '0xabc')
  })
})
