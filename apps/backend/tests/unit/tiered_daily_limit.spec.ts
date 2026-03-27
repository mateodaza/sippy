/**
 * EL-001: Tiered Daily Limit — Unit Tests
 *
 * Covers pure functions only (no DB, no mocks needed):
 *   - computeSecurityLimits()
 *   - formatTieredDailyLimitExceededMessage()
 */

import { test } from '@japa/runner'
import { computeSecurityLimits } from '#services/cdp_wallet.service'
import { formatTieredDailyLimitExceededMessage } from '#utils/messages'

// ---------------------------------------------------------------------------
// computeSecurityLimits()
// ---------------------------------------------------------------------------

test.group('computeSecurityLimits | verified user ($500 limit)', () => {
  // TODO: spec ambiguity — plan specified amount=200 but $200 > $100 tx limit would be caught first;
  // using amount=50 to match the intent (verified user can send within both limits)
  test('TC-EL-01: verified, $0 spent, $50 → allowed', ({ assert }) => {
    const result = computeSecurityLimits(true, 0, 50)
    assert.isTrue(result.allowed)
  })

  // TODO: spec ambiguity — plan had (400, 200) but amount=200 exceeds $100 tx limit before daily;
  // using (450, 60) so daily is hit (450+60=510>500) without triggering tx limit (60≤100)
  test('TC-EL-02: verified, $450 spent, $60 → daily limit exceeded', ({ assert }) => {
    const result = computeSecurityLimits(true, 450, 60)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isTrue(result.emailVerified)
  })
})

test.group('computeSecurityLimits | unverified user ($50 limit)', () => {
  test('TC-EL-03: unverified, $0 spent, $30 → allowed', ({ assert }) => {
    const result = computeSecurityLimits(false, 0, 30)
    assert.isTrue(result.allowed)
  })

  test('TC-EL-04: unverified, $40 spent, $20 → daily limit exceeded', ({ assert }) => {
    const result = computeSecurityLimits(false, 40, 20)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isFalse(result.emailVerified)
  })

  test('TC-EL-05: unverified, $0 spent, $60 → daily limit exceeded (60 > 50)', ({ assert }) => {
    const result = computeSecurityLimits(false, 0, 60)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isFalse(result.emailVerified)
  })
})

test.group('computeSecurityLimits | transaction limit ($100, checked first)', () => {
  test('TC-EL-06: verified, $0 spent, $150 → transaction limit (checked before daily)', ({
    assert,
  }) => {
    const result = computeSecurityLimits(true, 0, 150)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'transaction')
  })

  test('TC-EL-07: unverified, $0 spent, $150 → transaction limit takes priority over daily', ({
    assert,
  }) => {
    const result = computeSecurityLimits(false, 0, 150)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'transaction')
  })
})

// ---------------------------------------------------------------------------
// formatTieredDailyLimitExceededMessage()
// ---------------------------------------------------------------------------

test.group('formatTieredDailyLimitExceededMessage | English', () => {
  test('TC-EL-08: unverified EN → contains upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+573001234567', 'en', false)
    assert.include(msg, "You've reached your daily limit of $50")
    assert.include(msg, 'recovery email')
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, '$500/day')
  })

  test('TC-EL-09: verified EN → no upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(500, '+573001234567', 'en', true)
    assert.include(msg, "You've reached your daily limit of $500")
    assert.include(msg, 'resets tomorrow')
    assert.notInclude(msg, 'sippy.lat/settings')
  })
})

test.group('formatTieredDailyLimitExceededMessage | Spanish', () => {
  test('TC-EL-10: unverified ES → contains upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+573001234567', 'es', false)
    assert.include(msg, 'Has alcanzado tu limite diario de $50')
    assert.include(msg, 'correo de recuperacion')
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, '$500/dia')
  })

  test('TC-EL-12: verified ES → no upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(500, '+573001234567', 'es', true)
    assert.include(msg, 'Llegaste a tu limite diario de $500')
    assert.include(msg, 'manana')
    assert.notInclude(msg, 'sippy.lat/settings')
  })
})

test.group('formatTieredDailyLimitExceededMessage | Portuguese', () => {
  test('TC-EL-11: unverified PT → contains upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(50, '+573001234567', 'pt', false)
    assert.include(msg, 'Voce atingiu seu limite diario de $50')
    assert.include(msg, 'email de recuperacao')
    assert.include(msg, 'sippy.lat/settings')
    assert.include(msg, '$500/dia')
  })

  test('TC-EL-13: verified PT → no upsell', ({ assert }) => {
    const msg = formatTieredDailyLimitExceededMessage(500, '+573001234567', 'pt', true)
    assert.include(msg, 'Voce atingiu seu limite diario de $500')
    assert.include(msg, 'amanha')
    assert.notInclude(msg, 'sippy.lat/settings')
  })
})
