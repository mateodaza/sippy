/**
 * Season 1 — C2 anti-sybil integration tests.
 *
 * Runs the real #season/sybil graph rules + the verified-floor vendor exclusion +
 * the #season/flags review queue against a live Postgres. Skipped without a local
 * DB / Phase C schema.
 *
 * Coverage:
 *   - circular / roundtrip / star / cluster → season.flag written + offending send
 *     events zeroed (flagged-not-deleted)
 *   - vendor/exchange wallets excluded at the one seam (verifiedWalletCte)
 *   - a legit one-directional family send is NOT flagged (the lenient line)
 *   - flag dedup (UNIQUE season,subject,kind), confirm/clear audit stamps, no raw PII
 *   - a sybil-flagged pair voids its referral
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { recompute } from '#season/recompute'
import { runSybilScan, __resetDeps as resetSybilDeps } from '#season/sybil'
import { excludedVendorAddrs, verifiedWalletCte } from '#season/definitions'
import { listFlags, reviewFlag } from '#season/flags'
import { emitActiveWeeks } from '#season/job'

const SEASON = 'test-s1-sybil'
const NOW = 1_700_000_000

const A = '0xc2a0000000000000000000000000000000000001'
const B = '0xc2b0000000000000000000000000000000000002'
const C = '0xc2c0000000000000000000000000000000000003'
const F = '0xc2f0000000000000000000000000000000000004' // star funder
const R = [1, 2, 3, 4, 5].map((i) => `0xc2e000000000000000000000000000000000000${i}`)
const FAM1 = '0xc2fa000000000000000000000000000000000aa1'
const FAM2 = '0xc2fa000000000000000000000000000000000bb2'
const VENDOR = '0xc2d0000000000000000000000000000000000005'
const VENDOR_PHONE = '+15550059999'

const ADDRS = [A, B, C, F, FAM1, FAM2, VENDOR, ...R]
const PHONES = ADDRS.map((_, i) => `+1555005${String(1000 + i).padStart(4, '0')}`)
const PHONE_OF = new Map(ADDRS.map((a, i) => [a, PHONES[i]]))
// The vendor wallet must be reachable by the env phone the exclusion list uses.
PHONE_OF.set(VENDOR, VENDOR_PHONE)
const ALL_PHONES = [...PHONES, VENDOR_PHONE]
const TXS: string[] = []
const tx = (s: string) => {
  const id = `s1-sybil-${s}`
  if (!TXS.includes(id)) TXS.push(id)
  return id
}

async function ensureSeasonSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM season.flag LIMIT 0')
    return true
  } catch {
    return false
  }
}

async function seedWallet(address: string, onboardingTsSec = NOW - 30 * 86_400) {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23')
     ON CONFLICT (phone_number) DO NOTHING`,
    [PHONE_OF.get(address), `s1-sybil-${address.slice(2, 8)}`, address, onboardingTsSec * 1000]
  )
}

async function seedTransfer(id: string, from: string, to: string, amount: string, ts: number) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6) ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, ts, id]
  )
}

async function flagsFor(subject: string, kind?: string) {
  const res = kind
    ? await query<{ id: number; detail: Record<string, unknown> }>(
        `SELECT id, detail FROM season.flag WHERE season_id = $1 AND subject = $2 AND kind = $3`,
        [SEASON, subject, kind]
      )
    : await query<{ id: number; kind: string; detail: Record<string, unknown> }>(
        `SELECT id, kind, detail FROM season.flag WHERE season_id = $1 AND subject = $2`,
        [SEASON, subject]
      )
  return res.rows
}

async function sendFlagged(from: string, to: string): Promise<boolean> {
  const res = await query<{ flagged: boolean; flag_reason: string }>(
    `SELECT flagged, flag_reason FROM season.score_event
      WHERE season_id = $1 AND verb = 'send' AND wallet = $2 AND counterparty = $3`,
    [SEASON, from, to]
  )
  return res.rows.length > 0 && res.rows.every((r) => r.flagged)
}

async function cleanup() {
  await query('DELETE FROM season.flag WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.referral WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score WHERE season_id = $1', [SEASON])
  await query('DELETE FROM season.score_event WHERE season_id = $1', [SEASON])
  await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [TXS])
  await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [ALL_PHONES])
}

test.group('Season C2 | anti-sybil graph rules', (group) => {
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
    resetSybilDeps()
    for (const a of ADDRS) await seedWallet(a)
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('circular A↔B → flagged + both sends zeroed', async ({ assert }) => {
    await seedTransfer(tx('circ-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('circ-ba'), B, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })

    const result = await runSybilScan(SEASON)
    assert.isAbove(result.flags, 0)
    assert.lengthOf(await flagsFor(`${A}:${B}`, 'circular'), 1)
    assert.isTrue(await sendFlagged(A, B))
    assert.isTrue(await sendFlagged(B, A))
  })

  test('roundtrip (bounce within window) gets the extra flag', async ({ assert }) => {
    await seedTransfer(tx('rt-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('rt-ba'), B, A, '25000000', NOW - 5 * 86_400 + 600) // +10 min
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })

    await runSybilScan(SEASON)
    assert.lengthOf(await flagsFor(`${A}:${B}`, 'roundtrip'), 1)
    assert.lengthOf(await flagsFor(`${A}:${B}`, 'circular'), 1) // also circular
  })

  test('star: one funder → ≥5 sole-funded wallets → flagged + funder sends zeroed', async ({
    assert,
  }) => {
    for (const [i, element] of R.entries()) {
      await seedTransfer(tx(`star-${i}`), F, element, '10000000', NOW - (10 - i) * 86_400)
    }
    await recompute(F, { seasonId: SEASON, now: NOW })

    await runSybilScan(SEASON)
    const flags = await flagsFor(F, 'star')
    assert.lengthOf(flags, 1)
    assert.equal(flags[0].detail.fanout, 5)
    assert.isTrue(await sendFlagged(F, R[0]))
  })

  test('cluster: a 3-cycle A→B→C→A → flagged + cyclic sends zeroed', async ({ assert }) => {
    await seedTransfer(tx('cl-ab'), A, B, '25000000', NOW - 6 * 86_400)
    await seedTransfer(tx('cl-bc'), B, C, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('cl-ca'), C, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })
    await recompute(C, { seasonId: SEASON, now: NOW })

    await runSybilScan(SEASON)
    // members sorted lexicographically into the subject
    const [a, b, c] = [A, B, C].sort()
    assert.lengthOf(await flagsFor(`${a}:${b}:${c}`, 'cluster'), 1)
    assert.isTrue(await sendFlagged(A, B))
    assert.isTrue(await sendFlagged(B, C))
    assert.isTrue(await sendFlagged(C, A))
  })

  test('legit one-directional family send is NOT flagged (lenient line)', async ({ assert }) => {
    await seedTransfer(tx('fam'), FAM1, FAM2, '20000000', NOW - 5 * 86_400)
    await recompute(FAM1, { seasonId: SEASON, now: NOW })

    await runSybilScan(SEASON)
    assert.lengthOf(await flagsFor(`${FAM1}:${FAM2}`), 0)
    assert.lengthOf(await flagsFor(`${FAM2}:${FAM1}`), 0)
    assert.lengthOf(await flagsFor(FAM1), 0)
    assert.isFalse(await sendFlagged(FAM1, FAM2)) // legit send still earns
  })

  test('flag dedup (UNIQUE) + confirm stamps reviewed_at/by + no raw PII', async ({ assert }) => {
    await seedTransfer(tx('dd-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('dd-ba'), B, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })

    await runSybilScan(SEASON)
    await runSybilScan(SEASON) // re-run must not duplicate
    const flags = await flagsFor(`${A}:${B}`, 'circular')
    assert.lengthOf(flags, 1) // UNIQUE(season_id, subject, kind)

    // detail carries only masked addresses — never a phone/raw PII.
    const detail = JSON.stringify(flags[0].detail)
    for (const p of PHONES) assert.notInclude(detail, p)
    assert.include(detail, '…') // masked form present

    // Confirm stamps the audit fields; a second review is a no-op (already reviewed).
    const reviewed = await reviewFlag(flags[0].id, 'confirmed', 'admin@sippy.lat', SEASON)
    assert.isNotNull(reviewed)
    assert.equal(reviewed!.flag.status, 'confirmed')
    assert.equal(reviewed!.flag.reviewed_by, 'admin@sippy.lat')
    assert.isNotNull(reviewed!.flag.reviewed_at)
    assert.isNull(await reviewFlag(flags[0].id, 'cleared', 'someone-else', SEASON))
  })

  test('open flags surface in the review queue; reviewed ones drop out', async ({ assert }) => {
    await seedTransfer(tx('q-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('q-ba'), B, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })
    await runSybilScan(SEASON)

    const openBefore = await listFlags('open', SEASON)
    assert.isAbove(openBefore.length, 0)
    await reviewFlag(openBefore[0].id, 'cleared', 'admin@sippy.lat', SEASON)
    const openAfter = await listFlags('open', SEASON)
    assert.equal(openAfter.length, openBefore.length - 1)
  })

  test('a sybil-flagged pair voids its referral', async ({ assert }) => {
    // A referral (A referred B) that then turns out to be a circular wash pair.
    await query(
      `INSERT INTO season.referral (season_id, referrer_wallet, referee_wallet, source, stage)
       VALUES ($1, $2, $3, 'quest_code', 'pending')`,
      [SEASON, A, B]
    )
    await seedTransfer(tx('v-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('v-ba'), B, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })

    const result = await runSybilScan(SEASON)
    assert.isAbove(result.referralsVoided, 0)
    const stage = await query<{ stage: string }>(
      `SELECT stage FROM season.referral WHERE season_id = $1 AND referee_wallet = $2`,
      [SEASON, B]
    )
    assert.equal(stage.rows[0].stage, 'void')
  })

  test('P1a: a flagged send zeroes ALL its derived events (first_send/onramp_used/active_week/new_cp)', async ({
    assert,
  }) => {
    const EXT = '0xc2ee000000000000000000000000000000000eef' // external depositor (unverified)
    const eventRows = async (id: string) => {
      const r = await query<{ flagged: boolean }>(
        `SELECT flagged FROM season.score_event WHERE season_id = $1 AND id = $2`,
        [SEASON, id]
      )
      return r.rows
    }
    const activeWeekCountA = async () => {
      const r = await query(
        `SELECT 1 FROM season.score_event WHERE season_id=$1 AND wallet=$2 AND verb='active_week'`,
        [SEASON, A]
      )
      return r.rows.length
    }
    await seedTransfer(tx('p1a-on'), EXT, A, '50000000', NOW - 10 * 86_400) // A on-ramps $50
    await seedTransfer(tx('p1a-ab'), A, B, '20000000', NOW - 8 * 86_400) // A→B $20 (first_send/new_cp/realizes 20)
    await seedTransfer(tx('p1a-ba'), B, A, '20000000', NOW - 7 * 86_400) // B→A (makes it circular)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })
    await emitActiveWeeks(SEASON, 1) // A is active this week via the unflagged A→B

    // Pre-sybil: the send produced first_send, a realized onramp_used ($20 of $50), an
    // active_week, and a new_counterparty — all live.
    const usedId = `onramp_used:onramp:${tx('p1a-on')}:send:${tx('p1a-ab')}`
    assert.lengthOf(await eventRows(`first_send:${SEASON}:${A}`), 1)
    const usedBefore = await eventRows(usedId)
    assert.isFalse(usedBefore[0].flagged)
    assert.equal(await activeWeekCountA(), 1)

    // C2 flags the A↔B circular sends; recompute reconciles, emitActiveWeeks delete-stales.
    await runSybilScan(SEASON)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await emitActiveWeeks(SEASON, 1)
    await recompute(A, { seasonId: SEASON, now: NOW })

    // The raw send AND everything derived from it are now zeroed.
    assert.isTrue(await sendFlagged(A, B)) // raw send
    assert.lengthOf(await eventRows(`first_send:${SEASON}:${A}`), 0) // activation removed
    // realized on-ramp dropped — the rebuild excludes the sybil-flagged send entirely,
    // so its onramp_used row no longer exists (not merely flagged).
    assert.lengthOf(await eventRows(usedId), 0)
    const ncAfter = await eventRows(`new_counterparty:${SEASON}:${A}:${B}`)
    assert.isTrue(ncAfter[0].flagged) // breadth voided
    // the pending on-ramp is re-credited (its only realization was voided)
    const pending = await query<{ pending_remaining: string }>(
      `SELECT pending_remaining FROM season.score_event WHERE season_id=$1 AND id=$2`,
      [SEASON, `onramp:${tx('p1a-on')}`]
    )
    assert.equal(Number(pending.rows[0].pending_remaining), 50)
    assert.equal(await activeWeekCountA(), 0) // delete-staled — its only value-out is flagged
  })

  test('P2: clearing a flag lifts enforcement and a re-scan does not re-flag', async ({
    assert,
  }) => {
    await seedTransfer(tx('clr-ab'), A, B, '25000000', NOW - 5 * 86_400)
    await seedTransfer(tx('clr-ba'), B, A, '25000000', NOW - 4 * 86_400)
    await recompute(A, { seasonId: SEASON, now: NOW })
    await recompute(B, { seasonId: SEASON, now: NOW })
    await runSybilScan(SEASON)
    assert.isTrue(await sendFlagged(A, B)) // suppressed

    const circularFlags = await flagsFor(`${A}:${B}`, 'circular')
    const res = await reviewFlag(circularFlags[0].id, 'cleared', 'admin@sippy.lat', SEASON)
    assert.isNotNull(res)
    assert.includeMembers(res!.affectedWallets, [A, B])
    assert.isFalse(await sendFlagged(A, B)) // un-flagged on clear

    // A re-scan must NOT re-flag a cleared finding.
    await runSybilScan(SEASON)
    assert.isFalse(await sendFlagged(A, B))
  })

  test('vendor/exchange wallets are excluded at the verified-floor seam', async ({ assert }) => {
    const prev = process.env.PIZZA_DAY_EXCHANGE_PHONES
    process.env.PIZZA_DAY_EXCHANGE_PHONES = VENDOR_PHONE
    try {
      const vendors = await excludedVendorAddrs()
      assert.include(vendors, VENDOR)
      // The CTE must exclude the vendor wallet from `verified`.
      const inVerified = await query(
        `WITH ${await verifiedWalletCte()} SELECT 1 FROM verified WHERE addr = $1`,
        [VENDOR]
      )
      assert.lengthOf(inVerified.rows, 0)
    } finally {
      if (prev === undefined) delete process.env.PIZZA_DAY_EXCHANGE_PHONES
      else process.env.PIZZA_DAY_EXCHANGE_PHONES = prev
    }
  })
})
