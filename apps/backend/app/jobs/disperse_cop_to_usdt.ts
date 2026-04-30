/**
 * COP → USDT dispersion job
 *
 * Picks up onramp orders that have just confirmed an R2P payment (status='paid')
 * and runs Colurs's exchange Quote + Execute back-to-back to convert the COP
 * balance into USDT and disperse it to the Sippy wallet.
 *
 * Quote TTL is 1 minute, so Quote and Execute MUST run in the same handler —
 * never split across cron ticks.
 *
 * State transitions:
 *   paid          → fx_quoting       (atomic claim)
 *   fx_quoting    → fx_executing     (after successful Quote)
 *   fx_executing  → fx_settling      (after successful Execute, settling poller takes over)
 *   any           → fx_failed        (Colurs rejection, e.g. below 200k min)
 *
 * "Dirty secret": orders below 200,000 COP minimum still attempt the quote.
 * We log the Colurs rejection verbatim so we know exactly what comes back.
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { createOnrampQuote, executeOnrampExchange, getQuoteRate } from '#services/colurs_fx.service'
import { maskPhone } from '#utils/phone'

const MIN_COP = 200_000
let isRunning = false

interface PaidOrderRow {
  id: string
  external_id: string
  amount_cop: string
  phone_number: string
  /** R2P money_movement_id (mm_…) — passed to /execute/ so Colurs knows
   *  which COP balance to debit. */
  colurs_payment_id: string | null
}

/**
 * Recovery sweep — orders stuck in fx_quoting / fx_executing without their
 * respective ID columns populated.
 *
 * fx_quoting stuck → fx_failed (no money moved yet — quote response lost is safe to fail)
 *
 * fx_executing stuck → needs_reconciliation (NOT fx_failed). A timeout or 5xx
 * after we sent /execute/ can still mean Colurs accepted it and a movement
 * exists. Funds may already be moving. Manual ops check required before retry.
 */
async function recoverStuckDispersionOrders(): Promise<void> {
  const stuck = await db.rawQuery<{
    rows: { id: string; external_id: string; status: string }[]
  }>(
    `SELECT id, external_id, status
     FROM onramp_orders
     WHERE (
       (status = 'fx_quoting'
          AND colurs_dispersion_quote_uuid IS NULL
          AND updated_at < now() - interval '2 minutes')
       OR
       (status = 'fx_executing'
          AND colurs_dispersion_movement_id IS NULL
          AND updated_at < now() - interval '2 minutes')
     )
     LIMIT 20`
  )

  for (const order of stuck.rows) {
    if (order.status === 'fx_quoting') {
      logger.error(
        `disperse_cop_to_usdt: order ${order.external_id} stuck in fx_quoting >2m — fx_failed (no funds moved)`
      )
      await db.rawQuery(
        `UPDATE onramp_orders
         SET status = 'fx_failed', error = ?, updated_at = now()
         WHERE id = ? AND status = 'fx_quoting'`,
        ['Colurs quote response was not persisted within 2m. Safe to retry.', order.id]
      )
    } else {
      // fx_executing — possible in-flight movement on Colurs side
      logger.error(
        `disperse_cop_to_usdt: order ${order.external_id} stuck in fx_executing >2m — needs_reconciliation (funds may be moving)`
      )
      await db.rawQuery(
        `UPDATE onramp_orders
         SET status = 'needs_reconciliation', error = ?, updated_at = now()
         WHERE id = ? AND status = 'fx_executing'`,
        [
          'Execute response not persisted within 2m. Colurs may have accepted the quote and created a movement — verify before retry.',
          order.id,
        ]
      )
    }
  }
}

export async function disperseCopToUsdt(): Promise<void> {
  if (isRunning) {
    logger.warn('disperse_cop_to_usdt: previous run still in flight, skipping tick')
    return
  }
  isRunning = true

  try {
    await recoverStuckDispersionOrders()

    const orders = await db.rawQuery<{ rows: PaidOrderRow[] }>(
      `SELECT id, external_id, amount_cop, phone_number, colurs_payment_id
       FROM onramp_orders
       WHERE status = 'paid'
       LIMIT 10`
    )

    if (orders.rows.length === 0) return
    logger.info(`disperse_cop_to_usdt: picking up ${orders.rows.length} paid orders`)

    // Sequential — Quote+Execute is short enough that we don't need parallelism,
    // and 1-min TTL prefers controlled pacing.
    for (const order of orders.rows) {
      await disperseOne(order)
    }
  } finally {
    isRunning = false
  }
}

async function disperseOne(order: PaidOrderRow): Promise<void> {
  const amountCop = Number.parseFloat(order.amount_cop)
  logger.info(
    `disperse_cop_to_usdt: picking up order=${order.id} ext=${order.external_id} amount_cop=${amountCop} phone=${maskPhone(order.phone_number)}`
  )

  if (amountCop < MIN_COP) {
    logger.warn(
      `disperse_cop_to_usdt: order=${order.id} below 200k COP minimum (amount=${amountCop}) — attempting anyway (dirty secret)`
    )
  }

  // Atomic claim: paid → fx_quoting (prevents double-pickup across ticks)
  const claim = await db.rawQuery(
    `UPDATE onramp_orders SET status = 'fx_quoting', updated_at = now()
     WHERE id = ? AND status = 'paid'
     RETURNING id`,
    [order.id]
  )
  if (!claim.rows[0]) {
    logger.info(`disperse_cop_to_usdt: order=${order.id} already claimed by another tick, skipping`)
    return
  }
  logger.info(`disperse_cop_to_usdt: order=${order.id} paid → fx_quoting`)

  // ── Quote ────────────────────────────────────────────────────────────────
  // The canonical Colurs quote identifier is `cobre_quote_id` (prefixed
  // `fxq_…`, same convention as `mm_…` for money_movements). The internal
  // `id` UUID and (Postman-referenced) `uuid` field are NOT what /execute/
  // wants — those are internal record IDs.
  let quoteCobreId: string | undefined
  let quoteId: string | undefined
  let quoteRate = 0
  try {
    const quote = await createOnrampQuote(amountCop)
    // Log full response so we can see the actual field shape.
    logger.info({ quote }, `disperse_cop_to_usdt: order=${order.id} quote raw response`)
    quoteId = quote.id
    quoteCobreId = quote.cobre_quote_id ?? quote.uuid ?? quote.id
    quoteRate = getQuoteRate(quote)
    logger.info(
      `disperse_cop_to_usdt: order=${order.id} quote success quote_id=${quoteId} cobre_quote_id=${quote.cobre_quote_id ?? 'n/a'} sending_as_quote_uuid=${quoteCobreId} rate=${quoteRate} destination_amount=${quote.destination_amount}`
    )

    if (!quoteCobreId) {
      throw new Error(
        'Colurs quote response had no `cobre_quote_id`, `uuid`, or `id` — cannot execute'
      )
    }

    await db.rawQuery(
      `UPDATE onramp_orders
       SET colurs_dispersion_quote_id = ?,
           colurs_dispersion_quote_uuid = ?,
           fx_rate_cop_usd = ?,
           updated_at = now()
       WHERE id = ?`,
      [quoteId ?? null, quoteCobreId, quoteRate > 0 ? String(quoteRate) : null, order.id]
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Quote error'
    logger.error({ err }, `disperse_cop_to_usdt: order=${order.id} quote FAILED — ${msg}`)
    await db.rawQuery(
      `UPDATE onramp_orders SET status = 'fx_failed', error = ?, updated_at = now()
       WHERE id = ? AND status = 'fx_quoting'`,
      [`FX quote failed: ${msg}`, order.id]
    )
    return
  }

  // ── Execute (immediate — 1-min quote TTL) ────────────────────────────────
  // Per the COP→USDT Postman (source of truth): body is just { quote_uuid }.
  await db.rawQuery(
    `UPDATE onramp_orders SET status = 'fx_executing', updated_at = now()
     WHERE id = ? AND status = 'fx_quoting'`,
    [order.id]
  )
  logger.info(`disperse_cop_to_usdt: order=${order.id} fx_quoting → fx_executing`)

  // Execute may commit funds on Colurs side even if we never see a clean
  // response. Any error/timeout/5xx after the request is sent → reconciliation,
  // never fx_failed.
  try {
    const exec = await executeOnrampExchange(quoteCobreId!)
    // Log full response so we see the actual field shape.
    logger.info({ exec }, `disperse_cop_to_usdt: order=${order.id} execute raw response`)

    // Per Postman test script: movement uuid is the polling key.
    // Falls back to id only if uuid absent — Colurs may name it differently.
    const movementUuid = exec.uuid ?? (typeof exec.id === 'string' ? exec.id : undefined)
    logger.info(
      `disperse_cop_to_usdt: order=${order.id} execute success movement_uuid=${movementUuid ?? 'MISSING'} status=${exec.status ?? 'unknown'}`
    )

    if (!movementUuid) {
      // Movement may exist on Colurs side — needs_reconciliation, not fx_failed.
      logger.error(
        `disperse_cop_to_usdt: order=${order.id} execute response missing uuid — needs_reconciliation`
      )
      await db.rawQuery(
        `UPDATE onramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
         WHERE id = ? AND status = 'fx_executing'`,
        [
          'Execute response missing `uuid` — cannot poll movement. Verify on Colurs side before retry.',
          order.id,
        ]
      )
      return
    }

    await db.rawQuery(
      `UPDATE onramp_orders
       SET colurs_dispersion_movement_id = ?,
           usdt_tx_hash = COALESCE(?, usdt_tx_hash),
           status = 'fx_settling',
           updated_at = now()
       WHERE id = ? AND status = 'fx_executing'`,
      [movementUuid, exec.transaction_hash ?? null, order.id]
    )
    logger.info(`disperse_cop_to_usdt: order=${order.id} fx_executing → fx_settling`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Execute error'
    logger.error(
      { err },
      `disperse_cop_to_usdt: order=${order.id} execute UNCERTAIN — ${msg} — needs_reconciliation`
    )
    // Funds may have moved on Colurs side — never fx_failed here.
    await db.rawQuery(
      `UPDATE onramp_orders SET status = 'needs_reconciliation', error = ?, updated_at = now()
       WHERE id = ? AND status = 'fx_executing'`,
      [
        `FX execute outcome unknown: ${msg}. Colurs may have accepted the quote — verify before retry.`,
        order.id,
      ]
    )
  }
}
