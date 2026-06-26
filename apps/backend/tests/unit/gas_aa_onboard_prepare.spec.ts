/**
 * Gas → AA Track B (B1.1d) — `/prepare` orchestration unit tests (no CDP, no DB; all
 * deps injected). Focus: the two-token auth model's binding negatives (the surface to be
 * paranoid about) + adopt-first-completes + the A6 casing-positive + sponsorship fallback.
 */

import { test } from '@japa/runner'
import { getAddress } from 'viem'
import {
  prepareOnboard,
  adoptOnchainPermission,
  __setOnboardDepsForTest,
  __resetOnboardDeps,
  type OnboardPrepareDeps,
  type AdoptIO,
  type PrepareOnboardRequest,
} from '#services/gas_aa/onboard_prepare'
import type { RawPermission } from '#services/gas_aa/decode'

const WALLET_LC = '0xabcdef0123456789abcdef0123456789abcdef01'
const WALLET = getAddress(WALLET_LC) // checksummed (mixed-case), as CDP/phone_registry store it
const USER_EOA = getAddress('0x1111111111111111111111111111111111111111')
const OTHER = getAddress('0x9999999999999999999999999999999999999999')

const PERMISSION: RawPermission = {
  account: WALLET,
  spender: '0x2222222222222222222222222222222222222222',
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  allowance: 50_000000n,
  period: 86400,
  start: 1_700_000_000,
  end: 281474976710655,
  salt: 0n,
  extraData: '0x',
}

function makeDeps(over: Partial<OnboardPrepareDeps> = {}) {
  const calls = { resolve: 0, tos: 0, adopt: 0, derive: 0, build: 0, prepare: 0 }
  const deps: OnboardPrepareDeps = {
    resolveCdpUser: async () => {
      calls.resolve++
      return { userEoa: USER_EOA, smartAccount: WALLET }
    },
    isTosAccepted: async () => {
      calls.tos++
      return true
    },
    adoptExisting: async () => {
      calls.adopt++
      return { adopted: false }
    },
    deriveSmartAccount: async () => {
      calls.derive++
      return WALLET
    },
    buildPermission: async () => {
      calls.build++
      return PERMISSION
    },
    prepare: async () => {
      calls.prepare++
      return { sponsored: true, opId: 'op_1', unsignedUserOp: { u: 1 }, userOpHash: '0xhash' }
    },
    ...over,
  }
  return { deps, calls }
}

const REQ: PrepareOnboardRequest = {
  phoneNumber: '+15550001234',
  walletAddress: WALLET,
  cdpAccessToken: 'cdp-token',
}

test.group('gas_aa onboard prepare', (group) => {
  group.each.teardown(() => __resetOnboardDeps())

  test('happy → prepared (returns the unsigned op + hash)', async ({ assert }) => {
    const { deps, calls } = makeDeps()
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'prepared')
    if (out.kind === 'prepared') {
      assert.equal(out.opId, 'op_1')
      assert.equal(out.userOpHash, '0xhash')
    }
    assert.equal(calls.prepare, 1)
  })

  // ── two-token binding negatives ──────────────────────────────────────────────
  test('an invalid/expired CDP token → 401 (no DB work)', async ({ assert }) => {
    const { deps, calls } = makeDeps({
      resolveCdpUser: async () => {
        throw new Error('token expired')
      },
    })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'error')
    if (out.kind === 'error') assert.equal(out.status, 401)
    assert.equal(calls.adopt, 0)
    assert.equal(calls.prepare, 0)
  })

  test('a CDP token for a DIFFERENT user → 409 (cross-session block)', async ({ assert }) => {
    const { deps, calls } = makeDeps({
      resolveCdpUser: async () => ({ userEoa: USER_EOA, smartAccount: OTHER }),
    })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'error')
    if (out.kind === 'error') assert.equal(out.status, 409)
    // Binding is BEFORE any side effect — nothing downstream ran.
    assert.equal(calls.tos, 0)
    assert.equal(calls.adopt, 0)
    assert.equal(calls.prepare, 0)
  })

  test('a CDP token with no wallet → 401', async ({ assert }) => {
    const { deps } = makeDeps({
      resolveCdpUser: async () => ({ userEoa: '', smartAccount: '' }),
    })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'error')
    if (out.kind === 'error') assert.equal(out.status, 401)
  })

  test('ToS not accepted → 403 (before adopt/build)', async ({ assert }) => {
    const { deps, calls } = makeDeps({ isTosAccepted: async () => false })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'error')
    if (out.kind === 'error') assert.equal(out.status, 403)
    assert.equal(calls.adopt, 0)
    assert.equal(calls.prepare, 0)
  })

  test('convergence fail (owner does not derive the account) → 409, no sponsor', async ({
    assert,
  }) => {
    const { deps, calls } = makeDeps({ deriveSmartAccount: async () => OTHER })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'error')
    if (out.kind === 'error') assert.equal(out.status, 409)
    assert.equal(calls.prepare, 0)
  })

  // ── adopt-first completes (redline #3) ───────────────────────────────────────
  test('an existing on-chain permission → alreadyGranted, never sponsors a duplicate', async ({
    assert,
  }) => {
    const { deps, calls } = makeDeps({
      adoptExisting: async () => ({ adopted: true, permissionHash: '0xperm' }),
    })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'alreadyGranted')
    if (out.kind === 'alreadyGranted') assert.equal(out.permissionHash, '0xperm')
    // No duplicate: convergence + build + sponsor never ran.
    assert.equal(calls.derive, 0)
    assert.equal(calls.prepare, 0)
  })

  // ── A6 casing: checksummed CDP/derived address vs a lowercased request wallet ──
  test('casing: checksummed CDP + derived account match a lowercased request wallet', async ({
    assert,
  }) => {
    const { deps } = makeDeps({
      resolveCdpUser: async () => ({ userEoa: USER_EOA, smartAccount: WALLET }), // checksummed
      deriveSmartAccount: async () => WALLET, // checksummed
    })
    __setOnboardDepsForTest(deps)
    // The request carries the LOWERCASED wallet — a dropped lower() on either bind 409s here.
    const out = await prepareOnboard({ ...REQ, walletAddress: WALLET_LC })
    assert.equal(out.kind, 'prepared')
  })

  // ── sponsorship fallback (pre-broadcast) ─────────────────────────────────────
  test('prepareSetupOp sponsored:false → fallback (frontend runs legacy)', async ({ assert }) => {
    const { deps } = makeDeps({
      prepare: async () => ({ sponsored: false, reason: 'sponsor fetch failed' }),
    })
    __setOnboardDepsForTest(deps)
    const out = await prepareOnboard(REQ)
    assert.equal(out.kind, 'fallback')
    if (out.kind === 'fallback') assert.equal(out.reason, 'sponsor fetch failed')
  })
})

// adoptOnchainPermission — the tier-cap (P1) + zero-row (P2) guards, in isolation.
test.group('gas_aa onboard adopt', () => {
  const ARGS = { phoneNumber: '+15550001234', walletAddress: WALLET }

  function makeIO(over: Partial<AdoptIO> = {}) {
    const calls = { record: 0, notify: 0 }
    const io: AdoptIO = {
      findMatch: async () => ({ permissionHash: '0xperm', allowanceUsd: 50 }),
      getEffectiveLimit: async () => 50,
      recordHash: async () => {
        calls.record++
        return 1
      },
      notify: async () => {
        calls.notify++
      },
      ...over,
    }
    return { io, calls }
  }

  test('no matching permission → adopted:false', async ({ assert }) => {
    const { io, calls } = makeIO({ findMatch: async () => null })
    const out = await adoptOnchainPermission(ARGS, io)
    assert.isFalse(out.adopted)
    assert.equal(calls.record, 0)
  })

  test('within-tier match recorded → adopted:true', async ({ assert }) => {
    const { io, calls } = makeIO()
    const out = await adoptOnchainPermission(ARGS, io)
    assert.isTrue(out.adopted)
    if (out.adopted) assert.equal(out.permissionHash, '0xperm')
    assert.equal(calls.record, 1)
    assert.equal(calls.notify, 1)
  })

  // P1 — a stale over-tier permission ($500 > $50) must NOT be adopted (no resurrect).
  test('P1: an over-tier permission → adopted:false, never recorded', async ({ assert }) => {
    const { io, calls } = makeIO({
      findMatch: async () => ({ permissionHash: '0xbig', allowanceUsd: 500 }),
      getEffectiveLimit: async () => 50,
    })
    const out = await adoptOnchainPermission(ARGS, io)
    assert.isFalse(out.adopted)
    assert.equal(calls.record, 0) // never wrote the over-tier hash
  })

  // P2 — a zero-row write is NOT a completed adoption (no silent stuck state).
  test('P2: a zero-row write → adopted:false (not silently complete)', async ({ assert }) => {
    const { io, calls } = makeIO({ recordHash: async () => 0 })
    const out = await adoptOnchainPermission(ARGS, io)
    assert.isFalse(out.adopted)
    assert.equal(calls.notify, 0) // did not announce a setup that didn't persist
  })
})
