/**
 * Resolve Controller Functional Tests
 *
 * Tests GET /resolve-phone and GET /resolve-address endpoints.
 * These are public endpoints (no CDP auth), but /resolve-phone has IP throttle.
 */

import { test } from '@japa/runner'

test.group('Resolve | GET /resolve-phone', () => {
  test('missing phone param returns 400', async ({ client }) => {
    const response = await client.get('/resolve-phone')
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Phone number is required' })
  })

  test('non-existent phone returns 404', async ({ client }) => {
    const response = await client.get('/resolve-phone').qs({ phone: '+9999999999999' })
    response.assertStatus(404)
    response.assertBodyContains({ error: 'Wallet not found' })
  })

  test('non-existent phone includes phone in response', async ({ client }) => {
    const response = await client.get('/resolve-phone').qs({ phone: '+9999999999999' })
    response.assertStatus(404)
    response.assertBodyContains({ phone: '+9999999999999' })
  })
})

test.group('Resolve | GET /resolve-address', () => {
  test('missing address param returns 400', async ({ client }) => {
    const response = await client.get('/resolve-address')
    response.assertStatus(400)
    response.assertBodyContains({ error: 'Wallet address is required' })
  })

  test('non-existent address returns null phone', async ({ client }) => {
    const response = await client
      .get('/resolve-address')
      .qs({ address: '0x0000000000000000000000000000000000000000' })

    response.assertStatus(200)
    response.assertBodyContains({ phone: null })
  })
})
