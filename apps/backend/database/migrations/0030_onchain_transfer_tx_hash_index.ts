import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Index onchain.transfer (tx_hash). Two consumers group a transfer's sibling legs by
 * tx_hash to collapse the SpendPermission relay pair (user→spender + spender→recipient)
 * back into one logical user→recipient send:
 *   • the dashboard self-join in #season/definitions.logicalTransferCteSql, and
 *   • the score projector's per-leg sibling lookup (#season/projector.resolveRelayLeg).
 * Both did sequential scans without this index. Idempotent (IF NOT EXISTS); the table
 * already carries from/to/timestamp/block indexes (0012_onchain_tables).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_transfer_tx_hash ON onchain.transfer (tx_hash)'
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS onchain.idx_onchain_transfer_tx_hash')
  }
}
