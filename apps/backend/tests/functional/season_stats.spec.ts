/**
 * Season dashboard endpoint shape tests (Phase B) — GET /api/season/stats and
 * GET /api/season/transactions.
 *
 * Both are public + IP-throttled, so the throttle is reset in setup (earlier
 * spec files share the IP budget). DB-dependent assertions accept 503 when
 * Postgres is unavailable, mirroring resolve.spec.ts.
 *
 * The believable metrics derive live from onchain.transfer (no projector), so a
 * 200 with real shape is expected even in shadow mode; scoreDistribution /
 * topSenders come back null until season.score is populated.
 */

import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import '#types/container'

async function resetThrottle() {
  const rls = await app.container.make('rateLimitService')
  rls.resetIpThrottle()
}

test.group('Season | GET /api/season/stats', (group) => {
  group.setup(resetThrottle)
  group.each.setup(resetThrottle)

  test('returns 200 or 503 (DB-dependent)', async ({ client, assert }) => {
    const res = await client.get('/api/season/stats')
    assert.includeMembers([200, 503], [res.status()])
  })

  test('on 200, exposes the un-blended shape: transactedVolume and onboarded are SEPARATE fields', async ({
    client,
    assert,
  }) => {
    const res = await client.get('/api/season/stats')
    if (res.status() !== 200) {
      assert.equal(res.status(), 503)
      return
    }
    // Shape test: cast off the typed 200|503 response union.
    const body = res.body() as any

    // Hero + inflow are distinct keys; the hero is never the blended headline.
    assert.property(body, 'transactedVolume')
    assert.property(body, 'onboarded')
    assert.isString(body.transactedVolume)
    assert.isString(body.onboarded)
    // Total moved (gross deposits+sends) is a SEPARATE, clearly-labeled figure shown beside the
    // value-out hero — present and a string, but never resurrected under the old `totalVolume` key.
    assert.property(body, 'totalMoved')
    assert.isString(body.totalMoved)
    assert.notProperty(body, 'totalVolume')

    // Usage tiles, all numeric.
    for (const key of [
      'maw',
      'activeThisWeek',
      'retained',
      'retentionRate',
      'distinctCounterparties',
      'activatedCount',
      'activatedPct',
      'registeredUsers',
      'transferCount',
    ]) {
      assert.property(body, key)
      assert.isNumber(body[key])
    }

    assert.isArray(body.dailyVolumes)
    // Score-derived tiles: null in shadow mode, array once populated. Never undefined.
    assert.isTrue(body.scoreDistribution === null || Array.isArray(body.scoreDistribution))
    assert.isTrue(body.topSenders === null || Array.isArray(body.topSenders))
  })

  test('daily volume rows are value-out shaped (volume + count), not the blended series', async ({
    client,
    assert,
  }) => {
    const res = await client.get('/api/season/stats')
    if (res.status() !== 200) {
      assert.equal(res.status(), 503)
      return
    }
    const rows = (res.body() as any).dailyVolumes as {
      date: string
      volume: string
      count: number
    }[]
    for (const row of rows) {
      assert.property(row, 'date')
      assert.property(row, 'volume')
      assert.property(row, 'count')
      // The old field name (blended) must not survive.
      assert.notProperty(row, 'totalUsdcVolume')
    }
  })
})

test.group('Season | GET /api/season/transactions', (group) => {
  group.setup(resetThrottle)
  group.each.setup(resetThrottle)

  test('returns 200 or 503 (DB-dependent)', async ({ client, assert }) => {
    const res = await client.get('/api/season/transactions')
    assert.includeMembers([200, 503], [res.status()])
  })

  test('on 200, returns a masked feed with Arbiscan links and a count ticker — no phone fields', async ({
    client,
    assert,
  }) => {
    const res = await client.get('/api/season/transactions').qs({ limit: 5 })
    if (res.status() !== 200) {
      assert.equal(res.status(), 503)
      return
    }
    const body = res.body() as any

    assert.isArray(body.transactions)
    assert.isTrue(body.nextCursor === null || typeof body.nextCursor === 'string')
    assert.property(body, 'counts')
    assert.isNumber(body.counts.today)
    assert.isNumber(body.counts.thisWeek)

    for (const tx of body.transactions as Record<string, unknown>[]) {
      // Stable row identity (onchain.transfer PK) — distinct from txHash.
      assert.isString(tx.transferId)
      assert.isNumber(tx.usd)
      assert.isNumber(tx.timestamp)
      assert.isString(tx.from)
      assert.isString(tx.to)
      assert.isString(tx.txHash)
      // Arbiscan URL well-formed.
      assert.isString(tx.arbiscanUrl)
      assert.isTrue((tx.arbiscanUrl as string).startsWith('https://arbiscan.io/tx/'))
      // PHONES NEVER APPEAR.
      assert.notProperty(tx, 'phone')
      assert.notProperty(tx, 'phoneNumber')
      // On-chain addresses are masked (real 42-char addresses always shorten).
      const from = tx.from as string
      if (from.length > 0 && from.startsWith('0x') && from.length >= 42) {
        assert.include(from, '…')
      }
    }
  })

  test('cursor paginates forward without repeating a row (DB-dependent)', async ({
    client,
    assert,
  }) => {
    const page1 = await client.get('/api/season/transactions').qs({ limit: 1 })
    if (page1.status() !== 200) {
      assert.equal(page1.status(), 503)
      return
    }
    const b1 = page1.body() as any
    if (b1.transactions.length === 0 || !b1.nextCursor) {
      // Not enough data to page — nothing to assert beyond a valid first page.
      assert.isArray(b1.transactions)
      return
    }

    await resetThrottle()
    const page2 = await client
      .get('/api/season/transactions')
      .qs({ limit: 1, cursor: b1.nextCursor })
    assert.equal(page2.status(), 200)
    const b2 = page2.body() as any
    if (b2.transactions.length > 0) {
      // Strict total order on (timestamp DESC, id DESC) → page 2 never repeats
      // page 1. Compare the stable PK (transferId), not txHash (logs can share one).
      assert.notEqual(b2.transactions[0].transferId, b1.transactions[0].transferId)
    }
  })

  test('a malformed cursor is ignored, not fatal', async ({ client, assert }) => {
    const res = await client.get('/api/season/transactions').qs({ cursor: 'not-a-real-cursor' })
    assert.includeMembers([200, 503], [res.status()])
  })
})
