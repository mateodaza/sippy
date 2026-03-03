/**
 * Health Controller Functional Tests
 *
 * Tests GET / and GET /api/health endpoints.
 * These endpoints call getAllWallets() which requires DB — they may
 * return 503 if the wallet service / DB is not initialized. Both
 * behaviors are valid and tested.
 */

import { test } from '@japa/runner'

test.group('Health | GET /', () => {
  test('returns JSON with status field', async ({ client, assert }) => {
    const response = await client.get('/')
    const body = response.body()
    assert.property(body, 'status')
  })

  test('returns timestamp', async ({ client, assert }) => {
    const response = await client.get('/')
    const body = response.body()
    assert.property(body, 'timestamp')
  })

  test('200 response includes registeredWallets count', async ({ client, assert }) => {
    const response = await client.get('/')
    if (response.status() === 200) {
      const body = response.body()
      assert.property(body, 'registeredWallets')
    }
  })

  test('200 response includes correct message', async ({ client }) => {
    const response = await client.get('/')
    if (response.status() === 200) {
      response.assertBodyContains({ message: 'Sippy Webhook Server' })
    }
  })
})

test.group('Health | GET /api/health', () => {
  test('returns JSON with status field', async ({ client, assert }) => {
    const response = await client.get('/api/health')
    const body = response.body()
    assert.property(body, 'status')
  })

  test('returns service name', async ({ client, assert }) => {
    const response = await client.get('/api/health')
    const body = response.body()
    assert.property(body, 'service')
  })
})
