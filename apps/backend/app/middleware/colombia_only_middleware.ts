import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { maskPhone } from '#utils/phone'

/**
 * Restricts an endpoint to Colombian phone numbers (+57 prefix).
 *
 * Colurs R2P and FX exchange rails are licensed for Colombia only.
 * The registration flow hard-codes Colombian phone parsing and bank rails,
 * so any non-+57 number would fail or produce incorrect data.
 *
 * This middleware must run after jwtAuth (requires ctx.cdpUser.phoneNumber).
 */
export default class ColombiaOnlyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const phoneNumber = ctx.cdpUser?.phoneNumber

    if (!phoneNumber || !phoneNumber.startsWith('+57')) {
      logger.warn(
        `colombia_only: blocked request from ${maskPhone(phoneNumber ?? 'unknown')} — not a Colombian number`
      )
      return ctx.response.status(403).json({
        error: 'This feature is only available for Colombian phone numbers (+57).',
      })
    }

    return next()
  }
}
