/**
 * Season 1 — C1 referral state machine integration tests.
 *
 * Runs the real #season/referral + projector unlock detection against a live
 * Postgres. Skipped without a local DB / the Phase C schema.
 *
 * Coverage:
 *   - pending → unlocked → retained lifecycle (two-sided amounts, pay-on-transition)
 *   - precedence: referral_attributions beats pending_invites (one row per referee)
 *   - SOURCE-OF-FUNDS (the must-fix): the fund-and-bounce farm does NOT unlock; a
 *     send to the referrer never qualifies; an independently-funded referee DOES
 *   - void zeroes the awards (flagged-not-deleted)
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { recompute } from '#season/recompute'
import {
  syncPendingReferrals,
  promoteRetainedReferrals,
  voidReferral,
  reconcileReferralStages,
  __resetDeps as resetReferralDeps,
} from '#season/referral'
import { reviewFlag } from '#season/flags'

const SEASON = 'test-s1-referral'
const NOW = 1_700_000_000
const DAY = 86_400

const W_RFR = '0xc1000000000000000000000000000000000000a1' // referrer (quest code)
const W_REE = '0xc1000000000000000000000000000000000000b2' // referee
const W_V = '0xc1000000000000000000000000000000000000c3' // third verified party
const W_INV = '0xc1000000000000000000000000000000000000d4' // a different invite-sender
const EXT = '0xc1000000000000000000000000000000000000ff' // external depositor

const P_RFR = '+15550040001'
const P_REE = '+15550040002'
const P_V = '+15550040003'
const P_INV = '+15550040004'
const PHONES = [P_RFR, P_REE, P_V, P_INV]
const CODE = 'REFC1A'
const TX = (n: string) => `s1-ref-tx-${n}`
const ALL_TX = ['onramp10', 'send5', 'rfrFund5', 'bounce5', 'bounceRfr'].map(TX)

async function ensureSeasonSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM season.referral LIMIT 0')
    return true
  } catch {
    return false
  }
}

async function seedWallet(phone: string, address: string, onboardingTsSec: number) {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23')
     ON CONFLICT (phone_number) DO UPDATE SET created_at = EXCLUDED.created_at`,
    [phone, `s1-ref-${address.slice(2, 8)}`, address, onboardingTsSec * 1000]
  )
}

async function seedAttribution(refereePhone: string, referrerPhone: string, code: string) {
  await query(`INSERT INTO user_preferences (phone_number) VALUES ($1) ON CONFLICT DO NOTHING`, [
    refereePhone,
  ])
  await query(`INSERT INTO user_preferences (phone_number) VALUES ($1) ON CONFLICT DO NOTHING`, [
    referrerPhone,
  ])
  await query(
    `INSERT INTO referral_codes (code, phone_number, event_slug) VALUES ($1, $2, 'global')
     ON CONFLICT (code) DO NOTHING`,
    [code, referrerPhone]
  )
  await query(
    `INSERT INTO referral_attributions (referee_phone, referrer_phone, referral_code, event_slug)
     VALUES ($1, $2, $3, 'global') ON CONFLICT (referee_phone) DO NOTHING`,
    [refereePhone, referrerPhone, code]
  )
}

async function seedCompletedInvite(senderPhone: string, recipientPhone: string) {
  await query(
    `INSERT INTO pending_invites (sender_phone, recipient_phone, status, created_at, expires_at)
     VALUES ($1, $2, 'completed', $3, $4)`,
    [senderPhone, recipientPhone, (NOW - 11 * DAY) * 1000, (NOW + 30 * DAY) * 1000]
  )
}

async function seedTransfer(id: string, from: string, to: string, amount: string, ts: number) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6) ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, ts, id]
  )
}

async function stageOf(refereeWallet: string): Promise<string | undefined> {
  const r = await query<{ stage: string }>(
    `SELECT stage FROM season.referral WHERE season_id = $1 AND referee_wallet = $2`,
    [SEASON, refereeWallet]
  )
  return r.rows[0]?.stage
}

async function scoreOf(wallet: string): Promise<number> {
  const r = await query<{ score: number }>(
    `SELECT score FROM season.score WHERE season_id = $1 AND wallet = $2`,
    [SEASON, wallet]
  )
  return r.rows[0]?.score ?? 0
}

async function hasEvent(id: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM season.score_event WHERE season_id = $1 AND id = $2`, [
    SEASON,
    id,
  ])
  return r.rows.length > 0
}

async function cleanup() {
  await query('DELETE FROM season.flag WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.referral WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])
  await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [ALL_TX])
  await query('DELETE FROM referral_attributions WHERE referee_phone = ANY($1::text[])', [PHONES])
  await query('DELETE FROM referral_codes WHERE code = $1', [CODE])
  await query('DELETE FROM pending_invites WHERE recipient_phone = ANY($1::text[])', [PHONES])
  await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHONES])
  await query('DELETE FROM user_preferences WHERE phone_number = ANY($1::text[])', [PHONES])
}

test.group('Season C1 | referral state machine', (group) => {
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
    resetReferralDeps()
    // Onboarding anchors 10–11d ago so a NOW-5d send is inside the 14d window.
    await seedWallet(P_RFR, W_RFR, NOW - 11 * DAY)
    await seedWallet(P_REE, W_REE, NOW - 10 * DAY)
    await seedWallet(P_V, W_V, NOW - 11 * DAY)
    await seedWallet(P_INV, W_INV, NOW - 11 * DAY)
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('pending → unlocked → retained (two-sided, pay on transition)', async ({ assert }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    assert.equal(await syncPendingReferrals(SEASON), 1)
    assert.equal(await stageOf(W_REE), 'pending')

    // Pay-on-transition: a pending referral alone earns nothing for either side.
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await scoreOf(W_RFR), 0)

    // Referee on-ramps independently ($10 external), then sends $5 to a third
    // verified party (≠ referrer) within the window → the qualifying, own-funded send.
    await seedTransfer(TX('onramp10'), EXT, W_REE, '10000000', NOW - 7 * DAY)
    await seedTransfer(TX('send5'), W_REE, W_V, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })

    assert.equal(await stageOf(W_REE), 'unlocked')
    assert.isTrue(await hasEvent(`referral_unlock_referrer:${SEASON}:${W_REE}`))
    assert.isTrue(await hasEvent(`referral_unlock_referee:${SEASON}:${W_REE}`))

    // Referrer's score reflects the +40 unlock (referrer has no other events).
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await scoreOf(W_RFR), 40)

    // Retained: 30d after unlock with the referee still active (the qualifying send
    // sits at the start of the trailing 30d window) → referrer +30.
    const later = NOW + 25 * DAY // unlocked_at (NOW-5d) + 30d
    const promoted = await promoteRetainedReferrals(SEASON, later)
    assert.include(promoted, W_RFR)
    assert.equal(await stageOf(W_REE), 'retained')
    await recompute(W_RFR, { seasonId: SEASON, now: later })
    assert.equal(await scoreOf(W_RFR), 70) // 40 unlock + 30 retained
  })

  test('precedence: referral_attributions beats pending_invites (one row/referee)', async ({
    assert,
  }) => {
    // Same referee reachable via BOTH: a Quest attribution (referrer RFR) and a
    // completed direct invite (sender INV). The attribution must win.
    await seedAttribution(P_REE, P_RFR, CODE)
    await seedCompletedInvite(P_INV, P_REE)

    const created = await syncPendingReferrals(SEASON)
    assert.equal(created, 1) // exactly one row despite two sources

    const row = await query<{ referrer_wallet: string; source: string }>(
      `SELECT referrer_wallet, source FROM season.referral WHERE season_id = $1 AND referee_wallet = $2`,
      [SEASON, W_REE]
    )
    assert.equal(row.rows[0].referrer_wallet, W_RFR) // attribution referrer, not the invite sender
    assert.equal(row.rows[0].source, 'quest_code')

    // Re-running the sync is idempotent — still one row.
    assert.equal(await syncPendingReferrals(SEASON), 0)
  })

  test('SOURCE OF FUNDS: fund-and-bounce farm does NOT unlock', async ({ assert }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    await syncPendingReferrals(SEASON)

    // Referrer funds the referee $5, referee sends $5 onward to a third party. The
    // referee's only inflow traces to the referrer → eligible balance 0 → no unlock.
    await seedTransfer(TX('rfrFund5'), W_RFR, W_REE, '5000000', NOW - 7 * DAY)
    await seedTransfer(TX('bounce5'), W_REE, W_V, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })

    assert.equal(await stageOf(W_REE), 'pending') // still pending — farm defeated
    assert.isFalse(await hasEvent(`referral_unlock_referrer:${SEASON}:${W_REE}`))
  })

  test('SOURCE OF FUNDS: a send to the referrer never qualifies', async ({ assert }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    await syncPendingReferrals(SEASON)

    // Referee on-ramps independently but sends the $5 straight back to the referrer.
    await seedTransfer(TX('onramp10'), EXT, W_REE, '10000000', NOW - 7 * DAY)
    await seedTransfer(TX('bounceRfr'), W_REE, W_RFR, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })

    assert.equal(await stageOf(W_REE), 'pending') // recipient == referrer → no unlock
  })

  test('P1b: an unlock reverts when its qualifying send is later voided (sybil/reorg)', async ({
    assert,
  }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    await syncPendingReferrals(SEASON)
    await seedTransfer(TX('onramp10'), EXT, W_REE, '10000000', NOW - 7 * DAY)
    await seedTransfer(TX('send5'), W_REE, W_V, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })
    assert.equal(await stageOf(W_REE), 'unlocked')
    assert.isTrue(await hasEvent(`referral_unlock_referrer:${SEASON}:${W_REE}`))

    // The qualifying send is later voided — sybil flag here (a reorg deletes it instead;
    // both make reconcileReferralStages see no unflagged qualifying send for unlock_tx_id).
    await query(
      `UPDATE season.score_event SET flagged = true, flag_reason = 'sybil_circular'
        WHERE season_id = $1 AND id = $2`,
      [SEASON, `send:${TX('send5')}`]
    )
    const reverted = await reconcileReferralStages(SEASON)
    assert.includeMembers(reverted, [W_RFR, W_REE])
    assert.equal(await stageOf(W_REE), 'pending') // reverted — no longer paying
    assert.isFalse(await hasEvent(`referral_unlock_referrer:${SEASON}:${W_REE}`)) // award deleted
    assert.isFalse(await hasEvent(`referral_unlock_referee:${SEASON}:${W_REE}`))
  })

  test('P2: clearing a false-positive referral void restores the referrer points', async ({
    assert,
  }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    await syncPendingReferrals(SEASON)
    await seedTransfer(TX('onramp10'), EXT, W_REE, '10000000', NOW - 7 * DAY)
    await seedTransfer(TX('send5'), W_REE, W_V, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await stageOf(W_REE), 'unlocked')
    assert.equal(await scoreOf(W_RFR), 40)

    // A false-positive sybil flag (subject includes the referee) voids the referral.
    await query(
      `INSERT INTO season.flag (season_id, subject, kind, status, detail)
       VALUES ($1, $2, 'circular', 'open', '{}'::jsonb)`,
      [SEASON, `${W_REE}:${W_V}`]
    )
    await voidReferral(SEASON, W_REE, 'sybil_circular')
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await stageOf(W_REE), 'void')
    assert.equal(await scoreOf(W_RFR), 0) // award flagged → no points

    // Clear the false positive → un-void + recompute re-unlocks and REVIVES the award.
    const fl = await query<{ id: number }>(
      `SELECT id FROM season.flag WHERE season_id = $1 AND subject = $2`,
      [SEASON, `${W_REE}:${W_V}`]
    )
    const res = await reviewFlag(fl.rows[0].id, 'cleared', 'admin@sippy.lat', SEASON)
    assert.isNotNull(res)
    for (const w of res!.affectedWallets) await recompute(w, { seasonId: SEASON, now: NOW })
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await stageOf(W_REE), 'unlocked') // re-unlocked
    assert.equal(await scoreOf(W_RFR), 40) // referrer points restored
  })

  test('void zeroes the awards (flagged-not-deleted)', async ({ assert }) => {
    await seedAttribution(P_REE, P_RFR, CODE)
    await syncPendingReferrals(SEASON)
    await seedTransfer(TX('onramp10'), EXT, W_REE, '10000000', NOW - 7 * DAY)
    await seedTransfer(TX('send5'), W_REE, W_V, '5000000', NOW - 5 * DAY)
    await recompute(W_REE, { seasonId: SEASON, now: NOW })
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await scoreOf(W_RFR), 40)

    // Void (sybil) → stage void + the awards flagged → referrer's +40 zeroed.
    const affected = await voidReferral(SEASON, W_REE, 'sybil_cluster')
    assert.include(affected, W_RFR)
    assert.equal(await stageOf(W_REE), 'void')
    await recompute(W_RFR, { seasonId: SEASON, now: NOW })
    assert.equal(await scoreOf(W_RFR), 0) // award flagged → earns nothing
    // The event row still exists (flagged, not deleted).
    assert.isTrue(await hasEvent(`referral_unlock_referrer:${SEASON}:${W_REE}`))
  })
})
