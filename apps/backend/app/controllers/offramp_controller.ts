/**
 * Offramp Controller
 *
 * Handles USDC → COP offramp flows via Colurs FX exchange rails.
 *
 * POST /api/offramp/quote           — FX quote (USD → COP rate + amount)
 * POST /api/offramp/initiate        — pull USDC, initiate + execute FX exchange
 * GET  /api/offramp/status/:orderId — poll order status
 * GET  /api/offramp/bank-accounts   — list user's registered bank accounts
 * POST /api/offramp/bank-accounts   — register a new Colombian bank account
 * GET  /api/offramp/banks           — list available banks from Colurs
 *
 * All routes require JWT auth.
 *
 * Offramp flow:
 *   1. quote    — get USD→COP rate (valid ~3 min)
 *   2. initiate — pull USDC from user wallet → Sippy treasury
 *                 → POST /v2/exchange/initiate/ → POST /v2/exchange/execute/
 *   3. Colurs processes FX + bank payout (1–3 business days)
 *   4. webhook withdrawal.completed → mark completed, notify user
 */

import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import OfframpOrder from '#models/offramp_order'
import env from '#start/env'
import { maskPhone } from '#utils/phone'
import {
  createQuote,
  getQuote,
  getQuoteRate,
  initiateExchange,
  executeExchange,
  getUsdBalance,
} from '#services/colurs_fx.service'
import {
  registerBankAccount,
  listBankAccounts,
  getBanks,
  getDocumentTypes,
  type RegisterBankAccountParams,
} from '#services/colurs_bank.service'
import { sendWithSpendPermission } from '#services/embedded_wallet.service'

const MIN_OFFRAMP_USD = 50

// ── quote ─────────────────────────────────────────────────────────────────────

export default class OfframpController {
  /**
   * POST /api/offramp/quote
   *
   * Body: { amountUsdc: number }
   * Returns Colurs FX quote: rate, COP amount, expiry.
   * Quote is valid for ~3 minutes — call initiate before it expires.
   */
  async quote({ request, response }: HttpContext) {
    const { amountUsdc } = request.body() as { amountUsdc: unknown }

    if (!amountUsdc || typeof amountUsdc !== 'number' || amountUsdc <= 0) {
      return response.status(400).json({ error: 'amountUsdc must be a positive number' })
    }

    if (amountUsdc < MIN_OFFRAMP_USD) {
      return response.status(400).json({ error: `Minimum offramp is $${MIN_OFFRAMP_USD} USDC` })
    }

    try {
      const colursQuote = await createQuote(amountUsdc)

      return response.json({
        quoteId: colursQuote.id,
        amountUsdc,
        amountCop: colursQuote.destination_amount,
        rate: getQuoteRate(colursQuote),
        expiresAt: colursQuote.expires_at ?? colursQuote.valid_until,
      })
    } catch (err) {
      logger.error({ err }, 'offramp: quote failed')
      return response.status(502).json({ error: 'Could not get exchange rate. Try again.' })
    }
  }

  // ── initiate ────────────────────────────────────────────────────────────────

  /**
   * POST /api/offramp/initiate
   *
   * Body: {
   *   quoteId: string         — from /offramp/quote (must not be expired)
   *   bankAccountId: number   — local colurs_bank_accounts.id
   * }
   *
   * Steps:
   *   1. Validate quote is still fresh via Colurs
   *   2. Pre-flight: check Sippy USD balance covers the amount
   *   3. Pull USDC from user wallet → Sippy treasury (spend permission)
   *   4. Initiate Colurs FX exchange
   *   5. Execute Colurs payout
   *   6. Persist offramp_orders (status: pending_fx)
   */
  async initiate(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    const walletAddress = ctx.cdpUser?.walletAddress

    if (!phoneNumber || !walletAddress) {
      return response.status(401).json({ error: 'Unauthorized' })
    }

    const { quoteId, bankAccountId } = request.body() as {
      quoteId: unknown
      bankAccountId: unknown
    }

    if (!quoteId || typeof quoteId !== 'string') {
      return response.status(400).json({ error: 'quoteId is required' })
    }
    if (!bankAccountId || typeof bankAccountId !== 'number') {
      return response.status(400).json({ error: 'bankAccountId must be a number' })
    }

    let quote: Awaited<ReturnType<typeof getQuote>>
    try {
      quote = await getQuote(quoteId)
    } catch (err) {
      logger.error({ err }, 'offramp: quote fetch failed')
      return response.status(400).json({ error: 'Quote not found or expired. Request a new one.' })
    }

    if (quote.status !== 'valid') {
      return response.status(400).json({ error: 'Quote has expired. Request a new one.' })
    }

    const amountUsdc = quote.source_amount
    const amountCop = quote.destination_amount

    if (amountUsdc < MIN_OFFRAMP_USD) {
      return response.status(400).json({ error: `Minimum offramp is $${MIN_OFFRAMP_USD} USDC` })
    }

    const accounts = await listBankAccounts(phoneNumber)
    const account = accounts.find((a) => a.id === bankAccountId)
    if (!account) {
      return response.status(404).json({ error: 'Bank account not found' })
    }
    const colursBankAccountId = Number.parseInt(account.colursId, 10)
    if (!Number.isFinite(colursBankAccountId)) {
      logger.error(
        `offramp: bank account ${bankAccountId} has invalid colurs_id=${account.colursId}`
      )
      return response
        .status(500)
        .json({ error: 'Bank account configuration error. Please contact support.' })
    }

    try {
      const availableBalance = await getUsdBalance()
      if (availableBalance < amountUsdc) {
        logger.error(
          `offramp: insufficient Colurs USD balance (${availableBalance}) for ${amountUsdc}`
        )
        return response.status(503).json({
          error: 'Offramp temporarily unavailable. Please try again later.',
        })
      }
    } catch (err) {
      logger.error({ err }, 'offramp: balance check failed')
      return response.status(503).json({ error: 'Offramp temporarily unavailable.' })
    }

    const spenderAddress = env.get('SIPPY_SPENDER_ADDRESS', '')
    if (!spenderAddress) {
      logger.error('offramp: SIPPY_SPENDER_ADDRESS not configured')
      return response.status(503).json({ error: 'Offramp not available' })
    }

    // Transaction-scoped advisory lock: serialises concurrent initiate calls for the
    // same (phone, quote). Using pg_advisory_xact_lock (not pg_advisory_lock) ensures
    // the lock always runs on — and is released by — the enclosing transaction,
    // eliminating the pool-connection mismatch where unlock runs on a different
    // connection and leaves the session lock held until the connection is closed.
    type LockResult =
      | { found: true; existing: OfframpOrder }
      | { found: false; orderId: string; externalId: string }

    const lockResult = await db.transaction<LockResult>(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))', [
        phoneNumber,
        quoteId,
      ])

      // Idempotency guard: a quote maps to at most one offramp order.
      // Any existing order for this (phone, quote) pair — regardless of status — blocks a
      // new one. We cannot safely distinguish "failed before debit" from "failed after debit
      // with a lost pullTxHash write" (the hash write is best-effort). Returning the existing
      // order is always safe: if it is failed, the frontend shows the failed state and the
      // user simply requests a new quote. Colurs quotes expire in ~3 min, so a clean pre-debit
      // failure naturally forces a fresh quoteId on retry anyway.
      const existingOrder = await OfframpOrder.query({ client: trx })
        .where('phoneNumber', phoneNumber)
        .where('colursQuoteId', quoteId)
        .first()
      if (existingOrder) {
        return { found: true, existing: existingOrder }
      }

      const eid = `offramp_${randomUUID()}`
      // Persist order immediately so webhook can find it if something fails mid-flight
      const newOrder = await OfframpOrder.create(
        {
          phoneNumber,
          externalId: eid,
          colursQuoteId: quoteId,
          bankAccountId,
          amountUsdc: String(amountUsdc),
          amountCop: String(amountCop),
          exchangeRate: String(getQuoteRate(quote)),
          status: 'pending',
        },
        { client: trx }
      )
      return { found: false, orderId: newOrder.id, externalId: eid }
    })

    if (lockResult.found) {
      const ex = lockResult.existing
      logger.info(
        `offramp: duplicate initiate for quote ${quoteId} — returning existing order ${ex.id}`
      )
      return response.status(200).json({
        orderId: ex.id,
        externalId: ex.externalId,
        // Cast from DB string — frontend expects numbers for toFixed() / toLocaleString()
        amountUsdc: Number.parseFloat(ex.amountUsdc),
        amountCop: ex.amountCop ? Number.parseFloat(ex.amountCop) : null,
        rate: ex.exchangeRate ? Number.parseFloat(ex.exchangeRate) : null,
        status: ex.status,
        estimatedDelivery: '1–3 business days',
      })
    }

    const { orderId, externalId } = lockResult

    // Tracks whether USDC has left the user's wallet.
    let pullSucceeded = false
    let pullTxHash: string | null = null

    try {
      await OfframpOrder.query().where('externalId', externalId).update({ status: 'pulling_usdc' })

      const pullResult = await sendWithSpendPermission(phoneNumber, spenderAddress, amountUsdc)
      pullTxHash = pullResult.transactionHash

      // ⚠ Set pullSucceeded IMMEDIATELY — USDC is now debited.
      // Must happen before the DB write so a DB failure can't hide the debit from
      // the catch block and cause it to mark the order as clean-failed (retryable).
      pullSucceeded = true

      // Best-effort: persist tx hash. If the DB write fails, we've already flagged
      // pullSucceeded so the catch block will still route to needs_reconciliation.
      await OfframpOrder.query()
        .where('externalId', externalId)
        .update({ pullTxHash })
        .catch((dbErr: unknown) => {
          logger.error(
            { err: dbErr },
            `offramp: could not persist pull_tx_hash=${pullTxHash} for ${externalId} — continuing`
          )
        })

      logger.info(`offramp: pulled ${amountUsdc} USDC tx=${pullTxHash}`)

      const movement = await initiateExchange(quoteId, colursBankAccountId, externalId)

      // Persist movement ID before execute so ops can reconcile if execute throws.
      await OfframpOrder.query()
        .where('externalId', externalId)
        .update({ status: 'pending_fx', colursMovementId: movement.sale_crypto_id })

      await executeExchange(movement.sale_crypto_id)

      logger.info(`offramp: order ${orderId} pending_fx — movement=${movement.sale_crypto_id}`)

      return response.status(201).json({
        orderId,
        externalId,
        amountUsdc,
        amountCop,
        rate: getQuoteRate(quote),
        status: 'pending_fx',
        estimatedDelivery: '1–3 business days',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Offramp failed'
      logger.error({ err }, `offramp: initiation failed for ${maskPhone(phoneNumber)}`)

      if (pullSucceeded) {
        // USDC was debited but Colurs step failed — mark for ops review, do NOT
        // tell the user to retry or they may attempt a double debit.
        await OfframpOrder.query()
          .where('externalId', externalId)
          .update({ status: 'needs_reconciliation', error: message })
        logger.error(
          `offramp: RECONCILIATION REQUIRED — order ${orderId} (${externalId}) USDC debited` +
            (pullTxHash ? ` tx=${pullTxHash}` : ' (tx hash unknown)') +
            ' but Colurs step failed'
        )
        // Return 202 so the frontend receives the body — a 5xx causes api() to throw
        // and discard the status field, leaving the user on the confirm screen able to retry.
        return response.status(202).json({
          orderId,
          externalId,
          amountUsdc,
          amountCop,
          status: 'needs_reconciliation',
          error:
            'Your USDC was received but the bank payout could not be initiated. Our team has been notified and will process this manually. Please do not retry.',
        })
      }

      await OfframpOrder.query()
        .where('externalId', externalId)
        .update({ status: 'failed', error: message })
      return response.status(502).json({ error: 'Offramp failed. Please try again.' })
    }
  }

  // ── status ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/offramp/status/:orderId
   */
  async status(ctx: HttpContext) {
    const { params, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber

    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const order = await OfframpOrder.query()
      .where('id', params.orderId)
      .where('phoneNumber', phoneNumber)
      .first()

    if (!order) return response.status(404).json({ error: 'Order not found' })

    return response.json(order)
  }

  // ── bank accounts ───────────────────────────────────────────────────────────

  /**
   * GET /api/offramp/bank-accounts
   * Returns the user's registered Colombian bank accounts.
   */
  async listBankAccounts(ctx: HttpContext) {
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return ctx.response.status(401).json({ error: 'Unauthorized' })

    const accounts = await listBankAccounts(phoneNumber)
    return ctx.response.json({
      accounts: accounts.map((acc) => ({
        id: acc.id,
        bank_name: acc.bankName,
        holder_name: acc.holderName,
        account_type: acc.accountType,
        // Return only the last 4 digits — full account number is PII
        account_suffix: acc.accountNumber.slice(-4),
        is_default: acc.isDefault,
      })),
    })
  }

  /**
   * POST /api/offramp/bank-accounts
   *
   * Body: {
   *   holderName: string
   *   documentType: string      — CC | CE | NIT | TI | PPT
   *   documentNumber: string
   *   accountNumber: string
   *   accountType: string       — savings | checking
   *   bankId: number            — numeric ID from /offramp/banks
   *   bankName?: string
   * }
   */
  async addBankAccount(ctx: HttpContext) {
    const { request, response } = ctx
    const phoneNumber = ctx.cdpUser?.phoneNumber
    if (!phoneNumber) return response.status(401).json({ error: 'Unauthorized' })

    const {
      holderName,
      documentType,
      documentNumber,
      accountNumber,
      accountType,
      bankId,
      bankName,
    } = request.body() as Record<string, unknown>

    if (!holderName || typeof holderName !== 'string') {
      return response.status(400).json({ error: 'holderName is required' })
    }
    if (!documentType || !['CC', 'CE', 'NIT', 'TI', 'PPT'].includes(documentType as string)) {
      return response.status(400).json({ error: 'documentType must be CC, CE, NIT, TI, or PPT' })
    }
    if (!documentNumber || typeof documentNumber !== 'string') {
      return response.status(400).json({ error: 'documentNumber is required' })
    }
    if (!accountNumber || typeof accountNumber !== 'string') {
      return response.status(400).json({ error: 'accountNumber is required' })
    }
    if (!accountType || !['savings', 'checking'].includes(accountType as string)) {
      return response.status(400).json({ error: 'accountType must be savings or checking' })
    }
    if (!bankId || typeof bankId !== 'number') {
      return response.status(400).json({ error: 'bankId must be a number from /offramp/banks' })
    }

    try {
      const localId = await registerBankAccount({
        phoneNumber,
        holderName: holderName as string,
        documentType: documentType as string,
        documentNumber: documentNumber as string,
        accountNumber: accountNumber as string,
        accountType: accountType as 'savings' | 'checking',
        bankId: bankId as number,
        bankName: bankName as string | undefined,
      } satisfies RegisterBankAccountParams)

      return response.status(201).json({ id: localId, status: 'registered' })
    } catch (err) {
      logger.error(
        { err },
        `offramp: bank account registration failed for ${maskPhone(phoneNumber)}`
      )
      return response
        .status(502)
        .json({ error: 'Bank account registration failed. Check your details and try again.' })
    }
  }

  /**
   * GET /api/offramp/banks
   * Lists available Colombian banks from Colurs (for the registration form dropdown).
   */
  async availableBanks({ response }: HttpContext) {
    try {
      const banks = await getBanks()
      return response.json({ banks })
    } catch (err) {
      logger.error({ err }, 'offramp: failed to fetch banks')
      return response.status(502).json({ error: 'Could not load banks. Try again.' })
    }
  }

  /**
   * GET /api/offramp/document-types
   * Lists accepted document types from Colurs (for the registration form dropdown).
   */
  async documentTypes({ response }: HttpContext) {
    try {
      const types = await getDocumentTypes()
      return response.json({ types })
    } catch (err) {
      logger.error({ err }, 'offramp: failed to fetch document types')
      return response.status(502).json({ error: 'Could not load document types. Try again.' })
    }
  }
}
