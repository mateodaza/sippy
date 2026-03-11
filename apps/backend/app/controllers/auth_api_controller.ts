/**
 * Auth API Controller
 *
 * Handles OTP-based phone authentication and JWKS endpoint.
 * Routes: POST /api/auth/send-otp, POST /api/auth/verify-otp, GET /api/auth/.well-known/jwks.json
 */

import type { HttpContext } from '@adonisjs/core/http'
import { otpService } from '#services/otp_service'
import { jwtService } from '#services/jwt_service'

// ── Phone normalization ────────────────────────────────────────────────────────

/**
 * Strips common E.164 formatting characters and validates the result.
 * Exported for unit testing.
 */
export function normalizePhone(raw: string): string | null {
  // Strip whitespace, dashes, dots, parentheses
  const stripped = raw.replace(/[\s\-().]/g, '')
  // Must now match E.164 after stripping
  return /^\+[1-9]\d{1,14}$/.test(stripped) ? stripped : null
}

// ── Controller ─────────────────────────────────────────────────────────────────

export default class AuthApiController {
  /**
   * POST /api/auth/send-otp
   *
   * Sends an OTP via SMS to the provided phone number.
   */
  async sendOtp({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const phone = body?.phone

      if (!phone || typeof phone !== 'string') {
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      const normalizedPhone = normalizePhone(phone)
      if (normalizedPhone === null) {
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      const result = await otpService.sendOtp(normalizedPhone)

      if ('error' in result && result.error === 'rate_limited') {
        return response.status(429).json({ error: 'Too Many Requests', retryAfter: result.retryAfter })
      }

      return response.status(200).json({ success: true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/verify-otp
   *
   * Verifies an OTP code and returns a JWT if valid.
   */
  async verifyOtp({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { phone, code } = body ?? {}

      const normalizedPhone = typeof phone === 'string' ? normalizePhone(phone) : null
      if (normalizedPhone === null) {
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return response.status(422).json({ error: 'Invalid code' })
      }

      const result = await otpService.verifyOtp(normalizedPhone, code)

      if (!result.valid) {
        return response.status(401).json({ error: 'Invalid OTP' })
      }

      const token = await jwtService.signToken(normalizedPhone)
      return response.status(200).json({ token, expiresIn: 3600 })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/auth/.well-known/jwks.json
   *
   * Returns the public key set for JWT verification.
   */
  async jwks({ response }: HttpContext) {
    try {
      const jwks = await jwtService.getJwks()
      response.header('Cache-Control', 'public, max-age=3600')
      return response.status(200).json(jwks)
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}
