/**
 * Onramp Controller
 *
 * Handles COP → USDC onramp flows via Colurs R2P rails.
 *
 * KYC flow (one-time per user):
 *   GET  /api/onramp/kyc                 — check current KYC status
 *   POST /api/onramp/kyc/register        — register user on Colurs + save identity info
 *   POST /api/onramp/kyc/send-otp        — request phone or email OTP from Colurs
 *   POST /api/onramp/kyc/verify-phone    — verify phone OTP
 *   POST /api/onramp/kyc/verify-email    — verify email OTP
 *   POST /api/onramp/kyc/upload-document — upload ID document photo → submit for review
 *   POST /api/onramp/kyc/refresh-level   — poll Colurs for Level 5 approval
 *
 * Payment flow (requires Level 5):
 *   POST /api/onramp/quote               — COP → USDC estimate
 *   GET  /api/onramp/pse-banks           — list PSE financial institutions
 *   POST /api/onramp/initiate            — create Colurs R2P payment
 *   GET  /api/onramp/status/:orderId     — poll order status
 */

import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import OnrampOrder from '#models/onramp_order'
import { exchangeRateService } from '#services/exchange_rate_service'
import { initiatePayment, type OnrampMethod } from '#services/colurs_payment.service'
import { colursHeaders } from '#services/colurs_auth.service'
import {
  getKyc,
  getCounterpartyId,
  kycRegister,
  kycRequestOtp,
  kycVerifyPhone,
  kycVerifyEmail,
  kycSubmitDocument,
  kycRefreshLevel,
  type IdType,
} from '#services/colurs_kyc.service'
import env from '#start/env'
import { maskPhone } from '#utils/phone'

const VALID_METHODS: OnrampMethod[] = ['pse', 'nequi', 'bancolombia']
const VALID_ID_TYPES: IdType[] = ['CC', 'CE', 'NIT', 'PA']
const DEPOSIT_ADDRESS = () => env.get('SIPPY_ETH_DEPOSIT_ADDRESS', '')

export default class OnrampController {
  // ── GET /api/onramp/kyc ──────────────────────────────────────────────────────

  async kycStatus(ctx: HttpContext) {
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return ctx.response.status(401).json({ error: 'Unauthorized' })

    const kyc = await getKyc(phoneNumber)
    return ctx.response.json({
      kycStatus: kyc?.kycStatus ?? 'unregistered',
      kycLevel: kyc?.kycLevel ?? 0,
      // Mirror the same rule as refresh-level: Level 5 + counterparty required.
      // Without counterparty the user cannot initiate an onramp payment.
      isApproved:
        kyc?.kycStatus === 'approved' && (kyc?.kycLevel ?? 0) >= 5 && !!kyc?.counterpartyId,
      fullname: kyc?.fullname ?? null,
      idType: kyc?.idType ?? null,
      email: kyc?.email ?? null,
    })
  }

  // ── POST /api/onramp/kyc/register ────────────────────────────────────────────

  /**
   * Body: { fullname, idType, idNumber, email }
   * Creates the Colurs user account. Password is derived server-side.
   */
  async kycRegister(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { fullname, idType, idNumber, email } = request.body() as Record<string, unknown>

    if (!fullname || typeof fullname !== 'string' || fullname.trim().length < 2)
      return response.status(400).json({ error: 'fullname is required' })
    if (!idType || !VALID_ID_TYPES.includes(idType as IdType))
      return response.status(400).json({ error: 'idType must be CC, CE, NIT, or PA' })
    if (!idNumber || typeof idNumber !== 'string' || (idNumber as string).trim().length < 4)
      return response.status(400).json({ error: 'idNumber is required' })
    if (!email || typeof email !== 'string' || !(email as string).includes('@'))
      return response.status(400).json({ error: 'email is required' })

    try {
      await kycRegister({
        phoneNumber,
        email: (email as string).trim().toLowerCase(),
        fullname: (fullname as string).trim(),
        idType: idType as IdType,
        idNumber: (idNumber as string).trim(),
      })
      return response.status(201).json({ ok: true, kycStatus: 'registered' })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: register failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: 'Registration failed. Please try again.' })
    }
  }

  // ── POST /api/onramp/kyc/send-otp ────────────────────────────────────────────

  /**
   * Body: { type: 'phone' | 'email' }
   * Triggers Colurs to send a 6-digit OTP via SMS or email.
   */
  async kycSendOtp(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { type } = request.body() as { type: unknown }
    if (type !== 'phone' && type !== 'email')
      return response.status(400).json({ error: 'type must be phone or email' })

    try {
      await kycRequestOtp(phoneNumber, type)
      return response.json({ ok: true, sent: type })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: send-otp (${type}) failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: `Could not send ${type} verification code.` })
    }
  }

  // ── POST /api/onramp/kyc/verify-phone ────────────────────────────────────────

  /** Body: { code: string } */
  async kycVerifyPhone(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { code } = request.body() as { code: unknown }
    if (!code || typeof code !== 'string' || code.length !== 6)
      return response.status(400).json({ error: 'code must be a 6-digit string' })

    try {
      await kycVerifyPhone(phoneNumber, code)
      return response.json({ ok: true, kycStatus: 'phone_verified' })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: verify-phone failed for ${maskPhone(phoneNumber)}`)
      return response.status(400).json({ error: 'Invalid or expired code.' })
    }
  }

  // ── POST /api/onramp/kyc/verify-email ────────────────────────────────────────

  /** Body: { code: string } */
  async kycVerifyEmail(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { code } = request.body() as { code: unknown }
    if (!code || typeof code !== 'string' || code.length !== 6)
      return response.status(400).json({ error: 'code must be a 6-digit string' })

    try {
      await kycVerifyEmail(phoneNumber, code)
      return response.json({ ok: true, kycStatus: 'email_verified' })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: verify-email failed for ${maskPhone(phoneNumber)}`)
      return response.status(400).json({ error: 'Invalid or expired code.' })
    }
  }

  // ── POST /api/onramp/kyc/upload-document ─────────────────────────────────────

  /**
   * Body: { fileBase64: string, mimeType: 'image/jpeg' | 'image/png' }
   * Uploads the document photo to Colurs and submits for compliance review.
   * After this step the user waits for Level 5 approval (async).
   */
  async kycUploadDocument(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { fileBase64, mimeType } = request.body() as {
      fileBase64: unknown
      mimeType: unknown
    }

    if (!fileBase64 || typeof fileBase64 !== 'string')
      return response.status(400).json({ error: 'fileBase64 is required' })
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png')
      return response.status(400).json({ error: 'mimeType must be image/jpeg or image/png' })

    // Basic size guard — base64 of 10MB = ~13.3M chars
    if (fileBase64.length > 14_000_000)
      return response.status(400).json({ error: 'File too large. Maximum 10MB.' })

    // Decode and validate: reject invalid base64 and files whose magic bytes
    // don't match the claimed MIME type.
    let fileBytes: Buffer
    try {
      fileBytes = Buffer.from(fileBase64, 'base64')
    } catch {
      return response.status(400).json({ error: 'fileBase64 is not valid base64' })
    }

    if (fileBytes.length === 0) return response.status(400).json({ error: 'File is empty' })

    // JPEG magic: FF D8 FF
    // PNG magic:  89 50 4E 47 (‌.PNG)
    const isJpeg = fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff
    const isPng =
      fileBytes[0] === 0x89 &&
      fileBytes[1] === 0x50 &&
      fileBytes[2] === 0x4e &&
      fileBytes[3] === 0x47

    if (mimeType === 'image/jpeg' && !isJpeg)
      return response.status(400).json({ error: 'File content does not match image/jpeg' })
    if (mimeType === 'image/png' && !isPng)
      return response.status(400).json({ error: 'File content does not match image/png' })

    try {
      await kycSubmitDocument({ phoneNumber, fileBase64, mimeType })
      return response.json({ ok: true, kycStatus: 'documents_submitted' })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: upload-document failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: 'Document upload failed. Please try again.' })
    }
  }

  // ── POST /api/onramp/kyc/refresh-level ───────────────────────────────────────

  /**
   * Polls Colurs for the user's current KYC level.
   * When Level 5 is reached, creates the R2P counterparty automatically.
   */
  async kycRefreshLevel(ctx: HttpContext) {
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return ctx.response.status(401).json({ error: 'Unauthorized' })

    try {
      const result = await kycRefreshLevel(phoneNumber)
      // isApproved requires both Level 5 AND a counterparty ID.
      // Level 5 alone is not enough — the counterparty is required to initiate
      // an R2P payment. If counterparty creation failed, the UI must keep polling
      // (kycRefreshLevel retries it on every call) rather than exiting the flow.
      return ctx.response.json({
        kycLevel: result.level,
        kycStatus: result.status,
        isApproved: result.level >= 5 && !!result.counterpartyId,
      })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: refresh-level failed for ${maskPhone(phoneNumber)}`)
      return ctx.response.status(502).json({ error: 'Could not check KYC status.' })
    }
  }

  // ── POST /api/onramp/quote ───────────────────────────────────────────────────

  async quote({ request, response }: HttpContext) {
    const { amountCop } = request.body() as { amountCop: unknown }

    if (!amountCop || typeof amountCop !== 'number' || amountCop <= 0)
      return response.status(400).json({ error: 'amountCop must be a positive number' })

    const copRate = await exchangeRateService.getLocalRate('COP')
    if (!copRate)
      return response.status(503).json({ error: 'Exchange rate unavailable, try again shortly' })

    return response.json({
      amountCop,
      estimatedUsdc: Number((amountCop / copRate).toFixed(6)),
      rate: copRate,
      note: 'Indicative quote. Final amount set by Colurs after payment clears.',
    })
  }

  // ── GET /api/onramp/pse-banks ────────────────────────────────────────────────

  async pseBanks({ response }: HttpContext) {
    const baseUrl = env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
    try {
      const headers = await colursHeaders()
      const res = await fetch(`${baseUrl}/api/reload/r2p/pse/banks/`, { headers })
      if (!res.ok) {
        const text = await res.text()
        let errorKeys: string | undefined
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>
          errorKeys = Object.keys(parsed).join(', ')
        } catch {
          /* non-JSON body — omit */
        }
        logger.warn({ status: res.status, errorKeys }, 'onramp: PSE banks request failed')
        throw new Error(`Colurs PSE banks (${res.status})`)
      }
      return response.json(await res.json())
    } catch (err) {
      logger.error({ err }, 'onramp: failed to fetch PSE banks')
      return response.status(502).json({ error: 'Could not load banks. Try again.' })
    }
  }

  // ── POST /api/onramp/initiate ────────────────────────────────────────────────

  /**
   * Body: { method, amountCop, financialInstitutionCode? }
   * Requires Level 5 KYC approval before proceeding.
   */
  async initiate(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    const walletAddress = ctx.cdpUser?.walletAddress

    if (!phoneNumber || !walletAddress) return response.status(401).json({ error: 'Unauthorized' })

    if (!DEPOSIT_ADDRESS()) {
      logger.error('onramp: SIPPY_ETH_DEPOSIT_ADDRESS not configured')
      return response.status(503).json({ error: 'Onramp not available' })
    }

    const { method, amountCop, financialInstitutionCode } = request.body() as {
      method: unknown
      amountCop: unknown
      financialInstitutionCode?: string
    }

    if (!method || !VALID_METHODS.includes(method as OnrampMethod))
      return response.status(400).json({ error: 'method must be pse, nequi, or bancolombia' })
    if (!amountCop || typeof amountCop !== 'number' || amountCop < 1000)
      return response.status(400).json({ error: 'amountCop must be >= 1000' })
    if (method === 'pse' && !financialInstitutionCode)
      return response.status(400).json({ error: 'financialInstitutionCode required for PSE' })

    // Gate: user must be Level 5 with a counterparty
    const counterpartyId = await getCounterpartyId(phoneNumber)
    if (!counterpartyId) {
      return response.status(400).json({
        error: 'KYC approval required before onramp.',
        code: 'KYC_REQUIRED',
      })
    }

    const externalId = `onramp_${randomUUID()}`

    // Pre-insert the row BEFORE calling Colurs so that any payment.completed webhook
    // always has a local order to match, even if this process dies mid-flight.
    const order = await OnrampOrder.create({
      phoneNumber,
      externalId,
      method: method as string,
      amountCop: String(amountCop),
      depositAddress: DEPOSIT_ADDRESS(),
      status: 'initiating_payment',
    })
    const orderId = order.id

    try {
      const payment = await initiatePayment(method as OnrampMethod, {
        counterpartyId,
        amountCop: amountCop as number,
        externalId,
        financialInstitutionCode,
      })

      // Colurs accepted — store payment ID and mark pending atomically
      await OnrampOrder.query()
        .where('externalId', externalId)
        .update({ colursPaymentId: payment.money_movement_id, status: 'pending' })

      logger.info(`onramp: order ${orderId} created (${method}) for ${maskPhone(phoneNumber)}`)

      if (method === 'nequi') {
        return response.status(201).json({
          orderId,
          method,
          amountCop,
          trackingKey: payment.tracking_key,
          paymentLink: null,
          status: 'pending',
          instructions: 'Open the Nequi app, go to "Cobros pendientes", and approve the charge.',
        })
      }

      return response.status(201).json({
        orderId,
        method,
        amountCop,
        paymentLink: payment.payment_link,
        trackingKey: payment.tracking_key,
        status: 'pending',
      })
    } catch (err) {
      logger.error({ err }, `onramp: initiation failed for ${maskPhone(phoneNumber)}`)
      await OnrampOrder.query()
        .where('externalId', externalId)
        .update({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Initiation failed',
        })
      return response.status(502).json({ error: 'Payment initiation failed. Please try again.' })
    }
  }

  // ── GET /api/onramp/status/:orderId ─────────────────────────────────────────

  async status(ctx: HttpContext) {
    const { params, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const order = await OnrampOrder.query()
      .where('id', params.orderId)
      .where('phoneNumber', phoneNumber)
      .first()

    if (!order) return response.status(404).json({ error: 'Order not found' })

    return response.json(order)
  }
}
