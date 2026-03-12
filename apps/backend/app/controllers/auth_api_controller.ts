/**
 * Auth API Controller
 *
 * Handles OTP-based phone authentication and JWKS endpoint.
 * Routes: POST /api/auth/send-otp, POST /api/auth/verify-otp, GET /api/auth/.well-known/jwks.json
 */

import type { HttpContext } from '@adonisjs/core/http'
import { otpService } from '#services/otp_service'
import { jwtService } from '#services/jwt_service'
import { emailService } from '#services/email_service'
import { normalizeEmail, hashEmail, encryptEmail, decryptEmail } from '#utils/email_crypto'
import UserPreference from '#models/user_preference'
import { DateTime } from 'luxon'

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

// ── Email masking ──────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local[0]}***@${domain}`
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
   * POST /api/auth/send-email-code
   *
   * Sends an email verification code to the provided address.
   */
  async sendEmailCode(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const email = request.body()?.email
      if (!email || typeof email !== 'string') {
        return response.status(422).json({ error: 'Invalid email' })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(422).json({ error: 'Invalid email' })
      }

      const normalized = normalizeEmail(email)
      const hash = hashEmail(normalized)

      // Strip leading '+' to match the DB phone format used by user_preferences
      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')

      // Only block if another account has this email AND it's verified.
      // Unverified claims don't block — prevents squatting/lockout attacks.
      const duplicate = await UserPreference.query()
        .whereNotNull('emailHash')
        .where('emailHash', hash)
        .where('emailVerified', true)
        .whereNot('phoneNumber', dbPhone)
        .first()
      if (duplicate) {
        return response.status(409).json({ error: 'email_already_linked' })
      }

      const existingPref = await UserPreference.findBy('phoneNumber', dbPhone)
      const lang = existingPref?.preferredLanguage ?? undefined

      const { encrypted, iv } = encryptEmail(normalized)
      const combined = `${iv}:${encrypted}`

      const result = await emailService.sendEmailCode(normalized, lang ?? undefined)
      if ('error' in result) {
        if (result.error === 'rate_limited') {
          return response.status(429).json({ error: 'rate_limited' })
        }
        return response.status(500).json({ error: 'Internal server error' })
      }

      // Store pending email but preserve emailVerified status.
      // emailVerified is only set to true in verifyEmailCode after code confirmation.
      // This prevents a compromised session from downgrading protection by calling
      // sendEmailCode to reset emailVerified=false before the new email is proven.
      const existingVerified = existingPref?.emailVerified ?? false
      const existingVerifiedAt = existingPref?.emailVerifiedAt ?? null
      await UserPreference.updateOrCreate(
        { phoneNumber: dbPhone },
        {
          emailEncrypted: combined,
          emailHash: hash,
          emailVerified: existingVerified,
          emailVerifiedAt: existingVerifiedAt,
        }
      )

      return response.status(200).json({ success: true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/verify-email-code
   *
   * Verifies an email code and marks the address as verified.
   */
  async verifyEmailCode(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const email = request.body()?.email
      if (!email || typeof email !== 'string') {
        return response.status(422).json({ error: 'Invalid email' })
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(422).json({ error: 'Invalid email' })
      }

      const normalized = normalizeEmail(email)

      const code = request.body()?.code
      if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return response.status(422).json({ error: 'Invalid code' })
      }

      // Strip leading '+' to match the DB phone format used by user_preferences
      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')

      const pref = await UserPreference.findBy('phoneNumber', dbPhone)
      const submittedHash = hashEmail(normalized)
      if (!pref || pref.emailHash !== submittedHash) {
        return response.status(409).json({ error: 'email_mismatch' })
      }

      const result = await emailService.verifyEmailCode(normalized, code)
      if (!result.valid) {
        return response.status(401).json({ error: 'invalid_or_expired_code' })
      }

      // Clear any unverified claims of this email hash by other accounts
      // (prevents stale unverified rows from blocking future lookups)
      await UserPreference.query()
        .where('emailHash', submittedHash)
        .where('emailVerified', false)
        .whereNot('phoneNumber', dbPhone)
        .update({ emailHash: null, emailEncrypted: null })

      pref.emailVerified = true
      pref.emailVerifiedAt = DateTime.now()
      await pref.save()

      return response.status(200).json({ success: true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/auth/email-status
   *
   * Returns whether the authenticated user has a verified email.
   */
  async emailStatus(ctx: HttpContext) {
    const { response } = ctx
    try {
      // Strip leading '+' to match the DB phone format used by user_preferences
      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')
      const pref = await UserPreference.findBy('phoneNumber', dbPhone)

      let maskedEmail: string | null = null
      if (pref?.emailEncrypted) {
        try {
          const [iv, encrypted] = pref.emailEncrypted.split(':')
          const plaintext = decryptEmail(encrypted, iv)
          maskedEmail = maskEmail(plaintext)
        } catch {
          // Non-fatal: display field only — never 500 over a masked email
          maskedEmail = null
        }
      }

      return response.status(200).json({
        hasEmail: pref?.emailHash != null,
        verified: pref?.emailVerified ?? false,
        maskedEmail,
      })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/send-gate-code
   *
   * Sends an OTP to the user's already-stored verified email.
   * Does not modify emailVerified or emailVerifiedAt.
   */
  async sendGateCode(ctx: HttpContext) {
    const { response } = ctx
    try {
      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')
      const pref = await UserPreference.findBy('phoneNumber', dbPhone)

      if (!pref?.emailEncrypted || !pref.emailHash || pref.emailVerified !== true) {
        return response.status(409).json({ error: 'no_verified_email' })
      }

      const [iv, encrypted] = pref.emailEncrypted.split(':')
      const plaintext = decryptEmail(encrypted, iv)

      const result = await emailService.sendEmailCode(plaintext)
      if ('error' in result) {
        if (result.error === 'rate_limited') {
          return response.status(429).json({ error: 'rate_limited' })
        }
        return response.status(500).json({ error: 'Internal server error' })
      }

      return response.status(200).json({ success: true })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/verify-gate-code
   *
   * Verifies the OTP against the user's already-stored verified email.
   * On success, issues a gateToken. Does not modify emailVerified or emailVerifiedAt.
   */
  async verifyGateCode(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const code = request.body()?.code
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return response.status(422).json({ error: 'Invalid code' })
      }

      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')
      const pref = await UserPreference.findBy('phoneNumber', dbPhone)

      if (!pref?.emailEncrypted || !pref.emailHash || pref.emailVerified !== true) {
        return response.status(409).json({ error: 'no_verified_email' })
      }

      const [iv, encrypted] = pref.emailEncrypted.split(':')
      const plaintext = decryptEmail(encrypted, iv)

      const result = await emailService.verifyEmailCode(plaintext, code)
      if (!result.valid) {
        return response.status(401).json({ error: 'invalid_or_expired_code' })
      }

      const gateToken = emailService.issueGateToken(dbPhone)
      return response.status(200).json({ success: true, gateToken })
    } catch {
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/validate-export-gate
   *
   * Validates and consumes the gate token for a private key export operation.
   * Only required for users with a verified email. Returns 403 gate_required
   * if the token is missing, wrong, or expired.
   */
  async validateExportGate(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const gateToken = request.body()?.gateToken
      if (!gateToken || typeof gateToken !== 'string') {
        return response.status(403).json({ error: 'gate_required' })
      }

      const dbPhone = ctx.cdpUser!.phoneNumber.replace(/^\+/, '')
      const pref = await UserPreference.findBy('phoneNumber', dbPhone)

      if (!pref?.emailVerified) {
        return response.status(409).json({ error: 'no_verified_email' })
      }

      const valid = emailService.consumeGateToken(dbPhone, gateToken)
      if (!valid) {
        return response.status(403).json({ error: 'gate_required' })
      }

      return response.status(200).json({ success: true })
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
