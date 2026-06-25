/**
 * #season/standing unit tests — pure tier-progression + the DB reads via the
 * __setDepsForTest seam (no real DB).
 *
 * Audited behaviours covered here:
 *   - "to next tier" is computed from params.tiers, NOT hardcoded (re-run with
 *     modified params and the gap tracks it).
 *   - The Power step surfaces `verificationRequired` and NEVER a score-only path.
 *   - Empty state: an unscored wallet → getStanding returns null.
 *   - Leaderboard payload is anonymous: each row has ONLY {rank, displayId,
 *     score, tier} — no phone, no handle/name, no raw wallet.
 *   - displayId is stable per wallet/season and not the wallet itself.
 */

import { test } from '@japa/runner'
import {
  nextTierProgress,
  deriveTopActions,
  makeDisplayId,
  getStanding,
  getLeaderboard,
  resolveWalletForPhone,
  readScore,
  __setDepsForTest,
  __resetDeps,
} from '#season/standing'
import { DEFAULT_PARAMS, type SeasonParams } from '#season/params'

const P = DEFAULT_PARAMS
const stubParams = (async () => P) as unknown as (typeof import('#season/params'))['loadParams']

// ── nextTierProgress — from params, not hardcoded ────────────────────────────

test.group('season/standing | nextTierProgress', () => {
  test('newcomer → activated is a binary activation step (no score gate)', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'newcomer', score: 0, activeWeeks: 0, distinctCounterparties: 0 },
      P
    )
    assert.equal(n?.tier, 'activated')
    assert.equal(n?.scoreToGo, 0)
    assert.equal(n?.progressPct, 0)
    assert.isFalse(n?.verificationRequired)
  })

  test('activated → active gap is read from params.tiers.active', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'activated', score: 40, activeWeeks: 0, distinctCounterparties: 0 },
      P
    )
    assert.equal(n?.tier, 'active')
    // scoreToGo derives from params (150 default), not a literal.
    assert.equal(n?.scoreToGo, P.tiers.active.minScore - 40)
    assert.equal(n?.weeksToGo, P.tiers.active.minActiveWeeks)
  })

  test('active → regular gap reads score/weeks/counterparties from params', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'active', score: 300, activeWeeks: 2, distinctCounterparties: 1 },
      P
    )
    assert.equal(n?.tier, 'regular')
    assert.equal(n?.scoreToGo, P.tiers.regular.minScore - 300)
    assert.equal(n?.weeksToGo, P.tiers.regular.minActiveWeeks - 2)
    assert.equal(n?.counterpartiesToGo, P.tiers.regular.minCounterparties - 1)
    // progress within the [active floor, regular floor] band.
    const band = P.tiers.regular.minScore - P.tiers.active.minScore
    assert.equal(n?.progressPct, Math.round(((300 - P.tiers.active.minScore) / band) * 100))
  })

  test('gap tracks params (not hardcoded): bump active.minScore and scoreToGo follows', ({
    assert,
  }) => {
    const tweaked: SeasonParams = {
      ...P,
      tiers: { ...P.tiers, active: { minScore: 999, minActiveWeeks: 3 } },
    }
    const n = nextTierProgress(
      { tier: 'activated', score: 100, activeWeeks: 0, distinctCounterparties: 0 },
      tweaked
    )
    assert.equal(n?.scoreToGo, 999 - 100)
    assert.equal(n?.weeksToGo, 3)
  })

  test('regular → power surfaces verificationRequired and NO score-only path', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'regular', score: 1000, activeWeeks: 5, distinctCounterparties: 5 },
      P
    )
    assert.equal(n?.tier, 'power')
    assert.isTrue(n?.verificationRequired) // hasKyc defaults to false
    assert.equal(n?.scoreToGo, 0) // numeric progress deferred — can't grind to Power
    assert.equal(n?.progressPct, 0)
  })

  test('regular → power with KYC: still no score-only path, verification cleared', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'regular', score: 1000, activeWeeks: 5, distinctCounterparties: 5 },
      P,
      true
    )
    assert.equal(n?.tier, 'power')
    assert.isFalse(n?.verificationRequired)
    assert.equal(n?.scoreToGo, 0)
  })

  test('power is the top tier — no next step', ({ assert }) => {
    const n = nextTierProgress(
      { tier: 'power', score: 2000, activeWeeks: 9, distinctCounterparties: 9 },
      P
    )
    assert.isNull(n)
  })
})

// ── deriveTopActions ─────────────────────────────────────────────────────────

test.group('season/standing | deriveTopActions', () => {
  test('newcomer → just the first send', ({ assert }) => {
    const a = deriveTopActions(
      { tier: 'newcomer', activeWeeks: 0, distinctCounterparties: 0 },
      nextTierProgress({ tier: 'newcomer', score: 0, activeWeeks: 0, distinctCounterparties: 0 }, P)
    )
    assert.deepEqual(a, ['first_send'])
  })

  test('regular → power includes the verify action', ({ assert }) => {
    const next = nextTierProgress(
      { tier: 'regular', score: 1000, activeWeeks: 5, distinctCounterparties: 5 },
      P
    )
    const a = deriveTopActions({ tier: 'regular', activeWeeks: 5, distinctCounterparties: 5 }, next)
    assert.include(a, 'verify')
    assert.isTrue(a.length <= 3)
  })

  test('active with breadth + weeks gaps suggests new_counterparty and weekly', ({ assert }) => {
    const next = nextTierProgress(
      { tier: 'active', score: 200, activeWeeks: 1, distinctCounterparties: 0 },
      P
    )
    const a = deriveTopActions({ tier: 'active', activeWeeks: 1, distinctCounterparties: 0 }, next)
    assert.include(a, 'new_counterparty')
    assert.include(a, 'weekly')
    assert.isTrue(a.length <= 3)
  })

  test('top tier → gracious maintain actions, never empty', ({ assert }) => {
    const a = deriveTopActions({ tier: 'power', activeWeeks: 9, distinctCounterparties: 9 }, null)
    assert.isTrue(a.length > 0)
    assert.notInclude(a, 'first_send')
  })
})

// ── makeDisplayId ────────────────────────────────────────────────────────────

test.group('season/standing | makeDisplayId', () => {
  test('stable per wallet/season, 12 hex chars, not the wallet itself', ({ assert }) => {
    const w = '0xAbCdef0000000000000000000000000000000001'
    const a = makeDisplayId(w, 's1')
    const b = makeDisplayId(w, 's1')
    assert.equal(a, b) // stable
    assert.match(a, /^[0-9a-f]{12}$/) // hex, truncated
    assert.notInclude(a, w.slice(2, 8)) // not a slice of the wallet
  })

  test('case-insensitive on the wallet (lowercased before hashing)', ({ assert }) => {
    const lo = makeDisplayId('0xabc0000000000000000000000000000000000001', 's1')
    const hi = makeDisplayId('0xABC0000000000000000000000000000000000001', 's1')
    assert.equal(lo, hi)
  })

  test('differs by wallet and by season', ({ assert }) => {
    const w1 = makeDisplayId('0x0000000000000000000000000000000000000001', 's1')
    const w2 = makeDisplayId('0x0000000000000000000000000000000000000002', 's1')
    const s2 = makeDisplayId('0x0000000000000000000000000000000000000001', 's2')
    assert.notEqual(w1, w2)
    assert.notEqual(w1, s2)
  })
})

// ── DB reads via the DI seam ─────────────────────────────────────────────────

test.group('season/standing | reads (mocked DB)', (group) => {
  group.each.teardown(() => __resetDeps())

  test('readScore returns null for an unscored wallet (empty state)', async ({ assert }) => {
    __setDepsForTest({ query: (async () => ({ rows: [] })) as any })
    const row = await readScore('0xabc', 's1')
    assert.isNull(row)
  })

  test('getStanding returns null when there is no score row', async ({ assert }) => {
    __setDepsForTest({ query: (async () => ({ rows: [] })) as any, loadParams: stubParams })
    const s = await getStanding({ wallet: '0xabc' })
    assert.isNull(s)
  })

  test('getStanding maps a row to a standing WITHOUT exposing the raw wallet', async ({
    assert,
  }) => {
    __setDepsForTest({
      query: (async () => ({
        rows: [
          {
            wallet: '0x0000000000000000000000000000000000000abc',
            score: 320,
            tier: 'active',
            active_weeks: 2,
            distinct_counterparties: 1,
          },
        ],
      })) as any,
      loadParams: stubParams,
    })
    const s = await getStanding({ wallet: '0x0000000000000000000000000000000000000abc' })
    assert.equal(s?.score, 320)
    assert.equal(s?.tier, 'active')
    assert.equal(s?.nextTier?.tier, 'regular')
    assert.isString(s?.displayId)
    // The standing object must not leak the wallet/phone.
    assert.notProperty(s, 'wallet')
    assert.notProperty(s, 'phone')
    assert.notEqual(s?.displayId, '0x0000000000000000000000000000000000000abc')
  })

  test('getLeaderboard rows are anonymous — ONLY {rank, displayId, score, tier}', async ({
    assert,
  }) => {
    __setDepsForTest({
      query: (async () => ({
        rows: [
          { wallet: '0x0000000000000000000000000000000000000001', score: 900, tier: 'regular' },
          { wallet: '0x0000000000000000000000000000000000000002', score: 500, tier: 'active' },
        ],
      })) as any,
    })
    const rows = await getLeaderboard('s1', 50)
    assert.lengthOf(rows, 2)
    assert.deepEqual(rows[0].rank, 1)
    assert.deepEqual(rows[1].rank, 2)
    for (const r of rows) {
      assert.deepEqual(Object.keys(r).sort(), ['displayId', 'rank', 'score', 'tier'])
      // No PII / raw identifiers, ever.
      assert.notProperty(r, 'phone')
      assert.notProperty(r, 'wallet')
      assert.notProperty(r, 'handle')
      assert.notProperty(r, 'name')
      assert.match(r.displayId, /^[0-9a-f]{12}$/)
    }
  })

  test('resolveWalletForPhone: canonical hit', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => ({ rows: [{ wallet_address: '0xWALLET' }] })) as any,
    })
    const w = await resolveWalletForPhone('+573001234567')
    assert.equal(w, '0xWALLET')
  })

  test('resolveWalletForPhone: bare-digit fallback for pre-SH-003 rows', async ({ assert }) => {
    let call = 0
    __setDepsForTest({
      query: (async (_sql: string, params: unknown[]) => {
        call += 1
        // First call uses the canonical (+57…) form → miss; second uses bare digits → hit.
        if (call === 1) {
          assert.equal(params[0], '+573001234567')
          return { rows: [] }
        }
        assert.equal(params[0], '573001234567')
        return { rows: [{ wallet_address: '0xLEGACY' }] }
      }) as any,
    })
    const w = await resolveWalletForPhone('+573001234567')
    assert.equal(w, '0xLEGACY')
  })

  test('resolveWalletForPhone: null when no row at all', async ({ assert }) => {
    __setDepsForTest({ query: (async () => ({ rows: [] })) as any })
    const w = await resolveWalletForPhone('+573009999999')
    assert.isNull(w)
  })
})
