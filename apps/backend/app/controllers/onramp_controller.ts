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
import { createOnrampQuote, getQuoteRate } from '#services/colurs_fx.service'
import {
  initiatePayment,
  getPaymentPreview,
  type OnrampMethod,
} from '#services/colurs_payment.service'
import { PSE_BANKS_FALLBACK } from '#services/pse_banks'
import { colursHeaders } from '#services/colurs_auth.service'
import {
  getKyc,
  kycRegister,
  kycQuickRegister,
  kycUseQuickFlow,
  kycRequestOtp,
  kycVerifyPhone,
  kycVerifyEmail,
  kycSubmitDocument,
  kycRefreshLevel,
  type IdType,
} from '#services/colurs_kyc.service'
import {
  onPaymentSucceeded,
  TERMINAL_STATUSES,
  normalizeColursStatus,
} from '#jobs/poll_r2p_payments'
import env from '#start/env'
import { maskPhone } from '#utils/phone'

const VALID_METHODS: OnrampMethod[] = ['pse', 'nequi', 'bancolombia']
// CC-only in this release. KYC doc upload is hardcoded to national_id_front +
// national_id_back — re-add CE/PA/NIT once type_documents codes for their pairs
// are mapped in colurs_kyc.service.kycSubmitDocument.
const VALID_ID_TYPES: IdType[] = ['CC']
const DEPOSIT_ADDRESS = () => env.get('SIPPY_ETH_DEPOSIT_ADDRESS', '')

// ~$2,500 USD at current rates. Generous enough for real use, low enough
// to cap exposure through the hot-wallet bridge path.
const MAX_ONRAMP_COP = 10_000_000

// Monthly limit for users on the quick-flow (no full KYC).
// ≈ $1,000 USD at ~4,000 COP/USD. Above this, /initiate returns
// KYC_REQUIRED_FOR_AMOUNT and the frontend prompts the user to upgrade.
const QUICK_FLOW_LIMIT_COP = 4_000_000

export default class OnrampController {
  // ── GET /api/onramp/kyc ──────────────────────────────────────────────────────

  async kycStatus(ctx: HttpContext) {
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return ctx.response.status(401).json({ error: 'Unauthorized' })

    const kyc = await getKyc(phoneNumber)
    return ctx.response.json({
      kycStatus: kyc?.kycStatus ?? 'unregistered',
      kycLevel: kyc?.kycLevel ?? 0,
      // "Approved enough to onramp" requires only counterparty + status='approved'.
      // The kyc_level field discriminates between quick-flow (0) and full-KYC
      // approved (5); only level >= 5 lifts the monthly cap. Both states are
      // "approved" for the purposes of routing the user to the method picker.
      isApproved: kyc?.kycStatus === 'approved' && !!kyc?.counterpartyId,
      isFullKycApproved: (kyc?.kycLevel ?? 0) >= 5 && kyc?.kycStatus === 'approved',
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

    // Default register flow is now the QUICK FLOW (counterparty only, no /user/).
    // The full KYC flow is only triggered by POST /api/onramp/kyc/upgrade-to-full-kyc
    // when the user trips the monthly cap on /initiate.
    try {
      await kycQuickRegister({
        phoneNumber,
        email: (email as string).trim().toLowerCase(),
        fullname: (fullname as string).trim(),
        idType: idType as IdType,
        idNumber: (idNumber as string).trim(),
      })
      // isApproved=true means the frontend can jump straight to the method picker.
      return response.status(201).json({ ok: true, kycStatus: 'approved', isApproved: true })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: quick-register failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: 'Registration failed. Please try again.' })
    }
  }

  // ── POST /api/onramp/kyc/upgrade-to-full-kyc ────────────────────────────────
  //
  // Triggered when a quick-flow user trips the monthly cap (KYC_REQUIRED_FOR_AMOUNT
  // from /initiate). Reuses the identity already collected during quick-register
  // and creates the Colurs /user/ account on top of the existing counterparty.
  // After this, the user goes through the existing OTP → doc upload flow.

  async kycUpgradeToFullKyc(ctx: HttpContext) {
    const { response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const kyc = await getKyc(phoneNumber)
    if (!kyc?.counterpartyId) {
      return response.status(400).json({
        error: 'Quick-flow registration required first.',
        code: 'QUICK_FLOW_REQUIRED',
      })
    }
    if (kyc.colursUserId !== null && kyc.colursUserId !== undefined) {
      return response.status(409).json({
        error: 'Already upgraded.',
        code: 'ALREADY_UPGRADED',
      })
    }
    if (!kyc.fullname || !kyc.idType || !kyc.idNumber || !kyc.email) {
      return response.status(400).json({
        error: 'Missing identity data; please re-register.',
        code: 'MISSING_IDENTITY',
      })
    }

    try {
      await kycRegister({
        phoneNumber,
        email: kyc.email,
        fullname: kyc.fullname,
        idType: kyc.idType,
        idNumber: kyc.idNumber,
      })
      // kycStatus moves to 'registered' so the frontend routes the user into
      // the existing OTP/doc upload flow (kyc_phone_otp → … → kyc_pending).
      return response.status(201).json({ ok: true, kycStatus: 'registered' })
    } catch (err) {
      logger.error({ err }, `onramp/kyc: upgrade failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: 'Identity verification setup failed.' })
    }
  }

  // ── POST /api/onramp/kyc/use-quick-flow ─────────────────────────────────────
  //
  // Escape hatch from the "Under review" wait. A user who already started full
  // KYC (registered / phone_verified / email_verified / documents_submitted)
  // and is waiting on Colurs's compliance team can opt into the quick-flow
  // experience — capped at the same monthly limit — to start onramping small
  // amounts immediately.
  //
  // Idempotent: if a counterparty already exists on the row, we just bump
  // status. If not, we create one using the identity already collected during
  // registration.

  async kycUseQuickFlow(ctx: HttpContext) {
    const { response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    try {
      await kycUseQuickFlow({ phoneNumber })
      return response.status(200).json({
        ok: true,
        kycStatus: 'approved',
        isApproved: true,
      })
    } catch (err) {
      const code = (err as Error & { code?: string }).code
      if (code === 'MISSING_IDENTITY') {
        return response.status(400).json({
          error: 'Identity data missing; please re-register.',
          code: 'MISSING_IDENTITY',
        })
      }
      logger.error({ err }, `onramp/kyc: switch-to-quick-flow failed for ${maskPhone(phoneNumber)}`)
      return response.status(502).json({ error: 'Could not enable quick-flow.' })
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
    if (!code || typeof code !== 'string' || code.length !== 4)
      return response.status(400).json({ error: 'code must be a 4-digit string' })

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
    if (!code || typeof code !== 'string' || code.length !== 4)
      return response.status(400).json({ error: 'code must be a 4-digit string' })

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
   * Body: {
   *   frontBase64: string, frontMimeType: 'image/jpeg' | 'image/png',
   *   backBase64:  string, backMimeType:  'image/jpeg' | 'image/png'
   * }
   * Colombia CC requires both front and back of the national ID. This endpoint
   * uploads both sides to Colurs and submits them for compliance review.
   * After this step the user waits for Level 5 approval (async).
   */
  async kycUploadDocument(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const { frontBase64, frontMimeType, backBase64, backMimeType } = request.body() as {
      frontBase64: unknown
      frontMimeType: unknown
      backBase64: unknown
      backMimeType: unknown
    }

    const validateSide = (
      label: 'front' | 'back',
      b64: unknown,
      mime: unknown
    ): { ok: true; bytes: Buffer } | { ok: false; error: string } => {
      if (!b64 || typeof b64 !== 'string') return { ok: false, error: `${label}Base64 is required` }
      if (mime !== 'image/jpeg' && mime !== 'image/png')
        return { ok: false, error: `${label}MimeType must be image/jpeg or image/png` }
      if (b64.length > 14_000_000)
        return { ok: false, error: `${label} file too large. Maximum 10MB.` }

      let bytes: Buffer
      try {
        bytes = Buffer.from(b64, 'base64')
      } catch {
        return { ok: false, error: `${label}Base64 is not valid base64` }
      }
      if (bytes.length === 0) return { ok: false, error: `${label} file is empty` }

      // JPEG magic: FF D8 FF | PNG magic: 89 50 4E 47
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47

      if (mime === 'image/jpeg' && !isJpeg)
        return { ok: false, error: `${label} content does not match image/jpeg` }
      if (mime === 'image/png' && !isPng)
        return { ok: false, error: `${label} content does not match image/png` }
      return { ok: true, bytes }
    }

    const front = validateSide('front', frontBase64, frontMimeType)
    if (!front.ok) return response.status(400).json({ error: front.error })
    const back = validateSide('back', backBase64, backMimeType)
    if (!back.ok) return response.status(400).json({ error: back.error })

    try {
      await kycSubmitDocument({
        phoneNumber,
        frontBase64: frontBase64 as string,
        frontMimeType: frontMimeType as 'image/jpeg' | 'image/png',
        backBase64: backBase64 as string,
        backMimeType: backMimeType as 'image/jpeg' | 'image/png',
      })
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
  //
  // Calls Colurs's stateless /v2/exchange/quotes/ endpoint to surface the
  // real fee breakdown to the user BEFORE they pay. The quote returned here
  // is a price preview only — nothing is reserved or executed. The dispersion
  // job re-quotes at execute time so the user-displayed rate may move slightly
  // by the time the COP actually lands.
  //
  // Falls back to the indicative-rate stub if Colurs is unreachable so the UI
  // doesn't get stuck on amount entry.

  async quote({ request, response }: HttpContext) {
    const { amountCop } = request.body() as { amountCop: unknown }

    if (!amountCop || typeof amountCop !== 'number' || amountCop <= 0)
      return response.status(400).json({ error: 'amountCop must be a positive number' })

    // Try the real Colurs quote first
    try {
      const quote = await createOnrampQuote(amountCop)
      const rate = getQuoteRate(quote)
      const previewRaw = (quote as unknown as Record<string, unknown>).preview_comisiones
      const preview = (
        typeof previewRaw === 'object' && previewRaw !== null
          ? (previewRaw as Record<string, unknown>)
          : {}
      ) as Record<string, unknown>
      const feesRaw = (quote as unknown as Record<string, unknown>).fees_breakdown
      const fees = (
        typeof feesRaw === 'object' && feesRaw !== null ? (feesRaw as Record<string, unknown>) : {}
      ) as Record<string, unknown>

      const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0
      const costoEnvio = num(preview.costo_envio)
      const iva = num(preview.iva)
      const gmf = num(preview.gmf)
      const spread = num(fees.spread)
      const destinationAmount = num(quote.destination_amount)

      // For COP→USDC: source_amount converts to destination_amount at the FX
      // rate, and fees (costo_envio, iva, gmf — all in COP) are charged ON TOP
      // of source_amount. So:
      //   - The user RECEIVES destination_amount in USDC.
      //   - The user PAYS source_amount + sum(COP fees) via R2P.
      const sourceAmount = num(quote.source_amount) || amountCop
      const totalCop = sourceAmount + costoEnvio + iva + gmf

      return response.json({
        amountCop,
        estimatedUsdc: Number(destinationAmount.toFixed(6)),
        rate,
        sourceAmount,
        totalCop,
        fees: {
          costoEnvio,
          iva,
          gmf,
          spread,
        },
        validUntil: quote.valid_until ?? quote.expires_at ?? null,
        note: 'Quote valid for 1 minute. Rate may shift by a fraction of a percent at settlement.',
      })
    } catch (err) {
      logger.warn({ err }, `onramp.quote: Colurs quote failed, falling back to indicative rate`)
      const copRate = await exchangeRateService.getLocalRate('COP')
      if (!copRate)
        return response.status(503).json({ error: 'Exchange rate unavailable, try again shortly' })

      return response.json({
        amountCop,
        estimatedUsdc: Number((amountCop / copRate).toFixed(6)),
        rate: copRate,
        totalCop: amountCop,
        fees: null,
        validUntil: null,
        note: 'Indicative quote (live FX unavailable). Final amount set by Colurs after payment clears.',
      })
    }
  }

  // ── GET /api/onramp/preview/:colursPaymentId ────────────────────────────────
  //
  // Public (no auth) — proxies Colurs's public /api/reload/r2p/preview/{id}/.
  // Used by post-redirect success pages where the user's Sippy session may have
  // expired during the bank / Nequi flow.

  async preview(ctx: HttpContext) {
    const { params, response } = ctx
    const colursPaymentId = params.colursPaymentId as string | undefined
    if (!colursPaymentId) return response.status(400).json({ error: 'colursPaymentId required' })

    try {
      const data = await getPaymentPreview(colursPaymentId)
      // Return only fields safe for public display — drop any metadata Colurs
      // might add over time that could leak user info.
      return response.json({
        moneyMovementId: data.money_movement_id,
        status: data.status,
        statusCode: data.status_code ?? null,
        statusDescription: data.status_description ?? null,
        trackingKey: data.tracking_key ?? null,
      })
    } catch (err) {
      logger.error({ err, colursPaymentId }, 'onramp: preview failed')
      return response.status(502).json({ error: 'Could not load payment status.' })
    }
  }

  // ── GET /api/onramp/public-status/:orderId ──────────────────────────────────
  //
  // Public (no auth) — minimal status read for the post-payment redirect-resume
  // path. If the user's Sippy session expired during the bank flow (Bancolombia
  // PSE / Nequi can take 5+ min), the authed /status endpoint 401s. This route
  // returns just enough for the success page to render: status + amount + method.
  // No PII, no private details. orderId is a UUID (hard to guess); risk of
  // someone enumerating orderIds is acceptable given the trivial info exposed.

  async publicStatus(ctx: HttpContext) {
    const { params, response } = ctx
    const orderId = params.orderId as string | undefined
    if (!orderId) return response.status(400).json({ error: 'orderId required' })

    const order = await OnrampOrder.query().where('id', orderId).first()
    if (!order) return response.status(404).json({ error: 'Order not found' })

    return response.json({
      orderId: order.id,
      method: order.method,
      amountCop: Number.parseFloat(order.amountCop),
      status: order.status,
      paymentLink: order.paymentLink ?? null,
      trackingKey: order.trackingKey ?? null,
      createdAt: order.createdAt,
    })
  }

  // ── GET /api/onramp/pse-banks ────────────────────────────────────────────────
  //
  // Tries Colurs's live `/api/reload/r2p/pse/banks/` first. As of 2026-04-27
  // that endpoint is returning 500 (Django generic error page) on prod, so we
  // fall back to a static list of common Colombian ACH PSE codes. PSE create
  // accepts the `code` directly without first calling this endpoint, so the
  // fallback unblocks the dropdown without losing functionality.

  async pseBanks({ response }: HttpContext) {
    const baseUrl = env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
    try {
      const headers = await colursHeaders()
      const res = await fetch(`${baseUrl}/api/reload/r2p/pse/banks/`, { headers })
      if (res.ok) {
        const data = (await res.json()) as { banks?: unknown[] } | unknown[]
        const banks = Array.isArray(data) ? data : Array.isArray(data?.banks) ? data.banks : null
        if (banks && banks.length > 0) {
          return response.json({ banks })
        }
        logger.warn('onramp: PSE banks live response empty, using fallback')
      } else {
        logger.warn(
          { status: res.status },
          'onramp: PSE banks live fetch returned non-2xx, using fallback'
        )
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'onramp: PSE banks live fetch threw, using fallback')
    }
    return response.json({ banks: PSE_BANKS_FALLBACK })
  }

  // ── POST /api/onramp/initiate ────────────────────────────────────────────────

  /**
   * Body: { method, amountCop, idempotencyKey, financialInstitutionCode? }
   *
   * idempotencyKey: client-generated UUID. The frontend creates one when the
   * user reaches the payment step and reuses it on retries. A UNIQUE index on
   * onramp_orders.idempotency_key prevents duplicate Colurs R2P payments:
   * if the same key arrives twice, we return the existing order.
   *
   * Requires Level 5 KYC approval before proceeding.
   */
  async initiate(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    const walletAddress = ctx.cdpUser?.walletAddress

    if (!phoneNumber || !walletAddress) return response.status(401).json({ error: 'Unauthorized' })

    // Block early if the direct-USDC flag is set without a completion path.
    // This must fire BEFORE any COP is collected from the user.
    if (env.get('COLURS_DIRECT_USDC') === 'true') {
      logger.error('onramp: COLURS_DIRECT_USDC=true but completion path not implemented')
      return response.status(503).json({ error: 'Onramp not available (configuration error)' })
    }

    if (!DEPOSIT_ADDRESS()) {
      logger.error('onramp: SIPPY_ETH_DEPOSIT_ADDRESS not configured')
      return response.status(503).json({ error: 'Onramp not available' })
    }

    const { method, amountCop, idempotencyKey, financialInstitutionCode } = request.body() as {
      method: unknown
      amountCop: unknown
      idempotencyKey: unknown
      financialInstitutionCode?: string
    }

    if (!method || !VALID_METHODS.includes(method as OnrampMethod))
      return response.status(400).json({ error: 'method must be pse, nequi, or bancolombia' })
    if (!amountCop || typeof amountCop !== 'number' || amountCop < 1000)
      return response.status(400).json({ error: 'amountCop must be >= 1000' })
    if (amountCop > MAX_ONRAMP_COP)
      return response
        .status(400)
        .json({ error: `Maximum onramp is ${MAX_ONRAMP_COP.toLocaleString('en-US')} COP` })
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16)
      return response
        .status(400)
        .json({ error: 'idempotencyKey is required (UUID generated by the client)' })
    if (method === 'pse' && !financialInstitutionCode)
      return response.status(400).json({ error: 'financialInstitutionCode required for PSE' })

    const kyc = await getKyc(phoneNumber)
    const counterpartyId = kyc?.counterpartyId
    if (!counterpartyId) {
      return response.status(400).json({
        error: 'Identity verification required before onramp.',
        code: 'KYC_REQUIRED',
      })
    }

    // Monthly cap until the user has completed full Colurs KYC review.
    // Discriminator is `kyc_level >= 5` — that's the value kycRefreshLevel
    // writes when Colurs approves the documents. Quick-flow rows are at
    // level 0 (counterparty exists but no real verification), and
    // mid-upgrade rows are also at level 0 until Colurs's compliance team
    // completes review. Both stay capped.
    //
    // Status filter is an ALLOW-LIST of states that represent real,
    // committed money in flight. `initiating_payment` and other transient
    // pre-Colurs states do NOT count — otherwise an orphan row would
    // permanently consume quota.
    if ((kyc.kycLevel ?? 0) < 5) {
      const startOfMonth = new Date()
      startOfMonth.setUTCDate(1)
      startOfMonth.setUTCHours(0, 0, 0, 0)

      const sumResult = await OnrampOrder.query()
        .where('phoneNumber', phoneNumber)
        .whereIn('status', [
          // R2P leg — committed money
          'pending',
          'processing',
          'succeeded',
          'paid',
          // COP→USDT dispersion leg — Colurs is moving funds
          'fx_quoting',
          'fx_executing',
          'fx_settling',
          'usdt_received',
          // Bridge leg
          'initiating_bridge',
          'bridging',
          'delivered',
          'completed',
        ])
        .where('createdAt', '>=', startOfMonth.toISOString())
        .sum('amount_cop as total')
        .first()

      const monthSoFar = Number(
        (sumResult as unknown as { $extras?: { total?: string | number } } | null)?.$extras
          ?.total ?? 0
      )
      if (monthSoFar + (amountCop as number) > QUICK_FLOW_LIMIT_COP) {
        logger.info(
          `onramp: cap hit for ${maskPhone(phoneNumber)} — monthSoFar=${monthSoFar} + ${amountCop} > ${QUICK_FLOW_LIMIT_COP}`
        )
        return response.status(403).json({
          error:
            'You have reached the monthly limit for unverified accounts. Verify your identity to keep onramping.',
          code: 'KYC_REQUIRED_FOR_AMOUNT',
          limitCop: QUICK_FLOW_LIMIT_COP,
          usedCop: monthSoFar,
          remainingCop: Math.max(0, QUICK_FLOW_LIMIT_COP - monthSoFar),
        })
      }
    }

    // ── Idempotency check ───────────────────────────────────────────────────
    // If the same idempotencyKey was already used, return the existing order
    // with the persisted paymentLink/trackingKey so the frontend can resume.
    const existing = await OnrampOrder.query()
      .where('idempotencyKey', idempotencyKey as string)
      .where('phoneNumber', phoneNumber)
      .first()

    if (existing) {
      // If the first request is still in flight (initiating_payment, no payment details yet),
      // tell the frontend to retry rather than moving to the paying screen with null data.
      if (
        existing.status === 'initiating_payment' &&
        !existing.paymentLink &&
        !existing.trackingKey
      ) {
        logger.info(
          `onramp: duplicate initiate for idempotencyKey=${(idempotencyKey as string).slice(0, 8)}… — first request still in flight`
        )
        return response.status(202).json({
          orderId: existing.id,
          status: 'initiating_payment',
          retry: true,
          message: 'Payment is being created. Please wait a moment and try again.',
        })
      }

      logger.info(
        `onramp: duplicate initiate for idempotencyKey=${(idempotencyKey as string).slice(0, 8)}… — returning existing order ${existing.id}`
      )
      return response.status(200).json({
        orderId: existing.id,
        method: existing.method,
        amountCop: Number.parseFloat(existing.amountCop),
        paymentLink: existing.paymentLink ?? null,
        trackingKey: existing.trackingKey ?? null,
        status: existing.status,
        ...(existing.method === 'nequi'
          ? {
              instructions:
                'Open the Nequi app, go to "Cobros pendientes", and approve the charge.',
            }
          : {}),
      })
    }

    const externalId = `onramp_${randomUUID()}`

    // Pre-insert the row BEFORE calling Colurs so that any payment.completed webhook
    // always has a local order to match, even if this process dies mid-flight.
    // The try/catch handles the UNIQUE index race: if two concurrent requests pass
    // the SELECT above, one will hit the constraint and fall back to returning the
    // winner's order instead of bubbling a 500.
    let orderId: string
    try {
      const order = await OnrampOrder.create({
        phoneNumber,
        externalId,
        idempotencyKey: idempotencyKey as string,
        method: method as string,
        amountCop: String(amountCop),
        depositAddress: DEPOSIT_ADDRESS(),
        status: 'initiating_payment',
      })
      orderId = order.id
    } catch (createErr: unknown) {
      // Unique constraint violation (23505) — concurrent request already inserted
      const code = (createErr as { code?: string })?.code
      if (code === '23505') {
        const winner = await OnrampOrder.query()
          .where('idempotencyKey', idempotencyKey as string)
          .where('phoneNumber', phoneNumber)
          .first()
        if (winner) {
          // Same in-flight guard as the SELECT path above
          if (
            winner.status === 'initiating_payment' &&
            !winner.paymentLink &&
            !winner.trackingKey
          ) {
            return response.status(202).json({
              orderId: winner.id,
              status: 'initiating_payment',
              retry: true,
              message: 'Payment is being created. Please wait a moment and try again.',
            })
          }
          logger.info(`onramp: idempotencyKey race resolved — returning winner order ${winner.id}`)
          return response.status(200).json({
            orderId: winner.id,
            method: winner.method,
            amountCop: Number.parseFloat(winner.amountCop),
            paymentLink: winner.paymentLink ?? null,
            trackingKey: winner.trackingKey ?? null,
            status: winner.status,
            ...(winner.method === 'nequi'
              ? {
                  instructions:
                    'Open the Nequi app, go to "Cobros pendientes", and approve the charge.',
                }
              : {}),
          })
        }
      }
      throw createErr
    }

    try {
      const payment = await initiatePayment(method as OnrampMethod, {
        counterpartyId,
        amountCop: amountCop as number,
        externalId: env.get('COLURS_USERNAME') || externalId,
        financialInstitutionCode,
        // Pass our internal orderId so Colurs's redirect URL points back to
        // /onramp?orderId=<id> — the success page polls by that param.
        orderId,
      })

      // Persist paymentLink + trackingKey so idempotent replays can return them
      await OnrampOrder.query()
        .where('externalId', externalId)
        .update({
          colursPaymentId: payment.money_movement_id,
          paymentLink: payment.payment_link ?? null,
          trackingKey: payment.tracking_key ?? null,
          status: 'pending',
        })

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

    let order = await OnrampOrder.query()
      .where('id', params.orderId)
      .where('phoneNumber', phoneNumber)
      .first()

    if (!order) return response.status(404).json({ error: 'Order not found' })

    // Force a fresh Colurs check while still waiting on the user payment.
    // The background poller does this every ~30s, but the Refresh button on the
    // success page is meant to feel responsive — so we hit /preview/ inline,
    // advance the order through the same logic the poller uses, and re-read.
    if (
      order.colursPaymentId &&
      (order.status === 'pending' || order.status === 'initiating_payment')
    ) {
      try {
        const payment = await getPaymentPreview(order.colursPaymentId)
        const normalized = normalizeColursStatus(payment.status)
        logger.info(
          `onramp.status: order ${order.id} colurs status="${payment.status}" code="${payment.status_code ?? ''}" normalized="${normalized}"`
        )
        if (TERMINAL_STATUSES.includes(normalized)) {
          if (normalized === 'succeeded') {
            await onPaymentSucceeded(
              order.externalId,
              phoneNumber,
              payment as unknown as Record<string, unknown>
            )
          } else {
            await OnrampOrder.query()
              .where('id', order.id)
              .whereIn('status', ['pending', 'initiating_payment'])
              .update({
                status: 'failed',
                error: `R2P payment ${normalized} (raw=${payment.status})`,
              })
          }
          // Re-read so the response reflects the advanced state
          const refreshed = await OnrampOrder.query().where('id', order.id).first()
          if (refreshed) order = refreshed
        }
      } catch (err) {
        // Non-fatal — fall back to whatever the DB currently has.
        // Background poller will retry on its next tick.
        logger.warn(
          { err, orderId: order.id },
          'onramp.status: Colurs preview check failed, returning DB state'
        )
      }
    }

    return response.json({
      orderId: order.id,
      method: order.method,
      amountCop: Number.parseFloat(order.amountCop),
      status: order.status,
      paymentLink: order.paymentLink ?? null,
      trackingKey: order.trackingKey ?? null,
      createdAt: order.createdAt,
    })
  }
}
