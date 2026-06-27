import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Gas → AA Track B (slice 2) — setup-lane columns + the `awaiting_signature` state.
 *
 * The sponsored cold deploy+approve op is BROWSER-signed, so Pimlico sponsorship
 * (the webhook match) happens before the signature exists. Its row therefore sits
 * in a new pre-signature state `awaiting_signature` (sponsored + nonce-held, no
 * signed op yet) between `authorized` and `prepared`.
 *
 * `awaiting_signature` is NONCE-ACTIVE: a second `/prepare` must not reuse the nonce
 * while the first op waits on the browser — so the active-nonce partial-unique index
 * widens to include it. (Behaviour-preserving for `free_send`, which never has such
 * rows.) `cancelled` is the fallback-terminalize state — legacy GasRefuel may only
 * run after atomically cancelling the row (kills the legacy-then-late-submit dup).
 *
 * Setup columns (all NULL for free_send): `init_code_hash` (the §5 security binding),
 * `unsigned_user_op` (the sponsored op `/submit` attaches the wrapped sig to), and
 * `user_eoa` (the owner `/submit` verifies the sig recovers to). The hashToSign is
 * the existing `user_op_hash` (the raw v0.6 userOpHash — sig-seam spike).
 *
 * down() is a no-op (same prod-table discipline as 0031).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE gas_aa_prepared_user_ops
        ADD COLUMN IF NOT EXISTS init_code_hash   TEXT,
        ADD COLUMN IF NOT EXISTS unsigned_user_op JSONB,
        ADD COLUMN IF NOT EXISTS user_eoa         TEXT
    `)

    // Widen the active-nonce partial-unique index to treat `awaiting_signature` as
    // ACTIVE (holds a nonce). Without this, a second /prepare on the same
    // (chain, ep, sender, nonce) could reuse the nonce while the first unsigned op
    // is still waiting for its browser signature.
    this.schema.raw(`DROP INDEX IF EXISTS uniq_gas_aa_active_nonce`)
    this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_gas_aa_active_nonce
        ON gas_aa_prepared_user_ops (chain_id, entry_point, sender, sender_nonce)
        WHERE sender_nonce IS NOT NULL
          AND status IN ('authorized', 'awaiting_signature', 'prepared')
    `)
  }

  async down() {
    // Empty — production tables are not altered down (same rule as 0031).
  }
}
