import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Gas → AA Phase 2 slice 1 — the `gas_aa_prepared_user_ops` ledger.
 *
 * The authorization spine for off-CDP sponsored submission. A row is created
 * ONLY after the app's existing velocity/security checks pass (status
 * `authorized`), before the UserOp build. The DB-binding webhook sponsors ONLY a
 * Pimlico request it can match to a row here — calldata decoding alone is never
 * authorization. Lifecycle: authorized → prepared → landed | failed | expired.
 *
 * P1 backstops (mirror the submitter's per-(chain_id, entry_point, sender)
 * nonce lock so concurrent shared-spender sends can't double-allocate a nonce):
 *   • partial-unique over ACTIVE (non-terminal) rows on
 *     (chain_id, entry_point, sender, sender_nonce) once sender_nonce is set;
 *   • unique user_op_hash once prepared.
 * Rows without sender_nonce are NOT sponsorable.
 *
 * P2: expires_at is MINUTES-scale; a cleanup sweep marks un-landed rows expired
 * so the webhook can't sponsor a stale intent after product state moved on.
 *
 * Amounts/nonces in raw units NUMERIC(78,0) (uint256-safe). Addresses lowercased.
 * down() is a no-op (same prod-table discipline as 0027).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS gas_aa_prepared_user_ops (
        id                  TEXT PRIMARY KEY,        -- app-generated; also the paymasterContext prepared_op_id
        lane                TEXT NOT NULL,           -- 'free_send' (spender) | future lanes
        semantic_action_id  TEXT,                    -- app-side correlation (e.g. the send id)
        sender              TEXT NOT NULL,           -- 4337 sender (the spender for free-send), lowercase 0x
        decoded_user        TEXT,                    -- permission.account (the real user) for spender ops, lowercase
        chain_id            INTEGER NOT NULL,
        entry_point         TEXT NOT NULL,           -- EntryPoint address, lowercase
        sender_nonce        NUMERIC(78,0),           -- 4337 nonce (2D); null until resolved; NOT sponsorable while null
        calls_hash          TEXT NOT NULL,           -- keccak256 of the encoded calls (binding)
        cap_bucket          TEXT,                    -- per-permission.account cap bucket key
        status              TEXT NOT NULL DEFAULT 'authorized',  -- authorized|prepared|landed|failed|expired
        user_op_hash        TEXT,                    -- null until prepared
        signed_user_op      JSONB,                   -- FULL signed UserOp (null until prepared); enough to rebroadcast the EXACT hash
        meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
        expires_at          INTEGER NOT NULL,        -- unix seconds; minutes-scale
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // P1: at most ONE active (non-terminal) row per (chain, entryPoint, sender, nonce)
    // — the DB backstop to the submitter's nonce lock. Concurrent sends cannot
    // double-allocate a nonce; the second either takes the next nonce or fails
    // cleanly pre-broadcast.
    this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_gas_aa_active_nonce
        ON gas_aa_prepared_user_ops (chain_id, entry_point, sender, sender_nonce)
        WHERE sender_nonce IS NOT NULL AND status IN ('authorized', 'prepared')
    `)
    // P1: a userOpHash is globally unique once prepared (one signed op, one hash).
    this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_gas_aa_user_op_hash
        ON gas_aa_prepared_user_ops (user_op_hash)
        WHERE user_op_hash IS NOT NULL
    `)
    // Webhook match path: (chain_id, entry_point, sender, sender_nonce).
    this.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_gas_aa_match
        ON gas_aa_prepared_user_ops (chain_id, entry_point, sender, sender_nonce)
    `)
    // Cleanup/reconciliation sweep over un-landed rows past expiry.
    this.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_gas_aa_status_expiry
        ON gas_aa_prepared_user_ops (status, expires_at)
    `)
  }

  async down() {
    // Empty — production tables are not dropped (same rule as 0027).
  }
}
