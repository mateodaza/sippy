/**
 * Season score API functional tests (Phase D) — route wiring + auth + payload shape.
 *
 *   GET /api/season/score        — JWT-authed: unauthenticated/invalid token → 401.
 *   GET /api/season/leaderboard  — public, IP-throttled, degradation-safe: a 200
 *                                  with a (possibly empty) anonymous board, and NO
 *                                  phone/handle/raw-wallet key on any row.
 *
 * These complement the controller unit tests (which mock the DB to assert the
 * auth binding + full payload). Here we exercise the real routes/middleware. The
 * leaderboard degrades to an empty board when the season is off or the DB is
 * unavailable, so it returns 200 in any environment.
 */

import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'

async function resetThrottle() {
  const rls = await app.container.make('rateLimitService')
  rls.resetIpThrottle()
}

test.group('Season | GET /api/season/score (auth-gated)', (group) => {
  group.each.setup(resetThrottle)

  test('missing auth token → 401 (cannot read any score unauthenticated)', async ({ client }) => {
    const res = await client.get('/api/season/score')
    res.assertStatus(401)
  })

  test('a wallet/phone query param does NOT bypass auth → still 401', async ({ client }) => {
    const res = await client
      .get('/api/season/score')
      .qs({ wallet: '0xattacker', phone: '+573009999999' })
    res.assertStatus(401)
  })

  test('invalid bearer token → 401', async ({ client }) => {
    const res = await client.get('/api/season/score').header('Authorization', 'Bearer nope')
    res.assertStatus(401)
  })
})

test.group('Season | GET /api/season/leaderboard (public, anonymous)', (group) => {
  group.setup(resetThrottle)
  group.each.setup(resetThrottle)

  test('returns 200 with a { seasonId, leaderboard[] } shape (degradation-safe)', async ({
    client,
    assert,
  }) => {
    const res = await client.get('/api/season/leaderboard')
    res.assertStatus(200)
    const body = res.body() as unknown as { seasonId: string; leaderboard: unknown[] }
    assert.property(body, 'seasonId')
    assert.isArray(body.leaderboard)
  })

  test('no row ever carries a phone / handle / raw wallet key', async ({ client, assert }) => {
    const res = await client.get('/api/season/leaderboard').qs({ limit: 50 })
    res.assertStatus(200)
    const body = res.body() as unknown as { leaderboard: Record<string, unknown>[] }
    for (const row of body.leaderboard) {
      assert.notProperty(row, 'phone')
      assert.notProperty(row, 'handle')
      assert.notProperty(row, 'name')
      assert.notProperty(row, 'wallet')
      // The only identity is the anonymous displayId.
      assert.property(row, 'displayId')
    }
  })

  test('limit is clamped (no crash on absurd input)', async ({ client }) => {
    const res = await client.get('/api/season/leaderboard').qs({ limit: 100000 })
    res.assertStatus(200)
  })
})
