/**
 * Notify Controller Functional Tests
 *
 * Tests POST /notify-fund endpoint.
 */

import { test } from '@japa/runner'

test.group('Notify | POST /notify-fund', () => {
  test('missing required fields returns 400', async ({ client }) => {
    const response = await client.post('/notify-fund').json({})
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Missing required fields' })
  })

  test('partial fields returns 400', async ({ client }) => {
    const response = await client.post('/notify-fund').json({
      phone: '+573001234567',
      type: 'usdc',
    })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Missing required fields' })
  })

  test('invalid type returns 400', async ({ client }) => {
    const response = await client.post('/notify-fund').json({
      phone: '+573001234567',
      type: 'bitcoin',
      amount: '10',
      txHash: '0xabc123',
    })
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Invalid type' })
  })

  test('non-existent phone returns 404', async ({ client }) => {
    const response = await client.post('/notify-fund').json({
      phone: '+9999999999999',
      type: 'usdc',
      amount: '10',
      txHash: '0xabc123def456',
    })
    response.assertStatus(404)
    response.assertBodyContains({ error: 'Wallet not found' })
  })
})
