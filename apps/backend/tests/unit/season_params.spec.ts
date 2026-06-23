/**
 * #season/params unit tests — loadParams() merge + fallback, mocked DB.
 */

import { test } from '@japa/runner'
import { loadParams, DEFAULT_PARAMS, __setDepsForTest, __resetDeps } from '#season/params'

test.group('season/params | loadParams', (group) => {
  group.teardown(() => __resetDeps())

  test('falls back to DEFAULT_PARAMS when the row is missing', async ({ assert }) => {
    __setDepsForTest({ query: (async () => ({ rows: [], rowCount: 0 })) as any })
    assert.deepEqual(await loadParams('s1'), DEFAULT_PARAMS)
  })

  test('falls back to DEFAULT_PARAMS when the query throws', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => {
        throw new Error('no table')
      }) as any,
    })
    assert.deepEqual(await loadParams('s1'), DEFAULT_PARAMS)
  })

  test('deep-merges a partial snapshot over defaults', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => ({
        rows: [{ params: { K: 5, base: { send: 99 }, tiers: { active: { minScore: 200 } } } }],
        rowCount: 1,
      })) as any,
    })
    const p = await loadParams('s1')
    assert.equal(p.K, 5) // overridden
    assert.equal(p.vCap, DEFAULT_PARAMS.vCap) // default preserved
    assert.equal(p.base.send, 99) // overridden
    assert.equal(p.base.receive, DEFAULT_PARAMS.base.receive) // sibling default preserved
    assert.equal(p.tiers.active.minScore, 200) // overridden
    assert.equal(p.tiers.active.minActiveWeeks, DEFAULT_PARAMS.tiers.active.minActiveWeeks)
    assert.equal(p.tiers.regular.minScore, DEFAULT_PARAMS.tiers.regular.minScore)
  })

  test('tolerates a JSON string params column', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => ({
        rows: [{ params: JSON.stringify({ K: 7 }) }],
        rowCount: 1,
      })) as any,
    })
    const p = await loadParams('s1')
    assert.equal(p.K, 7)
    assert.equal(p.vCap, DEFAULT_PARAMS.vCap)
  })
})
