/**
 * PV-002: Profile endpoint functional tests
 *
 * Tests GET /api/profile which is now JWT-authenticated and owner-only.
 * Unauthenticated requests and requests for other users' profiles are rejected.
 *
 * Fixtures use prefix +15550050XXX to avoid collision with other test data.
 */
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import '#types/container'

// ---------------------------------------------------------------------------
// 401 — no auth token
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | unauthenticated → 401', (group) => {
  group.setup(async () => {
    const rls = await app.container.make('rateLimitService')
    rls.resetIpThrottle()
  })

  test('TC-PV-002-F01: missing auth token returns 401', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050001' })
    response.assertStatus(401)
  })

  test('TC-PV-002-F02: invalid auth token returns 401', async ({ client }) => {
    const response = await client
      .get('/api/profile')
      .header('Authorization', 'Bearer invalid_token')
      .qs({ phone: '+15550050001' })
    response.assertStatus(401)
  })
})

// ---------------------------------------------------------------------------
// 400 — invalid/missing phone (with invalid token → 401 takes precedence)
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | no auth + invalid phone → 401', (group) => {
  group.teardown(async () => {
    const rls = await app.container.make('rateLimitService')
    rls.resetIpThrottle()
  })

  test('TC-PV-002-F03: missing phone param without auth returns 401', async ({ client }) => {
    const response = await client.get('/api/profile')
    response.assertStatus(401)
  })

  test('TC-PV-002-F04: non-E.164 phone without auth returns 401', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: 'not-a-phone' })
    response.assertStatus(401)
  })
})
