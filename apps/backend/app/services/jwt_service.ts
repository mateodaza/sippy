import { importPKCS8, importSPKI, SignJWT, jwtVerify, exportJWK } from 'jose'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string
  iss: string
  iat: number
  exp: number
  jti: string
}

interface JwkKey {
  kty: string
  n: string
  e: string
  kid: string
  alg: 'RS256'
  use: 'sig'
}

interface Jwks {
  keys: JwkKey[]
}

// ── Service ────────────────────────────────────────────────────────────────────

class JwtService {
  private privateKey: CryptoKey | null = null
  private publicKey: CryptoKey | null = null
  private initialized: boolean = false

  private async init(): Promise<void> {
    if (this.initialized) return

    const privateB64 = process.env.JWT_PRIVATE_KEY_PEM
    const publicB64 = process.env.JWT_PUBLIC_KEY_PEM

    if (!privateB64 || !publicB64) {
      throw new Error('JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM must be set')
    }

    const privatePem = Buffer.from(privateB64, 'base64').toString('utf-8')
    const publicPem = Buffer.from(publicB64, 'base64').toString('utf-8')

    this.privateKey = await importPKCS8(privatePem, 'RS256')
    this.publicKey = await importSPKI(publicPem, 'RS256', { extractable: true })
    this.initialized = true
  }

  async signToken(sub: string): Promise<string> {
    await this.init()

    const kid = process.env.JWT_KEY_ID ?? 'sippy-1'
    const iss = process.env.JWT_ISSUER ?? 'sippy'
    const jti = crypto.randomUUID()

    return new SignJWT({ sub, jti })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.privateKey!)
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    await this.init()
    const { payload } = await jwtVerify(token, this.publicKey!)
    return payload as unknown as JwtPayload
  }

  async getJwks(): Promise<Jwks> {
    await this.init()

    const kid = process.env.JWT_KEY_ID ?? 'sippy-1'
    const jwk = await exportJWK(this.publicKey!)

    return {
      keys: [
        {
          kty: jwk.kty as string,
          n: jwk.n as string,
          e: jwk.e as string,
          kid,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }
  }
}

export const jwtService = new JwtService()
export default JwtService
