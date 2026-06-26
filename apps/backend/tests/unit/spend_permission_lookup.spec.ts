/**
 * A3 — register-permission indexing backoff (no DB, no CDP).
 *
 * Pins the behaviour /api/register-permission relies on: a just-created grant can
 * lag in listSpendPermissions, so the finder rides out empty/partial reads with a
 * bounded backoff while ALWAYS targeting the specific requested allowance — it must
 * never settle for the most-recent (possibly wrong) permission. Adopt-existing
 * (null allowance) is a single read.
 */

import { test } from '@japa/runner'
import {
  findPermissionForRegistration,
  filterSippyPermissions,
  findAllowanceMatches,
  pickMostRecent,
  type RawSpendPermission,
} from '#services/spend_permission_lookup'

const SPENDER = '0xb396805f4c4eb7a45e237a9468fb647c982fbeb1'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const NETWORK = 'arbitrum'
const DECIMALS = 6

function perm(opts: {
  hash: string
  allowanceUsd: number
  start: number
  spender?: string
  token?: string
  network?: string
}): RawSpendPermission {
  return {
    permissionHash: opts.hash,
    network: opts.network ?? NETWORK,
    permission: {
      spender: opts.spender ?? SPENDER,
      token: opts.token ?? USDC,
      allowance: BigInt(Math.round(opts.allowanceUsd * 10 ** DECIMALS)).toString(),
      start: opts.start,
    },
  }
}

const noSleep = async () => {}

test.group('spend_permission_lookup — findPermissionForRegistration', () => {
  test('rides out indexing lag: empty reads then the specific just-created permission', async ({
    assert,
  }) => {
    const p50 = perm({ hash: '0xP50', allowanceUsd: 50, start: 100 })
    let calls = 0
    const listFn = async () => {
      calls++
      return calls < 3 ? [] : [p50] // indexes on the 3rd read
    }
    const sleeps: number[] = []
    const found = await findPermissionForRegistration({
      listFn,
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: 50,
      decimals: DECIMALS,
      attempts: 5,
      baseDelayMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    assert.isNotNull(found)
    assert.equal(found!.permissionHash, '0xP50')
    assert.equal(calls, 3) // rode out two empty reads
    assert.deepEqual(sleeps, [1000, 2000]) // increasing backoff between the reads
  })

  test('targets the specific allowance, never the most-recent wrong one', async ({ assert }) => {
    const p500 = perm({ hash: '0xP500', allowanceUsd: 500, start: 200 }) // most-recent start
    const p50 = perm({ hash: '0xP50', allowanceUsd: 50, start: 100 })
    const found = await findPermissionForRegistration({
      listFn: async () => [p500, p50],
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: 50,
      decimals: DECIMALS,
      attempts: 5,
      baseDelayMs: 1000,
      sleep: noSleep,
    })
    assert.equal(found!.permissionHash, '0xP50') // NOT the $500 most-recent
  })

  test('adopt mode (null allowance) takes most-recent in a single read, no backoff', async ({
    assert,
  }) => {
    const older = perm({ hash: '0xOLD', allowanceUsd: 50, start: 100 })
    const newer = perm({ hash: '0xNEW', allowanceUsd: 50, start: 300 })
    let calls = 0
    const found = await findPermissionForRegistration({
      listFn: async () => {
        calls++
        return [older, newer]
      },
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: null,
      decimals: DECIMALS,
      attempts: 5,
      baseDelayMs: 1000,
      sleep: noSleep,
    })
    assert.equal(found!.permissionHash, '0xNEW')
    assert.equal(calls, 1)
  })

  test('returns null after exhausting attempts when the lag never resolves', async ({ assert }) => {
    let calls = 0
    const found = await findPermissionForRegistration({
      listFn: async () => {
        calls++
        return []
      },
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: 50,
      decimals: DECIMALS,
      attempts: 3,
      baseDelayMs: 1000,
      sleep: noSleep,
    })
    assert.isNull(found)
    assert.equal(calls, 3)
  })

  test('single attempt (adopt check) does one read and never waits', async ({ assert }) => {
    let calls = 0
    const sleeps: number[] = []
    const found = await findPermissionForRegistration({
      listFn: async () => {
        calls++
        return []
      },
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: 50,
      decimals: DECIMALS,
      attempts: 1,
      baseDelayMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    assert.isNull(found)
    assert.equal(calls, 1)
    assert.lengthOf(sleeps, 0)
  })

  test('ignores permissions for a different spender / token / network', async ({ assert }) => {
    const wrongSpender = perm({
      hash: '0xWS',
      allowanceUsd: 50,
      start: 100,
      spender: '0xdeadbeef00000000000000000000000000000000',
    })
    const wrongNetwork = perm({ hash: '0xWN', allowanceUsd: 50, start: 100, network: 'base' })
    const right = perm({ hash: '0xOK', allowanceUsd: 50, start: 90 })
    const found = await findPermissionForRegistration({
      listFn: async () => [wrongSpender, wrongNetwork, right],
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
      requestedAllowance: 50,
      decimals: DECIMALS,
      attempts: 2,
      baseDelayMs: 1000,
      sleep: noSleep,
    })
    assert.equal(found!.permissionHash, '0xOK')
  })
})

test.group('spend_permission_lookup — pure helpers', () => {
  test('filterSippyPermissions keeps only spender+token+network matches', ({ assert }) => {
    const ok = perm({ hash: '0xOK', allowanceUsd: 50, start: 1 })
    const bad = perm({ hash: '0xBAD', allowanceUsd: 50, start: 1, network: 'base' })
    const out = filterSippyPermissions([ok, bad], {
      spender: SPENDER,
      token: USDC,
      network: NETWORK,
    })
    assert.lengthOf(out, 1)
    assert.equal(out[0].permissionHash, '0xOK')
  })

  test('findAllowanceMatches matches within a cent, case-insensitive amount', ({ assert }) => {
    const a = perm({ hash: '0xA', allowanceUsd: 50, start: 1 })
    const b = perm({ hash: '0xB', allowanceUsd: 500, start: 1 })
    const out = findAllowanceMatches([a, b], 50, DECIMALS)
    assert.lengthOf(out, 1)
    assert.equal(out[0].permissionHash, '0xA')
  })

  test('pickMostRecent returns null on empty and the latest start otherwise', ({ assert }) => {
    assert.isNull(pickMostRecent([]))
    const a = perm({ hash: '0xA', allowanceUsd: 50, start: 1 })
    const b = perm({ hash: '0xB', allowanceUsd: 50, start: 9 })
    assert.equal(pickMostRecent([a, b])!.permissionHash, '0xB')
  })
})
