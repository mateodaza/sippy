/**
 * Season 1 — C4 season job integration tests.
 *
 * The season job's guarded entry point (runSeasonPass) is a no-op when
 * SEASON1_ENABLED is unset (as it is in tests), so the pass internals are tested
 * through their component functions (the established #season pattern) plus an
 * integrated "simulated pass" that composes them and checks recompute idempotency.
 *
 * Coverage:
 *   - active_week: one idempotent +15 per wallet per qualifying week (no double-reward)
 *   - the singleton lock (acquire / held / release / stale-steal)
 *   - runSeasonPass is a NO-OP when SEASON1_ENABLED is unset
 *   - an integrated pass (sync → recompute → active_week → retained → expiry → sybil)
 *     reaches a coherent end state AND recompute reproduces identical scores
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { recompute } from '#season/recompute'
import { emitActiveWeeks, runSeasonPass, __testing } from '#season/job'
import { syncPendingReferrals, promoteRetainedReferrals } from '#season/referral'
import { runSybilScan } from '#season/sybil'

const SEASON = 'test-s1-job'
const NOW = 1_700_000_000
const DAY = 86_400
const WEEK = 7 * DAY

const W = '0xc4000000000000000000000000000000000000a1'
const V = '0xc4000000000000000000000000000000000000b2'
const PHONES = ['+15550060001', '+15550060002']
const ADDRS = [W, V]
const TXS: string[] = []
const tx = (s: string) => {
  const id = `s1-job-${s}`
  if (!TXS.includes(id)) TXS.push(id)
  return id
}

async function ensureSeasonSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM season.job_lock LIMIT 0')
    return true
  } catch {
    return false
  }
}

async function seedWallet(phone: string, address: string) {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23')
     ON CONFLICT (phone_number) DO NOTHING`,
    [phone, `s1-job-${address.slice(2, 8)}`, address, (NOW - 40 * DAY) * 1000]
  )
}

async function seedTransfer(id: string, from: string, to: string, amount: string, ts: number) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6) ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, ts, id]
  )
}

async function activeWeekCount(wallet: string): Promise<number> {
  const r = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM season.score_event
      WHERE season_id = $1 AND wallet = $2 AND verb = 'active_week'`,
    [SEASON, wallet]
  )
  return Number(r.rows[0]?.n ?? 0)
}

async function cleanup() {
  await query('DELETE FROM season.job_lock WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])
  await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [TXS])
  await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHONES])
}

test.group('Season C4 | season job', (group) => {
  let ok = false
  group.setup(async () => {
    if (!(await isDbAvailable())) return
    if (!(await ensureSeasonSchema())) return
    ok = true
  })
  group.each.setup(async (t) => {
    if (!ok) {
      t.skip(true, 'No local DB or season schema (Phase C) not migrated')
      return
    }
    await cleanup()
    for (let i = 0; i < ADDRS.length; i++) await seedWallet(PHONES[i], ADDRS[i])
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('active_week: one +15 per qualifying week, idempotent, no double-reward', async ({
    assert,
  }) => {
    // Two value-outs in week 0, one in week 1 → exactly two qualifying weeks.
    await seedTransfer(tx('w0a'), W, V, '5000000', NOW - 10 * DAY)
    await seedTransfer(tx('w0b'), W, V, '5000000', NOW - 10 * DAY + 3600) // same week
    await seedTransfer(tx('w1'), W, V, '5000000', NOW - 10 * DAY + WEEK) // next week
    await recompute(W, { seasonId: SEASON, now: NOW })
    const wallets = await emitActiveWeeks(SEASON, 1)
    assert.include(wallets, W)
    assert.equal(await activeWeekCount(W), 2) // two distinct weeks, not three sends

    // Idempotent: re-running reconciles to the same two weeks (add + delete-stale).
    await emitActiveWeeks(SEASON, 1)
    assert.equal(await activeWeekCount(W), 2)

    // active_week (points) is distinct from computeScore's activeWeeks (tier signal),
    // which is derived from the value-out events themselves.
    await recompute(W, { seasonId: SEASON, now: NOW })
    const s = await query<{ active_weeks: number }>(
      `SELECT active_weeks FROM season.score WHERE season_id = $1 AND wallet = $2`,
      [SEASON, W]
    )
    assert.equal(s.rows[0].active_weeks, 2) // counted from value-outs, separately
  })

  test('singleton lock: acquire / held / release / stale-steal', async ({ assert }) => {
    const t1 = await __testing.acquireLock(SEASON)
    assert.isNotNull(t1)
    assert.isNull(await __testing.acquireLock(SEASON)) // held by t1 → second caller skips

    await __testing.releaseLock(SEASON, t1!)
    const t2 = await __testing.acquireLock(SEASON)
    assert.isNotNull(t2) // released → re-acquirable

    // A stale claim (older than the timeout) is stealable.
    await query(
      `UPDATE season.job_lock SET locked_at = NOW() - ($2 || ' seconds')::interval
        WHERE season_id = $1`,
      [SEASON, String(__testing.LOCK_STALE_SECS + 100)]
    )
    const t3 = await __testing.acquireLock(SEASON)
    assert.isNotNull(t3) // stolen from the abandoned holder
    await __testing.releaseLock(SEASON, t3!)
  })

  test('runSeasonPass is a no-op when SEASON1_ENABLED is unset', async ({ assert }) => {
    // The flag is unset in the test env, so the pass must not run or write.
    const before = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM season.score_event WHERE season_id = $1`,
      [SEASON]
    )
    const summary = await runSeasonPass({ seasonId: SEASON, now: NOW })
    assert.isFalse(summary.ran)
    const after = await query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM season.score_event WHERE season_id = $1`,
      [SEASON]
    )
    assert.equal(after.rows[0].n, before.rows[0].n) // nothing written
    // It also must not claim the lock (it returns before touching it).
    const lock = await query(`SELECT 1 FROM season.job_lock WHERE season_id = $1`, [SEASON])
    assert.lengthOf(lock.rows, 0)
  })

  test('integrated pass composes the loop + recompute reproduces identical scores', async ({
    assert,
  }) => {
    // A wallet that on-ramps, sends (realizing), and is active across two weeks.
    const EXT = '0xc400000000000000000000000000000000000fff'
    await seedTransfer(tx('e2e-onramp'), EXT, W, '50000000', NOW - 9 * DAY) // on-ramp $50
    await seedTransfer(tx('e2e-send1'), W, V, '20000000', NOW - 8 * DAY) // value-out $20 (realizes 20)
    await seedTransfer(tx('e2e-send2'), W, V, '5000000', NOW - 8 * DAY + WEEK) // value-out $5 (realizes 5), next week

    // Simulate a pass (flag is off in tests, so compose the components directly).
    await syncPendingReferrals(SEASON)
    await recompute(W, { seasonId: SEASON, now: NOW }) // projects + realizes + reconciles derived
    await promoteRetainedReferrals(SEASON, NOW)
    await runSybilScan(SEASON)
    await emitActiveWeeks(SEASON, 1)
    await recompute(W, { seasonId: SEASON, now: NOW }) // fold

    // Both value-outs realize FIFO against the $50 on-ramp ($20 + $5), leaving $25.
    const pending = await query<{ pending_remaining: string }>(
      `SELECT pending_remaining FROM season.score_event
        WHERE season_id = $1 AND id = $2`,
      [SEASON, `onramp:${tx('e2e-onramp')}`]
    )
    assert.equal(Number(pending.rows[0].pending_remaining), 25)

    // Recompute idempotency over the Phase C event set: same `now` → identical score.
    const first = await query<{ score: number; tier: string; active_weeks: number }>(
      `SELECT score, tier, active_weeks FROM season.score WHERE season_id = $1 AND wallet = $2`,
      [SEASON, W]
    )
    await recompute(W, { seasonId: SEASON, now: NOW })
    await recompute(W, { seasonId: SEASON, now: NOW })
    const again = await query<{ score: number; tier: string; active_weeks: number }>(
      `SELECT score, tier, active_weeks FROM season.score WHERE season_id = $1 AND wallet = $2`,
      [SEASON, W]
    )
    assert.deepEqual(again.rows[0], first.rows[0]) // reproducible
  })
})
