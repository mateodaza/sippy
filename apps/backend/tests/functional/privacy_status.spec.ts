/**
 * Privacy Status Functional Tests
 *
 * Tests that GET /api/privacy-status is correctly registered inside the
 * JWT-authenticated route group. Controller behaviour is covered by unit tests.
 */

import { test } from '@japa/runner'

test.group('Privacy Status | JWT middleware on /api/privacy-status', () => {
  test('TC-PV-001-F-RS01: GET /api/privacy-status without auth returns 401', async ({ client }) => {
    const response = await client.get('/api/privacy-status')
    response.assertStatus(401)
  })

  test('TC-PV-001-F-RS02: GET /api/privacy-status with invalid Bearer token returns 401', async ({
    client,
  }) => {
    const response = await client
      .get('/api/privacy-status')
      .header('Authorization', 'Bearer invalid_xyz')
    response.assertStatus(401)
  })
})
