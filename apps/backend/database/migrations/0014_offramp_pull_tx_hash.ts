import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds pull_tx_hash to offramp_orders.
 *
 * Stores the on-chain tx hash returned by sendWithSpendPermission()
 * when USDC is pulled from the user's wallet. Required for manual
 * reconciliation if the Colurs FX step fails after the pull.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE offramp_orders
        ADD COLUMN IF NOT EXISTS pull_tx_hash TEXT
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE offramp_orders
        DROP COLUMN IF EXISTS pull_tx_hash
      `)
    })
  }
}
