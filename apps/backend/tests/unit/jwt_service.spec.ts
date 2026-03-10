import { test } from '@japa/runner'
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT } from 'jose'
import JwtService from '#services/jwt_service'

// ── Setup helper ───────────────────────────────────────────────────────────────

async function makeTestKeys() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const privatePem = await exportPKCS8(privateKey)
  const publicPem = await exportSPKI(publicKey)
  process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(privatePem).toString('base64')
  process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(publicPem).toString('base64')
  process.env.JWT_KEY_ID = 'test-kid'
  process.env.JWT_ISSUER = 'test-issuer'
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
}

function decodeJwtHeader(token: string): Record<string, unknown> {
  const parts = token.split('.')
  return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'))
}

// ── signToken ─────────────────────────────────────────────────────────────────

test.group('JwtService | signToken', () => {
  test('returns a compact JWT string (3 dot-separated segments)', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token = await svc.signToken('user-123')
    const parts = token.split('.')
    assert.lengthOf(parts, 3)
  })

  test('payload structure has sub, iss, jti and exp - iat === 3600', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token = await svc.signToken('user-123')
    const payload = decodeJwtPayload(token)
    assert.equal(payload.sub, 'user-123')
    assert.equal(payload.iss, 'test-issuer')
    assert.isString(payload.jti)
    assert.isNumber(payload.iat)
    assert.isNumber(payload.exp)
    assert.equal((payload.exp as number) - (payload.iat as number), 3600)
  })

  test('each call returns unique jti', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token1 = await svc.signToken('user-123')
    const token2 = await svc.signToken('user-123')
    const payload1 = decodeJwtPayload(token1)
    const payload2 = decodeJwtPayload(token2)
    assert.notEqual(payload1.jti, payload2.jti)
  })

  test('uses default kid and issuer when env vars absent', async ({ assert }) => {
    await makeTestKeys()
    delete process.env.JWT_KEY_ID
    delete process.env.JWT_ISSUER
    const svc = new JwtService()
    const token = await svc.signToken('user-123')
    const header = decodeJwtHeader(token)
    const payload = decodeJwtPayload(token)
    assert.equal(header.kid, 'sippy-1')
    assert.equal(payload.iss, 'sippy')
    // restore
    process.env.JWT_KEY_ID = 'test-kid'
    process.env.JWT_ISSUER = 'test-issuer'
  })
})

// ── verifyToken ───────────────────────────────────────────────────────────────

test.group('JwtService | verifyToken', () => {
  test('sign then verify returns payload with matching sub and iss', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token = await svc.signToken('user-456')
    const payload = await svc.verifyToken(token)
    assert.equal(payload.sub, 'user-456')
    assert.equal(payload.iss, 'test-issuer')
  })

  test('returns full payload with sub, iss, iat, exp, jti', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token = await svc.signToken('user-789')
    const payload = await svc.verifyToken(token)
    assert.isString(payload.sub)
    assert.isString(payload.iss)
    assert.isNumber(payload.iat)
    assert.isNumber(payload.exp)
    assert.isString(payload.jti)
  })

  test('throws on expired token', async ({ assert }) => {
    // Generate a dedicated keypair for this test and set it in process.env
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    const privatePem = await exportPKCS8(privateKey)
    const publicPem = await exportSPKI(publicKey)
    process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(privatePem).toString('base64')
    process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(publicPem).toString('base64')
    process.env.JWT_KEY_ID = 'test-kid'
    process.env.JWT_ISSUER = 'test-issuer'
    const svc = new JwtService()
    // Sign an expired token using the private key directly
    const expiredToken = await new SignJWT({ sub: 'user-000', jti: 'test-jti' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuer('test-issuer')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)
    await assert.rejects(() => svc.verifyToken(expiredToken))
  })

  test('throws on tampered signature', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const token = await svc.signToken('user-123')
    const parts = token.split('.')
    const tampered = parts[0] + '.' + parts[1] + '.invalidsignature'
    await assert.rejects(() => svc.verifyToken(tampered))
  })

  test('throws on malformed token', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    await assert.rejects(() => svc.verifyToken('not.a.valid.jwt.token'))
  })
})

// ── getJwks ───────────────────────────────────────────────────────────────────

test.group('JwtService | getJwks', () => {
  test('returns keys array with one entry', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const jwks = await svc.getJwks()
    assert.isArray(jwks.keys)
    assert.lengthOf(jwks.keys, 1)
  })

  test('key entry has required fields kty, n, e, kid, alg, use', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const jwks = await svc.getJwks()
    const key = jwks.keys[0]
    assert.isString(key.kty)
    assert.isString(key.n)
    assert.isString(key.e)
    assert.isString(key.kid)
    assert.equal(key.alg, 'RS256')
    assert.equal(key.use, 'sig')
  })

  test('kid matches env var', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const jwks = await svc.getJwks()
    assert.equal(jwks.keys[0].kid, 'test-kid')
  })

  test('n and e are non-empty strings', async ({ assert }) => {
    await makeTestKeys()
    const svc = new JwtService()
    const jwks = await svc.getJwks()
    const key = jwks.keys[0]
    assert.isAbove(key.n.length, 0)
    assert.isAbove(key.e.length, 0)
  })
})

// ── init errors ───────────────────────────────────────────────────────────────

test.group('JwtService | init errors', () => {
  test('throws when JWT_PRIVATE_KEY_PEM is missing', async ({ assert }) => {
    await makeTestKeys()
    delete process.env.JWT_PRIVATE_KEY_PEM
    const svc = new JwtService()
    await assert.rejects(
      () => svc.signToken('user-123'),
      'JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM must be set'
    )
    // restore
    await makeTestKeys()
  })

  test('throws when JWT_PUBLIC_KEY_PEM is missing', async ({ assert }) => {
    await makeTestKeys()
    delete process.env.JWT_PUBLIC_KEY_PEM
    const svc = new JwtService()
    await assert.rejects(
      () => svc.signToken('user-123'),
      'JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM must be set'
    )
    // restore
    await makeTestKeys()
  })
})

// ── lazy init ─────────────────────────────────────────────────────────────────

test.group('JwtService | lazy init', () => {
  test('constructor does not throw when env vars are absent, but first method call does', async ({
    assert,
  }) => {
    delete process.env.JWT_PRIVATE_KEY_PEM
    delete process.env.JWT_PUBLIC_KEY_PEM
    // Constructor should not throw
    const svc = new JwtService()
    assert.isNotNull(svc)
    // First method call should throw
    await assert.rejects(() => svc.signToken('user-123'))
    // restore
    await makeTestKeys()
  })
})
