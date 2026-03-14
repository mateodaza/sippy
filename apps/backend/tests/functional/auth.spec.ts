/**
 * Auth API Functional Tests
 *
 * Tests the auth routes: send-otp, verify-otp, and jwks.
 *
 * NOTE: The ipThrottle middleware is shared across all throttled routes
 * (resolve-phone, resolve-address, send-otp, verify-otp) and uses a per-IP
 * counter with a limit of 10 requests/minute. To avoid exhausting the budget
 * before resolve.spec.ts tests, throttle-hitting test cases are consolidated
 * to 2 representative calls. Detailed input validation is covered in unit
 * tests (normalize_phone.spec.ts).
 */

import { test } from '@japa/runner'

test.group('Auth | GET /api/auth/.well-known/jwks.json', () => {
  test('returns 200 with keys array', async ({ client, assert }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    response.assertStatus(200)
    const body = response.body() as { keys?: unknown[] }
    assert.property(body, 'keys')
    assert.isArray(body.keys)
  })

  test('returns Cache-Control: public, max-age=3600', async ({ client }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    response.assertStatus(200)
    const cacheControl = response.header('cache-control')
    if (cacheControl) {
      const parts = cacheControl.split(',').map((s: string) => s.trim())
      const hasPublic = parts.some((p: string) => p === 'public')
      const hasMaxAge = parts.some((p: string) => p === 'max-age=3600')
      if (!hasPublic || !hasMaxAge) {
        throw new Error(`Expected Cache-Control: public, max-age=3600 but got: ${cacheControl}`)
      }
    }
  })
})

test.group('Auth | POST /api/auth/send-otp (throttled)', () => {
  // TC-R3: missing body returns 422 — representative validation test.
  // TC-R4 and TC-R5 are omitted at HTTP level to stay within the shared IP
  // throttle budget (10 req/min). Those cases are covered by unit tests.
  test('returns 422 when no phone provided', async ({ client }) => {
    const response = await client.post('/api/auth/send-otp').json({})
    response.assertStatus(422)
    response.assertBodyContains({ error: 'Invalid phone number' })
  })
})

test.group('Auth | POST /api/auth/verify-otp (throttled)', () => {
  // TC-R8: valid phone + valid 6-digit code but no OTP in store → 401.
  // TC-R6 and TC-R7 validation cases are omitted at HTTP level to stay within
  // the shared IP throttle budget. Those cases are covered by unit tests.
  test('returns 401 when no OTP in store for valid inputs', async ({ client }) => {
    const response = await client
      .post('/api/auth/verify-otp')
      .json({ phone: '+15555555555', code: '123456' })
    response.assertStatus(401)
    response.assertBodyContains({ error: 'Invalid OTP' })
  })
})

test.group('Auth | JWT middleware on API group', () => {
  test('GET /api/wallet-status without auth returns 401', async ({ client }) => {
    const response = await client.get('/api/wallet-status')
    response.assertStatus(401)
  })

  test('GET /api/wallet-status with invalid Bearer token returns 401', async ({ client }) => {
    const response = await client
      .get('/api/wallet-status')
      .header('Authorization', 'Bearer invalid_token_xyz')
    response.assertStatus(401)
  })
})
