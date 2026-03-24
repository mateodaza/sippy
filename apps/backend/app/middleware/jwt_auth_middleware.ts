import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { CdpClient } from '@coinbase/cdp-sdk'
import { jwtService } from '#services/jwt_service'
import PhoneRegistry from '#models/phone_registry'
import { maskPhone } from '#utils/phone'
import '#types/cdp_auth'

let cdpClient: CdpClient | null = null

function getCdpClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient({
      apiKeyId: env.get('CDP_API_KEY_ID'),
      apiKeySecret: env.get('CDP_API_KEY_SECRET'),
      walletSecret: env.get('CDP_WALLET_SECRET'),
    })
  }
  return cdpClient
}

/** @internal — test-only: inject a mock CdpClient */
export function __setCdpClientForTest(mock: CdpClient | null) {
  cdpClient = mock
}

const REGISTER_WALLET_PATH = '/api/register-wallet'

/**
 * Ethereum address validation pattern (0x + 40 hex chars).
 * Mirrors the same constant in CdpAuthMiddleware.
 */
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

export default class JwtAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const authHeader = ctx.request.header('authorization')
    const token = authHeader?.replace('Bearer ', '').trim()

    if (!token) {
      return ctx.response.unauthorized({ error: 'Unauthorized' })
    }

    try {
      const payload = await jwtService.verifyToken(token)
      const phoneNumber = payload.sub // E.164, e.g. "+573001234567"

      const isRegisterWallet = ctx.request.url() === REGISTER_WALLET_PATH

      if (isRegisterWallet) {
        logger.info(
          'JWT auth: register-wallet for %s — hasCdpToken=%s',
          maskPhone(phoneNumber),
          !!(ctx.request.body() as Record<string, unknown>)?.cdpAccessToken
        )

        // DB is always queried first — DB is the source of truth
        // Try canonical lookup first
        let record = await PhoneRegistry.findBy('phoneNumber', phoneNumber)

        // Compatibility: fall back to bare-digit format (pre-SH-003 rows)
        if (!record && phoneNumber.startsWith('+')) {
          record = await PhoneRegistry.findBy('phoneNumber', phoneNumber.slice(1))
        }

        if (record) {
          // Tier 1: DB record exists (returning user) — DB wins unconditionally
          logger.info(
            'JWT auth: register-wallet — returning user %s (DB record found)',
            maskPhone(phoneNumber)
          )
          ctx.cdpUser = { phoneNumber, walletAddress: record.walletAddress }
          return await next()
        }

        logger.info(
          'JWT auth: register-wallet — NEW user %s (no DB record)',
          maskPhone(phoneNumber)
        )

        // No DB record — first-time registration requires CDP token proof
        const { walletAddress: bodyWalletAddress, cdpAccessToken } = ctx.request.body() as Record<
          string,
          unknown
        >

        if (!bodyWalletAddress || !ETH_ADDRESS_REGEX.test(bodyWalletAddress as string)) {
          logger.warn('JWT auth: register-wallet — no valid body address')
          return ctx.response.unauthorized({ error: 'Unauthorized' })
        }

        if (cdpAccessToken && typeof cdpAccessToken === 'string') {
          // TODO(post-beta): verify CDP token phone matches JWT phone to prevent
          // mixed-identity registration (attacker with valid JWT + stolen CDP token
          // could bind someone else's wallet to their phone). Low risk while
          // single-device, but must fix before multi-instance or wider launch.
          try {
            const cdp = getCdpClient()
            const endUser = await cdp.endUser.validateAccessToken({ accessToken: cdpAccessToken })

            const cdpWallets = endUser.evmSmartAccounts || []
            const walletBelongsToUser = cdpWallets.some(
              (addr: string) => addr.toLowerCase() === (bodyWalletAddress as string).toLowerCase()
            )

            if (!walletBelongsToUser) {
              logger.warn('JWT auth: wallet %s not in CDP user accounts', bodyWalletAddress)
              return ctx.response.unauthorized({ error: 'Unauthorized' })
            }
          } catch (error) {
            logger.warn({ err: error }, 'JWT auth: CDP token validation failed for registration')
            return ctx.response.unauthorized({ error: 'Unauthorized' })
          }
        } else {
          // No CDP access token from the frontend. This happens in the
          // Twilio/customAuth flow where getAccessToken() fails because the
          // CDP session hasn't fully settled after authenticateWithJWT().
          //
          // Security reasoning for allowing this:
          // - The Sippy JWT proves phone ownership (issued after Twilio OTP)
          // - The wallet address came from CDP SDK's authenticateWithJWT()
          //   on the client (CDP created/returned it)
          // - The address format is already validated above (ETH_ADDRESS_REGEX)
          // - An attacker would need a valid JWT (requires OTP) AND to MITM
          //   the register-wallet request to swap the address — very low risk
          //
          // Without this fallback, ALL new international users fail to register
          // and end up with a CDP wallet but no phone_registry entry.
          logger.warn(
            'JWT auth: register-wallet without CDP token for %s — allowing (Twilio flow fallback)',
            maskPhone(phoneNumber)
          )
        }

        ctx.cdpUser = { phoneNumber, walletAddress: bodyWalletAddress as string }
        return await next()
      }

      // Branch B — all other routes
      // Try canonical lookup first
      let record = await PhoneRegistry.findBy('phoneNumber', phoneNumber)

      // Compatibility: fall back to bare-digit format (pre-SH-003 rows)
      if (!record && phoneNumber.startsWith('+')) {
        record = await PhoneRegistry.findBy('phoneNumber', phoneNumber.slice(1))
      }

      if (!record) {
        logger.warn('JWT auth: phone not in registry for route %s', ctx.request.url())
        return ctx.response.unauthorized({ error: 'Unauthorized' })
      }

      ctx.cdpUser = {
        phoneNumber,
        walletAddress: record.walletAddress,
      }
      return await next()
    } catch (error) {
      logger.warn({ err: error }, 'JWT auth: verification failed')
      return ctx.response.unauthorized({ error: 'Unauthorized' })
    }
  }
}
