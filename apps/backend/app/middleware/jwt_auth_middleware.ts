import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { jwtService } from '#services/jwt_service'
import PhoneRegistry from '#models/phone_registry'
import '#types/cdp_auth'

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

      // Strip "+" prefix for DB lookup — phone_registry stores without "+"
      const dbPhone = phoneNumber.replace(/^\+/, '')

      const isRegisterWallet = ctx.request.url() === REGISTER_WALLET_PATH

      if (isRegisterWallet) {
        // DB is always queried first — DB is the source of truth
        const record = await PhoneRegistry.findBy('phoneNumber', dbPhone)

        if (record) {
          // Tier 1: DB record exists (returning user) — DB wins unconditionally
          ctx.cdpUser = { phoneNumber, walletAddress: record.walletAddress }
          return await next()
        }

        // No DB record — check request body for first-time registration
        const { walletAddress: bodyWalletAddress } = ctx.request.body() as Record<string, unknown>

        if (bodyWalletAddress && ETH_ADDRESS_REGEX.test(bodyWalletAddress as string)) {
          // Tier 2: No DB record, valid body address (first-time registration)
          ctx.cdpUser = { phoneNumber, walletAddress: bodyWalletAddress as string }
          return await next()
        }

        // Tier 3: No DB record AND no valid body address — cannot proceed
        logger.warn('JWT auth: register-wallet — no registry row and no valid body address')
        return ctx.response.unauthorized({ error: 'Unauthorized' })
      }

      // Branch B — all other routes
      const record = await PhoneRegistry.findBy('phoneNumber', dbPhone)

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
