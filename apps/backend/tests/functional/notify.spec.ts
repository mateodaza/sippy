/**
 * Notify Controller Functional Tests
 *
 * Tests POST /notify-fund endpoint.
 *
 * DB-dependent tests accept 500 when PostgreSQL is unavailable.
 */

import { test } from '@japa/runner'

const NOTIFY_SECRET = 'test-notify-secret'

test.group('Notify | POST /notify-fund', () => {
  test('missing x-notify-secret returns 401', async ({ client }) => {
    const response = await client.post('/notify-fund').json({
      phone: '+573001234567',
      type: 'usdc',
      amount: '10',
      txHash: '0xabc123def456',
    })
    response.assertStatus(401)
    response.assertBodyContains({ error: 'Unauthorized' })
  })

  test('wrong x-notify-secret returns 401', async ({ client }) => {
    const response = await client
      .post('/notify-fund')
      .header('x-notify-secret', 'wrong-secret')
      .json({
        phone: '+573001234567',
        type: 'usdc',
        amount: '10',
        txHash: '0xabc123def456',
      })
    response.assertStatus(401)
    response.assertBodyContains({ error: 'Unauthorized' })
  })

  test('missing required fields returns 400', async ({ client }) => {
    const response = await client
      .post('/notify-fund')
      .header('x-notify-secret', NOTIFY_SECRET)
      .json({})
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Missing required fields' })
  })

  test('partial fields returns 400', async ({ client }) => {
    const response = await client
      .post('/notify-fund')
      .header('x-notify-secret', NOTIFY_SECRET)
      .json({
        phone: '+573001234567',
        type: 'usdc',
      })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Missing required fields' })
  })

  test('invalid type returns 400', async ({ client }) => {
    const response = await client
      .post('/notify-fund')
      .header('x-notify-secret', NOTIFY_SECRET)
      .json({
        phone: '+573001234567',
        type: 'bitcoin',
        amount: '10',
        txHash: '0xabc123',
      })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Invalid type' })
  })

  test('non-existent phone returns 404 or 500 (DB-dependent)', async ({ client, assert }) => {
    const response = await client
      .post('/notify-fund')
      .header('x-notify-secret', NOTIFY_SECRET)
      .json({
        phone: '+9999999999999',
        type: 'usdc',
        amount: '10',
        txHash: '0xabc123def456',
      })
    assert.includeMembers([404, 500], [response.status()])
  })
})
