/**
 * Gas → AA — decode / calls-hash unit tests (no DB).
 *
 * The DB-binding security model rests on ONE invariant: the calls_hash the
 * submitter computes from the built calls equals the calls_hash the webhook
 * recomputes from the decoded callData. These tests pin that round-trip, the
 * field extraction the webhook authorizes against, and the shape rejection that
 * stops non-free-send ops — plus binding sensitivity (a changed recipient or
 * amount yields a different hash, so it can't match a different authorization).
 */

import { test } from '@japa/runner'
import { getAddress } from 'viem'
import {
  buildFreeSendCalls,
  callsHash,
  decodeCalls,
  decodeFreeSendOp,
  encodeExecuteBatch,
  encodeTransferCall,
  capBucketForAccount,
  type RawPermission,
} from '#services/gas_aa/decode'

const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SPM = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad'
const SPENDER = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x3333333333333333333333333333333333333333'

function permission(): RawPermission {
  return {
    account: ACCOUNT,
    spender: SPENDER,
    token: USDC,
    allowance: 1_000_000n,
    period: 86_400,
    start: 1_700_000_000,
    end: 1_800_000_000,
    salt: 0n,
    extraData: '0x',
  }
}

function buildCalls(amount = 250_000n, recipient = RECIPIENT) {
  return buildFreeSendCalls({
    spendManager: SPM,
    permission: permission(),
    usdcAddress: USDC,
    recipient,
    amountUnits: amount,
  })
}

test.group('gas_aa decode | calls_hash round-trip', () => {
  test('submitter-built hash == webhook-decoded hash (the binding crux)', ({ assert }) => {
    const calls = buildCalls()
    const built = callsHash(calls)
    const callData = encodeExecuteBatch(calls)
    const decoded = callsHash(decodeCalls(callData))
    assert.equal(built, decoded)
  })

  test('decodeFreeSendOp.callsHash matches the built hash', ({ assert }) => {
    const calls = buildCalls()
    const callData = encodeExecuteBatch(calls)
    const d = decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC })
    assert.isNotNull(d)
    assert.equal(d!.callsHash, callsHash(calls))
  })

  test('a different recipient changes the hash (binding sensitivity)', ({ assert }) => {
    const a = callsHash(buildCalls(250_000n, RECIPIENT))
    const b = callsHash(buildCalls(250_000n, '0x4444444444444444444444444444444444444444'))
    assert.notEqual(a, b)
  })

  test('a different amount changes the hash', ({ assert }) => {
    assert.notEqual(callsHash(buildCalls(250_000n)), callsHash(buildCalls(250_001n)))
  })

  test('hash is casing-invariant on the recipient', ({ assert }) => {
    const lower = callsHash(buildCalls(250_000n, RECIPIENT.toLowerCase()))
    const checksum = callsHash(buildCalls(250_000n, getAddress(RECIPIENT)))
    assert.equal(lower, checksum)
  })
})

test.group('gas_aa decode | field extraction', () => {
  test('extracts account, spender, token, recipient, and equal amounts', ({ assert }) => {
    const callData = encodeExecuteBatch(buildCalls(250_000n))
    const d = decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC })
    assert.isNotNull(d)
    assert.equal(d!.account, getAddress(ACCOUNT))
    assert.equal(d!.spender, getAddress(SPENDER))
    assert.equal(d!.token, getAddress(USDC))
    assert.equal(d!.recipient, getAddress(RECIPIENT))
    assert.equal(d!.spendAmount, 250_000n)
    assert.equal(d!.transferAmount, 250_000n)
  })

  test('capBucketForAccount is stable and lowercased', ({ assert }) => {
    assert.equal(capBucketForAccount(ACCOUNT), `acct:${ACCOUNT.toLowerCase()}`)
    assert.equal(
      capBucketForAccount(ACCOUNT.toLowerCase()),
      capBucketForAccount(getAddress(ACCOUNT))
    )
  })
})

test.group('gas_aa decode | shape rejection', () => {
  test('rejects a single (non-batch) execute op', ({ assert }) => {
    const callData = encodeTransferCall(USDC, RECIPIENT, 1n).data // not an executeBatch
    assert.isNull(decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC }))
  })

  test('rejects when call[0] does not target the SpendPermissionManager', ({ assert }) => {
    const calls = buildCalls()
    calls[0] = { ...calls[0], to: '0x9999999999999999999999999999999999999999' }
    const callData = encodeExecuteBatch(calls)
    assert.isNull(decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC }))
  })

  test('rejects when call[1] does not target USDC', ({ assert }) => {
    const calls = buildCalls()
    calls[1] = encodeTransferCall('0x8888888888888888888888888888888888888888', RECIPIENT, 1n)
    const callData = encodeExecuteBatch(calls)
    assert.isNull(decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC }))
  })

  test('rejects garbage callData', ({ assert }) => {
    assert.isNull(decodeFreeSendOp('0xdeadbeef', { spendManager: SPM, usdcAddress: USDC }))
  })

  test('rejects a batch with the wrong call count', ({ assert }) => {
    const calls = buildCalls()
    const callData = encodeExecuteBatch([calls[0]]) // only the spend, no transfer
    assert.isNull(decodeFreeSendOp(callData, { spendManager: SPM, usdcAddress: USDC }))
  })
})
