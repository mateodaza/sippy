/**
 * Offramp poller — exchange movement status
 *
 * Polls GET /v2/exchange/movements/{uuid}/ for all offramp orders that are
 * waiting on Colurs to process the FX and bank payout.
 *
 * Status progression: initiated → processing → completed / failed / rejected
 * Give-up threshold: 7 days (10,080 polls at 1/min) → needs_reconciliation
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { getMovement } from '#services/colurs_fx.service'
import { maskPhone } from '#utils/phone'

const TERMINAL_STATUSES = ['completed', 'failed', 'rejected']
const MAX_POLLS = 10_080 // 7 days at 1 poll/minute

let isRunning = false

/**
 * Recovery sweep for orders stuck in pulling_usdc.
 *
 * If the process dies after marking pulling_usdc but before reaching pending_fx,
 * the user's USDC may already be debited. These orders will never be picked up
 * by the main poll loop (which only scans pending_fx). Move them to
 * needs_reconciliation so ops can verify the on-chain pull and refund if needed.
 */
async function recoverStuckPullingOrders(): Promise<void> {
  const stuck = await db.rawQuery<{
    rows: { id: string; external_id: string }[]
  }>(
    `SELECT id, external_id FROM offramp_orders
     WHERE status = 'pulling_usdc'
       AND updated_at < now() - interval '5 minutes'
     LIMIT 20`
  )

  for (const order of stuck.rows) {
    logger.error(
      `poll_colurs_movements: order ${order.external_id} stuck in pulling_usdc >5m — needs_reconciliation`
    )
    await db.rawQuery(
      `UPDATE offramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
       WHERE id = ? AND status = 'pulling_usdc'`,
      [
        'USDC pull status unknown — process may have died after debit. Manual reconciliation required.',
        order.id,
      ]
    )
  }
}

export async function pollColursMovements(): Promise<void> {
  if (isRunning) {
    logger.warn('poll_colurs_movements: previous run still in flight, skipping tick')
    return
  }
  isRunning = true

  try {
    await recoverStuckPullingOrders()

    const orders = await db.rawQuery<{
      rows: {
        id: string
        external_id: string
        colurs_movement_id: string
        phone_number: string
        poll_count: number
      }[]
    }>(
      `SELECT id, external_id, colurs_movement_id, phone_number, poll_count
       FROM offramp_orders
       WHERE status = 'pending_fx'
         AND colurs_movement_id IS NOT NULL
         AND (polled_at IS NULL OR polled_at < now() - interval '55 seconds')
       LIMIT 50`
    )

    const rows = orders.rows
    if (rows.length === 0) return

    logger.info(`poll_colurs_movements: checking ${rows.length} orders`)

    await Promise.allSettled(
      rows.map(async (order) => {
        try {
          if (order.poll_count >= MAX_POLLS) {
            await db.rawQuery(
              `UPDATE offramp_orders SET status = 'needs_reconciliation', updated_at = now()
               WHERE id = ? AND status NOT IN ('completed', 'needs_reconciliation')`,
              [order.id]
            )
            logger.error(
              `poll_colurs_movements: order ${order.external_id} exceeded max polls — needs_reconciliation`
            )
            return
          }

          const movement = await getMovement(order.colurs_movement_id)

          await db.rawQuery(
            `UPDATE offramp_orders SET polled_at = now(), poll_count = poll_count + 1, updated_at = now()
             WHERE id = ?`,
            [order.id]
          )

          if (!TERMINAL_STATUSES.includes(movement.status)) return

          if (movement.status === 'completed') {
            await db.rawQuery(
              `UPDATE offramp_orders SET status = 'completed', updated_at = now() WHERE id = ?`,
              [order.id]
            )
            logger.info(
              `poll_colurs_movements: offramp ${order.external_id} completed for ${maskPhone(order.phone_number)}`
            )
            // TODO: WhatsApp notification — offramp_completed template
          } else {
            // User's USDC was already pulled — flag for ops action, not just failed
            await db.rawQuery(
              `UPDATE offramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now() WHERE id = ?`,
              [`Movement ${movement.status}`, order.id]
            )
            logger.warn(
              `poll_colurs_movements: offramp ${order.external_id} ${movement.status} for ${maskPhone(order.phone_number)} — needs_reconciliation`
            )
            // TODO: WhatsApp notification — offramp_failed template
          }
        } catch (err) {
          logger.error({ err }, `poll_colurs_movements: error polling order ${order.external_id}`)
        }
      })
    )
  } finally {
    isRunning = false
  }
}
