/**
 * Webhook Controller Functional Tests
 *
 * Tests GET /webhook/whatsapp (verification) and POST /webhook/whatsapp (receive).
 * These are the Meta-registered endpoints — path parity is critical.
 */

import { test } from '@japa/runner'

test.group('Webhook | GET /webhook/whatsapp (Verification)', () => {
  test('valid verify_token returns 200 with challenge', async ({ client }) => {
    const response = await client.get('/webhook/whatsapp').qs({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': 'test_challenge_123',
    })

    response.assertStatus(200)
    response.assertTextIncludes('test_challenge_123')
  })

  test('invalid verify_token returns 403', async ({ client }) => {
    const response = await client.get('/webhook/whatsapp').qs({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'test_challenge',
    })

    response.assertStatus(403)
  })

  test('missing mode returns 403', async ({ client }) => {
    const response = await client.get('/webhook/whatsapp').qs({
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': 'test_challenge',
    })

    response.assertStatus(403)
  })

  test('wrong mode returns 403', async ({ client }) => {
    const response = await client.get('/webhook/whatsapp').qs({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': 'test-verify-token',
      'hub.challenge': 'test_challenge',
    })

    response.assertStatus(403)
  })
})

test.group('Webhook | POST /webhook/whatsapp (Message Receive)', () => {
  test('returns 200 immediately (Meta requirement)', async ({ client }) => {
    const response = await client.post('/webhook/whatsapp').json({
      object: 'whatsapp_business_account',
      entry: [],
    })

    response.assertStatus(200)
  })

  test('returns 200 even with empty body', async ({ client }) => {
    const response = await client.post('/webhook/whatsapp').json({})

    response.assertStatus(200)
  })

  test('returns 200 with valid message payload', async ({ client }) => {
    const response = await client.post('/webhook/whatsapp').json({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '573001234567',
                    id: 'test_msg_id_001',
                    type: 'text',
                    text: { body: 'balance' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    // Meta requires immediate 200 — processing is async
    response.assertStatus(200)
  })
})
