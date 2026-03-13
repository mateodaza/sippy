/**
 * Route Parity Validation Tests
 *
 * Verifies that ALL Express routes exist in AdonisJS with the same
 * paths, methods, and response shapes. This is the critical migration
 * parity check — Meta webhook URLs cannot change.
 */

import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'

function signPayload(payload: object): string {
  const raw = JSON.stringify(payload)
  return 'sha256=' + createHmac('sha256', 'test-app-secret').update(raw).digest('hex')
}

test.group('Parity | All Express routes exist', () => {
  test('GET / (health)', async ({ client, assert }) => {
    const response = await client.get('/')
    const body = response.body()
    assert.property(body, 'status')
    assert.property(body, 'timestamp')
  })

  test('GET /api/health', async ({ client, assert }) => {
    const response = await client.get('/api/health')
    const body = response.body()
    assert.property(body, 'status')
    assert.property(body, 'service')
  })

  test('GET /webhook/whatsapp (verify)', async ({ client }) => {
    const response = await client.get('/webhook/whatsapp').qs({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': 'parity_check',
    })
    response.assertStatus(200)
    response.assertTextIncludes('parity_check')
  })

  test('POST /webhook/whatsapp (receive)', async ({ client }) => {
    const payload = { entry: [] }
    const response = await client
      .post('/webhook/whatsapp')
      .header('x-hub-signature-256', signPayload(payload))
      .json(payload)
    response.assertStatus(200)
  })

  test('GET /resolve-phone without param → 400', async ({ client }) => {
    const response = await client.get('/resolve-phone')
    response.assertStatus(400)
  })

  test('GET /resolve-address without param → 400', async ({ client }) => {
    const response = await client.get('/resolve-address')
    response.assertStatus(400)
  })

  test('POST /notify-fund without secret → 401', async ({ client }) => {
    const response = await client.post('/notify-fund').json({})
    response.assertStatus(401)
  })

  test('GET /debug/wallets exists', async ({ client, assert }) => {
    const response = await client.get('/debug/wallets')
    // Either 200 (wallets list) or 503 (service not ready) — not 404
    assert.oneOf(response.status(), [200, 503])
  })

  test('GET /debug/parse-stats exists', async ({ client, assert }) => {
    const response = await client.get('/debug/parse-stats')
    // Either 200 or 500 (DB query error) — not 404
    assert.oneOf(response.status(), [200, 500])
  })

  // CDP-authenticated routes: verify they return 401 (not 404)
  const cdpRoutes = [
    { method: 'post' as const, path: '/api/register-wallet' },
    { method: 'post' as const, path: '/api/register-permission' },
    { method: 'post' as const, path: '/api/revoke-permission' },
    { method: 'post' as const, path: '/api/ensure-gas' },
    { method: 'get' as const, path: '/api/wallet-status' },
    { method: 'post' as const, path: '/api/log-export-event' },
    { method: 'post' as const, path: '/api/resolve-phone' },
    { method: 'post' as const, path: '/api/log-web-send' },
    { method: 'post' as const, path: '/api/set-language' },
  ]

  for (const route of cdpRoutes) {
    test(`${route.method.toUpperCase()} ${route.path} returns 401 (not 404)`, async ({
      client,
    }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})
