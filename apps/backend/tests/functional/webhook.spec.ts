/**
 * Webhook Controller Functional Tests
 *
 * Tests GET /webhook/whatsapp (verification) and POST /webhook/whatsapp (receive).
 * These are the Meta-registered endpoints — path parity is critical.
 */

import { test } from '@japa/runner'
import { createHmac } from 'node:crypto'

function signPayload(payload: object): string {
  const raw = JSON.stringify(payload)
  return 'sha256=' + createHmac('sha256', 'test-app-secret').update(raw).digest('hex')
}

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
    const payload = { object: 'whatsapp_business_account', entry: [] }
    const response = await client
      .post('/webhook/whatsapp')
      .header('x-hub-signature-256', signPayload(payload))
      .json(payload)

    response.assertStatus(200)
  })

  test('returns 200 even with empty body', async ({ client }) => {
    const payload = {}
    const response = await client
      .post('/webhook/whatsapp')
      .header('x-hub-signature-256', signPayload(payload))
      .json(payload)

    response.assertStatus(200)
  })

  test('returns 401 without valid signature', async ({ client }) => {
    const response = await client
      .post('/webhook/whatsapp')
      .header('x-hub-signature-256', 'sha256=invalid')
      .json({ entry: [] })

    response.assertStatus(401)
  })

  test('returns 200 with valid message payload', async ({ client }) => {
    const payload = {
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
    }
    const response = await client
      .post('/webhook/whatsapp')
      .header('x-hub-signature-256', signPayload(payload))
      .json(payload)

    // Meta requires immediate 200 — processing is async
    response.assertStatus(200)
  })
})
