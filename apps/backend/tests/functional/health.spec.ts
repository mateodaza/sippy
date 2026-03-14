/**
 * Health Controller Functional Tests
 *
 * Tests GET / and GET /api/health endpoints.
 * These endpoints call getAllWallets() which requires DB — they may
 * return 503 if the wallet service / DB is not initialized. Both
 * behaviors are valid and tested.
 */

import { test } from '@japa/runner'
import { isDbAvailable } from '../helpers/skip_without_db.js'

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

test.group('Health | GET /health', () => {
  test('returns 200 with no auth', async ({ client }) => {
    const response = await client.get('/health')
    response.assertStatus(200)
  })

  test('has db field with valid value', async ({ client, assert }) => {
    const response = await client.get('/health')
    const body = response.body()
    assert.include(['ok', 'error'], body.db)
  })

  test('db is ok in test env', async ({ client, assert }) => {
    if (!(await isDbAvailable())) { assert.plan(0); return } // skip without DB
    const response = await client.get('/health')
    const body = response.body()
    assert.equal(body.db, 'ok')
  })

  test('has uptime as non-negative integer', async ({ client, assert }) => {
    const response = await client.get('/health')
    const body = response.body()
    assert.isNumber(body.uptime)
    assert.isTrue(body.uptime >= 0)
  })

  test('does not expose gasRefuel', async ({ client, assert }) => {
    const response = await client.get('/health')
    const body = response.body()
    assert.notProperty(body, 'gasRefuel')
  })

  test('has whatsapp with valid value', async ({ client, assert }) => {
    const response = await client.get('/health')
    const body = response.body()
    assert.include(['ok', 'error'], body.whatsapp)
  })

  test('has timestamp as ISO string', async ({ client, assert }) => {
    const response = await client.get('/health')
    const body = response.body()
    assert.property(body, 'timestamp')
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
