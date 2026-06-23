/**
 * #season/score unit tests — pure, no DB.
 *
 * Covers volumeBonus, recencyWeight, base, the §1.3 caps (per-pair decay,
 * per-day cap), recency decay, and the §1.5 tier thresholds, plus end-to-end
 * computeScore folds.
 */

import { test } from '@japa/runner'
import {
  base,
  volumeBonus,
  recencyWeight,
  computeTier,
  computeScore,
  type ScoreEvent,
} from '#season/score'
import { DEFAULT_PARAMS, type Verb } from '#season/params'

const P = DEFAULT_PARAMS
const DAY = 86_400
const NOW = 1_700_000_000

function ev(partial: Partial<ScoreEvent> & { verb: Verb; timestamp: number }): ScoreEvent {
  return {
    usd: null,
    counterparty: null,
    flagged: false,
    ...partial,
  }
}

// ── volumeBonus (sub-linear, capped) ──────────────────────────────────────────

test.group('season/score | volumeBonus', () => {
  test('round(min(V_CAP, K*sqrt(usd))) per spec examples', ({ assert }) => {
    assert.equal(volumeBonus(1, P), 2) // 2*sqrt(1)=2
    assert.equal(volumeBonus(25, P), 10) // 2*5=10
    assert.equal(volumeBonus(100, P), 20) // 2*10=20 (at cap)
    assert.equal(volumeBonus(10_000, P), 20) // capped — a whale earns the same as $100
    assert.equal(volumeBonus(0, P), 0)
    assert.equal(volumeBonus(null, P), 0)
  })
})

// ── recencyWeight (rolling window) ────────────────────────────────────────────

test.group('season/score | recencyWeight', () => {
  test('1.0 ≤30d, 0.5 ≤90d, 0 >90d', ({ assert }) => {
    assert.equal(recencyWeight(0, P), 1.0)
    assert.equal(recencyWeight(30, P), 1.0)
    assert.equal(recencyWeight(31, P), 0.5)
    assert.equal(recencyWeight(90, P), 0.5)
    assert.equal(recencyWeight(91, P), 0.0)
  })
})

// ── base ──────────────────────────────────────────────────────────────────────

test.group('season/score | base', () => {
  test('verb base points from params', ({ assert }) => {
    assert.equal(base('send', P), 10)
    assert.equal(base('receive', P), 3)
    assert.equal(base('first_send', P), 50)
    assert.equal(base('offramp', P), 20)
  })
})

// ── computeScore folds ─────────────────────────────────────────────────────────

test.group('season/score | computeScore', () => {
  test('single verified send + first_send → activation', ({ assert }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 25, counterparty: '0xb', timestamp: NOW - 3600 }),
      ev({ verb: 'first_send', usd: 25, counterparty: '0xb', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 70) // (10+10) + 50
    assert.equal(r.tier, 'activated')
    assert.equal(r.activeWeeks, 1)
    assert.equal(r.distinctCounterparties, 1)
    assert.isFalse(r.dormant)
  })

  test('flagged events earn nothing and confer no status', ({ assert }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 100, counterparty: '0xext', timestamp: NOW - 3600, flagged: true }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 0)
    assert.equal(r.activeWeeks, 0)
    assert.equal(r.distinctCounterparties, 0)
    assert.equal(r.tier, 'newcomer')
  })

  test('receive alone does not make a wallet active', ({ assert }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'receive', usd: 50, counterparty: '0xa', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 3)
    assert.equal(r.activeWeeks, 0)
    assert.equal(r.tier, 'newcomer') // received, never sent
  })

  test('sub-$1 verified send earns nothing but still confers breadth (real-usage floor)', ({
    assert,
  }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 0.5, counterparty: '0xb', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 0) // below minActiveUsd → no base, no volume bonus
    assert.equal(r.activeWeeks, 0) // not a qualifying value-out
    assert.isNull(r.lastActive) // ...so it never advances lastActive
    assert.equal(r.distinctCounterparties, 1) // but still counts toward reach
    assert.equal(r.tier, 'newcomer') // a sub-$1 send alone is not activation
  })

  test('a send exactly at the $1 floor earns and counts as active', ({ assert }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 1, counterparty: '0xb', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 12) // base 10 + volumeBonus($1)=2 — the floor is inclusive
    assert.equal(r.activeWeeks, 1)
    assert.equal(r.distinctCounterparties, 1)
  })

  test('sub-$1 first send earns nothing and does NOT activate (strict floor)', ({ assert }) => {
    // first_send now carries the same $1 real-usage floor as a recurring send.
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 0.25, counterparty: '0xb', timestamp: NOW - 3600 }),
      ev({ verb: 'first_send', usd: 0.25, counterparty: '0xb', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 0) // both sub-$1 → no points
    assert.equal(r.tier, 'newcomer') // a sub-$1 first send is not activation
    assert.equal(r.activeWeeks, 0)
    assert.equal(r.distinctCounterparties, 1) // the send still records breadth
  })

  test('first real send (≥$1) activates + earns 50, even after a sub-$1 test send', ({
    assert,
  }) => {
    // The projector emits first_send only for the ≥$1 send, so its usd is ≥ floor.
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 0.25, counterparty: '0xb', timestamp: NOW - 7200 }), // test send → 0
      ev({ verb: 'send', usd: 5, counterparty: '0xb', timestamp: NOW - 3600 }), // real send
      ev({ verb: 'first_send', usd: 5, counterparty: '0xb', timestamp: NOW - 3600 }),
    ]
    const r = computeScore(events, P, { now: NOW })
    // send $0.25 → 0; send $5 → 10 + volumeBonus(5)=4 = 14; first_send → 50  ⇒ 64
    assert.equal(r.score, 64)
    assert.equal(r.tier, 'activated')
    assert.equal(r.activeWeeks, 1) // the $5 send is a qualifying value-out
    assert.equal(r.distinctCounterparties, 1)
  })

  test('per-pair decay: base-only after 3, zero after 8', ({ assert }) => {
    // 10 sends of $25 to the SAME counterparty, one per day (recency 1.0, no day-cap clash)
    const events: ScoreEvent[] = []
    for (let i = 0; i < 10; i++) {
      events.push(
        ev({ verb: 'send', usd: 25, counterparty: '0xb', timestamp: NOW - (10 - i) * DAY })
      )
    }
    const r = computeScore(events, P, { now: NOW })
    // n1-3: 20 each = 60 · n4-8: base 10 each = 50 · n9-10: 0  →  110
    assert.equal(r.score, 110)
    assert.equal(r.distinctCounterparties, 1)
  })

  test('per-day cap clamps burst farming at 150', ({ assert }) => {
    // 10 sends of $25 (20 pts each) to DISTINCT counterparties, same day → 200 raw, capped 150
    const events: ScoreEvent[] = []
    for (let i = 0; i < 10; i++) {
      events.push(ev({ verb: 'send', usd: 25, counterparty: `0xc${i}`, timestamp: NOW - 3600 }))
    }
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 150)
    assert.equal(r.distinctCounterparties, 10)
  })

  test('recency decay: 0.5 weight at 50d, 0 past 90d; dormant after 21d', ({ assert }) => {
    const events: ScoreEvent[] = [
      ev({ verb: 'send', usd: 100, counterparty: '0xb', timestamp: NOW - 50 * DAY }), // 30 * 0.5 = 15
      ev({ verb: 'send', usd: 100, counterparty: '0xc', timestamp: NOW - 100 * DAY }), // weight 0
    ]
    const r = computeScore(events, P, { now: NOW })
    assert.equal(r.score, 15)
    assert.equal(r.distinctCounterparties, 2) // both counted toward reach
    assert.isTrue(r.dormant) // last value-out 50d ago > 21d
  })

  test('empty log → newcomer, zeroed', ({ assert }) => {
    const r = computeScore([], P, { now: NOW })
    assert.deepEqual(r, {
      score: 0,
      tier: 'newcomer',
      activeWeeks: 0,
      distinctCounterparties: 0,
      lastActive: null,
      dormant: false,
    })
  })
})

// ── computeTier (time + breadth, not just score) ───────────────────────────────

test.group('season/score | computeTier', () => {
  test('Active needs ≥150 + ≥1 week', ({ assert }) => {
    assert.equal(
      computeTier(
        {
          score: 150,
          activeWeeks: 1,
          distinctCounterparties: 1,
          hasActivation: true,
          hasKyc: false,
        },
        P
      ),
      'active'
    )
    assert.equal(
      computeTier(
        {
          score: 149,
          activeWeeks: 5,
          distinctCounterparties: 5,
          hasActivation: true,
          hasKyc: false,
        },
        P
      ),
      'activated' // score gate not met
    )
  })

  test('Regular needs ≥600 + ≥4 weeks + ≥3 counterparties', ({ assert }) => {
    assert.equal(
      computeTier(
        {
          score: 600,
          activeWeeks: 4,
          distinctCounterparties: 3,
          hasActivation: true,
          hasKyc: false,
        },
        P
      ),
      'regular'
    )
    assert.equal(
      computeTier(
        {
          score: 600,
          activeWeeks: 4,
          distinctCounterparties: 2,
          hasActivation: true,
          hasKyc: false,
        },
        P
      ),
      'active' // breadth gate not met → falls back to active
    )
  })

  test('Power needs ≥1500 + ≥8 weeks + KYC/personhood', ({ assert }) => {
    const pwr = { score: 1500, activeWeeks: 8, distinctCounterparties: 3, hasActivation: true }
    assert.equal(computeTier({ ...pwr, hasKyc: true }, P), 'power')
    assert.equal(computeTier({ ...pwr, hasKyc: false }, P), 'regular') // no personhood → not Power
  })

  test('activation vs newcomer', ({ assert }) => {
    assert.equal(
      computeTier(
        {
          score: 0,
          activeWeeks: 0,
          distinctCounterparties: 0,
          hasActivation: false,
          hasKyc: false,
        },
        P
      ),
      'newcomer'
    )
    assert.equal(
      computeTier(
        {
          score: 50,
          activeWeeks: 0,
          distinctCounterparties: 1,
          hasActivation: true,
          hasKyc: false,
        },
        P
      ),
      'activated'
    )
  })
})
