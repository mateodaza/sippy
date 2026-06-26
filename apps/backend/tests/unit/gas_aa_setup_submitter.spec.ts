/**
 * Gas → AA Track B (B1.1b) — SetupSubmitter failure-envelope unit tests (no DB, no RPC).
 *
 * The money-path invariants of the sponsored prepare → submit lane, with an injected
 * in-memory ledger + fake engine:
 *   • prepare: happy → row awaiting_signature; any pre-broadcast failure → terminalize → legacy;
 *   • submit happy: persist signed op (markPrepared) BEFORE the broadcast boundary (R5);
 *   • abandoned/bad sig → cancelSetupOp → legacy, no broadcast;
 *   • re-sim reject → cancel → legacy;
 *   • markPrepared loses the atomic guard (cancelled/advanced) → conflict, NO broadcast;
 *   • bundler VALIDATION reject (pre-accept) → failSetupOp → legacy, no rebroadcast;
 *   • fallback is allowed ONLY if the row was DURABLY terminalized (else → conflict);
 *   • ambiguous send failure (post-accept maybe) → idempotent rebroadcast, NEVER legacy;
 *   • confirmed on-chain revert → terminal, never legacy/reconcile.
 */

import { test } from '@japa/runner'
import {
  prepareSetupOp,
  submitSetupOp,
  classifyBundlerRejection,
  __setDepsForTest,
  __resetDeps,
  type SetupSubmitterDeps,
  type PrepareSetupRequest,
} from '#services/gas_aa/setup_submitter'

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SPENDER = '0xb396805f4C4eb7A45E237A9468FB647C982fBeb1'
const WALLET = '0x5555555555555555555555555555555555555555' // user smart account = sender
const USER_EOA = '0x6666666666666666666666666666666666666666'
const UOH = '0x' + '11'.repeat(32)

const UNSIGNED = { sender: WALLET, nonce: '0x0', signature: '0x', callData: '0xcd' }
const SIGNED = { ...UNSIGNED, signature: '0xwrapped' }

interface Opts {
  insertAuthorizedThrows?: boolean
  buildThrows?: boolean
  onChainNonce?: bigint
  maxActiveNonce?: bigint | null
  // submit
  verifyOk?: boolean
  simulate?: boolean
  simulateResult?: 'ok' | 'reject' | 'unknown'
  flipResult?: boolean // markPreparedFromAwaitingSignature outcome
  cancelResult?: boolean // force cancelSetupOp's return (e.g. false = lost the row)
  cancelThrows?: boolean
  failResult?: boolean // force failSetupOp's return
  failThrows?: boolean
  send?: 'accept' | 'reject' | 'ambiguous' | 'ambiguousThenAccept'
  receiptSuccess?: boolean
  knownOnBundler?: boolean
}

function makeHarness(opts: Opts = {}) {
  const events: string[] = []
  const sentOps: Record<string, unknown>[] = []
  const rows = new Map<string, any>()
  let seq = 0
  let sendCount = 0

  const ledger: SetupSubmitterDeps['ledger'] = {
    insertAuthorized: async (p: any) => {
      if (opts.insertAuthorizedThrows)
        throw new Error('relation "gas_aa_prepared_user_ops" does not exist')
      const id = `op_${++seq}`
      rows.set(id, { id, status: 'authorized', signedUserOp: null, userOpHash: null, ...p })
      events.push('insertAuthorized')
      return id
    },
    setNonce: async (id: string, n: string) => {
      events.push('setNonce')
      rows.get(id).senderNonce = n
    },
    maxActiveNonce: async () => opts.maxActiveNonce ?? null,
    markAwaitingSignature: async (id: string, a: any) => {
      events.push('markAwaitingSignature')
      const r = rows.get(id)
      r.status = 'awaiting_signature'
      r.userOpHash = a.userOpHash
      r.unsignedUserOp = a.unsignedUserOp
      r.userEoa = a.userEoa
    },
    cancelSetupOp: async (id: string) => {
      events.push('cancelSetupOp')
      if (opts.cancelThrows) throw new Error('cancelSetupOp DB error')
      if (opts.cancelResult !== undefined) return opts.cancelResult
      const r = rows.get(id)
      if (r && r.status === 'awaiting_signature') {
        r.status = 'cancelled'
        return true
      }
      return false
    },
    failSetupOp: async (id: string) => {
      events.push('failSetupOp')
      if (opts.failThrows) throw new Error('failSetupOp DB error')
      if (opts.failResult !== undefined) return opts.failResult
      const r = rows.get(id)
      if (r && ['authorized', 'awaiting_signature', 'prepared'].includes(r.status)) {
        r.status = 'failed'
        return true
      }
      return false
    },
    markPreparedFromAwaitingSignature: async (id: string, op: Record<string, unknown>) => {
      events.push('markPrepared')
      if (opts.flipResult === false) return false // simulate a concurrent cancel
      const r = rows.get(id)
      if (r && r.status === 'awaiting_signature') {
        r.status = 'prepared'
        r.signedUserOp = op
        return true
      }
      return false
    },
    markFailed: async (id: string) => {
      events.push('markFailed')
      const r = rows.get(id)
      if (r) r.status = 'failed'
    },
    markLanded: async (id: string) => {
      events.push('markLanded')
      const r = rows.get(id)
      if (r) r.status = 'landed'
    },
    getById: async (id: string) => rows.get(id) ?? null,
  }

  const deps: SetupSubmitterDeps = {
    resolveNonce: async () => opts.onChainNonce ?? 0n,
    buildAndSponsor: async () => {
      if (opts.buildThrows) throw new Error('sponsor fetch failed (pre-broadcast)')
      events.push('buildAndSponsor')
      return { unsignedUserOp: UNSIGNED, userOpHash: UOH }
    },
    verifyAndWrap: async () => {
      events.push('verify')
      if (opts.verifyOk === false) return { ok: false }
      return { ok: true, signedUserOp: SIGNED }
    },
    simulate: opts.simulate ? async () => opts.simulateResult ?? 'ok' : undefined,
    sendRaw: async (op: Record<string, unknown>) => {
      sendCount++
      sentOps.push(op)
      events.push('sendRaw')
      const mode = opts.send ?? 'accept'
      if (mode === 'reject')
        throw Object.assign(new Error('AA24 signature error'), { kind: 'reject' })
      if (mode === 'ambiguous')
        throw Object.assign(new Error('socket hang up'), { kind: 'ambiguous' })
      if (mode === 'ambiguousThenAccept' && sendCount === 1)
        throw Object.assign(new Error('socket hang up'), { kind: 'ambiguous' })
      return UOH
    },
    classifyRejection: (err: any) => (err?.kind === 'reject' ? 'reject' : 'ambiguous'),
    waitReceipt: async () => ({ success: opts.receiptSuccess ?? true, transactionHash: '0xtx' }),
    getByHash: async () => opts.knownOnBundler ?? false,
    ledger,
  }

  const req: PrepareSetupRequest = {
    walletAddress: WALLET,
    userEoa: USER_EOA,
    fromPhoneNumber: '+15550001111',
    permission: {
      account: WALLET,
      spender: SPENDER,
      token: USDC,
      allowance: 50_000000n,
      period: 86400,
      start: 1000,
      end: 281474976710655,
      salt: 0n,
      extraData: '0x',
    },
  }

  /** Seed a row already in awaiting_signature (the state submit starts from). */
  function seedAwaiting(): string {
    const id = `op_${++seq}`
    rows.set(id, {
      id,
      status: 'awaiting_signature',
      sender: WALLET.toLowerCase(), // setup: sender == the user's wallet (bound at submit)
      userOpHash: UOH,
      unsignedUserOp: UNSIGNED,
      userEoa: USER_EOA,
      signedUserOp: null,
    })
    return id
  }

  return { deps, events, sentOps, rows, req, seedAwaiting }
}

test.group('gas_aa setup submitter | prepare', (group) => {
  group.each.teardown(() => __resetDeps())

  test('happy → sponsored, row awaiting_signature', async ({ assert }) => {
    const h = makeHarness()
    __setDepsForTest(h.deps)
    const out = await prepareSetupOp(h.req)
    assert.isTrue(out.sponsored)
    if (out.sponsored) {
      assert.equal(out.userOpHash, UOH)
      assert.equal(h.rows.get(out.opId).status, 'awaiting_signature')
    }
    assert.deepInclude(h.events, 'markAwaitingSignature')
  })

  test('sponsorship fetch failure → terminalize → legacy (sponsored:false)', async ({ assert }) => {
    const h = makeHarness({ buildThrows: true })
    __setDepsForTest(h.deps)
    const out = await prepareSetupOp(h.req)
    assert.isFalse(out.sponsored)
    assert.include(h.events, 'markFailed')
    assert.notInclude(h.events, 'markAwaitingSignature')
  })

  test('insertAuthorized failure (missing table) degrades to legacy, never hard-fails', async ({
    assert,
  }) => {
    const h = makeHarness({ insertAuthorizedThrows: true })
    __setDepsForTest(h.deps)
    const out = await prepareSetupOp(h.req) // must NOT throw
    assert.isFalse(out.sponsored)
    assert.notInclude(h.events, 'buildAndSponsor')
  })
})

test.group('gas_aa setup submitter | submit happy + R5 ordering', (group) => {
  group.each.teardown(() => __resetDeps())

  test('persists signed op (markPrepared) BEFORE the broadcast boundary, then lands', async ({
    assert,
  }) => {
    const h = makeHarness()
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'landed')
    assert.isBelow(h.events.indexOf('markPrepared'), h.events.indexOf('sendRaw')) // R5
    assert.equal(h.rows.get(id).status, 'landed')
    assert.lengthOf(h.sentOps, 1)
  })
})

// [P1 fix] The same-session binding is enforced INSIDE the service, before any side
// effect, so a leaked opId can't be used by another authenticated user to strand it.
test.group('gas_aa setup submitter | same-session binding', (group) => {
  group.each.teardown(() => __resetDeps())

  test('a different session wallet → conflict, NO cancel/verify/send (no stranding)', async ({
    assert,
  }) => {
    const h = makeHarness({ verifyOk: false }) // even a bad sig must not reach cancel
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting() // row.sender == WALLET
    const out = await submitSetupOp({
      opId: id,
      walletAddress: '0x7777777777777777777777777777777777777777', // someone else
      signature: '0xsig',
    })
    assert.equal(out.status, 'conflict')
    assert.notInclude(h.events, 'cancelSetupOp') // can't cancel another user's op
    assert.notInclude(h.events, 'verify')
    assert.notInclude(h.events, 'sendRaw')
    assert.equal(h.rows.get(id).status, 'awaiting_signature') // untouched
  })
})

test.group('gas_aa setup submitter | pre-broadcast → cancel/fail → legacy', (group) => {
  group.each.teardown(() => __resetDeps())

  test('abandoned/bad signature → cancelSetupOp → fallback, no broadcast', async ({ assert }) => {
    const h = makeHarness({ verifyOk: false })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xbad' })
    assert.equal(out.status, 'fallback')
    assert.include(h.events, 'cancelSetupOp')
    assert.notInclude(h.events, 'markPrepared')
    assert.notInclude(h.events, 'sendRaw')
    assert.equal(h.rows.get(id).status, 'cancelled')
  })

  test('local re-sim reject → cancel → fallback, no broadcast', async ({ assert }) => {
    const h = makeHarness({ simulate: true, simulateResult: 'reject' })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'fallback')
    assert.include(h.events, 'cancelSetupOp')
    assert.notInclude(h.events, 'sendRaw')
  })

  test('bundler VALIDATION reject (pre-accept) → failSetupOp → fallback, no rebroadcast', async ({
    assert,
  }) => {
    const h = makeHarness({ send: 'reject' })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'fallback')
    assert.include(h.events, 'failSetupOp')
    assert.lengthOf(h.sentOps, 1) // the one rejected attempt, no rebroadcast
    assert.equal(h.rows.get(id).status, 'failed')
  })
})

// [P1 fix] fallback is allowed ONLY if the row was DURABLY terminalized — else
// legacy could double-grant a still-live / reconciler-rebroadcast op. A
// non-terminalizing cancel/fail (returns false, or throws) must be `conflict`.
test.group('gas_aa setup submitter | terminalize-before-fallback (no double-grant)', (group) => {
  group.each.teardown(() => __resetDeps())

  test('bad sig but cancelSetupOp lost the row (false) → conflict, NOT fallback', async ({
    assert,
  }) => {
    const h = makeHarness({ verifyOk: false, cancelResult: false })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xbad' })
    assert.equal(out.status, 'conflict')
    assert.notInclude(h.events, 'sendRaw')
  })

  test('bad sig but cancelSetupOp throws (DB blip) → conflict, NOT fallback', async ({
    assert,
  }) => {
    const h = makeHarness({ verifyOk: false, cancelThrows: true })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xbad' })
    assert.equal(out.status, 'conflict')
  })

  test('re-sim reject but cancelSetupOp lost/threw → conflict, NOT fallback', async ({
    assert,
  }) => {
    for (const opts of [
      { simulate: true, simulateResult: 'reject' as const, cancelResult: false },
      { simulate: true, simulateResult: 'reject' as const, cancelThrows: true },
    ]) {
      const h = makeHarness(opts)
      __setDepsForTest(h.deps)
      const id = h.seedAwaiting()
      const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
      assert.equal(out.status, 'conflict')
      assert.notInclude(h.events, 'sendRaw')
      __resetDeps()
    }
  })

  test('bundler reject but failSetupOp throws → conflict, NOT fallback (reconciler owns the prepared row)', async ({
    assert,
  }) => {
    const h = makeHarness({ send: 'reject', failThrows: true })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'conflict')
  })

  test('bundler reject but failSetupOp returns false (row advanced) → conflict, NOT fallback', async ({
    assert,
  }) => {
    const h = makeHarness({ send: 'reject', failResult: false })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'conflict')
  })
})

test.group('gas_aa setup submitter | mutual exclusion (no double-submit)', (group) => {
  group.each.teardown(() => __resetDeps())

  test('markPrepared loses the atomic guard (cancelled concurrently) → conflict, NO broadcast', async ({
    assert,
  }) => {
    const h = makeHarness({ flipResult: false }) // the shared WHERE guard didn't match
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'conflict')
    assert.notInclude(h.events, 'sendRaw') // never crossed the boundary
  })

  test('a second submit on a non-awaiting_signature row → conflict', async ({ assert }) => {
    const h = makeHarness()
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    h.rows.get(id).status = 'prepared' // already submitted
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'conflict')
  })
})

test.group('gas_aa setup submitter | post-accept → reconcile, never legacy', (group) => {
  group.each.teardown(() => __resetDeps())

  test('ambiguous send failure → idempotent rebroadcast of the SAME op, lands', async ({
    assert,
  }) => {
    const h = makeHarness({ send: 'ambiguousThenAccept' })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'landed')
    assert.lengthOf(h.sentOps, 2) // first (ambiguous) + rebroadcast
    assert.deepEqual(h.sentOps[0], h.sentOps[1]) // identical signed op
    assert.equal(h.rows.get(id).status, 'landed')
  })

  test('ambiguous + already known on bundler → no rebroadcast, still settles', async ({
    assert,
  }) => {
    const h = makeHarness({ send: 'ambiguous', knownOnBundler: true })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    const out = await submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    assert.equal(out.status, 'landed')
    assert.lengthOf(h.sentOps, 1) // only the failed first attempt; not re-sent
  })

  test('confirmed on-chain revert → terminal (throws), never legacy/reconcile', async ({
    assert,
  }) => {
    const h = makeHarness({ receiptSuccess: false })
    __setDepsForTest(h.deps)
    const id = h.seedAwaiting()
    await assert.rejects(() =>
      submitSetupOp({ opId: id, walletAddress: WALLET, signature: '0xsig' })
    ) // terminal — throws
    assert.lengthOf(h.sentOps, 1) // single broadcast, no rebroadcast
  })
})

test.group('gas_aa setup submitter | classifyBundlerRejection', () => {
  test('AA validation codes + explicit rejects are definite "reject"', ({ assert }) => {
    assert.equal(classifyBundlerRejection(new Error('AA24 signature error')), 'reject')
    assert.equal(classifyBundlerRejection(new Error('UserOperation validation reverted')), 'reject')
    assert.equal(classifyBundlerRejection(new Error('AA33 reverted (paymaster)')), 'reject')
  })

  test('network/ambiguous + "already known" are NOT a reject (→ reconcile, never legacy)', ({
    assert,
  }) => {
    assert.equal(classifyBundlerRejection(new Error('socket hang up')), 'ambiguous')
    assert.equal(classifyBundlerRejection(new Error('request timed out')), 'ambiguous')
    assert.equal(classifyBundlerRejection(new Error('already known')), 'ambiguous')
  })
})
