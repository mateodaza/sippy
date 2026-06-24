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
  transactedVolume,
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
function installMocks(values: {
  active?: boolean
  maw?: string
  distinct?: string
  volume?: string
}) {
  const calls: Call[] = []
  setParamsDeps({
    query: (async () => ({ rows: [{ params: DEFAULT_PARAMS }], rowCount: 1 })) as any,
  })
  setDefDeps({
    query: (async (text: string, params: any[] = []) => {
      calls.push({ text, params })
      if (text.includes('EXISTS'))
        return { rows: [{ active: values.active ?? false }], rowCount: 1 }
      if (text.includes('COUNT(DISTINCT wallet)'))
        // maw over value_out
        return { rows: [{ maw: values.maw ?? '0' }], rowCount: 1 }
      if (text.includes('COUNT(DISTINCT LOWER(t."to"))'))
        // distinctVerifiedCounterparties (strict)
        return { rows: [{ n: values.distinct ?? '0' }], rowCount: 1 }
      if (text.includes('SUM(usd_raw)'))
        // transactedVolume over value_out
        return { rows: [{ total: values.volume ?? '0' }], rowCount: 1 }
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

  test('maw (LOOSE dashboard value-out): reads the relay-aware value_out source', async ({
    assert,
  }) => {
    const calls = installMocks({ maw: '7' })
    assert.equal(await maw({ start: 0, end: 100 }), 7)
    const q = calls.find((c) => c.text.includes('COUNT(DISTINCT wallet)'))!
    // Counts distinct value_out wallets, not raw onchain.transfer senders.
    assert.include(q.text, 'FROM value_out')
    // value_out is built on the relay-collapsing logical_transfer source...
    assert.include(q.text, 'logical_transfer')
    assert.include(q.text, 'JOIN onchain.transfer s') // the relay pair self-join
    // ...and includes completed off-ramps (the user→spender pull the collapse can't pair).
    assert.include(q.text, 'offramp_orders')
    // SENDER must be verified; the verified-RECIPIENT gate is gone (that's the loosening).
    assert.include(q.text, 'lt.sender IN (SELECT addr FROM verified)')
    assert.notInclude(q.text, 'lt.recipient IN (SELECT addr FROM verified)')
    // Spender bound as $1, minRaw as $2, then the period window.
    assert.equal(q.params[1], '1000000') // $2 = $1 floor in raw USDC units
    assert.equal(q.params[2], 0) // $3 = period.start
    assert.equal(q.params[3], 100) // $4 = period.end
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

  test('transactedVolume (LOOSE) sums the relay-aware value_out source incl. off-ramps', async ({
    assert,
  }) => {
    const calls = installMocks({ volume: '10700000000' }) // $10,700 in raw USDC units
    assert.equal(await transactedVolume(), '10700000000')
    const q = calls.find((c) => c.text.includes('SUM(usd_raw)'))!
    assert.include(q.text, 'FROM value_out')
    // Relay collapse (logical_transfer self-join) + off-ramp source both present.
    assert.include(q.text, 'logical_transfer')
    assert.include(q.text, 'JOIN onchain.transfer s')
    assert.include(q.text, 'offramp_orders')
    // Verified sender, recipient not gated on verified, self/spender/operator excluded.
    assert.include(q.text, 'lt.sender IN (SELECT addr FROM verified)')
    assert.notInclude(q.text, 'lt.recipient IN (SELECT addr FROM verified)')
    assert.include(q.text, 'lt.recipient <> lt.sender')
  })

  // ── THE SPLIT GUARD ─────────────────────────────────────────────────────────
  // The whole point of the stats-polish pass: the dashboard aggregates loosened
  // (above), but the per-wallet SCORE-ENGINE functions must stay STRICT (verified
  // counterparty). If this regresses, the sybil floor for scoring/referrals is gone.
  test('SPLIT GUARD: isActive + distinctVerifiedCounterparties stay STRICT (verified recipient)', async ({
    assert,
  }) => {
    const calls = installMocks({ active: true, distinct: '3' })
    await isActive('0xabc', { start: 0, end: 1 })
    await distinctVerifiedCounterparties('0xabc')

    const activeQ = calls.find((c) => c.text.includes('EXISTS'))!
    const distinctQ = calls.find((c) => c.text.includes('COUNT(DISTINCT LOWER(t."to"))'))!

    // Both MUST still require a verified recipient on the RAW transfer table —
    // that is the strict floor (the score engine is NOT relay-collapsed).
    assert.include(activeQ.text, 'FROM onchain.transfer t')
    assert.include(distinctQ.text, 'FROM onchain.transfer t')
    assert.include(activeQ.text, 'LOWER(t."to") IN (SELECT addr FROM verified)')
    assert.include(distinctQ.text, 'LOWER(t."to") IN (SELECT addr FROM verified)')
    // And neither reaches into the loose relay-aware source — they don't loosen.
    for (const q of [activeQ, distinctQ]) {
      assert.notInclude(q.text, 'logical_transfer')
      assert.notInclude(q.text, 'value_out')
      assert.notInclude(q.text, 'operator_addrs')
      assert.notInclude(q.text, 'offramp_orders')
    }
  })
})
