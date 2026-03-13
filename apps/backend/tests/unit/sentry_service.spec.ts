/**
 * SentryService Unit Tests
 *
 * Tests redactPii (pure logic) and smoke-tests captureException/captureMessage
 * to ensure they don't throw when Sentry is uninitialised (no DSN).
 */

import { test } from '@japa/runner'
import { redactPii } from '#services/sentry_service'
import sentryService from '#services/sentry_service'

test.group('redactPii | phone numbers', () => {
  test('masks a US phone number, keeping country prefix and last 2 digits', ({ assert }) => {
    const result = redactPii({ phone: '+12345678901' })
    assert.equal(result['phone'], '+123***01')
  })

  test('masks a 7-digit-minimum phone', ({ assert }) => {
    const result = redactPii({ phone: '+1234567' })
    assert.equal(result['phone'], '+123***67')
  })

  test('masks phone numbers embedded in longer strings', ({ assert }) => {
    const result = redactPii({ msg: 'Sending to +12345678901 now' })
    assert.include(result['msg'] as string, '+123***01')
    assert.notInclude(result['msg'] as string, '+12345678901')
  })

  test('leaves short numeric strings without + prefix untouched', ({ assert }) => {
    const result = redactPii({ code: '12345' })
    assert.equal(result['code'], '12345')
  })
})

test.group('redactPii | wallet addresses', () => {
  test('truncates a full 40-hex wallet address', ({ assert }) => {
    const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
    const result = redactPii({ address: addr })
    assert.equal(result['address'], '0xabcdef...ef12')
  })

  test('truncates wallet address embedded in a string', ({ assert }) => {
    const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
    const result = redactPii({ msg: `wallet: ${addr}` })
    assert.include(result['msg'] as string, '0xabcdef...ef12')
    assert.notInclude(result['msg'] as string, addr)
  })

  test('leaves non-address hex strings untouched', ({ assert }) => {
    // Less than 40 hex chars — not a wallet address
    const result = redactPii({ txid: '0xabc123' })
    assert.equal(result['txid'], '0xabc123')
  })
})

test.group('redactPii | clean data', () => {
  test('passes through plain text unmodified', ({ assert }) => {
    const result = redactPii({ msg: 'Balance: $42.50 USDC', amount: 42.5 })
    assert.equal(result['msg'], 'Balance: $42.50 USDC')
    assert.equal(result['amount'], 42.5)
  })

  test('passes through non-string values unmodified', ({ assert }) => {
    const result = redactPii({ count: 3, flag: true, obj: { nested: 1 } })
    assert.equal(result['count'], 3)
    assert.equal(result['flag'], true)
    assert.deepEqual(result['obj'], { nested: 1 })
  })
})

test.group('sentryService | smoke tests', () => {
  test('captureException does not throw when Sentry is uninitialised', ({ assert }) => {
    assert.doesNotThrow(() => {
      sentryService.captureException(new Error('test'), { url: '/test' })
    })
  })

  test('captureMessage does not throw when Sentry is uninitialised', ({ assert }) => {
    assert.doesNotThrow(() => {
      sentryService.captureMessage('test message', 'error', { to: '1234567890' })
    })
  })
})
