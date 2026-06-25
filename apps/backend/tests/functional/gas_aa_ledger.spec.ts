/**
 * Gas → AA — ledger integration tests (live Postgres; skipped without a DB or
 * the 0031 migration).
 *
 * Coverage:
 *   - authorized → prepared → landed lifecycle
 *   - P1 partial-unique active-nonce index: two ACTIVE rows can't share a nonce;
 *     a terminal row frees the nonce again
 *   - P1 unique user_op_hash once prepared
 *   - findActiveMatch only matches the full key + not-expired
 *   - P2 sweepExpired expires stale `authorized` rows but leaves `prepared` rows
 *     (broadcast, reconciled elsewhere) untouched
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import {
  insertAuthorized,
  setNonce,
  markPrepared,
  markFailed,
  markLanded,
  getById,
  findActiveMatch,
  sweepExpired,
  type MatchKey,
} from '#services/gas_aa/ledger'
import { ENTRY_POINT_V06 } from '#services/gas_aa/config'

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

function matchKey(over: Partial<MatchKey> = {}): MatchKey {
  return {
    chainId: CHAIN,
    entryPoint: EP,
    sender: SENDER,
    senderNonce: '9',
    callsHash: CALLS_HASH,
    decodedUser: USER,
    capBucket: CAP,
    ...over,
  }
}

test.group('gas_aa ledger | lifecycle', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    await clean()
  })
  group.teardown(async () => {
    if (await isDbAvailable()) await clean()
  })

  test('authorized → prepared → landed', async ({ assert }) => {
    const id = await insertAuthorized(authParams())
    let row = await getById(id)
    assert.equal(row!.status, 'authorized')
    assert.isNull(row!.senderNonce)

    await setNonce(id, '3')
    await markPrepared(id, '0x' + '11'.repeat(32), { sender: SENDER, nonce: '0x3' })
    row = await getById(id)
    assert.equal(row!.status, 'prepared')
    assert.equal(row!.senderNonce, '3')
    assert.isNotNull(row!.signedUserOp)

    await markLanded(id, '0xtx')
    row = await getById(id)
    assert.equal(row!.status, 'landed')
  })
})

test.group('gas_aa ledger | nonce uniqueness (P1)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    await clean()
  })
  group.teardown(async () => {
    if (await isDbAvailable()) await clean()
  })

  test('two ACTIVE rows cannot share a nonce; a terminal row frees it', async ({ assert }) => {
    const a = await insertAuthorized(authParams())
    const b = await insertAuthorized(authParams())
    await setNonce(a, '7')
    // Second active row on the same (chain, ep, sender, nonce) is rejected.
    await assert.rejects(() => setNonce(b, '7'))

    // Make A terminal → the nonce is no longer held by an active row.
    await markFailed(a)
    const c = await insertAuthorized(authParams())
    await setNonce(c, '7') // now allowed
    assert.equal((await getById(c))!.senderNonce, '7')
  })
})

test.group('gas_aa ledger | unique user_op_hash (P1)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    await clean()
  })
  group.teardown(async () => {
    if (await isDbAvailable()) await clean()
  })

  test('the same user_op_hash cannot be prepared twice', async ({ assert }) => {
    const hash = '0x' + 'cd'.repeat(32)
    const a = await insertAuthorized(authParams())
    const b = await insertAuthorized(authParams())
    await setNonce(a, '1')
    await setNonce(b, '2')
    await markPrepared(a, hash, { v: 1 })
    await assert.rejects(() => markPrepared(b, hash, { v: 2 }))
  })
})

test.group('gas_aa ledger | findActiveMatch + expiry (P2)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    await clean()
  })
  group.teardown(async () => {
    if (await isDbAvailable()) await clean()
  })

  test('matches only on the full key', async ({ assert }) => {
    const id = await insertAuthorized(authParams())
    await setNonce(id, '9')

    assert.isNotNull(await findActiveMatch(matchKey()))
    assert.isNull(await findActiveMatch(matchKey({ senderNonce: '10' })))
    assert.isNull(await findActiveMatch(matchKey({ callsHash: '0x' + 'ff'.repeat(32) })))
    assert.isNull(
      await findActiveMatch(matchKey({ decodedUser: '0x9999999999999999999999999999999999999999' }))
    )
    assert.isNull(await findActiveMatch(matchKey({ capBucket: 'acct:other' })))
  })

  test('an expired row does not match and is swept', async ({ assert }) => {
    const id = await insertAuthorized(authParams({ expiresInMinutes: -1 }))
    await setNonce(id, '9')
    // Already past expiry → not sponsorable.
    assert.isNull(await findActiveMatch(matchKey()))

    const swept = await sweepExpired()
    assert.include(swept, id)
    assert.equal((await getById(id))!.status, 'expired')
  })
})

test.group('gas_aa ledger | sweep targets authorized only (P2)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa table not migrated')
      return
    }
    await clean()
  })
  group.teardown(async () => {
    if (await isDbAvailable()) await clean()
  })

  test('a stale authorized row expires; a stale prepared row survives the sweep', async ({
    assert,
  }) => {
    // Stale AUTHORIZED (reserved a nonce, never broadcast) → expired, releasing it.
    const auth = await insertAuthorized(authParams({ expiresInMinutes: -1 }))
    await setNonce(auth, '8')

    // PREPARED past its short expiry (broadcast, holds a real on-chain nonce) →
    // must NOT be swept; the reconciler settles it to its true outcome instead.
    const prep = await insertAuthorized(authParams({ expiresInMinutes: -1 }))
    await setNonce(prep, '9')
    await markPrepared(prep, '0x' + 'ee'.repeat(32), { v: 1 })

    const swept = await sweepExpired()
    assert.include(swept, auth)
    assert.notInclude(swept, prep)
    assert.equal((await getById(auth))!.status, 'expired')
    assert.equal((await getById(prep))!.status, 'prepared')
  })
})
