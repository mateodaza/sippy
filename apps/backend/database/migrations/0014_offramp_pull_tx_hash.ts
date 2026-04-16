import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE offramp_orders
        ADD COLUMN IF NOT EXISTS pull_tx_hash TEXT,
        ADD COLUMN IF NOT EXISTS polled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS poll_count INTEGER NOT NULL DEFAULT 0
      `)
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        ADD COLUMN IF NOT EXISTS polled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS poll_count INTEGER NOT NULL DEFAULT 0
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE offramp_orders
        DROP COLUMN IF EXISTS pull_tx_hash,
        DROP COLUMN IF EXISTS polled_at,
        DROP COLUMN IF EXISTS poll_count
      `)
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        DROP COLUMN IF EXISTS polled_at,
        DROP COLUMN IF EXISTS poll_count
      `)
    })
  }
}
