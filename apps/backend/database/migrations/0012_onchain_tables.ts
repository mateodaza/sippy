import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE SCHEMA IF NOT EXISTS onchain')

    // Raw event — source of truth
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.transfer (
        id            TEXT PRIMARY KEY,
        "from"        TEXT NOT NULL,
        "to"          TEXT NOT NULL,
        amount        NUMERIC(78,0) NOT NULL,
        timestamp     INTEGER NOT NULL,
        block_number  INTEGER NOT NULL,
        tx_hash       TEXT NOT NULL,
        received_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_transfer_from ON onchain.transfer ("from")'
    )
    this.schema.raw('CREATE INDEX IF NOT EXISTS idx_onchain_transfer_to ON onchain.transfer ("to")')
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_transfer_timestamp ON onchain.transfer (timestamp)'
    )
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_transfer_block ON onchain.transfer (block_number)'
    )

    // Derived aggregate
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.account (
        address        TEXT PRIMARY KEY,
        balance        NUMERIC(78,0) NOT NULL DEFAULT 0,
        total_sent     NUMERIC(78,0) NOT NULL DEFAULT 0,
        total_received NUMERIC(78,0) NOT NULL DEFAULT 0,
        tx_count       INTEGER NOT NULL DEFAULT 0,
        last_activity  INTEGER NOT NULL DEFAULT 0
      )
    `)

    // Derived aggregate
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.daily_volume (
        id                TEXT PRIMARY KEY,
        date              TEXT NOT NULL,
        total_usdc_volume NUMERIC(78,0) NOT NULL DEFAULT 0,
        transfer_count    INTEGER NOT NULL DEFAULT 0,
        gas_refuel_count  INTEGER NOT NULL DEFAULT 0,
        gas_eth_spent     NUMERIC(78,0) NOT NULL DEFAULT 0
      )
    `)

    // Raw event — source of truth
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.refuel_event (
        id            TEXT PRIMARY KEY,
        "user"        TEXT NOT NULL,
        amount        NUMERIC(78,0) NOT NULL,
        timestamp     INTEGER NOT NULL,
        block_number  INTEGER NOT NULL,
        tx_hash       TEXT NOT NULL
      )
    `)
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_refuel_user ON onchain.refuel_event ("user")'
    )
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_onchain_refuel_timestamp ON onchain.refuel_event (timestamp)'
    )

    // Derived singleton
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.gas_refuel_status (
        id              TEXT PRIMARY KEY,
        total_refuels   INTEGER NOT NULL DEFAULT 0,
        total_eth_spent NUMERIC(78,0) NOT NULL DEFAULT 0,
        is_paused       BOOLEAN NOT NULL DEFAULT false,
        last_refuel_at  INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.schema.raw(`
      INSERT INTO onchain.gas_refuel_status (id, total_refuels, total_eth_spent, is_paused, last_refuel_at)
      VALUES ('singleton', 0, 0, false, 0)
      ON CONFLICT (id) DO NOTHING
    `)

    // Ops/debugging
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.webhook_delivery_log (
        id              SERIAL PRIMARY KEY,
        event_id        TEXT UNIQUE NOT NULL,
        webhook_id      TEXT NOT NULL,
        received_at     TIMESTAMPTZ DEFAULT NOW(),
        block_num       TEXT,
        activity_count  INTEGER,
        status          TEXT NOT NULL DEFAULT 'ok'
      )
    `)
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_webhook_delivery_received ON onchain.webhook_delivery_log (received_at)'
    )

    // GasRefuel poller state
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS onchain.poller_cursor (
        id                    TEXT PRIMARY KEY,
        last_processed_block  INTEGER NOT NULL,
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  }

  async down() {
    // Empty — production tables are not dropped
  }
}
