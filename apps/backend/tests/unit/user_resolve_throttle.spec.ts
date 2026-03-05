/**
 * Per-User Phone Resolution Throttle Tests
 *
 * Tests checkUserResolveThrottle (Map 4 of RateLimitService).
 * Limit: 20 lookups per hour per user.
 */

import { test } from '@japa/runner'
import RateLimitService from '#services/rate_limit_service'

test.group('RateLimitService | User Resolve Throttle', () => {
  test('first lookup is allowed', ({ assert }) => {
    const svc = new RateLimitService()
    assert.isTrue(svc.checkUserResolveThrottle('+573001234567'))
  })

  test('lookups within limit (20) are allowed', ({ assert }) => {
    const svc = new RateLimitService()
    const phone = '+573001234567'

    for (let i = 0; i < 20; i++) {
      assert.isTrue(svc.checkUserResolveThrottle(phone), `lookup ${i + 1} should be allowed`)
    }
  })

  test('21st lookup is blocked', ({ assert }) => {
    const svc = new RateLimitService()
    const phone = '+573001234567'

    // Exhaust the 20-lookup limit
    for (let i = 0; i < 20; i++) {
      svc.checkUserResolveThrottle(phone)
    }

    // 21st should be blocked
    assert.isFalse(svc.checkUserResolveThrottle(phone))
  })

  test('different phone numbers are independent', ({ assert }) => {
    const svc = new RateLimitService()
    const phone1 = '+573001234567'
    const phone2 = '+573009876543'

    // Exhaust phone1 limit
    for (let i = 0; i < 21; i++) {
      svc.checkUserResolveThrottle(phone1)
    }

    // phone2 should still be allowed
    assert.isTrue(svc.checkUserResolveThrottle(phone2))
  })

  test('lookups above limit stay blocked', ({ assert }) => {
    const svc = new RateLimitService()
    const phone = '+573001234567'

    // Exhaust + 5 extra
    for (let i = 0; i < 25; i++) {
      svc.checkUserResolveThrottle(phone)
    }

    assert.isFalse(svc.checkUserResolveThrottle(phone))
  })
})
