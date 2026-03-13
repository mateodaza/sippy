/**
 * User Language Functional Tests
 *
 * Tests that GET /api/user-language is correctly registered inside the
 * JWT-authenticated route group. Controller behaviour is covered by unit tests.
 */

import { test } from '@japa/runner'

test.group('User Language | JWT middleware on /api/user-language', () => {
  test('TC-LN-002-F01: GET /api/user-language without auth returns 401', async ({ client }) => {
    const response = await client.get('/api/user-language')
    response.assertStatus(401)
  })

  test('TC-LN-002-F02: GET /api/user-language with invalid Bearer token returns 401', async ({ client }) => {
    const response = await client
      .get('/api/user-language')
      .header('Authorization', 'Bearer invalid_xyz')
    response.assertStatus(401)
  })
})
