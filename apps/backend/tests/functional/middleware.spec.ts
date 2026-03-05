/**
 * Middleware Functional Tests
 *
 * Tests CDP Auth middleware and IP Throttle middleware behavior
 * through actual HTTP requests.
 */

import { test } from '@japa/runner'

test.group('Middleware | CDP Auth', () => {
  test('missing Authorization header returns 401', async ({ client }) => {
    const response = await client.get('/api/wallet-status')
    response.assertStatus(401)
    response.assertBodyContains({ error: 'Unauthorized' })
  })

  test('invalid Bearer token returns 401', async ({ client }) => {
    const response = await client
      .get('/api/wallet-status')
      .header('Authorization', 'Bearer invalid_token_xyz')

    response.assertStatus(401)
    response.assertBodyContains({ error: 'Unauthorized' })
  })

  test('all /api/* routes require auth', async ({ client }) => {
    const routes = [
      { method: 'post' as const, path: '/api/register-wallet' },
      { method: 'post' as const, path: '/api/register-permission' },
      { method: 'post' as const, path: '/api/revoke-permission' },
      { method: 'post' as const, path: '/api/ensure-gas' },
      { method: 'get' as const, path: '/api/wallet-status' },
      { method: 'post' as const, path: '/api/log-export-event' },
      { method: 'post' as const, path: '/api/resolve-phone' },
      { method: 'post' as const, path: '/api/log-web-send' },
    ]

    for (const route of routes) {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    }
  })
})

test.group('Middleware | IP Throttle', () => {
  test('first request to /resolve-phone is not throttled', async ({ client, assert }) => {
    const response = await client.get('/resolve-phone').qs({ phone: '+0000000000' })
    // Should get 400 or 404 (not 429 throttled)
    assert.notEqual(response.status(), 429)
  })
})
