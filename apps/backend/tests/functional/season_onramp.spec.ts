/**
 * Season 1 — C3 on-ramp/off-ramp + eligible-balance integration tests.
 *
 * Runs the real projector / #season/onramp / #season/emissions against a live
 * Postgres. Skipped if no local DB or the season schema isn't migrated (same
 * pattern as season_projector.spec.ts).
 *
 * Coverage:
 *   - external inflow → PENDING onramp (realized=false, earns 0 until used)
 *   - FIFO realisation incl. the spec's partial case ($20 vs $50 pending realises
 *     $20 leaving $30; a later $40 realises the remaining $30, never more than
 *     on-ramped) with deterministic onramp_used ids (replay-safe)
 *   - off-ramp completion → one idempotent `offramp` event + realises FIFO
 *   - computeEligibleBalance (the source-of-funds primitive): referrer-funded = 0,
 *     non-referrer/external = eligible
 *   - pending expiry → flagged 'expired_onramp', leftover preserved in meta
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { recompute } from '#season/recompute'
import {
  computeEligibleBalance,
  expirePendingOnramps,
  rebuildOnrampRealization,
  __resetDeps as resetOnrampDeps,
} from '#season/onramp'
import { applyOfframpCompletion, __resetDeps as resetEmissionDeps } from '#season/emissions'

const SEASON = 'test-s1-onramp'
const NOW = 1_700_000_000
const DAY = 86_400

const W = '0xc3000000000000000000000000000000000000a1' // verified Sippy wallet
const V1 = '0xc3000000000000000000000000000000000000b2' // verified recipient
const V2 = '0xc3000000000000000000000000000000000000c3' // verified recipient
const EXT = '0xc3000000000000000000000000000000000000ff' // external depositor (unverified)

const PHONES = ['+15550030001', '+15550030002', '+15550030003']
const TX = (n: string) => `s1-onramp-tx-${n}`
const ALL_TX = [
  'in50',
  'send20',
  'send40',
  'in50b',
  'inExpire',
  'p1on1',
  'p1on2',
  'p1on3',
  'p1send70',
  'sendA',
  'sendB',
].map(TX)
const OFFRAMP_ORDER_ID = '00000000-0000-0000-0000-0000000000c3'

async function ensureSeasonSchema(): Promise<boolean> {
  try {
    await query('SELECT pending_remaining FROM season.score_event LIMIT 0')
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
    [phone, `s1-onramp-${address.slice(2, 8)}`, address, NOW * 1000]
  )
}

async function seedTransfer(id: string, from: string, to: string, amount: string, ts: number) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, ts, id]
  )
}

async function getEvent(id: string) {
  const res = await query<{
    verb: string
    usd: string
    realized: boolean
    pending_remaining: string | null
    pending_until: number | null
    flagged: boolean
    flag_reason: string | null
    meta: Record<string, unknown>
  }>(
    `SELECT verb, usd, realized, pending_remaining, pending_until, flagged, flag_reason, meta
       FROM season.score_event WHERE season_id = $1 AND id = $2`,
    [SEASON, id]
  )
  return res.rows[0]
}

async function onrampUsedTotal(wallet: string): Promise<number> {
  const res = await query<{ total: string }>(
    `SELECT COALESCE(SUM(usd), 0)::text AS total
       FROM season.score_event
      WHERE season_id = $1 AND wallet = $2 AND verb = 'onramp_used'`,
    [SEASON, wallet]
  )
  return Number(res.rows[0]?.total ?? 0)
}

async function cleanup() {
  await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])
  await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [ALL_TX])
  await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHONES])
  await query('DELETE FROM offramp_orders WHERE id = $1', [OFFRAMP_ORDER_ID])
}

test.group('Season C3 | on-ramp pending + FIFO realize', (group) => {
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
    resetOnrampDeps()
    resetEmissionDeps()
    await seedWallet(PHONES[0], W)
    await seedWallet(PHONES[1], V1)
    await seedWallet(PHONES[2], V2)
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('external inflow → pending on-ramp (realized=false, earns 0 until used)', async ({
    assert,
  }) => {
    await seedTransfer(TX('in50'), EXT, W, '50000000', NOW - 5 * DAY) // EXT → W $50
    await recompute(W, { seasonId: SEASON, now: NOW })

    const onramp = await getEvent(`onramp:${TX('in50')}`)
    assert.equal(onramp.verb, 'onramp')
    assert.isFalse(onramp.realized)
    assert.equal(Number(onramp.pending_remaining), 50)
    assert.equal(onramp.pending_until, NOW - 5 * DAY + 14 * DAY) // ts + 14d window
    // The same inflow is also a flagged receive (external sender), earning 0.
    const receive = await getEvent(`receive:${TX('in50')}`)
    assert.isTrue(receive.flagged)
    assert.equal(receive.flag_reason, 'counterparty_unverified')
    // On-ramp earns nothing parked: W has only a pending on-ramp + flagged receive.
    const score = await query<{ score: number }>(
      'SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2',
      [SEASON, W]
    )
    assert.equal(score.rows[0].score, 0)
  })

  test('FIFO partial realization: $20 vs $50 leaves $30; later $40 realizes only $30', async ({
    assert,
  }) => {
    await seedTransfer(TX('in50'), EXT, W, '50000000', NOW - 10 * DAY) // on-ramp $50
    await seedTransfer(TX('send20'), W, V1, '20000000', NOW - 8 * DAY) // value-out $20
    await recompute(W, { seasonId: SEASON, now: NOW })

    // First value-out realizes exactly $20, leaving $30 pending.
    const pendingAfter20 = await getEvent(`onramp:${TX('in50')}`)
    assert.equal(Number(pendingAfter20.pending_remaining), 30)
    const used1 = await getEvent(`onramp_used:onramp:${TX('in50')}:send:${TX('send20')}`)
    assert.equal(used1.verb, 'onramp_used')
    assert.equal(Number(used1.usd), 20)
    assert.equal(await onrampUsedTotal(W), 20)

    // A later $40 value-out realizes only the remaining $30 (never more than on-ramped).
    await seedTransfer(TX('send40'), W, V2, '40000000', NOW - 6 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })

    const pendingAfter40 = await getEvent(`onramp:${TX('in50')}`)
    assert.equal(Number(pendingAfter40.pending_remaining), 0)
    const used2 = await getEvent(`onramp_used:onramp:${TX('in50')}:send:${TX('send40')}`)
    assert.equal(Number(used2.usd), 30) // not 40 — capped at what was on-ramped
    assert.equal(await onrampUsedTotal(W), 50) // total realized never exceeds the $50 on-ramp
  })

  test('realization is idempotent: re-running recompute does not double-realize', async ({
    assert,
  }) => {
    await seedTransfer(TX('in50'), EXT, W, '50000000', NOW - 10 * DAY)
    await seedTransfer(TX('send20'), W, V1, '20000000', NOW - 8 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })
    await recompute(W, { seasonId: SEASON, now: NOW }) // replay
    await recompute(W, { seasonId: SEASON, now: NOW }) // and again

    assert.equal(await onrampUsedTotal(W), 20) // still exactly $20
    const pendingReplay = await getEvent(`onramp:${TX('in50')}`)
    assert.equal(Number(pendingReplay.pending_remaining), 30)
  })

  test('replay-idempotent across MULTIPLE pendings + one large send (never over-realizes)', async ({
    assert,
  }) => {
    // Three $50 pendings, then one $70 send → realizes $50 + $20 = $70.
    await seedTransfer(TX('p1on1'), EXT, W, '50000000', NOW - 12 * DAY)
    await seedTransfer(TX('p1on2'), EXT, W, '50000000', NOW - 11 * DAY)
    await seedTransfer(TX('p1on3'), EXT, W, '50000000', NOW - 10 * DAY)
    await seedTransfer(TX('p1send70'), W, V1, '70000000', NOW - 8 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 70) // $50 (P1) + $20 (P2)

    // Replay recompute MUST NOT spill onto the untouched third pending. Without the
    // per-value-out baseline this returned $110 (the reviewer's case).
    await recompute(W, { seasonId: SEASON, now: NOW })
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 70) // still exactly $70, not $110
    // The third pending was never touched.
    const p3 = await getEvent(`onramp:${TX('p1on3')}`)
    assert.equal(Number(p3.pending_remaining), 50)
  })

  test('P2: concurrent rebuilds never over-realize (FOR UPDATE serialises)', async ({ assert }) => {
    await seedTransfer(TX('in50'), EXT, W, '50000000', NOW - 10 * DAY) // pending $50
    await seedTransfer(TX('send20'), W, V1, '20000000', NOW - 8 * DAY) // value-out $20
    await seedTransfer(TX('send40'), W, V2, '40000000', NOW - 6 * DAY) // value-out $40
    await recompute(W, { seasonId: SEASON, now: NOW })

    // Two full realization rebuilds racing on the same wallet. The FOR UPDATE on the
    // pending rows serialises them; each rebuild is deterministic, so the result is
    // exactly the $50 on-ramped ($20 + $30), never doubled.
    await Promise.all([
      rebuildOnrampRealization({ seasonId: SEASON, wallet: W, minActiveUsd: 1, spender: '' }),
      rebuildOnrampRealization({ seasonId: SEASON, wallet: W, minActiveUsd: 1, spender: '' }),
    ])
    assert.equal(await onrampUsedTotal(W), 50)
    const pending = await getEvent(`onramp:${TX('in50')}`)
    assert.equal(Number(pending.pending_remaining), 0)
  })

  test('clearing a flagged value-out never double-counts the same on-ramp (reviewer P1)', async ({
    assert,
  }) => {
    // The exact sequence: on-ramp $50 → send A uses $50 → A flagged → send B uses the
    // re-credited $50 → clear A. Total realized must never exceed the $50 on-ramped.
    await seedTransfer(TX('in50'), EXT, W, '50000000', NOW - 12 * DAY)
    await seedTransfer(TX('sendA'), W, V1, '50000000', NOW - 10 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 50) // A realized $50

    // A flagged sybil → recompute → A's realization is dropped, pending re-credited.
    await query(
      `UPDATE season.score_event SET flagged=true, flag_reason='sybil_circular'
        WHERE season_id=$1 AND id=$2`,
      [SEASON, `send:${TX('sendA')}`]
    )
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 0)

    // Send B uses the re-credited $50.
    await seedTransfer(TX('sendB'), W, V2, '50000000', NOW - 8 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 50) // B realized $50

    // Clear A's false-positive flag → recompute. A is older so it reclaims the $50 and
    // B gets nothing — the realization is rebuilt from scratch, never A + B = $100.
    await query(
      `UPDATE season.score_event SET flagged=false, flag_reason=NULL
        WHERE season_id=$1 AND id=$2`,
      [SEASON, `send:${TX('sendA')}`]
    )
    await recompute(W, { seasonId: SEASON, now: NOW })
    assert.equal(await onrampUsedTotal(W), 50) // NEVER 100
  })

  test('off-ramp completion emits one offramp event and realizes FIFO', async ({ assert }) => {
    await seedTransfer(TX('in50b'), EXT, W, '50000000', NOW - 5 * DAY) // on-ramp $50
    await recompute(W, { seasonId: SEASON, now: NOW })

    await query(
      `INSERT INTO offramp_orders (id, phone_number, external_id, bank_account_id, amount_usdc, status)
       VALUES ($1, $2, $3, 1, '30', 'completed')
       ON CONFLICT (id) DO NOTHING`,
      [OFFRAMP_ORDER_ID, PHONES[0], `s1-onramp-ext-${OFFRAMP_ORDER_ID}`]
    )

    const res = await applyOfframpCompletion({
      orderId: OFFRAMP_ORDER_ID,
      phone: PHONES[0],
      seasonId: SEASON,
      now: NOW,
    })
    assert.isNotNull(res)
    assert.equal(res!.usd, 30)
    assert.equal(res!.realized, 30) // off-ramp is a value-out → realizes $30 of the $50

    const offramp = await getEvent(`offramp:${OFFRAMP_ORDER_ID}`)
    assert.equal(offramp.verb, 'offramp')
    assert.equal(Number(offramp.usd), 30)
    // $30 of the $50 on-ramp realized via the off-ramp; $20 still pending.
    const pendingOff = await getEvent(`onramp:${TX('in50b')}`)
    assert.equal(Number(pendingOff.pending_remaining), 20)
    const used = await getEvent(`onramp_used:onramp:${TX('in50b')}:offramp:${OFFRAMP_ORDER_ID}`)
    assert.equal(Number(used.usd), 30)

    // Idempotent: re-running the completion doesn't double-emit or double-realize.
    await applyOfframpCompletion({
      orderId: OFFRAMP_ORDER_ID,
      phone: PHONES[0],
      seasonId: SEASON,
      now: NOW,
    })
    assert.equal(await onrampUsedTotal(W), 30)
  })

  test('pending expiry → flagged expired_onramp, leftover preserved in meta', async ({
    assert,
  }) => {
    // On-ramp 20d ago → pending_until = NOW-6d, already past at NOW.
    await seedTransfer(TX('inExpire'), EXT, W, '50000000', NOW - 20 * DAY)
    await recompute(W, { seasonId: SEASON, now: NOW })

    const wallets = await expirePendingOnramps(SEASON, NOW)
    assert.include(wallets, W)

    const expired = await getEvent(`onramp:${TX('inExpire')}`)
    assert.isTrue(expired.flagged)
    assert.equal(expired.flag_reason, 'expired_onramp')
    assert.isFalse(expired.realized) // never realized, never earns
    assert.equal(Number(expired.meta.expiredPendingRemaining), 50) // leftover preserved

    // Idempotent: a second expiry pass touches nothing new.
    const again = await expirePendingOnramps(SEASON, NOW)
    assert.notInclude(again, W)
  })
})

test.group('Season C3 | eligible-balance (source-of-funds primitive)', (group) => {
  let ok = false
  const RE = '0xc3e1000000000000000000000000000000000001' // referee
  const RF = '0xc3e1000000000000000000000000000000000002' // referrer
  const X = '0xc3e1000000000000000000000000000000000003' // a third party
  const ETX = ['s1-elig-rf5', 's1-elig-ext10', 's1-elig-send5']

  async function cleanupE() {
    await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [ETX])
  }

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
    await cleanupE()
    resetOnrampDeps()
  })
  group.teardown(async () => {
    if (ok) await cleanupE()
  })

  test('referrer-funded only → eligible balance 0 (fund-and-bounce farm)', async ({ assert }) => {
    await seedTransfer(ETX[0], RF, RE, '5000000', NOW - 2 * DAY) // referrer → referee $5
    await seedTransfer(ETX[2], RE, X, '5000000', NOW - 1 * DAY) // referee → X $5 (candidate)
    const eligible = await computeEligibleBalance({
      refereeWallet: RE,
      referrerWallet: RF,
      beforeTs: NOW - 1 * DAY,
      beforeTxId: ETX[2],
    })
    assert.equal(eligible, 0) // the only inflow traces to the referrer → NOT eligible
  })

  test('external on-ramp → eligible balance covers the send (legit unlock)', async ({ assert }) => {
    await seedTransfer(ETX[1], X, RE, '10000000', NOW - 2 * DAY) // non-referrer inbound $10
    await seedTransfer(ETX[2], RE, X, '5000000', NOW - 1 * DAY) // referee → X $5 (candidate)
    const eligible = await computeEligibleBalance({
      refereeWallet: RE,
      referrerWallet: RF,
      beforeTs: NOW - 1 * DAY,
      beforeTxId: ETX[2],
    })
    assert.equal(eligible, 10) // non-referrer inflow is eligible
  })

  test('mixed: referrer $5 + external $10 → only the $10 is eligible', async ({ assert }) => {
    await seedTransfer(ETX[0], RF, RE, '5000000', NOW - 3 * DAY) // referrer $5 (ineligible)
    await seedTransfer(ETX[1], X, RE, '10000000', NOW - 2 * DAY) // external $10 (eligible)
    await seedTransfer(ETX[2], RE, X, '5000000', NOW - 1 * DAY) // candidate send
    const eligible = await computeEligibleBalance({
      refereeWallet: RE,
      referrerWallet: RF,
      beforeTs: NOW - 1 * DAY,
      beforeTxId: ETX[2],
    })
    assert.equal(eligible, 10)
  })
})
