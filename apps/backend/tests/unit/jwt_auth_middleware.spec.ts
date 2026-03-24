import { test } from '@japa/runner'
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT } from 'jose'
import JwtAuthMiddleware, { __setCdpClientForTest } from '#middleware/jwt_auth_middleware'
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
    const keyPair = await generateKeyPair('RS256')
    signingKey = keyPair.privateKey
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

// ── CDP client mock helpers ──────────────────────────────────────────────────

function mockCdpClient(validWallets: string[]) {
  __setCdpClientForTest({
    endUser: {
      validateAccessToken: async () => ({
        evmSmartAccounts: validWallets,
      }),
    },
  } as any)
}

function restoreCdpClient() {
  __setCdpClientForTest(null)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.group('JwtAuthMiddleware | missing token', (group) => {
  group.setup(async () => {
    await ensureTestKeys()
  })

  test('TC-1: no Authorization header → 401, next not called', async ({ assert }) => {
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

  test('TC-2: malformed JWT string → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const { ctx, next, wasNextCalled } = buildCtx({
      token: 'this.is.notvalid.jwt',
      url: '/api/wallet-status',
    })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })

  test('TC-3: expired JWT → 401, next not called', async ({ assert }) => {
    const middleware = new JwtAuthMiddleware()
    const token = await signToken('+573001234567', { expired: true })
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })

  test('TC-3b: JWT signed with different key → 401, next not called', async ({ assert }) => {
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
  const WALLET = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('TC-4: valid JWT + phone in registry → cdpUser set, next called', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(wasNextCalled())
    assert.isFalse(ctx.response.unauthorizedCalled)
    assert.deepEqual(ctx.cdpUser, { phoneNumber: PHONE_E164, walletAddress: WALLET })
  })

  test('TC-5: ctx.cdpUser.phoneNumber preserves E.164 form (with +)', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.equal(ctx.cdpUser?.phoneNumber, PHONE_E164)
    assert.isTrue(ctx.cdpUser?.phoneNumber.startsWith('+'))
  })

  test('TC-6: DB lookup uses canonical phone (with +)', async ({ assert }) => {
    mockFindBy({ walletAddress: WALLET })
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.lengthOf(findByCalls, 1)
    assert.equal(findByCalls[0][1], PHONE_E164)
  })

  test('TC-7: phone not in registry → 401, next not called', async ({ assert }) => {
    mockFindBy(null)
    const middleware = new JwtAuthMiddleware()
    const token = await signToken(PHONE_E164)
    const { ctx, next, wasNextCalled } = buildCtx({ token, url: '/api/wallet-status' })

    await middleware.handle(ctx as any, next)

    assert.isTrue(ctx.response.unauthorizedCalled)
    assert.isFalse(wasNextCalled())
  })
})

test.group(
  'JwtAuthMiddleware | register-wallet — returning user (DB record found, Tier 1)',
  (group) => {
    const PHONE_E164 = '+573001234567'
    const DB_WALLET = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
    const BODY_WALLET = '0x1234567890AbCdEf1234567890AbCdEf12345678'

    group.setup(async () => {
      await ensureTestKeys()
    })

    group.each.teardown(() => {
      restoreFindBy()
    })

    test('TC-A: no body, phone in registry → DB address used, next called', async ({ assert }) => {
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

    test('TC-B: body has valid address different from DB → DB wins, body ignored, next called', async ({
      assert,
    }) => {
      mockFindBy({ walletAddress: DB_WALLET })
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next, wasNextCalled } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: BODY_WALLET },
      })

      await middleware.handle(ctx as any, next)

      assert.isTrue(wasNextCalled())
      assert.isFalse(ctx.response.unauthorizedCalled)
      assert.equal(ctx.cdpUser?.walletAddress, DB_WALLET)
      assert.notEqual(ctx.cdpUser?.walletAddress, BODY_WALLET)
    })

    test('TC-C: body has invalid address, phone in registry → DB wins, next called', async ({
      assert,
    }) => {
      mockFindBy({ walletAddress: DB_WALLET })
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next, wasNextCalled } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: 'not-an-eth-address' },
      })

      await middleware.handle(ctx as any, next)

      assert.isTrue(wasNextCalled())
      assert.isFalse(ctx.response.unauthorizedCalled)
      assert.equal(ctx.cdpUser?.walletAddress, DB_WALLET)
    })

    test('TC-D: body has empty string walletAddress, phone in registry → DB wins, next called', async ({
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

    test('TC-D2: DB lookup called exactly once for returning user (DB-first confirmed)', async ({
      assert,
    }) => {
      mockFindBy({ walletAddress: DB_WALLET })
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: BODY_WALLET },
      })

      await middleware.handle(ctx as any, next)

      assert.lengthOf(findByCalls, 1)
    })
  }
)

test.group(
  'JwtAuthMiddleware | register-wallet — first-time user, valid body address (Tier 2)',
  (group) => {
    const PHONE_E164 = '+573001234567'
    const VALID_WALLET = '0x1234567890AbCdEf1234567890AbCdEf12345678'

    group.setup(async () => {
      await ensureTestKeys()
    })

    group.each.teardown(() => {
      restoreFindBy()
      restoreCdpClient()
    })

    test('TC-E: no DB record, body has valid address + CDP token → cdpUser uses body address, next called', async ({
      assert,
    }) => {
      mockFindBy(null)
      mockCdpClient([VALID_WALLET])
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next, wasNextCalled } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: VALID_WALLET, cdpAccessToken: 'mock-cdp-token' },
      })

      await middleware.handle(ctx as any, next)

      assert.isTrue(wasNextCalled())
      assert.isFalse(ctx.response.unauthorizedCalled)
      assert.deepEqual(ctx.cdpUser, { phoneNumber: PHONE_E164, walletAddress: VALID_WALLET })
    })

    test('TC-F: DB lookup called before body used (canonical + bare-digit compat fallback)', async ({
      assert,
    }) => {
      mockFindBy(null)
      mockCdpClient([VALID_WALLET])
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: VALID_WALLET, cdpAccessToken: 'mock-cdp-token' },
      })

      await middleware.handle(ctx as any, next)

      // Two calls: canonical phone first, then bare-digit compat fallback
      assert.lengthOf(findByCalls, 2)
    })

    test('TC-G: no DB record, mixed-case valid address + CDP token → cdpUser uses body address, next called', async ({
      assert,
    }) => {
      const MIXED_WALLET = '0xAbCd1234567890aBcD1234567890AbCd12345678'
      mockFindBy(null)
      mockCdpClient([MIXED_WALLET])
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next, wasNextCalled } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: { walletAddress: MIXED_WALLET, cdpAccessToken: 'mock-cdp-token' },
      })

      await middleware.handle(ctx as any, next)

      assert.isTrue(wasNextCalled())
      assert.equal(ctx.cdpUser?.walletAddress, MIXED_WALLET)
    })
  }
)

test.group(
  'JwtAuthMiddleware | register-wallet — first-time user, no/invalid body → 401 (Tier 3)',
  (group) => {
    const PHONE_E164 = '+573001234567'

    group.setup(async () => {
      await ensureTestKeys()
    })

    group.each.teardown(() => {
      restoreFindBy()
    })

    test('TC-H: no DB record, no body → 401, next not called', async ({ assert }) => {
      mockFindBy(null)
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

    test('TC-I: no DB record, body walletAddress empty string → 401, next not called', async ({
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

      assert.isTrue(ctx.response.unauthorizedCalled)
      assert.isFalse(wasNextCalled())
    })

    test('TC-J: no DB record, body walletAddress invalid format → 401, next not called', async ({
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
    })

    test('TC-K: no DB record, body walletAddress too short → 401, next not called', async ({
      assert,
    }) => {
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

    test('TC-L: DB lookup tries canonical then bare-digit before body checked (DB-first for Tier 3)', async ({
      assert,
    }) => {
      mockFindBy(null)
      const middleware = new JwtAuthMiddleware()
      const token = await signToken(PHONE_E164)
      const { ctx, next } = buildCtx({
        token,
        url: '/api/register-wallet',
        body: {},
      })

      await middleware.handle(ctx as any, next)

      // Two calls: canonical phone first, then bare-digit compat fallback
      assert.lengthOf(findByCalls, 2)
    })
  }
)

test.group('JwtAuthMiddleware | DB error', (group) => {
  const PHONE_E164 = '+573001234567'

  group.setup(async () => {
    await ensureTestKeys()
  })

  group.each.teardown(() => {
    restoreFindBy()
  })

  test('TC-12: PhoneRegistry.findBy throws on non-register-wallet route → 401, next not called', async ({
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

  test('TC-12b: PhoneRegistry.findBy throws on register-wallet route → 401, next not called', async ({
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
