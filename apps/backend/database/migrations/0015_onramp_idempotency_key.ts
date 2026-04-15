import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds idempotency + replay columns to onramp_orders.
 *
 * idempotency_key: client-generated UUID, UNIQUE index prevents double-submission.
 * payment_link / tracking_key: persisted from the Colurs R2P response so that
 * idempotent replays can return the data the frontend needs to complete payment.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
        ADD COLUMN IF NOT EXISTS payment_link TEXT,
        ADD COLUMN IF NOT EXISTS tracking_key TEXT
      `)
      await db.rawQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_onramp_orders_idempotency_key
        ON onramp_orders(idempotency_key) WHERE idempotency_key IS NOT NULL
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`DROP INDEX IF EXISTS idx_onramp_orders_idempotency_key`)
      await db.rawQuery(`
        ALTER TABLE onramp_orders
        DROP COLUMN IF EXISTS idempotency_key,
        DROP COLUMN IF EXISTS payment_link,
        DROP COLUMN IF EXISTS tracking_key
      `)
    })
  }
}
