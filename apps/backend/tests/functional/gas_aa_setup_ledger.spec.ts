/**
 * Gas → AA Track B (B1.1a) — setup-lane ledger tests (live Postgres; skipped
 * without a DB or the 0032 migration).
 *
 * Covers the genuinely-new money-path surface — the `awaiting_signature` state that
 * holds a nonce while the browser signs:
 *   - setup lifecycle authorized → awaiting_signature → prepared → landed
 *   - `awaiting_signature` is NONCE-ACTIVE: a 2nd op can't reuse the nonce; maxActiveNonce sees it
 *   - cancel ↔ submit MUTUAL EXCLUSION (the anti-double-grant guard)
 *   - abandoned-after-prepare reclaim: a stale `awaiting_signature` is swept, freeing the nonce
 *   - findActiveMatch binds `init_code_hash` for the setup lane
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import {
  insertAuthorized,
  setNonce,
  getById,
  markLanded,
  maxActiveNonce,
  markAwaitingSignature,
  cancelSetupOp,
  markPreparedFromAwaitingSignature,
  findActiveMatch,
  findResumableSetupOp,
  findInFlightSetupOp,
  sweepExpired,
  type MatchKey,
} from '#services/gas_aa/ledger'
import { ENTRY_POINT_V06 } from '#services/gas_aa/config'

const CHAIN = 42161
const EP = ENTRY_POINT_V06
const SENDER = '0x3333333333333333333333333333333333333333' // setup: sender == user account
const USER_EOA = '0x4444444444444444444444444444444444444444'
const INIT = '0x' + 'cc'.repeat(32)
const CALLS_HASH = '0x' + 'ab'.repeat(32)
const CAP = `acct:${SENDER.toLowerCase()}`
const UOH = '0x' + '11'.repeat(32)

async function hasSetupSchema(): Promise<boolean> {
  try {
    await query(
      'SELECT init_code_hash, unsigned_user_op, user_eoa FROM gas_aa_prepared_user_ops LIMIT 0'
    )
    return true
  } catch {
    return false
  }
}
async function clean(): Promise<void> {
  await query(`DELETE FROM gas_aa_prepared_user_ops WHERE sender = $1`, [SENDER.toLowerCase()])
}

function setupAuth(over: Partial<Parameters<typeof insertAuthorized>[0]> = {}) {
  return {
    lane: 'setup',
    sender: SENDER,
    decodedUser: SENDER, // permission.account == sender for setup
    chainId: CHAIN,
    entryPoint: EP,
    callsHash: CALLS_HASH,
    capBucket: CAP,
    initCodeHash: INIT,
    ...over,
  }
}
function setupMatch(over: Partial<MatchKey> = {}): MatchKey {
  return {
    chainId: CHAIN,
    entryPoint: EP,
    sender: SENDER,
    senderNonce: '0',
    callsHash: CALLS_HASH,
    decodedUser: SENDER,
    capBucket: CAP,
    initCodeHash: INIT,
    ...over,
  }
}
const AWAIT = {
  userOpHash: UOH,
  unsignedUserOp: { sender: SENDER, nonce: '0x0' },
  userEoa: USER_EOA,
}

function dbGroup(name: string, register: () => void) {
  test.group(name, (group) => {
    group.each.setup(async (t) => {
      if (!(await isDbAvailable()) || !(await hasSetupSchema())) {
        t.skip(true, 'No local DB / 0032 not migrated')
        return
      }
      await clean()
    })
    group.teardown(async () => {
      if (await isDbAvailable()) await clean()
    })
    register()
  })
}

dbGroup('gas_aa setup ledger | lifecycle', () => {
  test('authorized → awaiting_signature → prepared → landed', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    let row = await getById(id)
    assert.equal(row!.status, 'authorized')
    assert.equal(row!.initCodeHash, INIT.toLowerCase())

    await markAwaitingSignature(id, AWAIT)
    row = await getById(id)
    assert.equal(row!.status, 'awaiting_signature')
    assert.equal(row!.userOpHash, UOH.toLowerCase()) // user_op_hash IS the hashToSign
    assert.isNotNull(row!.unsignedUserOp)
    assert.equal(row!.userEoa, USER_EOA.toLowerCase())
    assert.isNull(row!.signedUserOp) // no signed op yet — fallback-eligible

    const flipped = await markPreparedFromAwaitingSignature(id, {
      sender: SENDER,
      signature: '0xsig',
    })
    assert.isTrue(flipped)
    row = await getById(id)
    assert.equal(row!.status, 'prepared')
    assert.isNotNull(row!.signedUserOp)

    await markLanded(id, '0xtx')
    assert.equal((await getById(id))!.status, 'landed')
  })
})

dbGroup('gas_aa setup ledger | awaiting_signature is nonce-active', () => {
  test('a 2nd op cannot reuse the nonce; maxActiveNonce sees it; cancel frees it', async ({
    assert,
  }) => {
    const a = await insertAuthorized(setupAuth())
    await setNonce(a, '0')
    await markAwaitingSignature(a, AWAIT) // awaiting_signature, still holds nonce 0

    assert.equal(await maxActiveNonce(CHAIN, EP, SENDER), 0n)

    const b = await insertAuthorized(setupAuth())
    await assert.rejects(() => setNonce(b, '0')) // widened active-nonce index rejects it

    assert.isTrue(await cancelSetupOp(a)) // terminalize → nonce freed
    assert.isNull(await maxActiveNonce(CHAIN, EP, SENDER))
    await setNonce(b, '0') // now allowed
    assert.equal((await getById(b))!.senderNonce, '0')
  })
})

dbGroup('gas_aa setup ledger | cancel ↔ submit mutual exclusion', () => {
  test('cancel wins → submit is rejected (no double-grant)', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    assert.isTrue(await cancelSetupOp(id)) // fallback won the row
    assert.isFalse(await markPreparedFromAwaitingSignature(id, { x: 1 })) // submit loses → NO broadcast
    assert.equal((await getById(id))!.status, 'cancelled')
  })

  test('submit wins → cancel is rejected (legacy must not run)', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    assert.isTrue(await markPreparedFromAwaitingSignature(id, { x: 1 })) // committed
    assert.isFalse(await cancelSetupOp(id)) // cancel loses → legacy must NOT run
    assert.equal((await getById(id))!.status, 'prepared')
  })
})

dbGroup('gas_aa setup ledger | abandoned-after-prepare reclaim', () => {
  test('a stale awaiting_signature op is swept, freeing the nonce', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth({ expiresInMinutes: -1 }))
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT) // sponsored; browser never returned
    assert.isNull(await findActiveMatch(setupMatch())) // past expiry → not sponsorable

    const swept = await sweepExpired()
    assert.include(swept, id)
    assert.equal((await getById(id))!.status, 'expired')
    assert.isNull(await maxActiveNonce(CHAIN, EP, SENDER)) // nonce released for a retry / legacy fallback
  })
})

dbGroup('gas_aa setup ledger | init_code_hash binding', () => {
  test('findActiveMatch binds init_code_hash for the setup lane', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    assert.isNotNull(await findActiveMatch(setupMatch())) // correct hash matches
    assert.isNull(await findActiveMatch(setupMatch({ initCodeHash: '0x' + 'dd'.repeat(32) }))) // wrong hash
    assert.isNull(await findActiveMatch(setupMatch({ initCodeHash: null }))) // a free-send-style key (no hash) can't match a setup row
  })
})

// B1.1d redline #5 — idempotent /prepare resumes an existing awaiting_signature op.
dbGroup('gas_aa setup ledger | resumable setup op', () => {
  test('returns the awaiting_signature op for a sender (its unsigned op + hash)', async ({
    assert,
  }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    const r = await findResumableSetupOp(CHAIN, EP, SENDER)
    assert.isNotNull(r)
    assert.equal(r!.id, id)
    assert.equal(r!.userOpHash, UOH)
    assert.deepEqual(r!.unsignedUserOp, AWAIT.unsignedUserOp)
  })

  test('an authorized (pre-signature) op is NOT resumable', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0') // still authorized — no sponsored unsigned op yet
    assert.isNull(await findResumableSetupOp(CHAIN, EP, SENDER))
  })

  test('an expired awaiting_signature op is NOT resumable', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth({ expiresInMinutes: -1 }))
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    assert.isNull(await findResumableSetupOp(CHAIN, EP, SENDER))
  })
})

// B1.1d in-flight guard — a `prepared` (broadcasting) op blocks a 2nd /prepare.
dbGroup('gas_aa setup ledger | in-flight setup op', () => {
  test('a prepared (broadcast) op is in-flight; an awaiting_signature op is NOT', async ({
    assert,
  }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    // awaiting_signature = resumable, not yet broadcast → not in-flight
    assert.isNull(await findInFlightSetupOp(CHAIN, EP, SENDER))
    // flip to prepared (signed + broadcast)
    await markPreparedFromAwaitingSignature(id, {
      sender: SENDER,
      nonce: '0x0',
      signature: '0xsig',
    })
    const r = await findInFlightSetupOp(CHAIN, EP, SENDER)
    assert.isNotNull(r)
    assert.equal(r!.id, id)
  })

  test('a landed op is no longer in-flight', async ({ assert }) => {
    const id = await insertAuthorized(setupAuth())
    await setNonce(id, '0')
    await markAwaitingSignature(id, AWAIT)
    await markPreparedFromAwaitingSignature(id, { sender: SENDER, nonce: '0x0' })
    assert.isNotNull(await findInFlightSetupOp(CHAIN, EP, SENDER)) // prepared = in-flight
    await markLanded(id, '0xtx')
    assert.isNull(await findInFlightSetupOp(CHAIN, EP, SENDER)) // landed = terminal
  })
})
