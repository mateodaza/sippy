/**
 * Auth API Controller
 *
 * Handles OTP-based phone authentication and JWKS endpoint.
 * Routes: POST /api/auth/send-otp, POST /api/auth/verify-otp, GET /api/auth/.well-known/jwks.json
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import app from '@adonisjs/core/services/app'
import '#types/container'
import env from '#start/env'
import { CdpClient } from '@coinbase/cdp-sdk'
import { otpService } from '#services/otp_service'
import { jwtService } from '#services/jwt_service'
import { emailService } from '#services/email_service'
import { normalizeEmail, hashEmail, encryptEmail, decryptEmail } from '#utils/email_crypto'
import UserPreference from '#models/user_preference'
import { DateTime } from 'luxon'
import { canonicalizePhone, getLanguageForPhone, maskPhone } from '#utils/phone'
import { findUserPrefByPhone, resolveUserPrefKey } from '#utils/user_pref_lookup'

// ── CDP client singleton ──────────────────────────────────────────────────────

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
        logger.warn('sendOtp: missing or invalid phone in body')
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      const normalizedPhone = canonicalizePhone(phone)
      if (normalizedPhone === null) {
        logger.warn('sendOtp: canonicalization failed for input: %s', phone?.slice(0, 4) + '***')
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      logger.info('sendOtp: sending to %s', maskPhone(normalizedPhone))

      const lang = getLanguageForPhone(normalizedPhone)
      const result = await otpService.sendOtp(normalizedPhone, lang)

      if ('error' in result && result.error === 'rate_limited') {
        logger.warn('sendOtp: rate limited for %s', maskPhone(normalizedPhone))
        return response.status(429).json({ error: 'Too Many Requests', retryAfter: result.retryAfter })
      }

      logger.info('sendOtp: OTP sent successfully to %s', maskPhone(normalizedPhone))
      return response.status(200).json({ success: true })
    } catch (error) {
      logger.error('sendOtp error: %o', error)
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

      const normalizedPhone = typeof phone === 'string' ? canonicalizePhone(phone) : null
      if (normalizedPhone === null) {
        logger.warn('verifyOtp: invalid phone')
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        logger.warn('verifyOtp: invalid code format for %s', maskPhone(normalizedPhone))
        return response.status(422).json({ error: 'Invalid code' })
      }

      logger.info('verifyOtp: verifying for %s', maskPhone(normalizedPhone))
      const result = await otpService.verifyOtp(normalizedPhone, code)

      if (!result.valid) {
        logger.warn('verifyOtp: invalid OTP for %s (locked=%s)', maskPhone(normalizedPhone), 'locked' in result ? result.locked : false)
        return response.status(401).json({ error: 'Invalid OTP' })
      }

      const token = await jwtService.signToken(normalizedPhone)
      logger.info('verifyOtp: JWT issued for %s', maskPhone(normalizedPhone))
      return response.status(200).json({ token, expiresIn: 3600 })
    } catch (error) {
      logger.error('verifyOtp error: %o', error)
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

      const dbPhone = ctx.cdpUser!.phoneNumber

      // Only block if another account has this email AND it's verified.
      // Unverified claims don't block — prevents squatting/lockout attacks.
      const duplicate = await UserPreference.query()
        .whereNotNull('emailHash')
        .where('emailHash', hash)
        .where('emailVerified', true)
        .whereNotIn('phoneNumber', [dbPhone, dbPhone.slice(1)])
        .first()
      if (duplicate) {
        return response.status(409).json({ error: 'email_already_linked' })
      }

      const existingPref = await findUserPrefByPhone(dbPhone)
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
      const prefKey = await resolveUserPrefKey(dbPhone)
      await UserPreference.updateOrCreate(
        { phoneNumber: prefKey },
        {
          emailEncrypted: combined,
          emailHash: hash,
          emailVerified: existingVerified,
          emailVerifiedAt: existingVerifiedAt,
        }
      )

      return response.status(200).json({ success: true })
    } catch (error) {
      logger.error('sendEmailCode error: %o', error)
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

      const dbPhone = ctx.cdpUser!.phoneNumber

      const pref = await findUserPrefByPhone(dbPhone)
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
        .whereNotIn('phoneNumber', [dbPhone, dbPhone.slice(1)])
        .update({ emailHash: null, emailEncrypted: null })

      pref.emailVerified = true
      pref.emailVerifiedAt = DateTime.now()
      await pref.save()

      return response.status(200).json({ success: true })
    } catch (error) {
      logger.error('verifyEmailCode error: %o', error)
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
      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findUserPrefByPhone(dbPhone)

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
    } catch (error) {
      logger.error('emailStatus error: %o', error)
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
      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findUserPrefByPhone(dbPhone)

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
    } catch (error) {
      logger.error('sendGateCode error: %o', error)
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

      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findUserPrefByPhone(dbPhone)

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
    } catch (error) {
      logger.error('verifyGateCode error: %o', error)
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

      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findUserPrefByPhone(dbPhone)

      if (!pref?.emailVerified) {
        return response.status(409).json({ error: 'no_verified_email' })
      }

      const valid = emailService.consumeGateToken(dbPhone, gateToken)
      if (!valid) {
        return response.status(403).json({ error: 'gate_required' })
      }

      return response.status(200).json({ success: true })
    } catch (error) {
      logger.error('validateExportGate error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/user-language
   *
   * Returns the resolved language for the authenticated user.
   * Checks DB preference first; falls back to phone-number detection.
   */
  async userLanguage(ctx: HttpContext) {
    const { response } = ctx
    try {
      const dbPhone = ctx.cdpUser!.phoneNumber
      const pref = await findUserPrefByPhone(dbPhone)

      const validLanguages = ['en', 'es', 'pt'] as const
      type ValidLanguage = (typeof validLanguages)[number]

      if (pref?.preferredLanguage && (validLanguages as readonly string[]).includes(pref.preferredLanguage)) {
        return response.status(200).json({
          language: pref.preferredLanguage as ValidLanguage,
          source: 'preference',
        })
      }

      const language = getLanguageForPhone(dbPhone)
      return response.status(200).json({ language, source: 'phone' })
    } catch (error) {
      logger.error('userLanguage error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/set-language
   *
   * Saves or clears the user's preferred language.
   */
  async setLanguage(ctx: HttpContext) {
    const { request, response } = ctx
    const VALID_LANGUAGES = ['en', 'es', 'pt'] as const
    try {
      const body = request.body() as { language?: unknown }
      const { language } = body

      if (language !== null && !(VALID_LANGUAGES as readonly unknown[]).includes(language)) {
        return response.status(400).json({ error: 'invalid_language' })
      }

      const dbPhone = ctx.cdpUser!.phoneNumber
      const prefKey = await resolveUserPrefKey(dbPhone)
      await UserPreference.updateOrCreate(
        { phoneNumber: prefKey },
        { preferredLanguage: language as string | null }
      )
      return response.status(200).json({ ok: true })
    } catch (error) {
      logger.error('setLanguage error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/auth/exchange-cdp-token
   *
   * Validates a CDP access token (from native SMS auth) and returns a Sippy JWT.
   * Used by NANP (+1) users who authenticate via CDP's built-in SMS flow.
   * No JWT required — the CDP access token is the proof of identity.
   */
  async exchangeCdpToken({ request, response }: HttpContext) {
    try {
      const { cdpAccessToken } = request.body() ?? {}

      if (!cdpAccessToken || typeof cdpAccessToken !== 'string') {
        logger.warn('exchangeCdpToken: missing or invalid cdpAccessToken in body')
        return response.status(422).json({ error: 'Missing cdpAccessToken' })
      }

      logger.info('exchangeCdpToken: validating CDP token (length=%d)', cdpAccessToken.length)

      const cdp = getCdpClient()
      const endUser = await cdp.endUser.validateAccessToken({ accessToken: cdpAccessToken })

      logger.info(
        'exchangeCdpToken: CDP token valid — authMethods=%j, smartAccounts=%d',
        endUser.authenticationMethods?.map((m: { type: string }) => m.type) ?? [],
        (endUser.evmSmartAccounts || []).length
      )

      // Extract phone from SMS auth method (same pattern as cdp_auth_middleware.ts)
      const smsAuth = endUser.authenticationMethods?.find(
        (m: { type: string }) => m.type === 'sms'
      ) as { type: 'sms'; phoneNumber: string } | undefined

      if (!smsAuth?.phoneNumber) {
        logger.warn('exchangeCdpToken: no phone in CDP token authMethods')
        return response.status(401).json({ error: 'No phone in CDP token' })
      }

      const canonicalPhone = canonicalizePhone(smsAuth.phoneNumber)
      if (!canonicalPhone) {
        logger.warn('exchangeCdpToken: invalid phone from CDP token: %s', smsAuth.phoneNumber)
        return response.status(422).json({ error: 'Invalid phone number' })
      }

      logger.info('exchangeCdpToken: phone extracted — %s', maskPhone(canonicalPhone))

      const rateLimitService = await app.container.make('rateLimitService')
      const exchangeCheck = rateLimitService.checkCdpExchangeThrottle(canonicalPhone)
      if (!exchangeCheck.allowed) {
        logger.warn('exchangeCdpToken: rate limited for %s', maskPhone(canonicalPhone))
        response.header('Retry-After', String(exchangeCheck.retryAfter))
        return response.status(429).json({ error: 'Too many requests. Try again later.' })
      }

      const token = await jwtService.signToken(canonicalPhone)
      logger.info('exchangeCdpToken: JWT issued for %s', maskPhone(canonicalPhone))
      return response.status(200).json({ token, expiresIn: 3600 })
    } catch (error) {
      // Distinguish CDP auth failures from server errors using HTTP status codes
      // from the SDK response, not fragile string matching on error messages.
      const status = (error as Record<string, unknown>)?.status ??
        (error as Record<string, unknown> & { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) {
        logger.warn('exchangeCdpToken auth failure (status=%d): %s', status, (error as Error).message)
        return response.status(401).json({ error: 'CDP token invalid or expired' })
      }
      logger.error('exchangeCdpToken error: %o', error)
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
    } catch (error) {
      logger.error('jwks error: %o', error)
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}
