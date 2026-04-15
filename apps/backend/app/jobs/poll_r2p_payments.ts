/**
 * Onramp poller — R2P payment status
 *
 * Polls GET /reload/r2p/status/{money_movement_id}/ for all onramp orders
 * waiting on the user to complete a PSE / Nequi / Bancolombia payment.
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
import { getPaymentStatus } from '#services/colurs_payment.service'
import { maskPhone } from '#utils/phone'

const TERMINAL_STATUSES = ['succeeded', 'failed', 'expired']
const MAX_POLLS = 2_880 // 24 hours at 1 poll/30s

let isRunning = false

/**
 * Recovery sweep — runs once per cron tick before the main poll loop.
 *
 * paid            → bridge never attempted; atomically claim → initiating_bridge, then trigger
 * initiating_bridge (no hash) → process died between claim and broadcast → bridge_failed
 * bridging (hash, >2h) → waitForConfirmation() died in memory; no Alchemy webhook recovery → needs_reconciliation
 */
async function recoverStuckBridgeOrders(): Promise<void> {
  const stuck = await db.rawQuery<{
    rows: { external_id: string; status: string; lifi_tx_hash: string | null }[]
  }>(
    `SELECT external_id, status, lifi_tx_hash
     FROM onramp_orders
     WHERE (
       (status IN ('paid', 'initiating_bridge') AND updated_at < now() - interval '2 minutes')
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

    if (order.status === 'paid') {
      // Atomic claim: paid → initiating_bridge before calling triggerBridge().
      // Prevents a duplicate broadcast if two ticks race or the process dies after
      // broadcast but before lifi_tx_hash is persisted (order stays paid, next tick retries).
      const claim = await db.rawQuery(
        `UPDATE onramp_orders SET status = 'initiating_bridge', updated_at = now()
         WHERE external_id = ? AND status = 'paid'
         RETURNING id`,
        [order.external_id]
      )
      if (!claim.rows[0]) {
        logger.info(`poll_r2p_payments: paid order ${order.external_id} already claimed, skipping`)
        continue
      }

      logger.warn(
        `poll_r2p_payments: recovering stuck paid order ${order.external_id} — triggering bridge`
      )
      try {
        const { triggerBridge } = await import('#services/onramp_bridge.service')
        await triggerBridge(order.external_id)
      } catch (err) {
        logger.error({ err }, `poll_r2p_payments: bridge recovery failed for ${order.external_id}`)
        await db.rawQuery(
          `UPDATE onramp_orders SET status = 'bridge_failed', error = ?, updated_at = now()
           WHERE external_id = ? AND status = 'initiating_bridge'`,
          [err instanceof Error ? err.message : 'Bridge recovery error', order.external_id]
        )
      }
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

          const payment = await getPaymentStatus(order.colurs_payment_id)

          await db.rawQuery(
            `UPDATE onramp_orders SET polled_at = now(), poll_count = poll_count + 1, updated_at = now()
             WHERE id = ?`,
            [order.id]
          )

          if (!TERMINAL_STATUSES.includes(payment.status)) return

          if (payment.status === 'succeeded') {
            await onPaymentSucceeded(order.external_id, order.phone_number, payment)
          } else {
            // failed or expired
            const updated = await db.rawQuery(
              `UPDATE onramp_orders SET status = 'failed', error = ?, updated_at = now()
               WHERE id = ? AND status IN ('pending', 'initiating_payment')
               RETURNING id`,
              [`R2P payment ${payment.status}`, order.id]
            )
            if (updated.rows[0]) {
              logger.info(
                `poll_r2p_payments: onramp ${order.external_id} ${payment.status} for ${maskPhone(order.phone_number)}`
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

async function onPaymentSucceeded(
  externalId: string,
  phoneNumber: string,
  payment: Record<string, unknown>
): Promise<void> {
  // Phase 1 claim: pending / initiating_payment → paid (idempotent)
  const claimedRows = await db
    .from('onramp_orders')
    .where('external_id', externalId)
    .whereIn('status', ['pending', 'initiating_payment'])
    .update({ status: 'paid' }, ['id'])

  if (!claimedRows[0]) {
    // Already past pending — check current state
    const existing = await OnrampOrder.query().where('externalId', externalId).first()
    if (!existing) return

    if (existing.status === 'initiating_bridge' && !existing.lifiTxHash) {
      logger.error(
        `poll_r2p_payments: order ${externalId} stuck in 'initiating_bridge' with no hash — marking bridge_failed`
      )
      await OnrampOrder.query().where('externalId', externalId).update({
        status: 'bridge_failed',
        error:
          'Bridge broadcast may have occurred but tx hash was not persisted. Manual reconciliation required.',
      })
      return
    }

    if (existing.status !== 'paid' || existing.lifiTxHash) {
      logger.info(
        `poll_r2p_payments: order ${externalId} already in status '${existing.status}', skipping`
      )
      return
    }
    // status === 'paid' && !lifiTxHash → fall through to bridge claim
  }

  // Try to persist the settled USDT amount if Colurs includes it
  const settledUsdt =
    (payment.amount_usdt as number | undefined) ??
    (payment.amount_usd as number | undefined) ??
    (payment.usd_amount as number | undefined) ??
    (payment.usdt_amount as number | undefined)

  if (settledUsdt !== undefined && settledUsdt > 0) {
    await OnrampOrder.query()
      .where('externalId', externalId)
      .update({ amountUsdt: String(settledUsdt) })
  }

  // Phase 2 claim: paid → initiating_bridge (prevents duplicate bridge calls)
  const bridgeClaim = await db.rawQuery(
    `UPDATE onramp_orders SET status = 'initiating_bridge', updated_at = now()
     WHERE external_id = ? AND status = 'paid'
     RETURNING id`,
    [externalId]
  )
  if (!bridgeClaim.rows[0]) {
    logger.info(`poll_r2p_payments: bridge already claimed for ${externalId}, skipping`)
    return
  }

  logger.info(`poll_r2p_payments: payment succeeded for ${externalId}, triggering bridge`)

  try {
    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await triggerBridge(externalId)
  } catch (err) {
    logger.error(
      { err },
      `poll_r2p_payments: bridge failed for ${externalId} — marked bridge_failed`
    )
    await db
      .from('onramp_orders')
      .where('external_id', externalId)
      .update({
        status: 'bridge_failed',
        error: err instanceof Error ? err.message : 'Bridge error',
      })
  }

  logger.info(
    `poll_r2p_payments: bridge tx broadcast for ${maskPhone(phoneNumber)} — order is bridging`
  )
}
