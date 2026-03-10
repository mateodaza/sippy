import { test } from '@japa/runner'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'
import { jwtService } from '#services/jwt_service'
import { otpService } from '#services/otp_service'

// ── Setup ──────────────────────────────────────────────────────────────────────

test.group('AuthApiController | POST /api/auth/send-otp', (group) => {
  group.setup(async () => {
    // Patch otpService to use a no-op smsSender (avoids Twilio calls)
    ;(otpService as any).smsSender = async () => {}

    // Generate RSA keypair, set env vars, reset jwtService singleton state
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(await exportPKCS8(privateKey)).toString('base64')
    process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(await exportSPKI(publicKey)).toString('base64')
    process.env.JWT_KEY_ID = 'test-kid'
    process.env.JWT_ISSUER = 'test-issuer'
    // Reset singleton so it reinitializes with the new keys
    ;(jwtService as any).initialized = false
    ;(jwtService as any).privateKey = null
    ;(jwtService as any).publicKey = null
  })

  test('missing phone body field returns 400', async ({ client }) => {
    const response = await client.post('/api/auth/send-otp').json({})
    response.assertStatus(400)
  })

  test('invalid phone (garbage string) returns 400', async ({ client }) => {
    const response = await client.post('/api/auth/send-otp').json({ phone: 'not-a-phone' })
    response.assertStatus(400)
  })

  test('valid E.164 phone returns 200 with success: true', async ({ client }) => {
    const response = await client.post('/api/auth/send-otp').json({ phone: '+573001234567' })
    response.assertStatus(200)
    response.assertBodyContains({ success: true })
  })

  test('4th send for same phone in window returns 429', async ({ client }) => {
    const phone = '+573007771001'
    // Reset rate limit bucket for this phone by patching sendRateLimitMap
    ;(otpService as any).sendRateLimitMap.delete(phone)
    await client.post('/api/auth/send-otp').json({ phone })
    await client.post('/api/auth/send-otp').json({ phone })
    await client.post('/api/auth/send-otp').json({ phone })
    const response = await client.post('/api/auth/send-otp').json({ phone })
    response.assertStatus(429)
  })

  test('rate-limited response includes retryAfter as positive number', async ({ client, assert }) => {
    const phone = '+573007771002'
    ;(otpService as any).sendRateLimitMap.delete(phone)
    await client.post('/api/auth/send-otp').json({ phone })
    await client.post('/api/auth/send-otp').json({ phone })
    await client.post('/api/auth/send-otp').json({ phone })
    const response = await client.post('/api/auth/send-otp').json({ phone })
    const body = response.body()
    assert.isNumber(body.retryAfter)
    assert.isAbove(body.retryAfter, 0)
  })
})

test.group('AuthApiController | POST /api/auth/verify-otp', (group) => {
  group.setup(async () => {
    ;(otpService as any).smsSender = async () => {}

    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(await exportPKCS8(privateKey)).toString('base64')
    process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(await exportSPKI(publicKey)).toString('base64')
    process.env.JWT_KEY_ID = 'test-kid'
    process.env.JWT_ISSUER = 'test-issuer'
    ;(jwtService as any).initialized = false
    ;(jwtService as any).privateKey = null
    ;(jwtService as any).publicKey = null
  })

  test('missing phone returns 400', async ({ client }) => {
    const response = await client.post('/api/auth/verify-otp').json({ code: '123456' })
    response.assertStatus(400)
  })

  test('missing code returns 400', async ({ client }) => {
    const response = await client.post('/api/auth/verify-otp').json({ phone: '+573001234567' })
    response.assertStatus(400)
  })

  test('wrong code returns 401', async ({ client }) => {
    const phone = '+573007772001'
    ;(otpService as any).sendRateLimitMap.delete(phone)
    await client.post('/api/auth/send-otp').json({ phone })
    const response = await client.post('/api/auth/verify-otp').json({ phone, code: '000000' })
    response.assertStatus(401)
  })

  test('correct code returns 200 with token and expiresIn: 3600', async ({ client, assert }) => {
    const phone = '+573007772002'
    ;(otpService as any).sendRateLimitMap.delete(phone)
    await client.post('/api/auth/send-otp').json({ phone })
    const store = (otpService as any).otpStore as Map<string, { code: string }>
    const code = store.get(phone)!.code
    const response = await client.post('/api/auth/verify-otp').json({ phone, code })
    response.assertStatus(200)
    const body = response.body()
    assert.isString(body.token)
    assert.equal(body.expiresIn, 3600)
  })

  test('response token is a compact JWT (3 segments)', async ({ client, assert }) => {
    const phone = '+573007772003'
    ;(otpService as any).sendRateLimitMap.delete(phone)
    await client.post('/api/auth/send-otp').json({ phone })
    const store = (otpService as any).otpStore as Map<string, { code: string }>
    const code = store.get(phone)!.code
    const response = await client.post('/api/auth/verify-otp').json({ phone, code })
    const body = response.body()
    assert.equal(body.token.split('.').length, 3)
  })
})

test.group('AuthApiController | GET /api/auth/.well-known/jwks.json', (group) => {
  group.setup(async () => {
    ;(otpService as any).smsSender = async () => {}

    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(await exportPKCS8(privateKey)).toString('base64')
    process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(await exportSPKI(publicKey)).toString('base64')
    process.env.JWT_KEY_ID = 'test-kid'
    process.env.JWT_ISSUER = 'test-issuer'
    ;(jwtService as any).initialized = false
    ;(jwtService as any).privateKey = null
    ;(jwtService as any).publicKey = null
  })

  test('returns 200', async ({ client }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    response.assertStatus(200)
  })

  test('response has keys array', async ({ client, assert }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    const body = response.body()
    assert.isArray(body.keys)
  })

  test('key entry has required fields', async ({ client, assert }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    const body = response.body()
    const key = body.keys[0]
    assert.property(key, 'kty')
    assert.property(key, 'n')
    assert.property(key, 'e')
    assert.property(key, 'kid')
    assert.equal(key.alg, 'RS256')
    assert.equal(key.use, 'sig')
  })

  test('Cache-Control header is set correctly', async ({ client, assert }) => {
    const response = await client.get('/api/auth/.well-known/jwks.json')
    assert.equal(response.header('cache-control'), 'public, max-age=3600')
  })
})
