/**
 * Gas → AA — durability reconciler integration tests (live Postgres; skipped
 * without a DB or the 0031 migration).
 *
 * Proves the crash-recovery sweep (P1):
 *   - a stuck `prepared` op (owning request died after markPrepared) is
 *     rebroadcast + settled to `landed`;
 *   - a stale `authorized` row (reserved a nonce, never broadcast) is expired,
 *     releasing the nonce;
 *   - a `prepared` op past its short expiry but recently touched is NEITHER
 *     swept (it was broadcast) NOR prematurely reconciled (still within grace).
 *
 * The submitter's network deps are faked (getByHash + waitReceipt) so
 * reconcilePrepared settles without RPC; the REAL ledger drives the row writes.
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { ENTRY_POINT_V06 } from '#services/gas_aa/config'
import { insertAuthorized, setNonce, markPrepared } from '#services/gas_aa/ledger'
import { reconcileGasAaOnce } from '#services/gas_aa/reconcile'
import { __setDepsForTest, __resetDeps } from '#services/gas_aa/off_cdp_submitter'

const CHAIN = 42161
const EP = ENTRY_POINT_V06
const SENDER = '0x1111111111111111111111111111111111111111'
const USER = '0x2222222222222222222222222222222222222222'
const CALLS_HASH = '0x' + 'ab'.repeat(32)
const CAP = `acct:${USER.toLowerCase()}`

async function ensureSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM gas_aa_prepared_user_ops LIMIT 0')
    return true
  } catch {
    return false
  }
}
async function clean(): Promise<void> {
  await query(`DELETE FROM gas_aa_prepared_user_ops WHERE sender = $1`, [SENDER.toLowerCase()])
}
function authParams(over: Partial<Parameters<typeof insertAuthorized>[0]> = {}) {
  return {
    lane: 'free_send',
    sender: SENDER,
    decodedUser: USER,
    chainId: CHAIN,
    entryPoint: EP,
    callsHash: CALLS_HASH,
    capBucket: CAP,
    ...over,
  }
}
async function statusOf(id: string): Promise<string> {
  const r = await query(`SELECT status FROM gas_aa_prepared_user_ops WHERE id = $1`, [id])
  return r.rows[0]?.status
}

test.group('gas_aa reconcile', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    // Fake the network so reconcilePrepared settles without RPC; real ledger writes.
    __setDepsForTest({
      getByHash: async () => true, // already known → no rebroadcast needed
      waitReceipt: async () => ({ success: true, transactionHash: '0xtx' }),
    })
    await clean()
  })
  group.each.teardown(async () => {
    __resetDeps()
    if (await isDbAvailable()) await clean()
  })

  test('recovers a stuck prepared op, expires a stale authorized row, leaves a fresh prepared op', async ({
    assert,
  }) => {
    // (1) stuck prepared op — backdate updated_at past the 120s grace.
    const stuck = await insertAuthorized(authParams())
    await setNonce(stuck, '9')
    await markPrepared(stuck, '0x' + '11'.repeat(32), { signed: 'op-stuck' })
    await query(
      `UPDATE gas_aa_prepared_user_ops SET updated_at = NOW() - interval '5 minutes' WHERE id = $1`,
      [stuck]
    )

    // (2) stale authorized row — nonce reserved, past expiry, never broadcast.
    const stale = await insertAuthorized(authParams({ expiresInMinutes: -1 }))
    await setNonce(stale, '8')

    // (3) fresh prepared op — past its short expiry but just touched.
    const fresh = await insertAuthorized(authParams({ expiresInMinutes: -1 }))
    await setNonce(fresh, '7')
    await markPrepared(fresh, '0x' + '22'.repeat(32), { signed: 'op-fresh' })

    const res = await reconcileGasAaOnce()

    // stuck → landed; stale → expired; fresh → untouched (broadcast + within grace).
    assert.equal(await statusOf(stuck), 'landed')
    assert.equal(await statusOf(stale), 'expired')
    assert.equal(await statusOf(fresh), 'prepared')
    assert.isAtLeast(res.reconciled, 1)
    assert.isAtLeast(res.swept, 1)
  })
})
