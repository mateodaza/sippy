/**
 * B1.0 — setup-lane encode/decode + bindings (Track B, no DB, no money path).
 *
 * Pins the pure half of the sponsored-onboarding lane: the cold deploy+approve op
 * is EXACTLY one `approve(SpendPermission)` to the SPM with no extra calls and no
 * ETH value; its initCode is EXACTLY the public factory's createAccount([userEOA,
 * SPM], 0) (convergence with viem); and the §5 contextual bindings each reject.
 */

import { test } from '@japa/runner'
import { getAddress } from 'viem'
import {
  buildSetupCalls,
  encodeApproveCall,
  encodeSpendCall,
  encodeExecute,
  encodeExecuteBatch,
  decodeSetupOp,
  checkSetupOp,
  expectedSetupInitCode,
  COINBASE_SMART_WALLET_FACTORY,
  callsHash,
  type RawPermission,
} from '#services/gas_aa/decode'

const SPM = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SPENDER = '0xb396805f4C4eb7A45E237A9468FB647C982fBeb1'
// Golden fixture from a REAL prod onboard (Arbitrum One): the deploy+approve op
// for smart account 0x53A8…9463 carried this exact initCode (factory +
// createAccount([userEOA, SPM], 0)). tx 0xfd2174c3…d7ccc.
const ACCOUNT = '0x53A8a0e9D8AC5B28373De2130BC8Ff6d694d9463'
const USER_EOA = '0xdd1e16f59ad94314c160369a917172954de242da'
const GOLDEN_INITCODE =
  '0xba5ed110efdba3d005bfc882d75358acbbb858423ffba36f000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000020000000000000000000000000dd1e16f59ad94314c160369a917172954de242da0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000f85210b21cc50302f477ba56686d2019dc9b67ad'
const TIER_CAP = 50_000000n // $50 in USDC base units

function mkPerm(over: Partial<RawPermission> = {}): RawPermission {
  return {
    account: ACCOUNT,
    spender: SPENDER,
    token: USDC,
    allowance: 50_000000n,
    period: 86400,
    start: 1000,
    end: 281474976710655,
    salt: 123n,
    extraData: '0x',
    ...over,
  }
}

function ctx(over: Partial<Parameters<typeof checkSetupOp>[1]> = {}) {
  return {
    sender: ACCOUNT,
    userEOA: USER_EOA,
    spender: SPENDER,
    usdcAddress: USDC,
    tierCapUnits: TIER_CAP,
    spendManager: SPM,
    initCode: expectedSetupInitCode(USER_EOA, SPM).initCode,
    ...over,
  }
}

test.group('gas_aa setup-lane — encode/decode round-trip', () => {
  test('buildSetupCalls → executeBatch → decodeSetupOp recovers the permission', ({ assert }) => {
    const calls = buildSetupCalls({ spendManager: SPM, permission: mkPerm() })
    assert.lengthOf(calls, 1)
    const decoded = decodeSetupOp(encodeExecuteBatch(calls), { spendManager: SPM })
    assert.isNotNull(decoded)
    assert.equal(decoded!.account, getAddress(ACCOUNT))
    assert.equal(decoded!.spender, getAddress(SPENDER))
    assert.equal(decoded!.token, getAddress(USDC))
    assert.equal(decoded!.allowance, 50_000000n)
    assert.equal(decoded!.callsHash, callsHash(calls)) // binds the same hash both sides
  })

  test('accepts BOTH envelopes for one approve: execute(approve) and executeBatch([approve])', ({
    assert,
  }) => {
    // viem's encodeCalls emits `execute` for a one-call op (selector 0xb61d27f6),
    // while the CDP-built grants used `executeBatch`. Both must decode to the same
    // single approve and the SAME callsHash — the envelope is immaterial to the
    // binding (it's the inner call that's hashed + checked).
    const approve = encodeApproveCall(SPM, mkPerm())
    const viaExecute = decodeSetupOp(encodeExecute(approve), { spendManager: SPM })
    const viaBatch = decodeSetupOp(encodeExecuteBatch([approve]), { spendManager: SPM })
    assert.isNotNull(viaExecute)
    assert.isNotNull(viaBatch)
    assert.equal(viaExecute!.account, viaBatch!.account)
    assert.equal(viaExecute!.spender, viaBatch!.spender)
    assert.equal(viaExecute!.token, viaBatch!.token)
    assert.equal(viaExecute!.allowance, viaBatch!.allowance)
    assert.equal(viaExecute!.callsHash, viaBatch!.callsHash) // envelope-independent binding
  })
})

test.group('gas_aa setup-lane — initCode', () => {
  test('expectedSetupInitCode reproduces a REAL on-chain grant initCode (byte-for-byte)', ({
    assert,
  }) => {
    // The strongest convergence proof: the exact bytes the public factory used on
    // Arbitrum One for account 0x53A8…9463. If our owner-encoding / selector /
    // factory diverged, this wouldn't match what actually deployed.
    const mine = expectedSetupInitCode(USER_EOA, SPM)
    assert.equal(mine.initCode.toLowerCase(), GOLDEN_INITCODE.toLowerCase())
  })

  test('initCodeHash is keccak(initCode) and is deterministic', ({ assert }) => {
    const a = expectedSetupInitCode(USER_EOA, SPM)
    const b = expectedSetupInitCode(USER_EOA, SPM)
    assert.equal(a.initCode, b.initCode)
    assert.equal(a.initCodeHash, b.initCodeHash)
    assert.match(a.initCodeHash, /^0x[0-9a-f]{64}$/)
    // the factory constant is the 20-byte prefix of the initCode
    assert.equal(a.initCode.slice(0, 42).toLowerCase(), COINBASE_SMART_WALLET_FACTORY.toLowerCase())
  })

  test('a different owner yields a different initCode', ({ assert }) => {
    const a = expectedSetupInitCode(USER_EOA, SPM)
    const b = expectedSetupInitCode('0x1111111111111111111111111111111111111111', SPM)
    assert.notEqual(a.initCode, b.initCode)
  })
})

test.group(
  'gas_aa setup-lane — decodeSetupOp shape rejection (one negative per shape rule)',
  () => {
    test('rejects more than one call (no extra calls)', ({ assert }) => {
      const c = encodeApproveCall(SPM, mkPerm())
      assert.isNull(decodeSetupOp(encodeExecuteBatch([c, c]), { spendManager: SPM }))
    })

    test('rejects a call that is not to the SpendPermissionManager', ({ assert }) => {
      const bad = { ...encodeApproveCall(SPM, mkPerm()), to: getAddress(USDC) }
      assert.isNull(decodeSetupOp(encodeExecuteBatch([bad]), { spendManager: SPM }))
    })

    test('rejects a non-approve selector (e.g. spend) to the SPM', ({ assert }) => {
      const spend = encodeSpendCall(SPM, mkPerm(), 1_000000n)
      assert.isNull(decodeSetupOp(encodeExecuteBatch([spend]), { spendManager: SPM }))
    })

    test('rejects a non-zero ETH value', ({ assert }) => {
      const withValue = { ...encodeApproveCall(SPM, mkPerm()), value: 1n }
      assert.isNull(decodeSetupOp(encodeExecuteBatch([withValue]), { spendManager: SPM }))
    })

    test('rejects garbage callData', ({ assert }) => {
      assert.isNull(decodeSetupOp('0xdeadbeef', { spendManager: SPM }))
    })
  }
)

test.group('gas_aa setup-lane — checkSetupOp bindings (one negative per binding)', () => {
  const decoded = () =>
    decodeSetupOp(
      encodeExecuteBatch(buildSetupCalls({ spendManager: SPM, permission: mkPerm() })),
      { spendManager: SPM }
    )!

  test('accepts a fully-valid setup op', ({ assert }) => {
    const r = checkSetupOp(decoded(), ctx())
    assert.isTrue(r.ok)
  })

  test('rejects permission.account != sender', ({ assert }) => {
    const r = checkSetupOp(decoded(), ctx({ sender: '0x2222222222222222222222222222222222222222' }))
    assert.isFalse(r.ok)
    assert.equal((r as { reason: string }).reason, 'permission.account != sender')
  })

  test('rejects a spender that is not the Sippy spender', ({ assert }) => {
    const r = checkSetupOp(
      decoded(),
      ctx({ spender: '0x3333333333333333333333333333333333333333' })
    )
    assert.isFalse(r.ok)
    assert.equal((r as { reason: string }).reason, 'permission.spender != Sippy spender')
  })

  test('rejects a token that is not USDC', ({ assert }) => {
    const r = checkSetupOp(
      decoded(),
      ctx({ usdcAddress: '0x4444444444444444444444444444444444444444' })
    )
    assert.isFalse(r.ok)
    assert.equal((r as { reason: string }).reason, 'token is not USDC')
  })

  test('rejects an allowance above the tier cap', ({ assert }) => {
    // permission allowance is $50; cap it at $49 → reject.
    const r = checkSetupOp(decoded(), ctx({ tierCapUnits: 49_000000n }))
    assert.isFalse(r.ok)
    assert.equal((r as { reason: string }).reason, 'allowance exceeds tier cap')
  })

  test('rejects an initCode that is not factory.createAccount([userEOA, SPM], 0)', ({ assert }) => {
    // initCode for a DIFFERENT owner — the binding must catch the substitution.
    const wrong = expectedSetupInitCode('0x5555555555555555555555555555555555555555', SPM).initCode
    const r = checkSetupOp(decoded(), ctx({ initCode: wrong }))
    assert.isFalse(r.ok)
    assert.equal(
      (r as { reason: string }).reason,
      'initCode != factory.createAccount([userEOA, SPM], 0)'
    )
  })

  test('allowance exactly at the cap is allowed (boundary)', ({ assert }) => {
    const r = checkSetupOp(decoded(), ctx({ tierCapUnits: 50_000000n }))
    assert.isTrue(r.ok)
  })
})
