import { test } from '@japa/runner'
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT } from 'jose'
import JwtAuthMiddleware from '#middleware/jwt_auth_middleware'
import PhoneRegistry from '#models/phone_registry'

// ── Key setup ──────────────────────────────────────────────────────────────────

let testPrivateKey: CryptoKey
let keysReady = false

/**
 * Initialises JWT keys in process.env once per test run.
 * The jwtService singleton initialises lazily on first use; subsequent calls
 * to makeTestKeys() would update testPrivateKey while the singleton keeps the
 * original public key, causing signature mismatches.  We guard with keysReady.
 */
async function ensureTestKeys() {
  if (keysReady) return
  keysReady = true
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  testPrivateKey = privateKey
  const privatePem = await exportPKCS8(privateKey)
  const publicPem = await exportSPKI(publicKey)
  process.env.JWT_PRIVATE_KEY_PEM = Buffer.from(privatePem).toString('base64')
  process.env.JWT_PUBLIC_KEY_PEM = Buffer.from(publicPem).toString('base64')
  process.env.JWT_KEY_ID = 'test-kid'
  process.env.JWT_ISSUER = 'test-issuer'
}

async function signToken(
  sub: string,
  opts: { expired?: boolean; differentKey?: boolean } = {}
): Promise<string> {
  let signingKey: CryptoKey
  if (opts.differentKey) {
    signingKey = (await generateKeyPair('RS256')).privateKey
  } else {
    signingKey = testPrivateKey
  }

  const builder = new SignJWT({ sub, jti: 'test-jti' }).setProtectedHeader({
    alg: 'RS256',
    kid: 'test-kid',
  })

  if (opts.expired) {
    builder
      .setIssuer('test-issuer')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
  } else {
    builder.setIssuer('test-issuer').setIssuedAt().setExpirationTime('1h')
  }

  return builder.sign(signingKey)
}

// ── Mock context builder ───────────────────────────────────────────────────────

interface MockResponse {
  unauthorized: (body: unknown) => void
  unauthorizedCalled: boolean
  unauthorizedBody: unknown
}

interface MockCtx {
  request: {
    header: (name: string) => string | undefined
    url: () => string
    body: () => Record<string, unknown>
  }
  response: MockResponse
  cdpUser?: { phoneNumber: string; walletAddress: string }
}

function buildCtx(opts: { token?: string; url?: string; body?: Record<string, unknown> }): {
  ctx: MockCtx
  next: () => Promise<void>
  wasNextCalled: () => boolean
} {
  let nextCalled = false

  const next = async () => {
    nextCalled = true
  }

  const ctx: MockCtx = {
    request: {
      header: (name: string) => {
        if (name === 'authorization' && opts.token !== undefined) {
          return `Bearer ${opts.token}`
        }
        return undefined
      },
      url: () => opts.url ?? '/api/wallet-status',
      body: () => opts.body ?? {},
    },
    response: {
      unauthorized: (body: unknown) => {
        ctx.response.unauthorizedCalled = true
        ctx.response.unauthorizedBody = body
      },
      unauthorizedCalled: false,
      unauthorizedBody: undefined,
    },
  }

  return { ctx, next, wasNextCalled: () => nextCalled }
}

// ── PhoneRegistry mock helpers ─────────────────────────────────────────────────

type PhoneRecord = { walletAddress: string } | null

let findByResult: PhoneRecord = null
let findByShouldThrow = false
const findByCalls: Array<[unknown, unknown]> = []

const originalFindBy = PhoneRegistry.findBy.bind(PhoneRegistry)

function mockFindBy(result: PhoneRecord, throws = false) {
  findByResult = result
  findByShouldThrow = throws
  findByCalls.length = 0
  ;(PhoneRegistry as any).findBy = async (key: unknown, value: unknown) => {
    findByCalls.push([key, value])
    if (findByShouldThrow) throw new Error('DB error')
    return findByResult
  }
}

function restoreFindBy() {
  ;(PhoneRegistry as any).findBy = originalFindBy
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.group('JwtAuthMiddleware | missing token', (group) => {
  group.setup(async () => {
    await ensureTestKeys()
  })

  test('no Authorization header → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const { ctx, next, wasNextCalled } = buildCtx({ url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.deepEqual(ctx.response.unauthorizedBody, { error: 'Unauthorized' })
    assert.isFalse(wasNextCalled())
  })
})

test.group('JwtAuthMiddleware | invalid token', (group) => {
  group.setup(async () => {
    await ensureTestKeys()
  })

  test('malformed JWT string → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const { ctx, next, wasNextCalled } = buildCtx({
      token: 'this.is.notvalid.jwt',
      url: '/api/wallet-status',
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })

  test('expired JWT → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const token = await signToken('+573001234567', { expired: true })
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })

  test('tampered signature → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const token = await signToken('+573001234567', { differentKey: true })
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })
})

test.group('JwtAuthMiddleware | registered user — other routes', (group) => {
  const PHONE_E164 = '+573001234567'
  const PHONE_DB = '573001234567'
  const WALLET = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('valid JWT + phone in registry → cdpUser set, next called', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.deepEqual(ctx.cdpUser, { phoneNumber: PHONE_E164, walletAddress: WALLET })
  })

  test('ctx.cdpUser.phoneNumber preserves E.164 form (with +)', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.equal(ctx.cdpUser?.phoneNumber, PHONE_E164)
    assert.isTrue(ctx.cdpUser?.phoneNumber.startsWith('+'))
  })

  test('DB lookup uses normalized phone (without +)', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.lengthOf(findByCalls, 1)
    assert.equal(findByCalls[0][1], PHONE_DB)
  })

  test('phone not in registry → 401, next not called', async ({ assert }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })
})

test.group('JwtAuthMiddleware | register-wallet route — Tier 1 (valid body address)', (group) => {
  const PHONE_E164 = '+573001234567'
  const VALID_WALLET = '0x1234567890AbCdEf1234567890AbCdEf12345678'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('valid body address → cdpUser uses body address, next called, PhoneRegistry not called', async ({
    assert,
  }) => {
    mockFindBy({ walletAddress: '0xDifferentAddressFromDB1234567890ABCDEF12' })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: VALID_WALLET },
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.equal(ctx.cdpUser?.walletAddress, VALID_WALLET)
    assert.isEmpty(findByCalls)
  })

  test('valid body address takes priority over DB even when phone is in registry', async ({
    assert,
  }) => {
    const DB_WALLET = '0xDifferentAddressFromDB1234567890ABCDEF12'
    mockFindBy({ walletAddress: DB_WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: VALID_WALLET },
    })

    await middleware.handle(ctx as any, next)

    assert.equal(ctx.cdpUser?.walletAddress, VALID_WALLET)
    assert.notEqual(ctx.cdpUser?.walletAddress, DB_WALLET)
    assert.isEmpty(findByCalls)
  })
})

test.group('JwtAuthMiddleware | register-wallet route — Tier 2 (invalid body address)', (group) => {
  const PHONE_E164 = '+573001234567'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('non-empty invalid body address → 401, next not called, PhoneRegistry not called', async ({
    assert,
  }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: 'not-an-eth-address' },
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
    assert.isEmpty(findByCalls)
  })

  test('non-empty too-short address → 401, next not called', async ({ assert }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: '0xTOOSHORT' },
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })
})

test.group('JwtAuthMiddleware | register-wallet route — Tier 3 (absent body address)', (group) => {
  const PHONE_E164 = '+573001234567'
  const DB_WALLET = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('no body + phone in registry → walletAddress from DB, next called', async ({ assert }) => {
    mockFindBy({ walletAddress: DB_WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: {},
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.equal(ctx.cdpUser?.walletAddress, DB_WALLET)
    assert.equal(ctx.cdpUser?.phoneNumber, PHONE_E164)
  })

  test('empty string walletAddress + phone in registry → walletAddress from DB, next called', async ({
    assert,
  }) => {
    mockFindBy({ walletAddress: DB_WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: '' },
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.equal(ctx.cdpUser?.walletAddress, DB_WALLET)
  })

  test('no body + phone NOT in registry (first-time user) → walletAddress empty string, next called', async ({
    assert,
  }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: {},
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.deepEqual(ctx.cdpUser, { phoneNumber: PHONE_E164, walletAddress: '' })
  })

  test('empty string walletAddress + phone NOT in registry → walletAddress empty string, next called', async ({
    assert,
  }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: { walletAddress: '' },
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.deepEqual(ctx.cdpUser, { phoneNumber: PHONE_E164, walletAddress: '' })
  })
})

test.group('JwtAuthMiddleware | DB error', (group) => {
  const PHONE_E164 = '+573001234567'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('PhoneRegistry.findBy throws on non-register-wallet route → 401, next not called', async ({
    assert,
  }) => {
    mockFindBy(null, true)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })

  test('PhoneRegistry.findBy throws on register-wallet route (Tier 3) → 401, next not called', async ({
    assert,
  }) => {
    mockFindBy(null, true)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({
      token,
      url: '/api/register-wallet',
      body: {},
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })
})
