/**
 * EL-002: Balance Security Limit — Unit Tests
 *
 * Covers pure functions only (no DB, no mocks needed):
 *   - formatDailySecurityLimitBalance()
 *   - appendSecurityLimitSuffix()
 *   - computeNewDailySpent()
 */

import { test } from '@japa/runner'
import { computeNewDailySpent } from '#services/cdp_wallet.service'
import { formatDailySecurityLimitBalance, formatSpendingLimitBalance } from '#utils/messages'
import { appendSecurityLimitSuffix } from '#commands/balance_command'

// ---------------------------------------------------------------------------
// Group A: formatDailySecurityLimitBalance() — pure formatter, all 3 languages
// ---------------------------------------------------------------------------

test.group('formatDailySecurityLimitBalance | EN', () => {
  test('TC-EL-20: verified user ($500 limit, $42.50 remaining)', ({ assert }) => {
    const result = formatDailySecurityLimitBalance('42.50', '500.00', 'en')
    assert.equal(result, 'Daily limit: $42.50 remaining of $500.00')
  })

  test('TC-EL-21: unverified user ($50 limit, $0 remaining)', ({ assert }) => {
    const result = formatDailySecurityLimitBalance('0.00', '50.00', 'en')
    assert.equal(result, 'Daily limit: $0.00 remaining of $50.00')
  })

  test('TC-EL-24: remaining never goes below $0.00 (test with 0)', ({ assert }) => {
    const result = formatDailySecurityLimitBalance('0.00', '50.00', 'en')
    assert.include(result, '$0.00')
  })
})

test.group('formatDailySecurityLimitBalance | ES', () => {
  test('TC-EL-22: ES contains Limite diario and restante de', ({ assert }) => {
    const result = formatDailySecurityLimitBalance('42.50', '500.00', 'es')
    assert.include(result, 'Limite diario:')
    assert.include(result, 'restante de')
  })
})

test.group('formatDailySecurityLimitBalance | PT', () => {
  test('TC-EL-23: PT contains Limite diario and restante de', ({ assert }) => {
    const result = formatDailySecurityLimitBalance('42.50', '500.00', 'pt')
    assert.include(result, 'Limite diario:')
    assert.include(result, 'restante de')
  })
})

// ---------------------------------------------------------------------------
// Group B: appendSecurityLimitSuffix() — pure helper, covers both balance paths
// ---------------------------------------------------------------------------

test.group('appendSecurityLimitSuffix', () => {
  test('TC-EL-25: verified user, EN — suffix starts with \\n\\n and includes $500.00', ({
    assert,
  }) => {
    const result = appendSecurityLimitSuffix({ remaining: 500, effectiveLimit: 500 }, 'en')
    assert.isTrue(result.startsWith('\n\n'))
    assert.include(result, '$500.00')
  })

  test('TC-EL-26: unverified user, EN — suffix includes $50.00 as total', ({ assert }) => {
    const result = appendSecurityLimitSuffix({ remaining: 50, effectiveLimit: 50 }, 'en')
    assert.include(result, '$50.00')
  })

  test('TC-EL-27: embedded path regression — daily_spent=10 on $50 tier produces correct message', ({
    assert,
  }) => {
    const result = appendSecurityLimitSuffix({ remaining: 40, effectiveLimit: 50 }, 'en')
    assert.include(result, '$40.00 remaining of $50.00')
  })
})

// ---------------------------------------------------------------------------
// Group C: computeNewDailySpent() — pure helper, guards embedded daily_spent accumulation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Group C2: Capped limit display — verifies the Math.min logic used in
// handleEmbeddedBalance to cap on-chain values at the effective tier limit
// ---------------------------------------------------------------------------

test.group('Capped limit display logic', () => {
  test('legacy $10K on-chain, $50 tier → shows $50', ({ assert }) => {
    const onchainAllowance = 10000
    const onchainRemaining = 9990
    const effectiveLimit = 50
    const effectiveRemaining = 40 // $10 spent

    const cappedTotal = Math.min(onchainAllowance, effectiveLimit)
    const cappedRemaining = Math.min(onchainRemaining, effectiveRemaining)

    const result = formatSpendingLimitBalance(
      cappedRemaining.toFixed(2),
      cappedTotal.toFixed(2),
      12,
      'en'
    )
    assert.include(result, '$40.00')
    assert.include(result, '$50.00')
    assert.notInclude(result, '10000')
  })

  test('new user $50 on-chain, $500 verified tier → shows $50 (on-chain is lower)', ({
    assert,
  }) => {
    const onchainAllowance = 50
    const onchainRemaining = 50
    const effectiveLimit = 500
    const effectiveRemaining = 500

    const cappedTotal = Math.min(onchainAllowance, effectiveLimit)
    const cappedRemaining = Math.min(onchainRemaining, effectiveRemaining)

    const result = formatSpendingLimitBalance(
      cappedRemaining.toFixed(2),
      cappedTotal.toFixed(2),
      20,
      'en'
    )
    assert.include(result, '$50.00 of $50.00')
  })

  test('on-chain and tier equal ($500/$500) → shows $500', ({ assert }) => {
    const cappedTotal = Math.min(500, 500)
    const cappedRemaining = Math.min(450, 450)

    const result = formatSpendingLimitBalance(
      cappedRemaining.toFixed(2),
      cappedTotal.toFixed(2),
      8,
      'es'
    )
    assert.include(result, '$450.00')
    assert.include(result, '$500.00')
  })
})

// ---------------------------------------------------------------------------
// Group D: computeNewDailySpent() — pure helper, guards embedded daily_spent accumulation
// ---------------------------------------------------------------------------

test.group('computeNewDailySpent', () => {
  test('TC-EL-28: same day, accumulates', ({ assert }) => {
    const result = computeNewDailySpent(20, 'Fri Mar 13 2026', 10, 'Fri Mar 13 2026')
    assert.equal(result, 30)
  })

  test('TC-EL-29: new day, resets to amount', ({ assert }) => {
    const result = computeNewDailySpent(20, 'Thu Mar 12 2026', 10, 'Fri Mar 13 2026')
    assert.equal(result, 10)
  })

  test('TC-EL-30: first spend of the day (no prior balance)', ({ assert }) => {
    const result = computeNewDailySpent(0, 'Fri Mar 13 2026', 15, 'Fri Mar 13 2026')
    assert.equal(result, 15)
  })
})
