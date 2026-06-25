import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds COP→USDT dispersion columns to onramp_orders.
 *
 * After R2P payment lands in Colurs (status='paid'), a new dispersion job
 * runs Quote + Execute on /v2/exchange/* to convert the COP balance into
 * USDT and disperse it to the Sippy wallet. These columns persist the
 * Colurs identifiers and observed rate/amount across cron ticks.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        ADD COLUMN IF NOT EXISTS colurs_dispersion_quote_id TEXT,
        ADD COLUMN IF NOT EXISTS colurs_dispersion_quote_uuid TEXT,
        ADD COLUMN IF NOT EXISTS colurs_dispersion_movement_id TEXT,
        ADD COLUMN IF NOT EXISTS dispersion_polled_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS dispersion_poll_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS fx_rate_cop_usd DECIMAL(20,8),
        ADD COLUMN IF NOT EXISTS usdt_amount_received DECIMAL(20,8),
        ADD COLUMN IF NOT EXISTS usdt_tx_hash TEXT
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        DROP COLUMN IF EXISTS colurs_dispersion_quote_id,
        DROP COLUMN IF EXISTS colurs_dispersion_quote_uuid,
        DROP COLUMN IF EXISTS colurs_dispersion_movement_id,
        DROP COLUMN IF EXISTS dispersion_polled_at,
        DROP COLUMN IF EXISTS dispersion_poll_count,
        DROP COLUMN IF EXISTS fx_rate_cop_usd,
        DROP COLUMN IF EXISTS usdt_amount_received,
        DROP COLUMN IF EXISTS usdt_tx_hash
      `)
    })
  }
}
