import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { jwtService } from '#services/jwt_service'
import { otpService } from '#services/otp_service'
import { normalizePhoneNumber } from '#utils/phone'

// ── Helpers ────────────────────────────────────────────────────────────────────

function toE164(raw: string): string | null {
  const normalized = normalizePhoneNumber(raw)
  if (normalized === null) return null

  const withPlus = normalized.startsWith('+') ? normalized : `+${normalized}`

  if (!/^\+\d{10,15}$/.test(withPlus)) return null

  return withPlus
}

// ── Controller ─────────────────────────────────────────────────────────────────

export default class AuthApiController {
  async sendOtp({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { phone } = body

      if (!phone || typeof phone !== 'string') {
        return response.status(400).json({ error: 'Phone is required' })
      }

      const e164 = toE164(phone)
      if (e164 === null) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      const result = await otpService.sendOtp(e164)

      if ('error' in result && result.error === 'rate_limited') {
        return response.status(429).json({ error: 'Too many requests', retryAfter: result.retryAfter })
      }

      return response.status(200).json({ success: true })
    } catch (err) {
      logger.error({ err }, 'sendOtp: unexpected error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  async verifyOtp({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { phone, code } = body

      if (!phone || typeof phone !== 'string' || !code || typeof code !== 'string') {
        return response.status(400).json({ error: 'Phone and code are required' })
      }

      const e164 = toE164(phone)
      if (e164 === null) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      const result = await otpService.verifyOtp(e164, code)

      if (result.valid === false) {
        return response.status(401).json({ error: 'Invalid or expired code' })
      }

      const token = await jwtService.signToken(e164)
      return response.status(200).json({ token, expiresIn: 3600 })
    } catch (err) {
      logger.error({ err }, 'verifyOtp: unexpected error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  async jwks({ response }: HttpContext) {
    try {
      const jwks = await jwtService.getJwks()
      response.header('Cache-Control', 'public, max-age=3600')
      return response.status(200).json(jwks)
    } catch (err) {
      logger.error({ err }, 'jwks: unexpected error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}
