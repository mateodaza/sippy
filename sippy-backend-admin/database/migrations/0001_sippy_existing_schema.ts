import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Sippy existing schema — safe to run against production.
 * Uses raw SQL with IF NOT EXISTS so it never conflicts with existing data.
 * Matches the Express backend's initDb() schema exactly.
 */
export default class extends BaseSchema {
  async up() {
    // 1. phone_registry
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS phone_registry (
        phone_number TEXT PRIMARY KEY,
        cdp_wallet_name TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_activity BIGINT NOT NULL,
        daily_spent NUMERIC(18,6) NOT NULL DEFAULT 0,
        last_reset_date TEXT NOT NULL
      )
    `)
    await this.db.rawQuery(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS spend_permission_hash VARCHAR(66)
    `)
    await this.db.rawQuery(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS daily_limit DECIMAL(18, 6)
    `)
    await this.db.rawQuery(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS permission_created_at BIGINT
    `)

    // 2. parse_log
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS parse_log (
        id SERIAL PRIMARY KEY,
        message_id TEXT NOT NULL,
        phone_number TEXT,
        parse_source TEXT NOT NULL,
        intent TEXT NOT NULL,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        detected_language VARCHAR(2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    await this.db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parse_log_message_id_unique
      ON parse_log (message_id)
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_parse_log_created_at
      ON parse_log (created_at)
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_parse_log_source_created
      ON parse_log (parse_source, created_at)
    `)

    // 3. export_audit_log
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS export_audit_log (
        id SERIAL PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        event TEXT NOT NULL,
        phone_hash TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    await this.db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_export_audit_dedup
      ON export_audit_log (attempt_id, event)
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_export_audit_created
      ON export_audit_log (created_at)
    `)

    // 4. web_send_log
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS web_send_log (
        id SERIAL PRIMARY KEY,
        phone_hash TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        tx_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_web_send_created
      ON web_send_log (created_at)
    `)
    await this.db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_web_send_tx_hash
      ON web_send_log (tx_hash) WHERE tx_hash IS NOT NULL
    `)

    // 5. user_preferences
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        phone_number TEXT PRIMARY KEY,
        preferred_language VARCHAR(2),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)
  }

  async down() {
    // Intentionally empty — we never want to drop production tables
  }
}
