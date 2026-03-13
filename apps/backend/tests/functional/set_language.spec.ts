/**
 * Set Language Functional Tests
 *
 * Tests that POST /api/set-language is correctly registered inside the
 * JWT-authenticated route group. Controller behaviour is covered by unit tests.
 */

import { test } from '@japa/runner'

test.group('Set Language | JWT middleware on /api/set-language', () => {
  test('TC-LN-003-F-RT01: POST /api/set-language without auth returns 401', async ({ client }) => {
    const response = await client.post('/api/set-language').json({ language: 'en' })
    response.assertStatus(401)
  })

  test('TC-LN-003-F-RT02: POST /api/set-language with invalid Bearer token returns 401', async ({ client }) => {
    const response = await client
      .post('/api/set-language')
      .header('Authorization', 'Bearer invalid_xyz')
      .json({ language: 'en' })
    response.assertStatus(401)
  })
})
