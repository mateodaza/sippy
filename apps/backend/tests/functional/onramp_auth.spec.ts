/**
 * Onramp + Offramp Routes — Auth Boundary Functional Tests
 *
 * Verifies that every KYC and ramp route is behind the jwtAuth middleware.
 * No mocking of Colurs or DB needed — a missing/invalid token should be
 * rejected before any service code runs.
 *
 * All routes in the /api group with .use(middleware.jwtAuth()) must return 401.
 */

import { test } from '@japa/runner'

// ── Onramp KYC ────────────────────────────────────────────────────────────────

test.group('Onramp | KYC routes require JWT auth', () => {
  test('GET /api/onramp/kyc → 401 without token', async ({ client }) => {
    const res = await client.get('/api/onramp/kyc')
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/register → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/register').json({})
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/send-otp → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/send-otp').json({})
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/verify-phone → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/verify-phone').json({})
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/verify-email → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/verify-email').json({})
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/upload-document → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/upload-document').json({})
    res.assertStatus(401)
  })

  test('POST /api/onramp/kyc/refresh-level → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/kyc/refresh-level').json({})
    res.assertStatus(401)
  })
})

// ── Onramp payment ────────────────────────────────────────────────────────────

test.group('Onramp | Payment routes require JWT auth', () => {
  test('POST /api/onramp/quote → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/quote').json({})
    res.assertStatus(401)
  })

  test('GET /api/onramp/pse-banks → 401 without token', async ({ client }) => {
    const res = await client.get('/api/onramp/pse-banks')
    res.assertStatus(401)
  })

  test('POST /api/onramp/initiate → 401 without token', async ({ client }) => {
    const res = await client.post('/api/onramp/initiate').json({})
    res.assertStatus(401)
  })

  test('GET /api/onramp/status/123 → 401 without token', async ({ client }) => {
    const res = await client.get('/api/onramp/status/123')
    res.assertStatus(401)
  })
})

// ── Offramp ───────────────────────────────────────────────────────────────────

test.group('Offramp | Routes require JWT auth', () => {
  test('POST /api/offramp/quote → 401 without token', async ({ client }) => {
    const res = await client.post('/api/offramp/quote').json({})
    res.assertStatus(401)
  })

  test('POST /api/offramp/initiate → 401 without token', async ({ client }) => {
    const res = await client.post('/api/offramp/initiate').json({})
    res.assertStatus(401)
  })

  test('GET /api/offramp/status/123 → 401 without token', async ({ client }) => {
    const res = await client.get('/api/offramp/status/123')
    res.assertStatus(401)
  })

  test('GET /api/offramp/bank-accounts → 401 without token', async ({ client }) => {
    const res = await client.get('/api/offramp/bank-accounts')
    res.assertStatus(401)
  })

  test('POST /api/offramp/bank-accounts → 401 without token', async ({ client }) => {
    const res = await client.post('/api/offramp/bank-accounts').json({})
    res.assertStatus(401)
  })

  test('GET /api/offramp/banks → 401 without token', async ({ client }) => {
    const res = await client.get('/api/offramp/banks')
    res.assertStatus(401)
  })

  test('GET /api/offramp/document-types → 401 without token', async ({ client }) => {
    const res = await client.get('/api/offramp/document-types')
    res.assertStatus(401)
  })
})

// ── Invalid Bearer token ──────────────────────────────────────────────────────

test.group('Onramp | Invalid Bearer token → 401', () => {
  test('GET /api/onramp/kyc with garbage token returns 401', async ({ client }) => {
    const res = await client
      .get('/api/onramp/kyc')
      .header('Authorization', 'Bearer not_a_real_token')
    res.assertStatus(401)
  })

  test('POST /api/onramp/initiate with garbage token returns 401', async ({ client }) => {
    const res = await client
      .post('/api/onramp/initiate')
      .header('Authorization', 'Bearer not_a_real_token')
      .json({})
    res.assertStatus(401)
  })
})
