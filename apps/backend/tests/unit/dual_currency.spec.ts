/**
 * DC-006 Dual Currency Formatter Tests
 *
 * AC coverage:
 * - formatDualAmount: with rate (various currencies and separators)
 * - formatDualAmount: without rate (graceful fallback)
 * - formatDualAmount: edge cases (zero, fractional, large)
 * - formatBalanceMessage: dual currency integration
 */

import { test } from '@japa/runner'
import { formatDualAmount, formatBalanceMessage } from '#utils/messages'

// ── Group A: formatDualAmount — with rate ───────────────────────────────────

test.group('formatDualAmount | with rate', () => {
  test('basic COP (comma thousands separator)', ({ assert }) => {
    assert.equal(formatDualAmount(10, 4000, 'COP'), '$10.00 (~40,000 COP)')
  })

  test('basic MXN (dot thousands separator)', ({ assert }) => {
    assert.equal(formatDualAmount(10, 17, 'MXN'), '$10.00 (~170 MXN)')
  })

  test('basic BRL (dot thousands separator)', ({ assert }) => {
    assert.equal(formatDualAmount(10, 5, 'BRL'), '$10.00 (~50 BRL)')
  })

  test('rounding half-up', ({ assert }) => {
    assert.equal(formatDualAmount(1, 4150.6, 'COP'), '$1.00 (~4,151 COP)')
  })

  test('large amount with COP separator', ({ assert }) => {
    // TODO: spec ambiguity — formatCurrencyUSD uses toFixed(2) without USD thousands sep
    assert.equal(formatDualAmount(1000, 4000, 'COP'), '$1000.00 (~4,000,000 COP)')
  })

  test('unknown currency falls back to comma separator', ({ assert }) => {
    assert.equal(formatDualAmount(10, 100, 'XYZ'), '$10.00 (~1,000 XYZ)')
  })
})

// ── Group B: formatDualAmount — without rate ────────────────────────────────

test.group('formatDualAmount | without rate (graceful fallback)', () => {
  test('rate is null → bare USD string', ({ assert }) => {
    assert.equal(formatDualAmount(10, null, 'COP'), '$10.00')
  })

  test('currency is null → bare USD string', ({ assert }) => {
    assert.equal(formatDualAmount(10, 4000, null), '$10.00')
  })

  test('both null → bare USD string', ({ assert }) => {
    assert.equal(formatDualAmount(10, null, null), '$10.00')
  })
})

// ── Group C: formatDualAmount — edge cases ──────────────────────────────────

test.group('formatDualAmount | edge cases', () => {
  test('zero amount', ({ assert }) => {
    assert.equal(formatDualAmount(0, 4000, 'COP'), '$0.00 (~0 COP)')
  })

  test('fractional USD with integer local result', ({ assert }) => {
    // Math.round(0.01 * 4150) = Math.round(41.5) = 42
    assert.equal(formatDualAmount(0.01, 4150, 'COP'), '$0.01 (~42 COP)')
  })

  test('very large local amount (7+ digits)', ({ assert }) => {
    // TODO: spec ambiguity — formatCurrencyUSD uses toFixed(2) without USD thousands sep
    assert.equal(formatDualAmount(1000, 4150, 'COP'), '$1000.00 (~4,150,000 COP)')
  })
})

// ── Group D: formatBalanceMessage — dual currency integration ───────────────

test.group('formatBalanceMessage | dual currency integration', () => {
  test('with rate — en: includes dual amount', ({ assert }) => {
    const result = formatBalanceMessage(
      { balance: 10, wallet: '0x1234567890abcdef1234', localRate: 4000, localCurrency: 'COP' },
      'en'
    )
    assert.include(result, '$10.00')
    assert.include(result, '~40,000 COP')
  })

  test('without rate — en: USD only, no tilde', ({ assert }) => {
    const result = formatBalanceMessage({ balance: 10, wallet: '0x1234567890abcdef1234' }, 'en')
    assert.include(result, '$10.00')
    assert.notInclude(result, '~')
  })

  test('rate null, currency set — en: USD only, no tilde', ({ assert }) => {
    const result = formatBalanceMessage(
      { balance: 10, wallet: '0x1234567890abcdef1234', localRate: null, localCurrency: 'COP' },
      'en'
    )
    assert.include(result, '$10.00')
    assert.notInclude(result, '~')
  })

  test('zero balance with rate — en: shows zero dual amount', ({ assert }) => {
    const result = formatBalanceMessage(
      { balance: 0, wallet: '0x1234567890abcdef1234', localRate: 4000, localCurrency: 'COP' },
      'en'
    )
    assert.include(result, '$0.00')
    assert.include(result, '~0 COP')
  })
})
