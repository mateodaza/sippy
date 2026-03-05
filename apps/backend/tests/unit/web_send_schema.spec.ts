/**
 * Web Send Event Schema Tests
 *
 * Tests the Zod schema that validates wallet addresses, USDC amounts,
 * and transaction hashes for the POST /api/log-web-send endpoint.
 */

import { test } from '@japa/runner'
import { webSendEventSchema } from '#types/schemas'

test.group('webSendEventSchema | Valid inputs', () => {
  test('accepts valid wallet address, amount, and txHash', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x5Aa5B05d77C45E00C023ff90a7dB2c9FBD9bcde4',
      amount: '10.50',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isTrue(result.success)
  })

  test('accepts zero amount', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + '0'.repeat(40),
      amount: '0',
      txHash: '0x' + '0'.repeat(64),
    })
    assert.isTrue(result.success)
  })

  test('accepts amount with max 6 decimal places', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: '99999.999999',
      txHash: '0x' + 'f'.repeat(64),
    })
    assert.isTrue(result.success)
  })

  test('accepts integer amount', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'b'.repeat(40),
      amount: '100',
      txHash: '0x' + 'c'.repeat(64),
    })
    assert.isTrue(result.success)
  })
})

test.group('webSendEventSchema | Invalid toAddress', () => {
  test('rejects address missing 0x prefix', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: 'Aa5B05d77C45E00C023ff90a7dB2c9FBD9bcde4aa',
      amount: '10',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects address with wrong length (too short)', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(39),
      amount: '10',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects address with wrong length (too long)', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(41),
      amount: '10',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects address with non-hex chars', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'g'.repeat(40),
      amount: '10',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })
})

test.group('webSendEventSchema | Invalid amount', () => {
  test('rejects amount with too many decimals', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: '10.1234567',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects non-numeric amount', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: 'abc',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects negative amount', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: '-10',
      txHash: '0x' + 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })
})

test.group('webSendEventSchema | Invalid txHash', () => {
  test('rejects txHash missing 0x prefix', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: '10',
      txHash: 'a'.repeat(64),
    })
    assert.isFalse(result.success)
  })

  test('rejects txHash with wrong length', ({ assert }) => {
    const result = webSendEventSchema.safeParse({
      toAddress: '0x' + 'a'.repeat(40),
      amount: '10',
      txHash: '0x' + 'a'.repeat(63),
    })
    assert.isFalse(result.success)
  })
})
