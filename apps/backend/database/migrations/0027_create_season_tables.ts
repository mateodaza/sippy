import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Season 1 — measurement core (Phase A).
 *
 * Same raw-SQL, idempotent discipline as 0012_onchain_tables.ts:
 *   • season.score_event is the APPEND-ONLY source of truth (idempotent on `id`,
 *     mirrors onchain.transfer). Flagged events are kept, never deleted.
 *   • season.score is a DERIVED aggregate, fully recomputable from score_event
 *     (+ onchain.transfer for the transfer-derived verbs).
 *   • season.config holds one row per season with a JSONB snapshot of the
 *     §8 tunables at launch, so a score is always explainable against the
 *     params that were live when its events landed.
 *
 * Referral / flag tables are Phase C — intentionally NOT created here.
 *
 * down() is a no-op: production tables are not dropped (same rule as 0012).
 * Every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING so re-running is safe.
 *
 * Amounts: onchain raw USDC units stay NUMERIC(78,0) in onchain.transfer; the
 * `usd` column here is the USD value at event time (dollars) that volumeBonus()
 * consumes. The raw source amount is preserved as a string in meta.rawAmount.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE SCHEMA IF NOT EXISTS season')

    // One row per season. params = JSONB snapshot of the §8 tunables at launch.
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.config (
        id          TEXT PRIMARY KEY,
        starts_at   INTEGER NOT NULL,
        ends_at     INTEGER NOT NULL,
        params      JSONB NOT NULL,
        status      TEXT NOT NULL DEFAULT 'active',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Append-only source of truth (mirrors onchain.transfer). PK is composite
    // (season_id, id) so the SAME transfer can project independently into more
    // than one season — transfer-derived id is "{verb}:{txHash}-{logIndex}"
    // (no season inside it); per-wallet events are "{verb}:{seasonId}:{wallet}".
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.score_event (
        id             TEXT NOT NULL,
        season_id      TEXT NOT NULL,
        wallet         TEXT NOT NULL,
        verb           TEXT NOT NULL,
        counterparty   TEXT,
        usd            NUMERIC(20,6),
        tx_hash        TEXT,
        realized       BOOLEAN NOT NULL DEFAULT true,
        pending_until  INTEGER,
        flagged        BOOLEAN NOT NULL DEFAULT false,
        flag_reason    TEXT,
        meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
        timestamp      INTEGER NOT NULL,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (season_id, id)
      )
    `)
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_score_event_wallet ON season.score_event (wallet)'
    )
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_score_event_timestamp ON season.score_event (timestamp)'
    )
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_score_event_season ON season.score_event (season_id)'
    )
    // Hot path for recompute(wallet): all of one wallet's events in one season.
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_score_event_season_wallet ON season.score_event (season_id, wallet)'
    )

    // Derived aggregate — recomputable from score_event. Composite PK so a
    // wallet can carry an independent score per season.
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS season.score (
        wallet                   TEXT NOT NULL,
        season_id                TEXT NOT NULL,
        score                    INTEGER NOT NULL DEFAULT 0,
        tier                     TEXT NOT NULL DEFAULT 'newcomer',
        active_weeks             INTEGER NOT NULL DEFAULT 0,
        distinct_counterparties  INTEGER NOT NULL DEFAULT 0,
        last_active              INTEGER,
        dormant                  BOOLEAN NOT NULL DEFAULT false,
        updated_at               TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (wallet, season_id)
      )
    `)
    this.schema.raw(
      'CREATE INDEX IF NOT EXISTS idx_season_score_season ON season.score (season_id)'
    )
    this.schema.raw('CREATE INDEX IF NOT EXISTS idx_season_score_tier ON season.score (tier)')

    // Seed the 's1' season with the spec's default §8 tunables. ON CONFLICT
    // DO NOTHING so re-running the migration never clobbers a tuned param set.
    // params JSON is kept in sync with DEFAULT_PARAMS in #season/params.
    this.schema.raw(`
      INSERT INTO season.config (id, starts_at, ends_at, params, status)
      VALUES (
        's1',
        EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-06-23T00:00:00Z')::int,
        EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-09-21T00:00:00Z')::int,
        '{
          "K": 2,
          "vCap": 20,
          "dailyCap": 150,
          "base": {
            "first_send": 50,
            "send": 10,
            "receive": 3,
            "onramp": 0,
            "onramp_used": 10,
            "offramp": 20,
            "active_week": 15,
            "new_counterparty": 8,
            "referral_unlock_referrer": 40,
            "referral_unlock_referee": 25,
            "referral_retained": 30
          },
          "pairDecay": { "baseOnlyAfter": 3, "zeroAfter": 8 },
          "recency": { "fullDays": 30, "halfDays": 90 },
          "dormantDays": 21,
          "referral": {
            "unlockMinSend": 5,
            "unlockWindowDays": 14,
            "retainedWindowDays": 30,
            "seasonCap": 500,
            "decayAfter": 10
          },
          "onrampRealizeWindowDays": 14,
          "newCounterpartySeasonCap": 10,
          "minActiveUsd": 1,
          "tiers": {
            "active": { "minScore": 150, "minActiveWeeks": 1 },
            "regular": { "minScore": 600, "minActiveWeeks": 4, "minCounterparties": 3 },
            "power": { "minScore": 1500, "minActiveWeeks": 8, "requiresKyc": true }
          }
        }'::jsonb,
        'active'
      )
      ON CONFLICT (id) DO NOTHING
    `)
  }

  async down() {
    // Empty — production tables are not dropped (same rule as 0012).
  }
}
