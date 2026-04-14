/**
 * Colurs Webhook Controller
 *
 * Receives event notifications from Colurs for onramp and offramp orders.
 *
 * POST /webhook/colurs
 *
 * Events handled:
 *   payment.completed   — COP payment confirmed → trigger onramp bridge
 *   payment.failed      — COP payment failed → mark order failed
 *   withdrawal.completed — COP bank payout sent → mark offramp completed
 *   withdrawal.failed    — COP bank payout failed → mark offramp failed
 *
 * Signature verification:
 *   HMAC-SHA256 implementation is a placeholder. The exact header name and
 *   algorithm are not yet published by Colurs ("coming soon" in their docs).
 *   Confirm with Colurs before going live and update verifySignature() below.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { timingSafeEqual, createHmac } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import OnrampOrder from '#models/onramp_order'
import env from '#start/env'
import { getUserLanguage } from '#services/db'
import { getLanguageForPhone, maskPhone } from '#utils/phone'
import { notifyFundReceived } from '#services/notification.service'

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify the Colurs webhook signature.
 *
 * TODO: Confirm with Colurs:
 *   - exact header name (e.g. x-colurs-signature, x-webhook-signature)
 *   - signing algorithm (assumed HMAC-SHA256 — industry standard)
 *   - whether they sign the raw body or a canonical string
 *
 * Until confirmed, set COLURS_WEBHOOK_SECRET and this will enforce that
 * the request is signed. If the secret is not set, requests are rejected
 * in production to prevent unauthenticated webhook abuse.
 */
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature.replace(/^sha256=/, ''))
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function updateOnrampOrder(
  externalId: string,
  fields: { status: string; error?: string }
): Promise<{ id: string; phone_number: string } | null> {
  const rows = await db
    .from('onramp_orders')
    .where('external_id', externalId)
    .update({ status: fields.status, error: fields.error ?? null }, ['id', 'phone_number'])
  return rows[0] ?? null
}

async function updateOfframpOrder(
  externalId: string,
  fields: { status: string; error?: string }
): Promise<{
  id: string
  phone_number: string
  amount_cop: number
  bank_account_id: number
} | null> {
  const rows = await db
    .from('offramp_orders')
    .where('external_id', externalId)
    .update({ status: fields.status, error: fields.error ?? null }, [
      'id',
      'phone_number',
      'amount_cop',
      'bank_account_id',
    ])
  return rows[0] ?? null
}

// ── Controller ────────────────────────────────────────────────────────────────

export default class WebhookColursController {
  async handle({ request, response }: HttpContext) {
    const secret = env.get('COLURS_WEBHOOK_SECRET', '')

    // Reject if secret not configured — never accept unsigned webhooks in prod
    if (!secret) {
      logger.error('webhook_colurs: COLURS_WEBHOOK_SECRET not set — rejecting request')
      return response.status(503).json({ error: 'Webhook not configured' })
    }

    const rawBody = request.raw() || ''

    // TODO: update header name once Colurs confirms (see verifySignature comment above)
    const signature = request.header('x-colurs-signature') || ''

    if (!verifySignature(rawBody, signature, secret)) {
      logger.warn('webhook_colurs: invalid signature')
      return response.status(401).json({ error: 'Invalid signature' })
    }

    const body = request.body() as {
      event?: { type?: string; data?: Record<string, unknown> }
    }

    const eventType = body?.event?.type
    const data = body?.event?.data ?? {}

    if (!eventType) {
      return response.status(400).json({ error: 'Missing event.type' })
    }

    // Process synchronously before responding.
    // Return 500 on internal errors so Colurs retries delivery — this is safe
    // because processEvent is idempotent (DB upserts, duplicate-safe status checks).
    // Unknown/irrelevant event types are handled inside processEvent and return
    // normally, so 200 is returned for those without any retry.
    try {
      await this.processEvent(eventType, data)
    } catch (err) {
      logger.error({ err }, `webhook_colurs: internal error processing ${eventType}`)
      return response.status(500).json({ error: 'Internal error' })
    }

    return response.status(200).json({ ok: true })
  }

  // ── Event dispatch ──────────────────────────────────────────────────────────

  private async processEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    logger.info(`webhook_colurs: processing ${eventType}`)

    switch (eventType) {
      case 'payment.completed':
        return this.onPaymentCompleted(data)
      case 'payment.failed':
        return this.onPaymentFailed(data)
      case 'withdrawal.completed':
        return this.onWithdrawalCompleted(data)
      case 'withdrawal.failed':
        return this.onWithdrawalFailed(data)
      default:
        logger.info(`webhook_colurs: ignoring unknown event type ${eventType}`)
    }
  }

  // ── payment.completed ───────────────────────────────────────────────────────

  /**
   * COP payment confirmed by Colurs.
   * Update order to 'paid' then hand off to the bridge service.
   * Notifies user via WhatsApp once the bridge completes.
   *
   * Idempotent: if the order is already past 'pending' (e.g. 'paid', 'bridging',
   * 'completed', 'bridge_failed') we skip processing so duplicate webhooks don't
   * re-trigger the bridge on an already-running or finished order.
   */
  private async onPaymentCompleted(data: Record<string, unknown>): Promise<void> {
    const externalId = data.external_id as string | undefined
    if (!externalId) {
      logger.warn('webhook_colurs: payment.completed missing external_id')
      return
    }

    // Atomic claim: only one webhook wins.
    // Also claims 'initiating_payment' — that state means Colurs accepted the
    // payment but the local UPDATE to 'pending' hadn't landed yet. A payment.completed
    // webhook proves Colurs accepted it, so we can safely advance to 'paid'.
    const claimedRows = await db
      .from('onramp_orders')
      .where('external_id', externalId)
      .whereIn('status', ['pending', 'initiating_payment'])
      .update({ status: 'paid' }, ['id', 'phone_number'])
    let row = claimedRows[0]
    if (!row) {
      // No row returned — order doesn't exist, already past 'pending', or stuck in 'paid'
      const existing = await OnrampOrder.query().where('externalId', externalId).first()
      if (!existing) {
        logger.warn(`webhook_colurs: payment.completed — order not found for ${externalId}`)
        return
      }
      if (existing.status === 'paid' && !existing.lifiTxHash) {
        // Bridge never attempted — safe to re-enter
        logger.info(
          `webhook_colurs: payment.completed — recovering stuck 'paid' order ${externalId}, re-entering bridge`
        )
        row = { id: existing.id, phone_number: existing.phoneNumber }
      } else if (existing.status === 'initiating_bridge' && !existing.lifiTxHash) {
        // Process died after marking initiating_bridge but before saving the tx hash.
        // The broadcast may or may not have landed on-chain — retrying could double-send
        // treasury funds. Route to manual review instead.
        logger.error(
          `webhook_colurs: payment.completed — order ${externalId} stuck in 'initiating_bridge' with no hash — marking bridge_failed (duplicate broadcast risk)`
        )
        await OnrampOrder.query().where('externalId', externalId).update({
          status: 'bridge_failed',
          error:
            'Bridge broadcast may have occurred but tx hash was not persisted. Manual reconciliation required.',
        })
        return
      } else {
        logger.info(
          `webhook_colurs: payment.completed — order ${externalId} already in status '${existing.status}', skipping duplicate webhook`
        )
        return
      }
    }

    const phoneNumber = row.phone_number
    logger.info(`webhook_colurs: payment.completed for ${externalId}, triggering bridge`)

    // Try to persist the settled USDT amount Colurs sent to our ETH deposit address.
    // ⚠ UNKNOWN: Colurs has not confirmed which field carries this value.
    // Logging the full data object so we can identify the correct field during testing.
    logger.info({ webhookData: data }, `webhook_colurs: payment.completed raw data`)
    const settledUsdt =
      (data.amount_usdt as number | undefined) ??
      (data.amount_usd as number | undefined) ??
      (data.usd_amount as number | undefined) ??
      (data.usdt_amount as number | undefined)

    if (settledUsdt !== undefined && settledUsdt > 0) {
      await OnrampOrder.query()
        .where('externalId', externalId)
        .update({ amountUsdt: String(settledUsdt) })
      logger.info(`webhook_colurs: wrote amount_usdt=${settledUsdt} for ${externalId}`)
    } else {
      logger.warn(
        `webhook_colurs: no settled USDT amount found in payment.completed payload for ${externalId} — bridge will estimate from COP`
      )
    }

    // Second atomic claim: paid → initiating_bridge.
    // Closes the race window between the first claim (pending → paid) and
    // triggerBridge() advancing the status. A duplicate webhook that arrives in
    // that window sees paid && !lifiTxHash and would enter the recovery branch,
    // calling triggerBridge() concurrently. This UPDATE ensures only one caller
    // proceeds to the bridge.
    const bridgeClaim = await db.rawQuery(
      `UPDATE onramp_orders SET status = 'initiating_bridge', updated_at = now()
       WHERE external_id = ? AND status = 'paid'
       RETURNING id`,
      [externalId]
    )
    if (!bridgeClaim.rows[0]) {
      logger.info(`webhook_colurs: bridge already claimed for ${externalId}, skipping duplicate`)
      return
    }

    try {
      const { triggerBridge } = await import('#services/onramp_bridge.service')
      await triggerBridge(externalId)
    } catch (err) {
      // Bridge failure after COP was already received — do NOT mark as 'failed'
      // (which would be a terminal state the user can't recover from). Use
      // 'bridge_failed' so ops can inspect and retry the bridge manually without
      // the user having lost their payment.
      logger.error(
        { err },
        `webhook_colurs: bridge failed for ${externalId} — marked bridge_failed for manual review`
      )
      await updateOnrampOrder(externalId, {
        status: 'bridge_failed',
        error: err instanceof Error ? err.message : 'Bridge error',
      })
      return
    }

    // Bridge succeeded — order is now 'completed'. Notification failure must NOT
    // affect the order status, so it runs in its own try/catch outside the bridge catch.
    try {
      const order = await OnrampOrder.query().where('externalId', externalId).first()
      const amountUsdc = order?.amountUsdt ? Number.parseFloat(order.amountUsdt).toFixed(2) : null

      if (amountUsdc) {
        const lang = (await getUserLanguage(phoneNumber)) || getLanguageForPhone(phoneNumber)
        // Notify via fund_received template: "You received X USDC"
        await notifyFundReceived({
          recipientPhone: phoneNumber,
          amount: amountUsdc,
          type: 'usdc',
          txHash: externalId,
          lang,
        })
      }
    } catch (notifyErr) {
      // Non-fatal — order is already completed, just log
      logger.error(
        { err: notifyErr },
        `webhook_colurs: notification failed for ${externalId} (order still completed)`
      )
    }
  }

  // ── payment.failed ──────────────────────────────────────────────────────────

  private async onPaymentFailed(data: Record<string, unknown>): Promise<void> {
    const externalId = data.external_id as string | undefined
    const reason = (data.reason as string) ?? 'Payment failed'

    if (!externalId) {
      logger.warn('webhook_colurs: payment.failed missing external_id')
      return
    }

    // Guard: only allow 'pending' → 'failed'. A late or out-of-order failure event
    // must not overwrite 'paid', 'bridging', 'completed', or 'bridge_failed'.
    const updatedRows = await db
      .from('onramp_orders')
      .where('external_id', externalId)
      .where('status', 'pending')
      .update({ status: 'failed', error: reason }, ['id'])
    if (!updatedRows[0]) {
      logger.info(
        `webhook_colurs: payment.failed — order ${externalId} not in 'pending', skipping to avoid regression`
      )
      return
    }

    logger.info(`webhook_colurs: onramp order ${externalId} marked failed`)

    // Notification (Phase 8): notify user their payment failed
  }

  // ── withdrawal.completed ────────────────────────────────────────────────────

  /**
   * Colurs completed the COP bank payout.
   * Mark offramp order completed and notify user.
   */
  private async onWithdrawalCompleted(data: Record<string, unknown>): Promise<void> {
    const externalId = data.external_id as string | undefined
    if (!externalId) {
      logger.warn('webhook_colurs: withdrawal.completed missing external_id')
      return
    }

    const row = await updateOfframpOrder(externalId, { status: 'completed' })
    if (!row) {
      logger.warn(`webhook_colurs: withdrawal.completed — order not found for ${externalId}`)
      return
    }

    logger.info(
      `webhook_colurs: offramp ${externalId} completed for ${maskPhone(row.phone_number)}`
    )
    // TODO: send WhatsApp notification once offramp_completed template is approved in Meta
  }

  // ── withdrawal.failed ───────────────────────────────────────────────────────

  private async onWithdrawalFailed(data: Record<string, unknown>): Promise<void> {
    const externalId = data.external_id as string | undefined
    const reason = (data.reason as string) ?? 'Withdrawal failed'

    if (!externalId) {
      logger.warn('webhook_colurs: withdrawal.failed missing external_id')
      return
    }

    // Guard: do not overwrite 'completed' or 'needs_reconciliation' — a late failure
    // event must not regress an order that has already been paid out or is under
    // manual review (which implies USDC was already debited from the user).
    const updatedRows = await db
      .from('offramp_orders')
      .where('external_id', externalId)
      .whereNotIn('status', ['completed', 'needs_reconciliation', 'failed'])
      .update({ status: 'failed', error: reason }, ['id', 'phone_number'])
    const row = updatedRows[0]
    if (!row) {
      logger.info(
        `webhook_colurs: withdrawal.failed — order ${externalId} not in a transitionable state, skipping to avoid regression`
      )
      return
    }

    logger.info(`webhook_colurs: offramp ${externalId} failed for ${maskPhone(row.phone_number)}`)

    // Notification (Phase 8): notify user their withdrawal failed
  }
}
