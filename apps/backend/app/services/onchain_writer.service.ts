/**
 * Onchain Writer Service
 *
 * Owns all writes to the onchain.* tables. Every write path is idempotent:
 * raw events are inserted with ON CONFLICT DO NOTHING, and aggregate updates
 * only run when the raw insert succeeds (no row returned = duplicate, skip).
 *
 * Raw events (transfer, refuel_event) are source of truth.
 * Aggregates (account, daily_volume, gas_refuel_status) are derived and recomputable.
 */

import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

const SPENDER_ADDRESS = (env.get('SIPPY_SPENDER_ADDRESS', '') || '').toLowerCase().trim()

export interface TransferParams {
  id: string // "{txHash}-{logIndex}"
  from: string // lowercase 0x
  to: string // lowercase 0x
  amount: string // raw USDC units as string (bigint-safe)
  timestamp: number // unix seconds
  blockNumber: number
  txHash: string
}

export interface RefuelEventParams {
  id: string // "{txHash}-{logIndex}"
  user: string // lowercase 0x
  amount: string // raw wei as string
  timestamp: number
  blockNumber: number
  txHash: string
}

/**
 * Process a USDC transfer event. Idempotent.
 *
 * 1. Insert raw event (skip if duplicate)
 * 2. Update sender account (skip if spender)
 * 3. Update receiver account (skip if spender)
 * 4. Update daily volume
 */
export async function processTransfer(params: TransferParams): Promise<boolean> {
  const { id, from, to, amount, timestamp, blockNumber, txHash } = params
  const trx = await db.transaction()

  try {
    // Step 1: Insert raw event — gate everything on this
    const insertResult = await trx.rawQuery(
      `INSERT INTO onchain.transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, from, to, amount, timestamp, blockNumber, txHash]
    )

    if (insertResult.rows.length === 0) {
      await trx.rollback()
      return false // duplicate, skip aggregates
    }

    // Step 2: Update sender account (skip spender)
    if (from !== SPENDER_ADDRESS) {
      await trx.rawQuery(
        `INSERT INTO onchain.account (address, balance, total_sent, total_received, tx_count, last_activity)
         VALUES (?, -?::NUMERIC, ?::NUMERIC, 0, 1, ?)
         ON CONFLICT (address) DO UPDATE SET
           balance = onchain.account.balance - ?::NUMERIC,
           total_sent = onchain.account.total_sent + ?::NUMERIC,
           tx_count = onchain.account.tx_count + 1,
           last_activity = GREATEST(onchain.account.last_activity, ?)`,
        [from, amount, amount, timestamp, amount, amount, timestamp]
      )
    }

    // Step 3: Update receiver account (skip spender)
    if (to !== SPENDER_ADDRESS) {
      await trx.rawQuery(
        `INSERT INTO onchain.account (address, balance, total_sent, total_received, tx_count, last_activity)
         VALUES (?, ?::NUMERIC, 0, ?::NUMERIC, 1, ?)
         ON CONFLICT (address) DO UPDATE SET
           balance = onchain.account.balance + ?::NUMERIC,
           total_received = onchain.account.total_received + ?::NUMERIC,
           tx_count = onchain.account.tx_count + 1,
           last_activity = GREATEST(onchain.account.last_activity, ?)`,
        [to, amount, amount, timestamp, amount, amount, timestamp]
      )
    }

    // Step 4: Update daily volume
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    await trx.rawQuery(
      `INSERT INTO onchain.daily_volume (id, date, total_usdc_volume, transfer_count)
       VALUES (?, ?, ?::NUMERIC, 1)
       ON CONFLICT (id) DO UPDATE SET
         total_usdc_volume = onchain.daily_volume.total_usdc_volume + ?::NUMERIC,
         transfer_count = onchain.daily_volume.transfer_count + 1`,
      [date, date, amount, amount]
    )

    await trx.commit()
    return true
  } catch (err) {
    await trx.rollback()
    throw err
  }
}

/**
 * Process a GasRefuel Refueled event. Idempotent.
 */
export async function processRefuelEvent(params: RefuelEventParams): Promise<boolean> {
  const { id, user, amount, timestamp, blockNumber, txHash } = params
  const trx = await db.transaction()

  try {
    const insertResult = await trx.rawQuery(
      `INSERT INTO onchain.refuel_event (id, "user", amount, timestamp, block_number, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, user, amount, timestamp, blockNumber, txHash]
    )

    if (insertResult.rows.length === 0) {
      await trx.rollback()
      return false
    }

    // Update singleton status
    await trx.rawQuery(
      `UPDATE onchain.gas_refuel_status SET
         total_refuels = total_refuels + 1,
         total_eth_spent = total_eth_spent + ?::NUMERIC,
         last_refuel_at = GREATEST(last_refuel_at, ?)
       WHERE id = 'singleton'`,
      [amount, timestamp]
    )

    // Update daily volume gas columns
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    await trx.rawQuery(
      `INSERT INTO onchain.daily_volume (id, date, total_usdc_volume, transfer_count, gas_refuel_count, gas_eth_spent)
       VALUES (?, ?, 0, 0, 1, ?::NUMERIC)
       ON CONFLICT (id) DO UPDATE SET
         gas_refuel_count = onchain.daily_volume.gas_refuel_count + 1,
         gas_eth_spent = onchain.daily_volume.gas_eth_spent + ?::NUMERIC`,
      [date, date, amount, amount]
    )

    await trx.commit()
    return true
  } catch (err) {
    await trx.rollback()
    throw err
  }
}

/**
 * Update GasRefuel paused state.
 */
export async function setRefuelPaused(isPaused: boolean): Promise<void> {
  await db.rawQuery(`UPDATE onchain.gas_refuel_status SET is_paused = ? WHERE id = 'singleton'`, [
    isPaused,
  ])
}

/**
 * Delete a transfer (for reorg handling). Returns true if a row was deleted.
 */
export async function deleteTransfer(id: string): Promise<boolean> {
  const result = await db.rawQuery(`DELETE FROM onchain.transfer WHERE id = ? RETURNING id`, [id])
  return result.rows.length > 0
}

/**
 * Delete a refuel event (for reorg handling). Returns true if a row was deleted.
 */
export async function deleteRefuelEvent(id: string): Promise<boolean> {
  const result = await db.rawQuery(`DELETE FROM onchain.refuel_event WHERE id = ? RETURNING id`, [
    id,
  ])
  return result.rows.length > 0
}

/**
 * Recompute all aggregate tables from raw events.
 * Use after reorg deletions or if aggregates are suspected inconsistent.
 */
export async function recomputeAggregates(): Promise<void> {
  logger.info('Recomputing onchain aggregates from raw events...')

  // Rebuild account table
  await db.rawQuery('TRUNCATE onchain.account')
  await db.rawQuery(
    `
    INSERT INTO onchain.account (address, balance, total_sent, total_received, tx_count, last_activity)
    SELECT
      address,
      COALESCE(SUM(received), 0) - COALESCE(SUM(sent), 0) as balance,
      COALESCE(SUM(sent), 0) as total_sent,
      COALESCE(SUM(received), 0) as total_received,
      COALESCE(SUM(send_count + recv_count), 0)::int as tx_count,
      COALESCE(MAX(last_ts), 0) as last_activity
    FROM (
      SELECT "from" as address, amount as sent, 0::NUMERIC as received,
             1 as send_count, 0 as recv_count, timestamp as last_ts
      FROM onchain.transfer
      WHERE "from" != ?
      UNION ALL
      SELECT "to" as address, 0::NUMERIC as sent, amount as received,
             0 as send_count, 1 as recv_count, timestamp as last_ts
      FROM onchain.transfer
      WHERE "to" != ?
    ) t
    GROUP BY address
  `,
    [SPENDER_ADDRESS, SPENDER_ADDRESS]
  )

  // Rebuild daily_volume table
  await db.rawQuery('TRUNCATE onchain.daily_volume')
  await db.rawQuery(`
    INSERT INTO onchain.daily_volume (id, date, total_usdc_volume, transfer_count, gas_refuel_count, gas_eth_spent)
    SELECT
      COALESCE(t.date, r.date) as id,
      COALESCE(t.date, r.date) as date,
      COALESCE(t.vol, 0) as total_usdc_volume,
      COALESCE(t.cnt, 0)::int as transfer_count,
      COALESCE(r.cnt, 0)::int as gas_refuel_count,
      COALESCE(r.eth, 0) as gas_eth_spent
    FROM (
      SELECT to_char(to_timestamp(timestamp), 'YYYY-MM-DD') as date,
             SUM(amount) as vol, COUNT(*) as cnt
      FROM onchain.transfer GROUP BY 1
    ) t
    FULL OUTER JOIN (
      SELECT to_char(to_timestamp(timestamp), 'YYYY-MM-DD') as date,
             COUNT(*) as cnt, SUM(amount) as eth
      FROM onchain.refuel_event GROUP BY 1
    ) r ON t.date = r.date
  `)

  // Rebuild gas_refuel_status singleton
  await db.rawQuery(`
    UPDATE onchain.gas_refuel_status SET
      total_refuels = COALESCE((SELECT COUNT(*) FROM onchain.refuel_event), 0),
      total_eth_spent = COALESCE((SELECT SUM(amount) FROM onchain.refuel_event), 0),
      last_refuel_at = COALESCE((SELECT MAX(timestamp) FROM onchain.refuel_event), 0)
    WHERE id = 'singleton'
  `)

  logger.info('Onchain aggregates recomputed')
}
