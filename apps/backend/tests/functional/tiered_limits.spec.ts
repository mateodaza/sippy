/**
 * EL-004: Tiered Limits — Functional Tests
 *
 * Exercises checkSecurityLimits(phoneNumber, amount) through the full DB-backed
 * path, covering ACs 1, 2, and 3.
 *
 * These tests seed real rows in phone_registry and user_preferences using
 * query() and call checkSecurityLimits() directly (no HTTP). This proves that
 * the function reads email_verified and daily_spent from DB on each invocation.
 *
 * Test phone numbers use prefix +15550040XXX (unlikely to collide with other fixtures).
 */

import { test } from '@japa/runner'
import { query } from '#services/db'
import { checkSecurityLimits } from '#services/cdp_wallet.service'
import { isDbAvailable } from '../helpers/skip_without_db.js'

const NOW = Date.now()
const TODAY = new Date().toDateString()

// ---------------------------------------------------------------------------
// AC1 — checkSecurityLimits blocks unverified user at $50 (real DB)
// ---------------------------------------------------------------------------

test.group('AC1 | checkSecurityLimits | unverified blocked at $50 (DB)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => {
    if (!(await isDbAvailable())) return
    await query(
      `INSERT INTO phone_registry
        (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (phone_number) DO UPDATE SET daily_spent = EXCLUDED.daily_spent`,
      [
        '+15550040001',
        'test-wallet-el004-001',
        '0x0000000000000000000000000000000000000001',
        NOW,
        NOW,
        40,
        TODAY,
      ]
    )
    await query(
      `INSERT INTO user_preferences (phone_number, email_verified)
       VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET email_verified = EXCLUDED.email_verified`,
      ['+15550040001', false]
    )
  })

  group.teardown(async () => {
    if (!(await isDbAvailable())) return
    await query('DELETE FROM phone_registry WHERE phone_number = $1', ['+15550040001'])
    await query('DELETE FROM user_preferences WHERE phone_number = $1', ['+15550040001'])
  })

  test('TC-EL-004-F01: daily_spent=40, amount=11 → blocked (40+11=51 > 50 unverified limit)', async ({
    assert,
  }) => {
    const result = await checkSecurityLimits('+15550040001', 11)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isFalse(result.emailVerified)
  })

  test('TC-EL-004-F02: daily_spent=40, amount=10 → allowed (40+10=50 not > 50, boundary is strictly >)', async ({
    assert,
  }) => {
    const result = await checkSecurityLimits('+15550040001', 10)
    assert.isTrue(result.allowed)
  })
})

// ---------------------------------------------------------------------------
// AC2 — checkSecurityLimits allows verified user up to $500 (real DB)
// ---------------------------------------------------------------------------

test.group('AC2 | checkSecurityLimits | verified allowed up to $500 (DB)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => {
    if (!(await isDbAvailable())) return
    await query(
      `INSERT INTO phone_registry
        (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (phone_number) DO UPDATE SET daily_spent = EXCLUDED.daily_spent`,
      [
        '+15550040002',
        'test-wallet-el004-002',
        '0x0000000000000000000000000000000000000002',
        NOW,
        NOW,
        450,
        TODAY,
      ]
    )
    await query(
      `INSERT INTO user_preferences (phone_number, email_verified)
       VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET email_verified = EXCLUDED.email_verified`,
      ['+15550040002', true]
    )
  })

  group.teardown(async () => {
    if (!(await isDbAvailable())) return
    await query('DELETE FROM phone_registry WHERE phone_number = $1', ['+15550040002'])
    await query('DELETE FROM user_preferences WHERE phone_number = $1', ['+15550040002'])
  })

  test('TC-EL-004-F03: daily_spent=450, amount=60 → blocked (450+60=510 > 500 verified limit)', async ({
    assert,
  }) => {
    const result = await checkSecurityLimits('+15550040002', 60)
    assert.isFalse(result.allowed)
    assert.equal(result.limitType, 'daily')
    assert.isTrue(result.emailVerified)
  })

  test('TC-EL-004-F04: daily_spent=450, amount=50 → allowed (450+50=500 not > 500, right at cap)', async ({
    assert,
  }) => {
    const result = await checkSecurityLimits('+15550040002', 50)
    assert.isTrue(result.allowed)
  })
})

// ---------------------------------------------------------------------------
// AC3 — mid-day email verification changes limit immediately (real DB)
//
// Proves checkSecurityLimits() reads email_verified fresh from DB on each call.
// Same phone, same daily_spent=40, same amount=15 — only user_preferences changes.
// ---------------------------------------------------------------------------

test.group(
  'AC3 | checkSecurityLimits | mid-day verification change picked up immediately (DB)',
  (group) => {
    group.each.setup(async (t) => {
      if (!(await isDbAvailable())) t.skip(true, 'No local DB')
    })
    group.setup(async () => {
      if (!(await isDbAvailable())) return
      await query(
        `INSERT INTO phone_registry
        (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (phone_number) DO UPDATE SET daily_spent = EXCLUDED.daily_spent`,
        [
          '+15550040003',
          'test-wallet-el004-003',
          '0x0000000000000000000000000000000000000003',
          NOW,
          NOW,
          40,
          TODAY,
        ]
      )
      await query(
        `INSERT INTO user_preferences (phone_number, email_verified)
       VALUES ($1, $2)
       ON CONFLICT (phone_number) DO UPDATE SET email_verified = EXCLUDED.email_verified`,
        ['+15550040003', false]
      )
    })

    group.teardown(async () => {
      if (!(await isDbAvailable())) return
      await query('DELETE FROM phone_registry WHERE phone_number = $1', ['+15550040003'])
      await query('DELETE FROM user_preferences WHERE phone_number = $1', ['+15550040003'])
    })

    test('TC-EL-004-F05/F06/F07: blocked before verification → DB update → allowed after (no restart, single test)', async ({
      assert,
    }) => {
      // Step 1 — BEFORE verification: 40+15=55 > 50 unverified limit → blocked
      const before = await checkSecurityLimits('+15550040003', 15)
      assert.isFalse(before.allowed, 'should be blocked before email verification')
      assert.equal(before.limitType, 'daily')
      assert.isFalse(before.emailVerified)

      // Step 2 — Simulate mid-day email verification (same runtime, no server restart)
      await query('UPDATE user_preferences SET email_verified = true WHERE phone_number = $1', [
        '+15550040003',
      ])

      // Step 3 — AFTER verification: same phone, same daily_spent=40, same amount=15
      // Now 40+15=55 ≤ 500 verified limit → allowed; proves DB is re-read on each call
      const after = await checkSecurityLimits('+15550040003', 15)
      assert.isTrue(after.allowed, 'should be allowed after email verification picked up from DB')

      // Step 4 — No mid-day gap regression: verified user, amount=100 → allowed (40+100=140 ≤ 500)
      const large = await checkSecurityLimits('+15550040003', 100)
      assert.isTrue(large.allowed, 'verified user should allow $100 tx within $500 daily limit')
    })
  }
)

// ---------------------------------------------------------------------------
// AC1/AC2 — wallet not found returns not-allowed (guard clause)
// ---------------------------------------------------------------------------

test.group('AC1/AC2 | checkSecurityLimits | unknown phone → not-allowed guard', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  test('TC-EL-004-F08: no phone_registry row for phone → { allowed: false, reason: "User wallet not found" }', async ({
    assert,
  }) => {
    const result = await checkSecurityLimits('+15550040099', 10)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'User wallet not found')
  })
})
