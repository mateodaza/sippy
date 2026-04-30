/**
 * COP→USDT dispersion settling poller
 *
 * Picks up onramp orders in status='fx_settling' and polls Colurs's
 * GET /v2/exchange/movements/{uuid}/ until the movement reaches a terminal
 * state (completed / failed / rejected / cancelled).
 *
 * On terminal:
 *   completed  → usdt_received     ← END STATE for this iteration
 *                                    (LiFi bridge gating goes here later)
 *   failed     → fx_failed
 *   rejected   → fx_failed
 *   cancelled  → fx_failed
 *
 * Stuck >2h in fx_settling → needs_reconciliation.
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { getMovement } from '#services/colurs_fx.service'
import { normalizeColursStatus } from '#jobs/poll_r2p_payments'
import { maskPhone } from '#utils/phone'

const MAX_POLLS = 2_880 // 24 hours at 1 poll/30s
let isRunning = false

interface SettlingOrderRow {
  id: string
  external_id: string
  colurs_dispersion_movement_id: string
  phone_number: string
  dispersion_poll_count: number
}

async function recoverStuckSettling(): Promise<void> {
  const stuck = await db.rawQuery<{
    rows: { id: string; external_id: string; colurs_dispersion_movement_id: string }[]
  }>(
    `SELECT id, external_id, colurs_dispersion_movement_id
     FROM onramp_orders
     WHERE status = 'fx_settling'
       AND updated_at < now() - interval '2 hours'
     LIMIT 20`
  )

  for (const order of stuck.rows) {
    logger.error(
      `poll_dispersion_movements: order=${order.id} ext=${order.external_id} stuck in fx_settling >2h — needs_reconciliation`
    )
    await db.rawQuery(
      `UPDATE onramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
       WHERE id = ? AND status = 'fx_settling'`,
      [
        `Dispersion movement ${order.colurs_dispersion_movement_id} not confirmed within 2h. Manual reconciliation required.`,
        order.id,
      ]
    )
  }
}

export async function pollDispersionMovements(): Promise<void> {
  if (isRunning) {
    logger.warn('poll_dispersion_movements: previous run still in flight, skipping tick')
    return
  }
  isRunning = true

  try {
    await recoverStuckSettling()

    const orders = await db.rawQuery<{ rows: SettlingOrderRow[] }>(
      `SELECT id, external_id, colurs_dispersion_movement_id, phone_number, dispersion_poll_count
       FROM onramp_orders
       WHERE status = 'fx_settling'
         AND colurs_dispersion_movement_id IS NOT NULL
         AND (dispersion_polled_at IS NULL OR dispersion_polled_at < now() - interval '25 seconds')
       LIMIT 50`
    )

    if (orders.rows.length === 0) return
    logger.info(`poll_dispersion_movements: checking ${orders.rows.length} orders`)

    await Promise.allSettled(orders.rows.map(pollOne))
  } finally {
    isRunning = false
  }
}

async function pollOne(order: SettlingOrderRow): Promise<void> {
  try {
    if (order.dispersion_poll_count >= MAX_POLLS) {
      await db.rawQuery(
        `UPDATE onramp_orders SET status = 'needs_reconciliation', updated_at = now()
         WHERE id = ? AND status = 'fx_settling'`,
        [order.id]
      )
      logger.error(
        `poll_dispersion_movements: order=${order.id} exceeded max polls — needs_reconciliation`
      )
      return
    }

    const movement = (await getMovement(order.colurs_dispersion_movement_id)) as unknown as Record<
      string,
      unknown
    >
    const rawStatus = (movement.status as string | undefined) ?? ''
    const statusCode = (movement.status_code as string | undefined) ?? ''
    const normalized = normalizeColursStatus(rawStatus)

    logger.info(
      `poll_dispersion_movements: order=${order.id} movement=${order.colurs_dispersion_movement_id} raw_status="${rawStatus}" code="${statusCode}" normalized="${normalized}"`
    )

    await db.rawQuery(
      `UPDATE onramp_orders
       SET dispersion_polled_at = now(),
           dispersion_poll_count = dispersion_poll_count + 1,
           updated_at = now()
       WHERE id = ?`,
      [order.id]
    )

    // Try to extract USDT amount + tx hash if Colurs returns them
    const usdtAmount =
      (movement.destination_amount as number | string | undefined) ??
      (movement.amount_usdt as number | string | undefined) ??
      (movement.amount_usd as number | string | undefined)
    const txHash =
      (movement.transaction_hash as string | undefined) ??
      (movement.tx_hash as string | undefined) ??
      null

    if (normalized === 'succeeded') {
      await db.rawQuery(
        `UPDATE onramp_orders
         SET status = 'usdt_received',
             usdt_amount_received = COALESCE(?, usdt_amount_received),
             usdt_tx_hash = COALESCE(?, usdt_tx_hash),
             updated_at = now()
         WHERE id = ? AND status = 'fx_settling'`,
        [usdtAmount !== undefined ? String(usdtAmount) : null, txHash, order.id]
      )
      logger.info(
        `poll_dispersion_movements: order=${order.id} fx_settling → usdt_received for ${maskPhone(order.phone_number)}`
      )
      // LiFi bridge intentionally NOT triggered here. Manual verification first.
      return
    }

    if (normalized === 'failed' || normalized === 'expired') {
      await db.rawQuery(
        `UPDATE onramp_orders SET status = 'fx_failed', error = ?, updated_at = now()
         WHERE id = ? AND status = 'fx_settling'`,
        [`Dispersion movement ${normalized} (raw=${rawStatus} code=${statusCode})`, order.id]
      )
      logger.warn(
        `poll_dispersion_movements: order=${order.id} fx_settling → fx_failed (${normalized}) for ${maskPhone(order.phone_number)}`
      )
      return
    }

    // Still pending / processing — keep polling
  } catch (err) {
    logger.error({ err }, `poll_dispersion_movements: error polling order=${order.id}`)
  }
}
