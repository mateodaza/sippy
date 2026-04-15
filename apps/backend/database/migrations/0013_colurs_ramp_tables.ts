import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Colurs onramp + offramp tables.
 *
 * onramp_orders  — COP payment → USDC delivery tracking
 * offramp_orders — USDC pull → COP bank payout tracking
 * colurs_bank_accounts — user-registered Colombian bank accounts
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // ── onramp_orders ───────────────────────────────────────────────────────
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS onramp_orders (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone_number      TEXT NOT NULL,
          external_id       TEXT UNIQUE NOT NULL,
          colurs_payment_id TEXT,
          method            TEXT NOT NULL,
          amount_cop        DECIMAL(18,2) NOT NULL,
          amount_usdt       DECIMAL(18,8),
          deposit_address   TEXT NOT NULL,
          status            TEXT NOT NULL DEFAULT 'pending',
          lifi_tx_hash      TEXT,
          usdc_received     DECIMAL(18,6),
          error             TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      // status machine (LiFi bridge path):
      //   initiating_payment → pending → paid → initiating_bridge → bridging → completed | bridge_failed | needs_reconciliation
      // COLURS_DIRECT_USDC=true is blocked at the controller level until a
      // trustworthy completion/correlation path is implemented.

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_onramp_orders_phone ON onramp_orders(phone_number)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_onramp_orders_external ON onramp_orders(external_id)`
      )

      // ── offramp_orders ──────────────────────────────────────────────────────
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS offramp_orders (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          phone_number        TEXT NOT NULL,
          external_id         TEXT UNIQUE NOT NULL,
          colurs_quote_id     TEXT,
          colurs_movement_id  TEXT,
          bank_account_id     INTEGER NOT NULL,
          amount_usdc         DECIMAL(18,6) NOT NULL,
          amount_cop          DECIMAL(18,2),
          exchange_rate       DECIMAL(18,4),
          status              TEXT NOT NULL DEFAULT 'pending',
          error               TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      // status machine: pending → pulling_usdc → pending_fx → completed | failed

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_offramp_orders_phone ON offramp_orders(phone_number)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_offramp_orders_external ON offramp_orders(external_id)`
      )

      // ── colurs_bank_accounts ────────────────────────────────────────────────
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS colurs_bank_accounts (
          id              SERIAL PRIMARY KEY,
          phone_number    TEXT NOT NULL,
          colurs_id       TEXT NOT NULL,
          holder_name     TEXT NOT NULL,
          document_type   TEXT NOT NULL,
          document_number TEXT NOT NULL,
          account_number  TEXT NOT NULL,
          account_type    TEXT NOT NULL,              -- 'savings'|'checking' for display; mapped to 0/1 int when calling Colurs API
          bank_id         INTEGER NOT NULL,           -- numeric ID from Colurs /banks/
          bank_name       TEXT,
          country_code    TEXT NOT NULL DEFAULT 'CO',
          is_default      BOOLEAN NOT NULL DEFAULT false,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      // document_type stores display codes (CC, CE, NIT); map to Colurs numeric IDs at request time
      // bank_id is the numeric ID from /banks/
      // document_type stores display code (CC, CE, NIT, TI, PPT); colurs_bank.service maps to numeric ID at call time
      // account_type stores 'savings'/'checking'; colurs_bank.service maps to 0/1 at call time

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_colurs_bank_accounts_phone ON colurs_bank_accounts(phone_number)`
      )

      // ── colurs_kyc ──────────────────────────────────────────────────────────
      // Full Colurs user registration + KYC per Sippy end-user.
      //
      // Flow: unregistered → registered → phone_verified → email_verified
      //       → documents_submitted → approved (Level 5)
      //
      // colurs_user_id  — Colurs numeric user ID from POST /user/
      // counterparty_id — Colurs cp_xxx from POST /api/reload/r2p/counterparty/
      //                   created once Level 5 is reached, reused for all R2P payments
      // kyc_level       — 0,1,2,5 as returned by Colurs profile endpoint
      // kyc_status      — internal state machine for the onboarding flow
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS colurs_kyc (
          phone_number      TEXT PRIMARY KEY,
          fullname          TEXT,
          id_type           TEXT,             -- CC | CE | NIT | PA
          id_number         TEXT,
          email             TEXT,
          colurs_user_id    INTEGER,          -- Colurs numeric user id (POST /user/)
          counterparty_id   TEXT,             -- Colurs cp_xxx (POST /api/reload/r2p/counterparty/)
          kyc_level         INTEGER NOT NULL DEFAULT 0,
          kyc_status        TEXT NOT NULL DEFAULT 'unregistered',
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP TABLE IF EXISTS colurs_kyc')
      await db.rawQuery('DROP TABLE IF EXISTS colurs_bank_accounts')
      await db.rawQuery('DROP TABLE IF EXISTS offramp_orders')
      await db.rawQuery('DROP TABLE IF EXISTS onramp_orders')
    })
  }
}
