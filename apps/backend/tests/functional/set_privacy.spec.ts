/**
 * Set Privacy Functional Tests
 *
 * Tests that POST /api/set-privacy is correctly registered inside the
 * JWT-authenticated route group. Controller behaviour is covered by unit tests.
 */

import { test } from '@japa/runner'

test.group('Set Privacy | JWT middleware on /api/set-privacy', () => {
  test('TC-PV-001-F-RT01: POST /api/set-privacy without auth returns 401', async ({ client }) => {
    const response = await client.post('/api/set-privacy').json({ phoneVisible: true })
    response.assertStatus(401)
  })

  test('TC-PV-001-F-RT02: POST /api/set-privacy with invalid Bearer token returns 401', async ({ client }) => {
    const response = await client
      .post('/api/set-privacy')
      .header('Authorization', 'Bearer invalid_xyz')
      .json({ phoneVisible: true })
    response.assertStatus(401)
  })
})
