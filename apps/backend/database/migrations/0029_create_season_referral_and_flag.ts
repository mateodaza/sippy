import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Season 1 — referral ledger + sybil flag tables (Phase C).
 *
 * The two tables Phase A deliberately deferred (plan §2). Same raw-SQL,
 * idempotent discipline as 0027 / 0028:
 *   • Every statement is IF NOT EXISTS so re-running is safe.
 *   • down() is a no-op — production tables are not dropped (rule from 0012).
 *
 * season.referral — ONE ledger fed by BOTH existing referral sources
 *   (referral_attributions + pending_invites), joined to wallets via
 *   phone_registry. UNIQUE(season_id, referee_wallet) enforces "one referrer
 *   per referee" (mirrors the PK on referral_attributions.referee_phone). All
 *   stages are DERIVED — the row is rebuildable from the source tables + the
 *   score_event log, like every other season aggregate. Reputation-only:
 *   stages drive score points, never money or a redeemable perk (Lina gate).
 *
 * season.flag — sybil/fraud findings (flagged-not-deleted; feeds the admin
 *   review queue). UNIQUE(season_id, subject, kind) so the season job can't
 *   create duplicate flags and an admin confirm/clear is auditable (who+when
 *   via reviewed_by/reviewed_at). detail carries NO raw PII — hashed/masked
 *   references only (enforced in the writer, documented here).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE SCHEMA IF NOT EXISTS season')

    // ── season.score_event.pending_remaining (Phase C on-ramp FIFO) ───────────
    // Per-pending-on-ramp running USD balance, initialised to the on-ramp amount
    // and reduced as value-outs realise it FIFO (#season/onramp). It is a DERIVED
    // cache (= original usd − Σ realised onramp_used chunks), always SET to that
    // value rather than blind-decremented, so a replay/recompute reproduces it.
    // NULL for every non-on-ramp event. Same idempotent-aggregate discipline as
    // the rest of score_event; lives here because it is Phase C schema.
    this.schema.raw(
      'ALTER TABLE season.score_event ADD COLUMN IF NOT EXISTS pending_remaining NUMERIC(20,6)'
    )

    // ── season.referral ──────────────────────────────────────────────────────
    // source: 'quest_code' (referral_attributions) | 'direct_invite' (pending_invites)
    // ref_id: referral_attributions.referee_phone OR pending_invites.id, per source
    // stage:  pending | unlocked | retained | void
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.referral (
        id               SERIAL PRIMARY KEY,
        season_id        TEXT NOT NULL,
        referrer_wallet  TEXT NOT NULL,
        referee_wallet   TEXT NOT NULL,
        source           TEXT NOT NULL,
        ref_id           TEXT,
        stage            TEXT NOT NULL DEFAULT 'pending',
        unlocked_at      INTEGER,
        unlock_tx_id     TEXT,
        retained_at      INTEGER,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (season_id, referee_wallet)
      )
    `)
    // unlock_tx_id was added after the first cut of this migration, so a dev/staging
    // DB that already ran 0029 keeps a referral table without it (CREATE TABLE IF NOT
    // EXISTS is a no-op there). Explicit ADD COLUMN IF NOT EXISTS makes it idempotent
    // for both fresh and already-migrated databases.
    this.schema.raw('ALTER TABLE season.referral ADD COLUMN IF NOT EXISTS unlock_tx_id TEXT')
    // "my referrals" lookups (referrer dashboard, retained-promotion scan).
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_referral_referrer ON season.referral (season_id, referrer_wallet)'
    )
    // Season-job scans by stage (pending→unlocked detection scope, retained pass).
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_referral_stage ON season.referral (season_id, stage)'
    )
    // Projector unlock check joins on the referee wallet.
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_referral_referee ON season.referral (season_id, referee_wallet)'
    )

    // ── season.flag ──────────────────────────────────────────────────────────
    // subject: wallet | "a:b" sorted pair | cluster id
    // kind:    circular | roundtrip | star | cluster | velocity | vendor
    // status:  open | confirmed | cleared
    // detail:  JSONB — NO raw PII (hashed/masked references only)
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.flag (
        id           SERIAL PRIMARY KEY,
        season_id    TEXT NOT NULL,
        subject      TEXT NOT NULL,
        kind         TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'open',
        detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at  TIMESTAMPTZ,
        reviewed_by  TEXT,
        UNIQUE (season_id, subject, kind)
      )
    `)
    // Review-queue read pattern: open flags for a season, newest first.
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_flag_status ON season.flag (season_id, status, created_at DESC)'
    )

    // ── season.job_lock (Phase C / C4 singleton guard) ────────────────────────
    // One row per season. The season job claims it before a pass and releases it
    // after, so on multi-instance / multi-warm-process deploys two processes never
    // run the same heavy pass concurrently. A pool-safe alternative to a session
    // advisory lock (which Lucid's connection pool can't release reliably — the
    // unlock may land on a different connection than the lock). Stale claims past a
    // timeout are stealable, so a crashed pass can't wedge the job forever.
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.job_lock (
        season_id   TEXT PRIMARY KEY,
        locked_at   TIMESTAMPTZ,
        locked_by   TEXT
      )
    `)
  }

  async down() {
    // Empty — production tables are not dropped (same rule as 0012 / 0027 / 0028).
  }
}
