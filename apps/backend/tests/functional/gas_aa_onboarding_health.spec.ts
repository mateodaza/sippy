/**
 * Gas → AA — onboarding-health monitor, REAL adapters against live Postgres (skipped without a
 * DB or the gas_aa / onchain migrations).
 *
 * The unit suite proves the pure logic (evaluateHealth, auditOnboard) with injected deps. This
 * proves the SQL the units can't: realCountOnboards7d's epoch-MS window, realListNewlyDone's
 * LATERAL join (casing + the permission_created_at-anchored setup match, including the boundary
 * fix and stale-row exclusion), and realHasRefuelEvent's casing. The monitor's worst failure mode
 * is "healthy because the query selected nothing", so these run against real rows, not fakes.
 */

import { test } from '@japa/runner'
import { getAddress } from 'viem'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { ENTRY_POINT_V06 } from '#services/gas_aa/config'
import {
  realCountOnboards7d,
  realListNewlyDone,
  realHasRefuelEvent,
} from '#services/gas_aa/onboarding_health'

const EP = ENTRY_POINT_V06.toLowerCase()
const CALLS_HASH = '0x' + 'ab'.repeat(32)
const PHONE_PREFIX = '+155507' // every seeded registry phone starts here (cleanup scope)
const ID_PREFIX = 'ohtest-' // every seeded gas_aa / refuel row id starts here

// Mixed-case (checksummed) wallets so the LOWER()-both-sides joins are actually exercised.
const W = (n: number) =>
  getAddress('0xabcdef000000000000000000000000000000' + n.toString(16).padStart(4, '0'))
const EOA = (n: number) =>
  ('0xee00000000000000000000000000000000000000' + n.toString(16).padStart(2, '0')).toLowerCase()

async function ensureSchema(): Promise<boolean> {
  try {
    await query('SELECT permission_created_at, spend_permission_hash FROM phone_registry LIMIT 0')
    await query('SELECT 1 FROM gas_aa_prepared_user_ops LIMIT 0')
    await query('SELECT 1 FROM onchain.refuel_event LIMIT 0')
    return true
  } catch {
    return false
  }
}

async function clean(): Promise<void> {
  await query(`DELETE FROM gas_aa_prepared_user_ops WHERE id LIKE '${ID_PREFIX}%'`)
  await query(`DELETE FROM onchain.refuel_event WHERE id LIKE '${ID_PREFIX}%'`)
  await query(`DELETE FROM phone_registry WHERE phone_number LIKE '${PHONE_PREFIX}%'`)
}

async function seedRegistry(
  phone: string,
  walletChecksummed: string,
  o: {
    createdAtMs: number
    permissionHash?: string | null
    permissionCreatedAtMs?: number | null
    dailyLimit?: number | null
  }
): Promise<void> {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date,
        spend_permission_hash, permission_created_at, daily_limit)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23', $5, $6, $7)
     ON CONFLICT (phone_number) DO NOTHING`,
    [
      phone,
      `oh-test-${walletChecksummed.slice(2, 8)}`,
      walletChecksummed,
      o.createdAtMs,
      o.permissionHash ?? null,
      o.permissionCreatedAtMs ?? null,
      o.dailyLimit ?? null,
    ]
  )
}

async function seedLandedSetup(
  id: string,
  senderChecksummed: string,
  o: { updatedAtMs: number; txHash: string; userEoa: string }
): Promise<void> {
  await query(
    `INSERT INTO gas_aa_prepared_user_ops
       (id, lane, sender, chain_id, entry_point, calls_hash, status, user_eoa, meta, expires_at, updated_at)
     VALUES ($1, 'setup', LOWER($2), 42161, $3, $4, 'landed', $5,
             jsonb_build_object('tx_hash', $6::text), $7, to_timestamp($8::bigint / 1000.0))
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      senderChecksummed,
      EP,
      CALLS_HASH,
      o.userEoa,
      o.txHash,
      Math.floor(o.updatedAtMs / 1000) + 3600,
      o.updatedAtMs,
    ]
  )
}

async function seedRefuel(id: string, userChecksummed: string): Promise<void> {
  await query(
    `INSERT INTO onchain.refuel_event (id, "user", amount, timestamp, block_number, tx_hash)
     VALUES ($1, LOWER($2), '1000000', 1, 1, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, userChecksummed, `${id}-tx`]
  )
}

const DAY = 24 * 60 * 60 * 1000

test.group('gas_aa onboarding-health | real SQL adapters', (group) => {
  let ok = false
  group.setup(async () => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) return
    ok = true
    await clean()
  })
  group.each.setup((t) => {
    if (!ok) t.skip(true, 'No local DB / gas_aa + onchain schema not migrated')
  })
  group.teardown(async () => {
    if (ok) await clean()
  })

  test('realCountOnboards7d windows on epoch-MS created_at (a 10-day-old row is excluded)', async ({
    assert,
  }) => {
    const before = await realCountOnboards7d()
    const now = Date.now()
    // R1: done, inside 7d. R2: registered-only, inside 7d. R3: done, OUTSIDE 7d (must not count).
    await seedRegistry(`${PHONE_PREFIX}01`, W(1), {
      createdAtMs: now - 1 * DAY,
      permissionHash: '0xh1',
      permissionCreatedAtMs: now - 1 * DAY,
    })
    await seedRegistry(`${PHONE_PREFIX}02`, W(2), { createdAtMs: now - 2 * DAY })
    await seedRegistry(`${PHONE_PREFIX}03`, W(3), {
      createdAtMs: now - 10 * DAY,
      permissionHash: '0xh3',
      permissionCreatedAtMs: now - 10 * DAY,
    })
    const after = await realCountOnboards7d()
    // If created_at (ms) were mis-read as seconds, to_timestamp would land ~year 57000 and R3
    // would count too (delta 3). Correct ms handling excludes R3 → delta 2 reg / 1 done.
    assert.equal(after.reg7d - before.reg7d, 2)
    assert.equal(after.done7d - before.done7d, 1)
  })

  test('realListNewlyDone joins the landed setup row across casing and exposes permissionCreatedAtMs', async ({
    assert,
  }) => {
    const T = 1_750_000_000_000
    await seedRegistry(`${PHONE_PREFIX}10`, W(10), {
      createdAtMs: T,
      permissionHash: '0xhash10',
      permissionCreatedAtMs: T,
      dailyLimit: 50,
    })
    await seedLandedSetup(`${ID_PREFIX}10`, W(10), {
      updatedAtMs: T - 60_000,
      txHash: '0xdeadbeef10',
      userEoa: EOA(10),
    })

    const rows = await realListNewlyDone(T - 1000)
    const row = rows.find((r) => r.account.toLowerCase() === W(10).toLowerCase())
    assert.exists(row, 'the onboard should be returned')
    assert.equal(row!.account, W(10)) // checksummed as stored
    assert.equal(row!.setupTxHash, '0xdeadbeef10') // LATERAL matched despite sender stored lowercase
    assert.equal(row!.userEoa, EOA(10))
    assert.equal(row!.dailyLimit, 50)
    assert.equal(row!.permissionCreatedAtMs, T)
  })

  test('BOUNDARY FIX: a setup landing just before the moving cutoff is still matched', async ({
    assert,
  }) => {
    const T = 1_750_000_000_000
    // permission recorded at T; the setup landed 30m earlier; the rolling cutoff sits BETWEEN them.
    await seedRegistry(`${PHONE_PREFIX}20`, W(20), {
      createdAtMs: T,
      permissionHash: '0xhash20',
      permissionCreatedAtMs: T,
      dailyLimit: 25,
    })
    await seedLandedSetup(`${ID_PREFIX}20`, W(20), {
      updatedAtMs: T - 30 * 60 * 1000,
      txHash: '0xboundary20',
      userEoa: EOA(20),
    })

    // cutoff is AFTER the setup's updated_at but BEFORE permission_created_at. The old query
    // (LATERAL filtered o.updated_at > cutoff) dropped the setup → false missing_setup_row.
    const rows = await realListNewlyDone(T - 15 * 60 * 1000)
    const row = rows.find((r) => r.account.toLowerCase() === W(20).toLowerCase())
    assert.exists(row)
    assert.equal(row!.setupTxHash, '0xboundary20') // anchored to permission_created_at ± tolerance, so matched
  })

  test('a stale prior-onboard setup row (outside the tolerance) is NOT matched', async ({
    assert,
  }) => {
    const T = 1_750_000_000_000
    // A setup that landed 3h before this permission record — older than the ±2h tolerance, so it
    // must NOT be adopted (else it would mask a later legacy fallback). Expect setupTxHash null.
    await seedRegistry(`${PHONE_PREFIX}30`, W(30), {
      createdAtMs: T,
      permissionHash: '0xhash30',
      permissionCreatedAtMs: T,
      dailyLimit: 10,
    })
    await seedLandedSetup(`${ID_PREFIX}30`, W(30), {
      updatedAtMs: T - 3 * 60 * 60 * 1000,
      txHash: '0xstale30',
      userEoa: EOA(30),
    })

    const rows = await realListNewlyDone(T - 1000)
    const row = rows.find((r) => r.account.toLowerCase() === W(30).toLowerCase())
    assert.exists(row, 'the onboard row still appears (the registry side qualifies)')
    assert.isNull(row!.setupTxHash) // stale setup excluded → surfaces as missing_setup_row, as intended
  })

  test('realListNewlyDone excludes an onboard whose permission predates the cutoff', async ({
    assert,
  }) => {
    const T = 1_750_000_000_000
    await seedRegistry(`${PHONE_PREFIX}40`, W(40), {
      createdAtMs: T,
      permissionHash: '0xhash40',
      permissionCreatedAtMs: T - 10 * 60 * 1000,
    })
    const rows = await realListNewlyDone(T) // cutoff after the permission timestamp
    assert.notExists(rows.find((r) => r.account.toLowerCase() === W(40).toLowerCase()))
  })

  test('realHasRefuelEvent matches case-insensitively on the lowercased refuel "user"', async ({
    assert,
  }) => {
    await seedRefuel(`${ID_PREFIX}50`, W(50))
    assert.isTrue(await realHasRefuelEvent(W(50))) // checksummed in → LOWER both sides → hit
    assert.isFalse(await realHasRefuelEvent(W(51))) // never seeded → miss
  })
})
