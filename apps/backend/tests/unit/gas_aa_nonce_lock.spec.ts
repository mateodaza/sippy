/**
 * Gas → AA — nonce-lock unit tests (no DB).
 *
 * The shared spender's nonce safety rests on `withNonceLock` serialising the
 * resolve→write→sign→submit critical section per (chain, entryPoint, sender).
 * These pin: strict FIFO on the same key, no cross-key blocking, a throwing
 * holder doesn't strand the next waiter, and result/error propagation.
 */

import { test } from '@japa/runner'
import { nonceLockKey, withNonceLock } from '#services/gas_aa/config'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test.group('gas_aa nonce lock', () => {
  test('serialises same-key sections (no interleave even with awaits inside)', async ({
    assert,
  }) => {
    const key = nonceLockKey(42161, '0xep', '0xspender')
    const log: string[] = []
    const section = (id: number) =>
      withNonceLock(key, async () => {
        log.push(`start:${id}`)
        await sleep(5)
        log.push(`end:${id}`)
      })
    // Launch concurrently; the lock must run them one-at-a-time in call order.
    await Promise.all([section(1), section(2), section(3)])
    assert.deepEqual(log, ['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3'])
  })

  test('different keys do NOT block each other', async ({ assert }) => {
    const log: string[] = []
    const a = withNonceLock('A', async () => {
      log.push('a-start')
      await sleep(20)
      log.push('a-end')
    })
    const b = withNonceLock('B', async () => {
      log.push('b-start')
      await sleep(1)
      log.push('b-end')
    })
    await Promise.all([a, b])
    // B (fast, different key) finishes before A despite starting second.
    assert.isBelow(log.indexOf('b-end'), log.indexOf('a-end'))
  })

  test('a throwing holder does not strand the next waiter', async ({ assert }) => {
    const key = 'throwy'
    const first = withNonceLock(key, async () => {
      throw new Error('boom')
    })
    await assert.rejects(() => first, 'boom')
    let ran = false
    await withNonceLock(key, async () => {
      ran = true
    })
    assert.isTrue(ran)
  })

  test('propagates the section result', async ({ assert }) => {
    const out = await withNonceLock('R', async () => 7)
    assert.equal(out, 7)
  })
})
