/**
 * EL-004: Tiered Limits — Unit Tests
 *
 * Boundary tests for computeSecurityLimits(), computeNewDailySpent(), and
 * formatTieredDailyLimitExceededMessage() focused on EL-004 ACs.
 *
 * Does NOT duplicate tests already in:
 *   - tiered_daily_limit.spec.ts (TC-EL-01 through TC-EL-13)
 *   - balance_security_limit.spec.ts (TC-EL-20 through TC-EL-30)
 *
 * These tests use distinct boundary inputs and assert against exported
 * constants (DAILY_LIMIT_UNVERIFIED, DAILY_LIMIT_VERIFIED) rather than
 * hardcoded magic numbers.
 */

import { test } from '@japa/runner'
import {
  computeSecurityLimits,
  computeNewDailySpent,
  DAILY_LIMIT_UNVERIFIED,
  DAILY_LIMIT_VERIFIED,
} from '#services/cdp_wallet.service'
import { formatTieredDailyLimitExceededMessage } from '#utils/messages'

// ---------------------------------------------------------------------------
// AC1 — unverified user blocked at $50 (boundary)
// ---------------------------------------------------------------------------

test.group('AC1 | computeSecurityLimits | unverified $50 boundary', () => {
  test('TC-EL-004-01: unverified, $0 spent, $50 → allowed (exactly at cap, boundary is strictly >)', ({
    assert,
  }) => {
    assert.equal(DAILY_LIMIT_UNVERIFIED, 50)
    const result = computeSecurityLimits(false, 0, 50)
    assert.isTrue(result.allowed)
  })

  test('TC-EL-004-02: unverified, $0 spent, $50.01 → blocked daily (first cent over cap)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(false, 0, 50.01)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isFalse(result.emailVerified)
  })

  test('TC-EL-004-03: unverified, $49 spent, $2 → blocked daily (accumulation: 49+2=51 > 50)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(false, 49, 2)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isFalse(result.emailVerified)
  })

  test('TC-EL-004-04: unverified, $50 spent, $0 → allowed (spent=cap, zero additional)', ({
    assert,
  }) => {
    assert.equal(DAILY_LIMIT_UNVERIFIED, 50)
    const result = computeSecurityLimits(false, 50, 0)
    assert.isTrue(result.allowed)
  })
})

// ---------------------------------------------------------------------------
// AC2 — verified user allowed up to $500 (boundary)
// ---------------------------------------------------------------------------

test.group('AC2 | computeSecurityLimits | verified $500 boundary', () => {
  test('TC-EL-004-05: verified, $0 spent, $100 → allowed (within tx limit and daily limit)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(true, 0, 100)
    assert.isTrue(result.allowed)
  })

  test('TC-EL-004-06: verified, $499 spent, $1 → allowed (exactly fills $500 cap: 499+1=500 not > 500)', ({
    assert,
  }) => {
    assert.equal(DAILY_LIMIT_VERIFIED, 500)
    const result = computeSecurityLimits(true, 499, 1)
    assert.isTrue(result.allowed)
    assert.isTrue(result.emailVerified)
  })

  test('TC-EL-004-07: verified, $450 spent, $51 → blocked daily (450+51=501 > 500)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(true, 450, 51)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isTrue(result.emailVerified)
  })

  test('TC-EL-004-08: verified, $499.50 spent, $0.51 → blocked daily (sub-dollar: 499.50+0.51=500.01 > 500)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(true, 499.5, 0.51)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isTrue(result.emailVerified)
  })
})

// ---------------------------------------------------------------------------
// AC4 — limit message includes upgrade CTA for unverified users
//
// These tests assert that the CTA references the DAILY_LIMIT_VERIFIED constant
// (not a hardcoded 500) and that verified users do NOT receive a CTA.
// ---------------------------------------------------------------------------

test.group('AC4 | formatTieredDailyLimitExceededMessage | CTA via constant', () => {
  test('TC-EL-004-09: unverified EN → includes sippy.lat/settings and $500/day (via DAILY_LIMIT_VERIFIED)', ({
    assert,
  }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+573001234567', 'en', false)
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, `$${DAILY_LIMIT_VERIFIED}/day`)
  })

  test('TC-EL-004-10: unverified ES → includes sippy.lat/settings and $500/dia (via DAILY_LIMIT_VERIFIED)', ({
    assert,
  }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+573001234567', 'es', false)
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, `$${DAILY_LIMIT_VERIFIED}/dia`)
  })

  test('TC-EL-004-11: unverified PT → includes sippy.lat/settings and $500/dia (via DAILY_LIMIT_VERIFIED)', ({
    assert,
  }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+556199999999', 'pt', false)
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, `$${DAILY_LIMIT_VERIFIED}/dia`)
  })

  test('TC-EL-004-12: verified EN → does NOT include sippy.lat/settings (no CTA when already verified)', ({
    assert,
  }) => {
    const msg = formatTieredDailyLimitExceededMessage(500, '+573001234567', 'en', true)
    assert.notInclude(msg, 'sippy.lat/settings')
  })
})

// ---------------------------------------------------------------------------
// AC5 — daily limit resets regardless of tier
//
// These tests add tier-specific context to the reset logic already in
// balance_security_limit.spec.ts: both unverified ($50) and verified ($500)
// users experience a full reset, and the new tier limit applies fresh.
// ---------------------------------------------------------------------------

test.group('AC5 | computeNewDailySpent | daily reset for both tiers', () => {
  test('TC-EL-004-13: unverified user at $49 yesterday; new day resets to $10 (new amount only)', ({
    assert,
  }) => {
    const result = computeNewDailySpent(49, 'Thu Mar 12 2026', 10, 'Fri Mar 13 2026')
    assert.equal(result, 10)
  })

  test('TC-EL-004-14: verified user at $499 yesterday; new day resets to $50 (new amount only)', ({
    assert,
  }) => {
    const result = computeNewDailySpent(499, 'Thu Mar 12 2026', 50, 'Fri Mar 13 2026')
    assert.equal(result, 50)
  })

  test('TC-EL-004-15: unverified limit applies fresh after reset — spent=10, amount=30 → allowed (10+30=40 ≤ 50)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(false, 10, 30)
    assert.isTrue(result.allowed)
  })

  test('TC-EL-004-16: verified limit applies fresh after reset — spent=50, amount=100 → allowed (50+100=150 ≤ 500)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(true, 50, 100)
    assert.isTrue(result.allowed)
  })
})
