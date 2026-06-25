/**
 * Gas → AA — OffCdpSubmitter safety unit tests (no DB, no RPC).
 *
 * The money-path invariants, exercised with an injected in-memory ledger + fake
 * engine:
 *   • happy path → persist (markPrepared) BEFORE send, then land sponsored;
 *   • nonce = max(on-chain, in-flight high-water + 1) — cross-process safe;
 *   • active-nonce collision → bounded retry (NOT legacy); exhaustion → terminal
 *     NonceContentionError with no broadcast and no legacy;
 *   • a NON-collision pre-broadcast failure → legacy fallback exactly once, NO send;
 *   • post-prepare crash → idempotent rebroadcast of the IDENTICAL signed op,
 *     never legacy, never a rebuild;
 *   • a confirmed revert is terminal (failed), never reconciled, never legacy.
 */

import { test } from '@japa/runner'
import {
  submitFreeSend,
  __setDepsForTest,
  __resetDeps,
  type SubmitterDeps,
  type FreeSendRequest,
} from '#services/gas_aa/off_cdp_submitter'

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SPENDER = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x3333333333333333333333333333333333333333'

interface Harness {
  deps: SubmitterDeps
  events: string[]
  sentOps: Record<string, unknown>[]
  legacyCalls: number[]
  rows: Map<string, any>
  setNonceArgs: string[]
  req: FreeSendRequest
}

interface Opts {
  insertAuthorizedThrows?: boolean // authorize fails at step 0 (e.g. missing table)
  markFailedThrows?: boolean // markFailed itself fails (the DB is the problem)
  markLandedThrows?: boolean // markLanded fails AFTER a successful receipt

  setNonceThrows?: boolean // generic (non-collision) error → pre-broadcast fallback
  setNonceCollideTimes?: number // throw 23505 N times, then succeed (retry path)
  setNonceAlwaysCollide?: boolean // always 23505 → exhaustion → NonceContentionError
  maxActiveNonce?: bigint | null // in-flight high-water mark
  onChainNonce?: bigint
  prepareThrows?: boolean
  sendFailsFirst?: boolean
  sendAlwaysFails?: boolean
  receiptSuccess?: boolean
  knownOnBundler?: boolean
}

/** A Postgres-style unique-violation error (active-nonce index collision). */
function collisionError(): Error {
  const e: any = new Error(
    'duplicate key value violates unique constraint "uniq_gas_aa_active_nonce"'
  )
  e.code = '23505'
  return e
}

function makeHarness(opts: Opts = {}): Harness {
  const events: string[] = []
  const sentOps: Record<string, unknown>[] = []
  const legacyCalls: number[] = []
  const rows = new Map<string, any>()
  const setNonceArgs: string[] = []
  let seq = 0
  let sendCount = 0
  let setNonceCount = 0

  const RPC_OP = { sender: SPENDER, nonce: '0x5', signature: '0xsig', callData: '0xcd' }

  const ledger: SubmitterDeps['ledger'] = {
    insertAuthorized: async (p: any) => {
      if (opts.insertAuthorizedThrows) {
        throw new Error('relation "gas_aa_prepared_user_ops" does not exist')
      }
      const id = `op_${++seq}`
      rows.set(id, { id, status: 'authorized', signedUserOp: null, userOpHash: null, ...p })
      events.push('insertAuthorized')
      return id
    },
    maxActiveNonce: async () => opts.maxActiveNonce ?? null,
    setNonce: async (id: string, n: string) => {
      setNonceCount++
      setNonceArgs.push(n)
      if (opts.setNonceThrows) throw new Error('no authorized row (advanced/expired)')
      if (opts.setNonceAlwaysCollide) throw collisionError()
      if (opts.setNonceCollideTimes && setNonceCount <= opts.setNonceCollideTimes) {
        throw collisionError()
      }
      events.push('setNonce')
      rows.get(id).senderNonce = n
    },
    markPrepared: async (id: string, hash: string, op: Record<string, unknown>) => {
      events.push('markPrepared')
      const r = rows.get(id)
      r.status = 'prepared'
      r.userOpHash = hash
      r.signedUserOp = op
    },
    markLanded: async (id: string) => {
      if (opts.markLandedThrows) throw new Error('markLanded DB error')
      events.push('markLanded')
      rows.get(id).status = 'landed'
    },
    markFailed: async (id: string) => {
      if (opts.markFailedThrows) throw new Error('markFailed DB error')
      events.push('markFailed')
      const r = rows.get(id)
      if (r) r.status = 'failed'
    },
    getById: async (id: string) => rows.get(id) ?? null,
  }

  const deps: SubmitterDeps = {
    resolveNonce: async () => opts.onChainNonce ?? 5n,
    prepareAndSign: async () => {
      if (opts.prepareThrows) throw new Error('sponsor failed (pre-broadcast)')
      events.push('prepareAndSign')
      return { rpcOp: RPC_OP, userOpHash: '0xhash' }
    },
    sendRaw: async (op: Record<string, unknown>) => {
      sendCount++
      sentOps.push(op)
      events.push('sendRaw')
      if (opts.sendAlwaysFails) throw new Error('bundler down')
      if (opts.sendFailsFirst && sendCount === 1) throw new Error('bundler hiccup')
      return '0xhash'
    },
    waitReceipt: async () => ({ success: opts.receiptSuccess ?? true, transactionHash: '0xtx' }),
    getByHash: async () => opts.knownOnBundler ?? false,
    ledger,
  }

  const req: FreeSendRequest = {
    fromPhoneNumber: '+15550001111',
    userWalletAddress: ACCOUNT,
    permission: {
      account: ACCOUNT,
      spender: SPENDER,
      token: USDC,
      allowance: 1_000_000n,
      period: 86_400,
      start: 1_700_000_000,
      end: 1_800_000_000,
      salt: 0n,
      extraData: '0x',
    },
    recipient: RECIPIENT,
    amountUnits: 250_000n,
    spenderAddress: SPENDER,
    usdcAddress: USDC,
    legacySend: async () => {
      legacyCalls.push(1)
      return { transactionHash: '0xLEGACY', userOpHash: '0xlu' }
    },
  }

  return { deps, events, sentOps, legacyCalls, rows, setNonceArgs, req }
}

test.group('gas_aa submitter | happy path', (group) => {
  group.each.teardown(() => __resetDeps())

  test('persists BEFORE send, then lands sponsored', async ({ assert }) => {
    const h = makeHarness()
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)

    assert.isTrue(out.sponsored)
    assert.equal(out.transactionHash, '0xtx')
    assert.isBelow(h.events.indexOf('markPrepared'), h.events.indexOf('sendRaw'))
    assert.isNotNull(out.preparedOpId)
    assert.equal(h.rows.get(out.preparedOpId!).status, 'landed')
    assert.lengthOf(h.legacyCalls, 0)
    assert.lengthOf(h.sentOps, 1)
  })
})

test.group('gas_aa submitter | nonce allocation', (group) => {
  group.each.teardown(() => __resetDeps())

  test('claims max(on-chain, in-flight high-water + 1)', async ({ assert }) => {
    // in-flight row already holds nonce 9, on-chain still reads 5 → next is 10.
    const h = makeHarness({ maxActiveNonce: 9n, onChainNonce: 5n })
    __setDepsForTest(h.deps)
    await submitFreeSend(h.req)
    assert.equal(h.setNonceArgs[0], '10')
  })

  test('uses the on-chain nonce when it is ahead of the DB high-water', async ({ assert }) => {
    const h = makeHarness({ maxActiveNonce: 9n, onChainNonce: 20n })
    __setDepsForTest(h.deps)
    await submitFreeSend(h.req)
    assert.equal(h.setNonceArgs[0], '20')
  })

  test('active-nonce collision retries (NOT legacy) then succeeds', async ({ assert }) => {
    const h = makeHarness({ setNonceCollideTimes: 2 }) // 2 collisions, 3rd claim wins
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)
    assert.isTrue(out.sponsored)
    assert.lengthOf(h.legacyCalls, 0)
    assert.isAbove(h.setNonceArgs.length, 2) // retried past the collisions
  })

  test('contention exhaustion → terminal, no broadcast, no legacy', async ({ assert }) => {
    const h = makeHarness({ setNonceAlwaysCollide: true })
    __setDepsForTest(h.deps)
    await assert.rejects(() => submitFreeSend(h.req))
    assert.lengthOf(h.legacyCalls, 0) // NonceContentionError must NOT fall back to legacy
    assert.lengthOf(h.sentOps, 0) // nothing broadcast
    assert.notInclude(h.events, 'prepareAndSign')
  })

  test('a FUTURE nonce + pre-broadcast failure does NOT fall back to legacy', async ({
    assert,
  }) => {
    // maxActive 9 > on-chain 5 → allocate future nonce 10 (a lower op is pending);
    // then prepare fails. Legacy would re-resolve the on-chain (lower) nonce and
    // conflict, so this must fail cleanly instead.
    const h = makeHarness({ maxActiveNonce: 9n, onChainNonce: 5n, prepareThrows: true })
    __setDepsForTest(h.deps)
    await assert.rejects(() => submitFreeSend(h.req))
    assert.lengthOf(h.legacyCalls, 0)
    assert.lengthOf(h.sentOps, 0)
  })
})

test.group('gas_aa submitter | pre-broadcast fallback', (group) => {
  group.each.teardown(() => __resetDeps())

  test('sponsor failure → legacy once, no send, no double-send', async ({ assert }) => {
    const h = makeHarness({ prepareThrows: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)

    assert.isFalse(out.sponsored)
    assert.equal(out.transactionHash, '0xLEGACY')
    assert.lengthOf(h.legacyCalls, 1)
    assert.lengthOf(h.sentOps, 0)
    assert.notInclude(h.events, 'markPrepared')
    assert.include(h.events, 'markFailed')
  })

  test('a NON-collision setNonce failure → clean legacy fallback', async ({ assert }) => {
    const h = makeHarness({ setNonceThrows: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)

    assert.isFalse(out.sponsored)
    assert.lengthOf(h.legacyCalls, 1)
    assert.lengthOf(h.sentOps, 0)
    assert.notInclude(h.events, 'prepareAndSign')
  })

  test('authorize failure (e.g. missing gas_aa table) degrades to legacy, never hard-fails', async ({
    assert,
  }) => {
    // insertAuthorized is step 0 but lives INSIDE the fallback envelope — its
    // failure must NOT propagate to the user; it falls back to legacy.
    const h = makeHarness({ insertAuthorizedThrows: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req) // must NOT throw

    assert.isFalse(out.sponsored)
    assert.equal(out.transactionHash, '0xLEGACY')
    assert.isNull(out.preparedOpId) // no row was created
    assert.lengthOf(h.legacyCalls, 1)
    assert.lengthOf(h.sentOps, 0)
    assert.notInclude(h.events, 'prepareAndSign')
  })

  test('a failing markFailed does not break the legacy fallback', async ({ assert }) => {
    // authorize succeeds, prepare fails pre-broadcast, AND markFailed throws (the
    // gas_aa DB is the thing that's down) — the send must still degrade to legacy.
    const h = makeHarness({ prepareThrows: true, markFailedThrows: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req) // must NOT throw

    assert.isFalse(out.sponsored)
    assert.equal(out.transactionHash, '0xLEGACY')
    assert.lengthOf(h.legacyCalls, 1)
    assert.lengthOf(h.sentOps, 0)
  })
})

test.group('gas_aa submitter | post-prepare commitment', (group) => {
  group.each.teardown(() => __resetDeps())

  test('post-broadcast crash → idempotent rebroadcast of the IDENTICAL op', async ({ assert }) => {
    const h = makeHarness({ sendFailsFirst: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)

    assert.isTrue(out.sponsored)
    assert.lengthOf(h.legacyCalls, 0) // NEVER legacy once prepared
    assert.lengthOf(h.sentOps, 2) // first (failed) + rebroadcast
    assert.deepEqual(h.sentOps[0], h.sentOps[1]) // same signed op, same hash
  })

  test('already known on bundler → no rebroadcast, still settles', async ({ assert }) => {
    const h = makeHarness({ sendFailsFirst: true, knownOnBundler: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req)

    assert.isTrue(out.sponsored)
    assert.lengthOf(h.legacyCalls, 0)
    assert.lengthOf(h.sentOps, 1) // failed attempt only; not re-sent (already pending)
  })

  test('on-chain revert is surfaced as failure, never legacy, never reconciled', async ({
    assert,
  }) => {
    const h = makeHarness({ receiptSuccess: false, knownOnBundler: true })
    __setDepsForTest(h.deps)
    await assert.rejects(() => submitFreeSend(h.req))
    assert.lengthOf(h.legacyCalls, 0)
    // A confirmed revert is terminal — markFailed runs exactly once and the op is
    // NOT routed through reconcile (which would re-send / re-settle).
    assert.lengthOf(
      h.events.filter((e) => e === 'markFailed'),
      1
    )
    assert.lengthOf(h.sentOps, 1) // the single original broadcast, no rebroadcast
  })

  test('a failing markLanded after a successful receipt still returns SUCCESS (no retry, no double-send)', async ({
    assert,
  }) => {
    // The op landed (receipt.success). If markLanded throws it must NOT cascade
    // into reconcile (which would rebroadcast) nor surface as a failure to the
    // user (which would invite a retry = a second real transfer).
    const h = makeHarness({ markLandedThrows: true })
    __setDepsForTest(h.deps)
    const out = await submitFreeSend(h.req) // must NOT throw

    assert.isTrue(out.sponsored)
    assert.equal(out.transactionHash, '0xtx')
    assert.lengthOf(h.sentOps, 1) // exactly one broadcast — no cascade-rebroadcast
    assert.lengthOf(h.legacyCalls, 0)
  })
})
