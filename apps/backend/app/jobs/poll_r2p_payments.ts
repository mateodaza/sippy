/**
 * Onramp poller — R2P payment status
 *
 * Polls GET /api/reload/r2p/preview/{money_movement_id}/ for all onramp orders
 * waiting on the user to complete a PSE / Nequi / Bancolombia payment.
 * (Public preview endpoint — same payload as /status/ but no JWT required.)
 *
 * Status progression: initiated → pending → processing → succeeded / failed / expired
 * Give-up threshold: 24 hours (2,880 polls at 1/30s) → needs_reconciliation
 *
 * On succeeded: atomic two-phase claim → triggerBridge()
 * (Same logic as the old payment.completed webhook handler.)
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import OnrampOrder from '#models/onramp_order'
import { getPaymentPreview } from '#services/colurs_payment.service'
import { maskPhone } from '#utils/phone'

export const TERMINAL_STATUSES = ['succeeded', 'failed', 'expired']
const MAX_POLLS = 2_880 // 24 hours at 1 poll/30s

/**
 * Normalize Colurs status strings to our internal lowercase set.
 * The /preview/ endpoint may return uppercase variants ("COMPLETED",
 * "PENDING", "FAILED", "CANCELLED") while the legacy /status/ endpoint
 * returns lowercase ("succeeded", "pending", "failed", "expired").
 * Map both naming conventions onto our internal terminal vocabulary.
 */
export function normalizeColursStatus(raw: string | undefined): string {
  if (!raw) return ''
  const s = raw.toLowerCase()
  if (s === 'completed' || s === 'succeeded') return 'succeeded'
  if (s === 'failed' || s === 'rejected') return 'failed'
  if (s === 'cancelled' || s === 'canceled' || s === 'expired') return 'expired'
  return s // pending / processing / initiated / unknown
}

let isRunning = false

/**
 * Recovery sweep — runs once per cron tick before the main poll loop.
 *
 * initiating_payment (null colurs_payment_id, >2min) → Colurs may have accepted the R2P
 *   creation but the response/write was lost. We cannot look up by external_id on Colurs
 *   (their API only accepts money_movement_id), so mark needs_reconciliation for ops.
 * initiating_bridge (no hash) → process died between claim and broadcast → bridge_failed
 * bridging (hash, >2h) → waitForConfirmation() died in memory; no Alchemy webhook recovery → needs_reconciliation
 *
 * Note: 'paid' is now a holding state — orders rest there until the COP→USDT
 * dispersion job advances them. We do NOT auto-trigger LiFi bridge from `paid`
 * anymore. That happens after Colurs FX exchange completes.
 */
async function recoverStuckBridgeOrders(): Promise<void> {
  // ── Orphaned initiating_payment orders ──────────────────────────────────
  // If the process died after inserting the order but before persisting colurs_payment_id,
  // the order is invisible to the main poll loop (which requires colurs_payment_id IS NOT NULL).
  // Mark as needs_reconciliation — ops must check Colurs for a payment matching our external_id.
  const orphaned = await db.rawQuery<{
    rows: { id: string; external_id: string }[]
  }>(
    `SELECT id, external_id FROM onramp_orders
     WHERE status = 'initiating_payment'
       AND colurs_payment_id IS NULL
       AND updated_at < now() - interval '2 minutes'
     LIMIT 20`
  )
  for (const order of orphaned.rows) {
    logger.error(
      `poll_r2p_payments: order ${order.external_id} stuck in initiating_payment with no colurs_payment_id >2m — needs_reconciliation`
    )
    await db.rawQuery(
      `UPDATE onramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
       WHERE id = ? AND status = 'initiating_payment' AND colurs_payment_id IS NULL`,
      [
        'Colurs R2P payment may have been created but colurs_payment_id was not persisted. ' +
          'Check Colurs for a payment matching this external_id. Manual reconciliation required.',
        order.id,
      ]
    )
  }

  // ── Stuck bridge orders ─────────────────────────────────────────────────
  // 'paid' intentionally NOT in this filter — orders sit there until the
  // upcoming COP→USDT dispersion job advances them.
  const stuck = await db.rawQuery<{
    rows: { external_id: string; status: string; lifi_tx_hash: string | null }[]
  }>(
    `SELECT external_id, status, lifi_tx_hash
     FROM onramp_orders
     WHERE (
       (status = 'initiating_bridge' AND updated_at < now() - interval '2 minutes')
       OR
       (status = 'bridging' AND lifi_tx_hash IS NOT NULL AND updated_at < now() - interval '2 hours')
     )
     LIMIT 20`
  )

  for (const order of stuck.rows) {
    if (order.status === 'initiating_bridge' && !order.lifi_tx_hash) {
      logger.error(
        `poll_r2p_payments: order ${order.external_id} stuck in initiating_bridge with no hash — marking bridge_failed`
      )
      await db.rawQuery(
        `UPDATE onramp_orders SET status = 'bridge_failed', error = ?, updated_at = now()
         WHERE external_id = ? AND status = 'initiating_bridge' AND lifi_tx_hash IS NULL`,
        [
          'Bridge broadcast may have occurred but tx hash was not persisted. Manual reconciliation required.',
          order.external_id,
        ]
      )
      continue
    }

    if (order.status === 'bridging' && order.lifi_tx_hash) {
      logger.error(
        `poll_r2p_payments: order ${order.external_id} stuck in bridging for >2h — needs_reconciliation`
      )
      await db.rawQuery(
        `UPDATE onramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
         WHERE external_id = ? AND status = 'bridging'`,
        [
          `Bridge tx ${order.lifi_tx_hash} broadcast but not confirmed within 2h. Manual reconciliation required.`,
          order.external_id,
        ]
      )
      continue
    }
  }
}

export async function pollR2pPayments(): Promise<void> {
  if (isRunning) {
    logger.warn('poll_r2p_payments: previous run still in flight, skipping tick')
    return
  }
  isRunning = true

  try {
    await recoverStuckBridgeOrders()

    const orders = await db.rawQuery<{
      rows: {
        id: string
        external_id: string
        colurs_payment_id: string
        phone_number: string
        poll_count: number
      }[]
    }>(
      `SELECT id, external_id, colurs_payment_id, phone_number, poll_count
       FROM onramp_orders
       WHERE status IN ('pending', 'initiating_payment')
         AND colurs_payment_id IS NOT NULL
         AND (polled_at IS NULL OR polled_at < now() - interval '25 seconds')
       LIMIT 50`
    )

    const rows = orders.rows
    if (rows.length === 0) return

    logger.info(`poll_r2p_payments: checking ${rows.length} orders`)

    await Promise.allSettled(
      rows.map(async (order) => {
        try {
          if (order.poll_count >= MAX_POLLS) {
            await db.rawQuery(
              `UPDATE onramp_orders SET status = 'needs_reconciliation', updated_at = now()
               WHERE id = ? AND status NOT IN ('paid', 'initiating_bridge', 'bridging', 'completed', 'bridge_failed', 'needs_reconciliation')`,
              [order.id]
            )
            logger.error(
              `poll_r2p_payments: order ${order.external_id} exceeded max polls — needs_reconciliation`
            )
            return
          }

          const payment = await getPaymentPreview(order.colurs_payment_id)
          const normalized = normalizeColursStatus(payment.status)

          logger.info(
            `poll_r2p_payments: order ${order.external_id} colurs status="${payment.status}" code="${payment.status_code ?? ''}" normalized="${normalized}"`
          )

          await db.rawQuery(
            `UPDATE onramp_orders SET polled_at = now(), poll_count = poll_count + 1, updated_at = now()
             WHERE id = ?`,
            [order.id]
          )

          if (!TERMINAL_STATUSES.includes(normalized)) return

          if (normalized === 'succeeded') {
            await onPaymentSucceeded(order.external_id, order.phone_number, payment)
          } else {
            // failed or expired
            const updated = await db.rawQuery(
              `UPDATE onramp_orders SET status = 'failed', error = ?, updated_at = now()
               WHERE id = ? AND status IN ('pending', 'initiating_payment')
               RETURNING id`,
              [`R2P payment ${normalized} (raw=${payment.status})`, order.id]
            )
            if (updated.rows[0]) {
              logger.info(
                `poll_r2p_payments: onramp ${order.external_id} ${normalized} for ${maskPhone(order.phone_number)}`
              )
              // TODO: WhatsApp notification — onramp_failed template
            }
          }
        } catch (err) {
          logger.error({ err }, `poll_r2p_payments: error polling order ${order.external_id}`)
        }
      })
    )
  } finally {
    isRunning = false
  }
}

export async function onPaymentSucceeded(
  externalId: string,
  phoneNumber: string,
  payment: Record<string, unknown>
): Promise<void> {
  // Extract settled USDT amount from the Colurs payment response (multiple field name variants)
  const settledUsdt =
    (payment.amount_usdt as number | undefined) ??
    (payment.amount_usd as number | undefined) ??
    (payment.usd_amount as number | undefined) ??
    (payment.usdt_amount as number | undefined)

  // Phase 1 claim: pending / initiating_payment → paid (idempotent)
  // Persists settledUsdt atomically so a crash never loses the amount.
  const claimResult = await db.rawQuery(
    `UPDATE onramp_orders
     SET status = 'paid',
         amount_usdt = COALESCE(?, amount_usdt),
         updated_at = now()
     WHERE external_id = ? AND status IN ('pending', 'initiating_payment')
     RETURNING id`,
    [settledUsdt !== undefined && settledUsdt > 0 ? String(settledUsdt) : null, externalId]
  )

  if (claimResult.rows[0]) {
    logger.info(
      `poll_r2p_payments: payment succeeded for ${externalId} (${maskPhone(phoneNumber)}) — paid, awaiting COP→USDT dispersion`
    )
    return
  }

  // Already past 'pending'. Log so we know an order has advanced past `paid`.
  const existing = await OnrampOrder.query().where('externalId', externalId).first()
  if (!existing) return
  logger.info(
    `poll_r2p_payments: order ${externalId} already in status '${existing.status}', skipping`
  )
}
