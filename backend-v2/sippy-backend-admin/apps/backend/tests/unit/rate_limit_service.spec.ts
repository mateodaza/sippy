/**
 * Rate Limit Service Unit Tests (NEW)
 *
 * Tests the consolidated RateLimitService that replaces
 * the 4 scattered Maps from Express server.ts.
 */

import { test } from '@japa/runner'
import RateLimitService from '#services/rate_limit_service'

test.group('RateLimitService | Message Deduplication', () => {
  test('first check returns false (not duplicate)', ({ assert }) => {
    const svc = new RateLimitService()
    assert.isFalse(svc.isDuplicate('msg-001'))
  })

  test('after markProcessed, returns true (is duplicate)', ({ assert }) => {
    const svc = new RateLimitService()
    svc.markProcessed('msg-001')
    assert.isTrue(svc.isDuplicate('msg-001'))
  })

  test('different message IDs are independent', ({ assert }) => {
    const svc = new RateLimitService()
    svc.markProcessed('msg-001')
    assert.isFalse(svc.isDuplicate('msg-002'))
  })
})

test.group('RateLimitService | Spam Detection', () => {
  test('first message is not spam', ({ assert }) => {
    const svc = new RateLimitService()
    assert.isFalse(svc.isSpamming('573001234567'))
  })

  test('messages below threshold are not spam', ({ assert }) => {
    const svc = new RateLimitService()
    // Send messages under the limit (default is 10/min)
    for (let i = 0; i < 9; i++) {
      svc.isSpamming('573001234567')
    }
    assert.isFalse(svc.isSpamming('573001234567'))
  })

  test('messages above threshold trigger spam', ({ assert }) => {
    const svc = new RateLimitService()
    // Send 11 messages (threshold is 10)
    for (let i = 0; i < 11; i++) {
      svc.isSpamming('573001234567')
    }
    assert.isTrue(svc.isSpamming('573001234567'))
  })

  test('different phone numbers are independent', ({ assert }) => {
    const svc = new RateLimitService()
    for (let i = 0; i < 15; i++) {
      svc.isSpamming('573001234567')
    }
    assert.isFalse(svc.isSpamming('573009999999'))
  })
})

test.group('RateLimitService | IP Throttle', () => {
  test('first request is allowed', ({ assert }) => {
    const svc = new RateLimitService()
    const result = svc.checkIpResolveThrottle('192.168.1.1')
    assert.isTrue(result.allowed)
  })

  test('requests within limit are allowed', ({ assert }) => {
    const svc = new RateLimitService()
    for (let i = 0; i < 9; i++) {
      svc.checkIpResolveThrottle('192.168.1.1')
    }
    const result = svc.checkIpResolveThrottle('192.168.1.1')
    assert.isTrue(result.allowed)
  })

  test('requests above limit are blocked', ({ assert }) => {
    const svc = new RateLimitService()
    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      svc.checkIpResolveThrottle('192.168.1.1')
    }
    const result = svc.checkIpResolveThrottle('192.168.1.1')
    assert.isFalse(result.allowed)
    assert.isDefined(result.retryAfter)
  })

  test('different IPs are independent', ({ assert }) => {
    const svc = new RateLimitService()
    for (let i = 0; i < 15; i++) {
      svc.checkIpResolveThrottle('192.168.1.1')
    }
    const result = svc.checkIpResolveThrottle('192.168.1.2')
    assert.isTrue(result.allowed)
  })
})
