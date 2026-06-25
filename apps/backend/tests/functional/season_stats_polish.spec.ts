/**
 * Season 1 — stats & UX polish: behavioral proof of the RELAY-AWARE value source
 * (DB-backed). This is the corrected model after the audit found that naively
 * excluding every spender-touching row erased the core send path.
 *
 * SpendPermission batches every embedded send into ONE tx of two USDC legs:
 * user→spender (pull) then spender→recipient (forward), same tx_hash and amount
 * (embedded_wallet.service). Off-ramp pulls are user→spender→spender. So the seed
 * below is prod-shaped: relayed sends (two legs), direct transfers (inflows /
 * P2P), an operator leg, a self-transfer, sub-$1 dust, and a completed off-ramp.
 * It asserts:
 *
 *   • DASHBOARD value-out COLLAPSES each relay pair into one user→recipient send
 *     and INCLUDES it (the core path), plus completed off-ramps from offramp_orders,
 *     while excluding operator/self/spender recipients and the unverified-sender
 *     on-ramp. → transactedVolume + MAW are the believable proof numbers.
 *   • The onchain-transactions count is one-per-logical-transfer (relay collapsed),
 *     excludes operator legs / self-transfers / dust, and (being inflows-inclusive)
 *     is labelled "transfers" not "sends".
 *   • SCORE engine (strict) is untouched: it still reads RAW onchain.transfer and
 *     so a relayed-only sender is NOT strictly isActive even though it's in MAW.
 *   • The live feed shows each logical transfer ONCE, with no spender/operator rows.
 *
 * Skipped if no local Postgres (same pattern as season_onramp.spec.ts).
 */

import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import '#types/container'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import {
  transactedVolume,
  maw,
  isActive,
  distinctVerifiedCounterparties,
  onchainTransactionCount,
  trailing,
  getSpenderAddress,
} from '#season/definitions'

const NOW = 2_000_000_000 // distinctly-recent epoch so feed rows sort to the top
const DAY = 86_400

// Distinctive addresses so the rest of the suite's seeds never collide.
const V1 = '0xdda1000000000000000000000000000000000001' // verified sender (relayed-only)
const V2 = '0xdda1000000000000000000000000000000000002' // verified sender (has a direct verified send)
const EXT = '0xdda1000000000000000000000000000000000003' // external, NON-Sippy
const EXT2 = '0xdda1000000000000000000000000000000000005' // external, NON-Sippy
const OP = '0xdda1000000000000000000000000000000000004' // operator float wallet
const SP = getSpenderAddress() // the spender (SIPPY_SPENDER_ADDRESS, .env.test)

const PHONES = ['+15550990001', '+15550990002']
const EVENT_SLUG = 'season-polish-evt'
const OP_EMAIL = 'polish-operator@example.test'
const OFFRAMP_ID = '00000000-0000-0000-0000-0000000000d1'

// All seeded onchain.transfer ids (relay sends are TWO legs sharing one tx_hash).
const TX_IDS = [
  'tx-r1-0',
  'tx-r1-1',
  'tx-r2-0',
  'tx-r2-1',
  'tx-d1-0',
  'tx-d2-0',
  'tx-in-0',
  'tx-op-0',
  'tx-self-0',
  'tx-dust-0',
  'tx-offramp-0',
  'tx-offramp-1',
]

async function seedWallet(phone: string, address: string) {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, last_reset_date)
     VALUES ($1, $2, $3, $4, $4, '2026-06-23')
     ON CONFLICT (phone_number) DO NOTHING`,
    [phone, `polish-${address.slice(2, 8)}`, address, NOW * 1000]
  )
}

/** Seed one ERC-20 Transfer log. Relay legs pass the SHARED txHash explicitly. */
async function seedTransfer(
  id: string,
  from: string,
  to: string,
  amount: string,
  ts: number,
  txHash: string = id
) {
  await query(
    `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
     VALUES ($1, $2, $3, $4::numeric, $5, 1, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, from, to, amount, ts, txHash]
  )
}

async function seedOperator() {
  await query(`INSERT INTO events (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`, [
    EVENT_SLUG,
    'Polish Test Event',
  ])
  const adm = await query<{ id: number }>(
    `INSERT INTO admin_users (email, password, role, created_at, updated_at)
     VALUES ($1, 'x', 'viewer', now(), now()) RETURNING id`,
    [OP_EMAIL]
  )
  await query(
    `INSERT INTO event_operator_wallets
       (event_slug, operator_user_id, wallet_address, cdp_account_name, cdp_owner_name, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (event_slug) DO NOTHING`,
    [EVENT_SLUG, adm.rows[0].id, OP, 'polish-op-acct', 'polish-op-owner']
  )
}

/** A completed off-ramp for V1 — value-out sourced from offramp_orders, NOT chain. */
async function seedOfframp(amountUsdc: string, ts: number) {
  await query(
    `INSERT INTO offramp_orders
       (id, phone_number, external_id, bank_account_id, amount_usdc, status, pull_tx_hash, updated_at)
     VALUES ($1, $2, $3, 1, $4::numeric, 'completed', 'offramp-pull-1', to_timestamp($5))
     ON CONFLICT (id) DO NOTHING`,
    [OFFRAMP_ID, PHONES[0], 'polish-offramp-ext-1', amountUsdc, ts]
  )
}

/** The prod-shaped ledger shared by both groups. */
async function seedLedger() {
  await seedWallet(PHONES[0], V1)
  await seedWallet(PHONES[1], V2)
  await seedOperator()
  // Relayed send V1→EXT $100 (one tx, two legs).
  await seedTransfer('tx-r1-0', V1, SP, '100000000', NOW - 6 * DAY, 'tx-r1')
  await seedTransfer('tx-r1-1', SP, EXT, '100000000', NOW - 6 * DAY, 'tx-r1')
  // Relayed send V1→V2 $50 (verified recipient, still via the spender).
  await seedTransfer('tx-r2-0', V1, SP, '50000000', NOW - 5 * DAY, 'tx-r2')
  await seedTransfer('tx-r2-1', SP, V2, '50000000', NOW - 5 * DAY, 'tx-r2')
  // Direct send V2→EXT2 $25 (no spender leg).
  await seedTransfer('tx-d1-0', V2, EXT2, '25000000', NOW - 4 * DAY, 'tx-d1')
  // Direct verified P2P V2→V1 $15 — the strict score engine CAN see this one.
  await seedTransfer('tx-d2-0', V2, V1, '15000000', NOW - 4 * DAY, 'tx-d2')
  // On-ramp inflow EXT→V1 $200 (unverified sender; a transfer, not a value-out).
  await seedTransfer('tx-in-0', EXT, V1, '200000000', NOW - 7 * DAY, 'tx-in')
  // Operator leg, self-transfer, dust — all excluded from value-out + the count.
  await seedTransfer('tx-op-0', V1, OP, '30000000', NOW - 3 * DAY, 'tx-op')
  await seedTransfer('tx-self-0', V1, V1, '20000000', NOW - 2 * DAY, 'tx-self')
  await seedTransfer('tx-dust-0', V1, EXT, '500000', NOW - 1 * DAY, 'tx-dust')
  // Off-ramp pull on-chain = V1→spender→spender (recipient resolves to spender →
  // dropped by the collapse). The value-out is sourced from offramp_orders below.
  await seedTransfer('tx-offramp-0', V1, SP, '40000000', NOW - 1 * DAY, 'tx-offramp')
  await seedTransfer('tx-offramp-1', SP, SP, '40000000', NOW - 1 * DAY, 'tx-offramp')
  await seedOfframp('40', NOW - 1 * DAY)
}

async function cleanup() {
  await query('DELETE FROM onchain.transfer WHERE id = ANY($1::text[])', [TX_IDS])
  await query('DELETE FROM offramp_orders WHERE id = $1', [OFFRAMP_ID])
  await query('DELETE FROM event_operator_wallets WHERE event_slug = $1', [EVENT_SLUG])
  await query('DELETE FROM admin_users WHERE email = $1', [OP_EMAIL])
  await query('DELETE FROM events WHERE slug = $1', [EVENT_SLUG])
  await query('DELETE FROM phone_registry WHERE phone_number = ANY($1::text[])', [PHONES])
}

async function resetThrottle() {
  const rls = await app.container.make('rateLimitService')
  rls.resetIpThrottle()
}

test.group('Season stats polish | relay-aware value source (DB)', (group) => {
  let ok = false

  group.setup(async () => {
    if (!(await isDbAvailable())) return
    ok = true
  })
  group.each.setup(async (t) => {
    if (!ok || !SP) {
      t.skip(true, !SP ? 'No spender configured' : 'No local DB')
      return
    }
    await cleanup()
    await seedLedger()
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('value-out COLLAPSES relay pairs + counts off-ramps; excludes operator/self/spender/dust', async ({
    assert,
  }) => {
    // $100 (V1→EXT relayed) + $50 (V1→V2 relayed) + $25 (V2→EXT2 direct) + $15
    // (V2→V1 direct P2P) + $40 (V1 off-ramp) = $230. NOT the $200 inflow (external
    // sender), the $30 operator, the $20 self, or the $0.50 dust — and the relayed
    // sends each count ONCE, not as two spender legs.
    assert.equal(await transactedVolume(), '230000000')
  })

  test('MAW counts the relayed-send and off-ramp senders (loose value-out)', async ({ assert }) => {
    // V1 (relayed sends + off-ramp) and V2 (direct sends) both moved value out.
    assert.equal(await maw(trailing(30, NOW)), 2)
  })

  test('onchain transaction count is one-per-logical-transfer (relay collapsed), no plumbing/dust', async ({
    assert,
  }) => {
    // The 5 logical transfers ≥ $1, neither side an operator, not self:
    //   V1→EXT, V1→V2 (relays collapsed), V2→EXT2, V2→V1, EXT→V1 (inflow).
    // Excludes the operator leg, the self-transfer, the dust, and every spender
    // relay leg + the off-ramp legs.
    assert.equal(await onchainTransactionCount(), 5)
  })

  test('THE SPLIT: a relayed-only sender is in MAW but NOT strictly isActive (score engine untouched)', async ({
    assert,
  }) => {
    // V1's only verified-recipient send (V1→V2) is RELAYED — invisible to the strict
    // score engine, which still reads raw onchain.transfer (V1→spender is unverified).
    assert.isFalse(await isActive(V1, trailing(30, NOW)))
    // V2 has a DIRECT verified send (V2→V1) the strict engine can see → active.
    assert.isTrue(await isActive(V2, trailing(30, NOW)))
    // Strict counterparties likewise: V1 reaches no verified recipient directly; V2 reaches V1.
    assert.equal(await distinctVerifiedCounterparties(V1), 0)
    assert.equal(await distinctVerifiedCounterparties(V2), 1)
  })
})

test.group('Season stats polish | live feed collapses relay legs (DB)', (group) => {
  let ok = false

  group.setup(async () => {
    if (!(await isDbAvailable())) return
    ok = true
  })
  group.each.setup(async (t) => {
    if (!ok || !SP) {
      t.skip(true, !SP ? 'No spender configured' : 'No local DB')
      return
    }
    await resetThrottle()
    await cleanup()
    await seedLedger()
  })
  group.teardown(async () => {
    if (ok) await cleanup()
  })

  test('each logical transfer shows ONCE; no spender/operator rows, no self/dust', async ({
    client,
    assert,
  }) => {
    // This group only runs when Postgres IS available (each.setup skips otherwise),
    // so a non-200 here is a real failure, not a missing-DB skip.
    const res = await client.get('/api/season/transactions').qs({ limit: 100 })
    assert.equal(res.status(), 200)
    const rows = (
      res.body() as {
        transactions: { transferId: string; from: string; to: string; usd: number }[]
      }
    ).transactions
    const mine = rows.filter((t) => TX_IDS.includes(t.transferId))

    // The 5 logical transfers, each ONCE — keyed by the user-leg id for relays.
    assert.deepEqual(mine.map((t) => t.transferId).sort(), [
      'tx-d1-0',
      'tx-d2-0',
      'tx-in-0',
      'tx-r1-0',
      'tx-r2-0',
    ])
    // The spender forward legs and off-ramp legs never surface as their own rows.
    for (const ghost of [
      'tx-r1-1',
      'tx-r2-1',
      'tx-offramp-0',
      'tx-offramp-1',
      'tx-op-0',
      'tx-self-0',
      'tx-dust-0',
    ]) {
      assert.notInclude(
        mine.map((t) => t.transferId),
        ghost
      )
    }

    const maskedSpender = SP.length <= 10 ? SP : `${SP.slice(0, 6)}…${SP.slice(-4)}`
    const maskedOp = `${OP.slice(0, 6)}…${OP.slice(-4)}`
    for (const tx of mine) {
      assert.notEqual(tx.from, maskedSpender)
      assert.notEqual(tx.to, maskedSpender)
      assert.notEqual(tx.from, maskedOp)
      assert.notEqual(tx.to, maskedOp)
      assert.isAtLeast(tx.usd, 1) // sub-$1 dust excluded
    }
  })
})
