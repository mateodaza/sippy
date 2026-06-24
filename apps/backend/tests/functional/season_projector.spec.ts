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
import { getSpenderAddress } from '#season/definitions'

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

    // A: send→B (10+10) + send→C (10+14) + first_send (50) + receive (3)
    //    + new_counterparty→B (8) + new_counterparty→C (8) = 113  (Phase C verb)
    //    send→EXT is flagged (unverified) → 0, and no new_counterparty (cp unverified)
    const a = await getScore(A)
    assert.equal(a.score, 113)
    assert.equal(a.tier, 'activated')
    assert.equal(a.distinct_counterparties, 2) // B and C; EXT flagged out
    assert.equal(a.active_weeks, 1)
    assert.isFalse(a.dormant)

    // B: send→A (10+10) + first_send (50) + receive (3) + new_counterparty→A (8) = 81
    const b = await getScore(B)
    assert.equal(b.score, 81)
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
    assert.equal(live.a.score, 113) // incl. 2× new_counterparty (Phase C)
    assert.equal(live.b.score, 81) // incl. 1× new_counterparty (Phase C)
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
    assert.equal(after.rows[0].score, 78) // send (10+10) + first_send (50) + new_counterparty (8)
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
    assert.equal(scored.rows[0].score, 78) // send (10+10) + first_send (50) + new_counterparty (8)

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
    assert.equal(scored.rows[0].score, 78) // send (10+10) + first_send (50) + new_counterparty (8)

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

// ── spender relay collapse (the Season-1 go-live blocker) ─────────────────────
// A Sippy embedded send is ONE tx of two USDC legs: user→spender (pull) then
// spender→recipient (forward), same tx_hash + amount. The projector must collapse
// the pair so the user's REAL send scores / activates / unlocks — instead of a
// 0-earning send to the unverified spender. Self-contained (own season/phones/ids).

test.group('Season Integration | spender relay collapse', (group) => {
  const S = 'test-s1-relay'
  const SP = getSpenderAddress() // spender (SIPPY_SPENDER_ADDRESS, .env.test)
  // Verified Sippy wallets.
  const U1 = '0xf1d1000000000000000000000000000000000001' // relay sender
  const U2 = '0xf1d1000000000000000000000000000000000002' // relay recipient
  const U3 = '0xf1d1000000000000000000000000000000000003' // direct sender (control)
  const U4 = '0xf1d1000000000000000000000000000000000004' // direct recipient (control)
  const EXTW = '0xf1d100000000000000000000000000000000000f' // external, NON-Sippy
  const PHR = ['+15550030001', '+15550030002', '+15550030003', '+15550030004']
  // Every onchain.transfer id this group can seed (cleaned each test).
  const TX = [
    'rly1-0',
    'rly1-1',
    'dir1-0',
    'ext1-0',
    'ext1-1',
    'off1-0',
    'off1-1',
    'bat1-0',
    'bat1-1',
    'bat1-2',
    'bat1-3',
    'in1-0',
    'rsend-0',
    'rsend-1',
  ]
  let ok = false

  async function cleanupRly() {
    await query('DELETE FROM season.score WHERE season_id = $1', [S])
    await query('DELETE FROM season.score_event WHERE season_id = $1', [S])
    await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [TX])
    await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHR])
  }

  /** Seed one ERC-20 Transfer leg with an EXPLICIT shared tx_hash (relay legs pair on it). */
  async function seedLeg(id: string, from: string, to: string, amount: string, txHash: string) {
    await query(
      `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
       VALUES ($1, $2, $3, $4::numeric, $5, 1, $6) ON CONFLICT (id) DO NOTHING`,
      [id, from, to, amount, NOW - 3600, txHash]
    )
  }

  async function seedW(phone: string, address: string) {
    await query(
      `INSERT INTO phone_registry
         (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
       VALUES ($1, $2, $3, $4, $4, '2026-06-23') ON CONFLICT (phone_number) DO NOTHING`,
      [phone, `rly-${address.slice(2, 8)}`, address, NOW * 1000]
    )
  }

  async function scoreRow(wallet: string) {
    const r = await query<{
      score: number
      tier: string
      distinct_counterparties: number
    }>(
      `SELECT score, tier, distinct_counterparties FROM season.score
        WHERE season_id = $1 AND wallet = $2`,
      [S, wallet]
    )
    return r.rows[0]
  }

  async function eventRow(id: string) {
    const r = await query<{
      wallet: string
      counterparty: string
      flagged: boolean
      flag_reason: string
    }>(
      `SELECT wallet, counterparty, flagged, flag_reason FROM season.score_event
        WHERE season_id = $1 AND id = $2`,
      [S, id]
    )
    return r.rows[0]
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
    if (!ok || !SP) {
      t.skip(true, !SP ? 'No spender configured (.env.test)' : 'No local DB or season schema')
      return
    }
    await cleanupRly()
    await seedW(PHR[0], U1)
    await seedW(PHR[1], U2)
    await seedW(PHR[2], U3)
    await seedW(PHR[3], U4)
  })
  group.teardown(async () => {
    if (ok) await cleanupRly()
  })

  test('a relayed send scores, activates, and earns IDENTICALLY to a direct send', async ({
    assert,
  }) => {
    // Relayed: U1→spender→U2 $25 (two legs, one tx). Direct control: U3→U4 $25.
    await seedLeg('rly1-0', U1, SP, '25000000', 'rly1')
    await seedLeg('rly1-1', SP, U2, '25000000', 'rly1')
    await seedLeg('dir1-0', U3, U4, '25000000', 'dir1')
    await recompute(U1, { seasonId: S, now: NOW })
    await recompute(U2, { seasonId: S, now: NOW })
    await recompute(U3, { seasonId: S, now: NOW })
    await recompute(U4, { seasonId: S, now: NOW })

    // The relayed send is collapsed: its send row points at the REAL recipient (U2),
    // unflagged, and earns exactly what the direct $25 send earns:
    //   send (10+10) + first_send (50) + new_counterparty (8) = 78.
    const sendEv = await eventRow('send:rly1-0')
    assert.equal(sendEv.wallet, U1)
    assert.equal(sendEv.counterparty, U2) // NOT the spender
    assert.isFalse(sendEv.flagged)

    const u1 = await scoreRow(U1)
    const u3 = await scoreRow(U3)
    assert.equal(u1.score, 78)
    assert.equal(u1.tier, 'activated')
    assert.equal(u1.distinct_counterparties, 1)
    assert.deepEqual(
      { s: u1.score, t: u1.tier, d: u1.distinct_counterparties },
      {
        s: u3.score,
        t: u3.tier,
        d: u3.distinct_counterparties,
      }
    ) // relay transparency: identical to the direct control

    // first_send (activation) exists for the relayed sender.
    const fs = await query(`SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2`, [
      S,
      `first_send:${S}:${U1}`,
    ])
    assert.lengthOf(fs.rows, 1)

    // The recipient's receive is attributed to the REAL sender (U1), unflagged, and
    // scores the same 3 as a direct receive.
    const recvEv = await eventRow('receive:rly1-1')
    assert.equal(recvEv.wallet, U2)
    assert.equal(recvEv.counterparty, U1) // NOT the spender
    assert.isFalse(recvEv.flagged)
    const u2 = await scoreRow(U2)
    const u4 = await scoreRow(U4)
    assert.equal(u2.score, 3)
    assert.equal(u2.score, u4.score)
  })

  test('a relayed send to an EXTERNAL recipient is flagged + earns 0 (collapse keeps the strict floor)', async ({
    assert,
  }) => {
    // U1→spender→EXTW $25: EXTW is non-Sippy, so even collapsed the send stays flagged.
    await seedLeg('ext1-0', U1, SP, '25000000', 'ext1')
    await seedLeg('ext1-1', SP, EXTW, '25000000', 'ext1')
    await recompute(U1, { seasonId: S, now: NOW })

    const sendEv = await eventRow('send:ext1-0')
    assert.equal(sendEv.counterparty, EXTW) // resolved to the REAL recipient (not the spender)
    assert.isTrue(sendEv.flagged)
    assert.equal(sendEv.flag_reason, 'counterparty_unverified')
    const u1 = await scoreRow(U1)
    assert.equal(u1.score, 0) // flagged send earns nothing, no activation
    assert.equal(u1.tier, 'newcomer')
  })

  test('an off-ramp pull (user→spender→spender) is NOT collapsed into a send; no double-count', async ({
    assert,
  }) => {
    // The off-ramp on-chain shape: U1→spender (pull) then spender→spender (forward to
    // self). The collapse must NOT pair these into a user→recipient send — the
    // value-out is realised from offramp_orders, not the projector.
    await seedLeg('off1-0', U1, SP, '40000000', 'off1')
    await seedLeg('off1-1', SP, SP, '40000000', 'off1')
    await recompute(U1, { seasonId: S, now: NOW })

    const sendEv = await eventRow('send:off1-0')
    assert.equal(sendEv.counterparty, SP) // stays a send to the spender (uncollapsed)
    assert.isTrue(sendEv.flagged)
    // The spender→spender leg produces no scoreable event for anyone.
    assert.isUndefined(await eventRow('send:off1-1'))
    assert.isUndefined(await eventRow('receive:off1-1'))
    const u1 = await scoreRow(U1)
    assert.equal(u1.score, 0) // not activated by the off-ramp pull
  })

  test('a batch tx with TWO equal-amount relay pairs pairs each leg 1:1 (no cross-join)', async ({
    assert,
  }) => {
    // One tx, four legs, all $10: U1→spender→U2 and U3→spender→U4. Pairing is by
    // log-index adjacency, so U1 reaches U2 (not U4) and U3 reaches U4 (not U2).
    await seedLeg('bat1-0', U1, SP, '10000000', 'bat1') // pull  (log 0)
    await seedLeg('bat1-1', SP, U2, '10000000', 'bat1') // forward(log 1)
    await seedLeg('bat1-2', U3, SP, '10000000', 'bat1') // pull  (log 2)
    await seedLeg('bat1-3', SP, U4, '10000000', 'bat1') // forward(log 3)
    await recompute(U1, { seasonId: S, now: NOW })
    await recompute(U2, { seasonId: S, now: NOW })
    await recompute(U3, { seasonId: S, now: NOW })
    await recompute(U4, { seasonId: S, now: NOW })

    const s0 = await eventRow('send:bat1-0')
    const s2 = await eventRow('send:bat1-2')
    const r1 = await eventRow('receive:bat1-1')
    const r3 = await eventRow('receive:bat1-3')
    assert.equal(s0.counterparty, U2) // U1 → U2, not U4
    assert.equal(s2.counterparty, U4) // U3 → U4, not U2
    assert.equal(r1.counterparty, U1) // U2 ← U1
    assert.equal(r3.counterparty, U3) // U4 ← U3
    // No cross-count: each sender reaches exactly ONE distinct counterparty.
    const u1 = await scoreRow(U1)
    const u3 = await scoreRow(U3)
    assert.equal(u1.distinct_counterparties, 1)
    assert.equal(u3.distinct_counterparties, 1)
  })

  test('reorg of a relayed send drops BOTH derived legs and de-scores both wallets', async ({
    assert,
  }) => {
    await seedLeg('rsend-0', U1, SP, '25000000', 'rsend')
    await seedLeg('rsend-1', SP, U2, '25000000', 'rsend')
    await recompute(U1, { seasonId: S, now: NOW })
    await recompute(U2, { seasonId: S, now: NOW })
    const u1Before = await scoreRow(U1)
    const u2Before = await scoreRow(U2)
    assert.equal(u1Before.score, 78)
    assert.equal(u2Before.score, 3)

    // The whole tx reorgs out (both logs removed), then the hook core runs.
    await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [['rsend-0', 'rsend-1']])
    const ctx = await buildContext(S)
    const affected = await reprojectAfterReorg(['rsend-0', 'rsend-1'], ctx, { now: NOW })
    assert.includeMembers([...affected], [U1, U2])

    assert.isUndefined(await eventRow('send:rsend-0')) // derived send gone
    assert.isUndefined(await eventRow('receive:rsend-1')) // derived receive gone
    const fs = await query(`SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2`, [
      S,
      `first_send:${S}:${U1}`,
    ])
    assert.lengthOf(fs.rows, 0) // activation dropped
    const u1After = await scoreRow(U1)
    const u2After = await scoreRow(U2)
    assert.equal(u1After.score, 0)
    assert.equal(u2After.score, 0)
  })

  test('a relayed send REALISES a pending on-ramp (seen as a value-out, counterparty ≠ spender)', async ({
    assert,
  }) => {
    // External inflow EXT→U1 $20 → a pending on-ramp. Then U1 spends it out via a
    // relayed send U1→spender→U2 $20. The collapse makes the send a realizable
    // value-out (counterparty U2, not the spender), so the pending realises.
    await seedLeg('in1-0', EXTW, U1, '20000000', 'in1') // direct external inflow
    await seedLeg('rsend-0', U1, SP, '20000000', 'rsend') // relayed spend-out (pull)
    await seedLeg('rsend-1', SP, U2, '20000000', 'rsend') // relayed spend-out (forward)
    await recompute(U1, { seasonId: S, now: NOW })

    // The pending on-ramp exists, and an onramp_used realization was derived from the
    // relayed send (proving rebuildOnrampRealization saw it as a value-out).
    const pending = await query(
      `SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2 AND verb = 'onramp'`,
      [S, 'onramp:in1-0']
    )
    assert.lengthOf(pending.rows, 1)
    const used = await query<{ usd: string }>(
      `SELECT usd FROM season.score_event
        WHERE season_id = $1 AND wallet = $2 AND verb = 'onramp_used'`,
      [S, U1]
    )
    assert.lengthOf(used.rows, 1) // the relayed send realised the pending
    assert.equal(Number(used.rows[0].usd), 20)
  })

  test('the live-hook path (projectAndRecompute) collapses a relay batch the same way', async ({
    assert,
  }) => {
    // Both legs arrive in ONE webhook batch (same tx) — the real ingestion shape.
    await seedLeg('rly1-0', U1, SP, '25000000', 'rly1')
    await seedLeg('rly1-1', SP, U2, '25000000', 'rly1')
    const ctx = await buildContext(S)
    const batch: TransferRow[] = [
      { id: 'rly1-0', from: U1, to: SP, amount: '25000000', timestamp: NOW - 3600, txHash: 'rly1' },
      { id: 'rly1-1', from: SP, to: U2, amount: '25000000', timestamp: NOW - 3600, txHash: 'rly1' },
    ]
    const affected = await projectAndRecompute(batch, ctx, { now: NOW })
    assert.includeMembers([...affected], [U1, U2]) // both sides recomputed from one batch

    const sendEv = await eventRow('send:rly1-0')
    assert.equal(sendEv.counterparty, U2)
    assert.isFalse(sendEv.flagged)
    const u1 = await scoreRow(U1)
    const u2 = await scoreRow(U2)
    assert.equal(u1.score, 78)
    assert.equal(u2.score, 3)
  })
})
