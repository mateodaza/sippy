/**
 * Season 1 projector + recompute integration tests (Phase A).
 *
 * Runs the real projector and recompute against a live Postgres. Skipped if a
 * local DB (or the season schema) is unavailable — same pattern as
 * onchain_webhook.spec.ts.
 *
 * Coverage:
 *   - A fixture transfer set projects into score_event and builds the expected
 *     season.score values (verified sends earn, flagged sends earn 0, receive
 *     alone never activates).
 *   - Projector idempotency: the same transfer processed twice = one event row.
 *   - Recompute determinism: recompute() twice with the same `now` = identical
 *     season.score.
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { recompute, rebuildAll } from '#season/recompute'
import {
  buildContext,
  projectAndRecompute,
  reprojectAfterReorg,
  type TransferRow,
} from '#season/projector'

const SEASON = 'test-s1-projector'
const NOW = 1_700_000_000

const A = '0xa11ce00000000000000000000000000000000001'
const B = '0xb0b0000000000000000000000000000000000002'
const C = '0xc0c0000000000000000000000000000000000003'
const EXT = '0xe2700000000000000000000000000000000000ff' // not registered → unverified

const PHONES = ['+15550010001', '+15550010002', '+15550010003']
const TX_IDS = ['season-test-tx1-0', 'season-test-tx2-0', 'season-test-tx3-0', 'season-test-tx4-0']

// The same four fixture transfers, in ingestion order, shaped as the projector
// receives them from the webhook (the onchain.transfer rows are already inserted
// by seedTransfer). Used to replay the live-hook path without re-scanning.
const BATCH: TransferRow[] = [
  { id: TX_IDS[0], from: A, to: B, amount: '25000000', timestamp: NOW - 3600, txHash: 'tx1' },
  { id: TX_IDS[1], from: A, to: C, amount: '50000000', timestamp: NOW - 3000, txHash: 'tx2' },
  { id: TX_IDS[2], from: B, to: A, amount: '25000000', timestamp: NOW - 2400, txHash: 'tx3' },
  { id: TX_IDS[3], from: A, to: EXT, amount: '100000000', timestamp: NOW - 1800, txHash: 'tx4' },
]

async function ensureSeasonSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM season.score_event LIMIT 0')
    return true
  } catch {
    return false
  }
}

async function cleanup() {
  await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])
  await query(`DELETE FROM onchain.transfer WHERE id = ANY($1::text[])`, [TX_IDS])
  await query(`DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])`, [PHONES])
}

async function seedWallet(phone: string, address: string) {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23')
     ON CONFLICT (phone_number) DO NOTHING`,
    [phone, `season-test-${address.slice(2, 8)}`, address, NOW * 1000]
  )
}

async function seedTransfer(
  id: string,
  from: string,
  to: string,
  amount: string,
  timestamp: number
) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, timestamp, id.split('-')[2] ?? '0x01']
  )
}

async function getScore(wallet: string) {
  const res = await query<{
    score: number
    tier: string
    active_weeks: number
    distinct_counterparties: number
    dormant: boolean
  }>(
    `SELECT score, tier, active_weeks, distinct_counterparties, dormant
       FROM season.score WHERE season_id = $1 AND wallet = $2`,
    [SEASON, wallet]
  )
  return res.rows[0]
}

async function buildScores() {
  await recompute(A, { seasonId: SEASON, now: NOW })
  await recompute(B, { seasonId: SEASON, now: NOW })
  await recompute(C, { seasonId: SEASON, now: NOW })
}

test.group('Season Integration | projector + recompute', (group) => {
  let ok = false

  group.setup(async () => {
    if (!(await isDbAvailable())) return
    if (!(await ensureSeasonSchema())) return
    ok = true
    await cleanup()
    await seedWallet(PHONES[0], A)
    await seedWallet(PHONES[1], B)
    await seedWallet(PHONES[2], C)
    // A→B $25, A→C $50, B→A $25 (all verified), A→EXT $100 (unverified counterparty)
    await seedTransfer(TX_IDS[0], A, B, '25000000', NOW - 3600)
    await seedTransfer(TX_IDS[1], A, C, '50000000', NOW - 3000)
    await seedTransfer(TX_IDS[2], B, A, '25000000', NOW - 2400)
    await seedTransfer(TX_IDS[3], A, EXT, '100000000', NOW - 1800)
  })

  group.each.setup((t) => {
    if (!ok) t.skip(true, 'No local DB or season schema not migrated')
  })

  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('builds expected season.score from a fixture transfer set', async ({ assert }) => {
    await buildScores()

    // A: send→B (10+10) + send→C (10+14) + first_send (50) + receive (3) = 97
    //    send→EXT is flagged (unverified) → 0
    const a = await getScore(A)
    assert.equal(a.score, 97)
    assert.equal(a.tier, 'activated')
    assert.equal(a.distinct_counterparties, 2) // B and C; EXT flagged out
    assert.equal(a.active_weeks, 1)
    assert.isFalse(a.dormant)

    // B: send→A (10+10) + first_send (50) + receive (3) = 73
    const b = await getScore(B)
    assert.equal(b.score, 73)
    assert.equal(b.tier, 'activated')
    assert.equal(b.distinct_counterparties, 1)

    // C: only received $50 → 3, never activated
    const c = await getScore(C)
    assert.equal(c.score, 3)
    assert.equal(c.tier, 'newcomer')
    assert.equal(c.distinct_counterparties, 0)
  })

  test('the flagged send to an unverified counterparty is recorded, not deleted', async ({
    assert,
  }) => {
    await buildScores()
    const res = await query<{ flagged: boolean; flag_reason: string }>(
      `SELECT flagged, flag_reason FROM season.score_event WHERE id = $1`,
      [`send:${TX_IDS[3]}`]
    )
    assert.lengthOf(res.rows, 1)
    assert.isTrue(res.rows[0].flagged)
    assert.equal(res.rows[0].flag_reason, 'counterparty_unverified')
  })

  test('projector idempotency: same transfer twice = one event row', async ({ assert }) => {
    await buildScores()
    await buildScores() // run again

    const send = await query(`SELECT 1 FROM season.score_event WHERE id = $1`, [
      `send:${TX_IDS[0]}`,
    ])
    assert.lengthOf(send.rows, 1)

    // first_send is one row per wallet/season
    const firstSend = await query(`SELECT 1 FROM season.score_event WHERE id = $1`, [
      `first_send:${SEASON}:${A}`,
    ])
    assert.lengthOf(firstSend.rows, 1)
  })

  test('recompute determinism: twice with the same now = identical score', async ({ assert }) => {
    await buildScores()
    const first = await getScore(A)
    await buildScores()
    const second = await getScore(A)
    assert.deepEqual(second, first)
  })

  test('live-hook path (incremental, skip re-projection) == full recompute', async ({ assert }) => {
    // Reference: a full recompute that re-projects every onchain.transfer row.
    await buildScores()
    const full = { a: await getScore(A), b: await getScore(B), c: await getScore(C) }

    // Replay as the live webhook hook does: wipe the derived score + the event
    // log, then feed the transfers in two sequential batches. Each batch projects
    // only its own rows and recomputes the affected wallets WITHOUT re-scanning
    // onchain.transfer (skipProjection) — so batch 2's recompute of A/B must still
    // see batch 1's events purely from score_event. Same path onTransfersIngested
    // runs, minus the env guard, with a fixed `now` for determinism.
    await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
    await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])

    const ctx = await buildContext(SEASON)
    const batch1 = await projectAndRecompute(BATCH.slice(0, 2), ctx, { now: NOW })
    const batch2 = await projectAndRecompute(BATCH.slice(2), ctx, { now: NOW })

    // Selectivity: C is only ever a receiver in batch 1, so batch 2 must not
    // touch it — yet its batch-1 score must still match the full recompute.
    assert.isTrue(batch1.has(C))
    assert.isFalse(batch2.has(C))

    const live = { a: await getScore(A), b: await getScore(B), c: await getScore(C) }
    assert.deepEqual(live.a, full.a)
    assert.deepEqual(live.b, full.b)
    assert.deepEqual(live.c, full.c)
    // Pin the documented fixture values so a regression in either path is caught.
    assert.equal(live.a.score, 97)
    assert.equal(live.b.score, 73)
    assert.equal(live.c.score, 3)
  })
})

// ── reproject flag-refresh + reorg cleanup (P1) ───────────────────────────────
// Self-contained: own season / phones / addresses / tx-ids, fresh per test.

test.group('Season Integration | flag refresh + reorg cleanup', (group) => {
  const S = 'test-s1-reproj'
  const X = '0xd1d1e00000000000000000000000000000000aa1' // tracked sender
  const Y = '0xd2d2e00000000000000000000000000000000bb2' // counterparty
  const PHR = ['+15550020001', '+15550020002']
  const TXR = ['reproj-test-tx1-0', 'reproj-test-tx2-0']
  let ok = false

  async function cleanupR() {
    await query('DELETE FROM season.score WHERE season_id = $1', [S])
    await query('DELETE FROM season.score_event WHERE season_id = $1', [S])
    await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [TXR])
    await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHR])
  }

  group.setup(async () => {
    if (!(await isDbAvailable())) return
    try {
      await query('SELECT 1 FROM season.score_event LIMIT 0')
    } catch {
      return
    }
    ok = true
  })

  group.each.setup(async (t) => {
    if (!ok) {
      t.skip(true, 'No local DB or season schema not migrated')
      return
    }
    await cleanupR() // fresh state per test
  })

  group.teardown(async () => {
    if (ok) await cleanupR()
  })

  test('reproject refreshes a stale flag: send un-flags + earns once the counterparty verifies', async ({
    assert,
  }) => {
    // Only X is a Sippy wallet yet → the send to Y is flagged, earns nothing.
    await seedWallet(PHR[0], X)
    await seedTransfer(TXR[0], X, Y, '25000000', NOW - 3600)
    await recompute(X, { seasonId: S, now: NOW })

    const flaggedRow = await query<{ flagged: boolean }>(
      'SELECT flagged FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `send:${TXR[0]}`]
    )
    assert.isTrue(flaggedRow.rows[0].flagged)
    const before = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.equal(before.rows[0].score, 0)

    // Y becomes verified; a reproject must REFRESH the frozen flag (the P1a fix),
    // not leave it stale — that is what keeps the score truly recomputable.
    await seedWallet(PHR[1], Y)
    await recompute(X, { seasonId: S, now: NOW })

    const refreshed = await query<{ flagged: boolean }>(
      'SELECT flagged FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `send:${TXR[0]}`]
    )
    assert.isFalse(refreshed.rows[0].flagged)
    const after = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.equal(after.rows[0].score, 70) // send (10+10) + first_send (50)
  })

  test('reorg cleanup: reprojectAfterReorg drops derived events + activation and de-scores', async ({
    assert,
  }) => {
    await seedWallet(PHR[0], X)
    await seedWallet(PHR[1], Y)
    await seedTransfer(TXR[1], X, Y, '25000000', NOW - 3600)
    await recompute(X, { seasonId: S, now: NOW })
    const scored = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.equal(scored.rows[0].score, 70)

    // Reorg: the transfer is removed from onchain.transfer, then the hook core runs.
    await query('DELETE FROM onchain.transfer WHERE id = $1', [TXR[1]])
    const ctx = await buildContext(S)
    const affected = await reprojectAfterReorg([TXR[1]], ctx, { now: NOW })
    assert.isTrue(affected.has(X))

    const sendRow = await query(
      'SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `send:${TXR[1]}`]
    )
    assert.lengthOf(sendRow.rows, 0) // derived send deleted
    const firstSendRow = await query(
      'SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `first_send:${S}:${X}`]
    )
    assert.lengthOf(firstSendRow.rows, 0) // activation dropped (only verified send reorged out)
    const deScored = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.equal(deScored.rows[0].score, 0)
  })

  test('full rebuild clears orphaned transfer-derived events before reprojecting', async ({
    assert,
  }) => {
    await seedWallet(PHR[0], X)
    await seedWallet(PHR[1], Y)
    await seedTransfer(TXR[0], X, Y, '25000000', NOW - 3600)
    await recompute(X, { seasonId: S, now: NOW })

    const scored = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.equal(scored.rows[0].score, 70)

    // Simulate an out-of-band transfer deletion where the live reorg hook did not
    // run. rebuildAll must not leave the orphaned send / first_send in score_event.
    await query('DELETE FROM onchain.transfer WHERE id = $1', [TXR[0]])
    await rebuildAll({ seasonId: S, now: NOW })

    const sendRow = await query(
      'SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `send:${TXR[0]}`]
    )
    assert.lengthOf(sendRow.rows, 0)
    const firstSendRow = await query(
      'SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2',
      [S, `first_send:${S}:${X}`]
    )
    assert.lengthOf(firstSendRow.rows, 0)
    const scoreRow = await query(
      'SELECT 1 FROM season.score WHERE season_id = $1 AND wallet = $2',
      [S, X]
    )
    assert.lengthOf(scoreRow.rows, 0)
  })
})
