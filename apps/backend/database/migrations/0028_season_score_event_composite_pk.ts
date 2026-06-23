import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Season 1 — migrate season.score_event to a composite (season_id, id) PK.
 *
 * 0027 originally created score_event with a single-column PK on `id`. But the
 * transfer-derived ids ("send:{txHash}-{logIndex}" / "receive:{...}") carry no
 * season, so a second season could never project the same transfer — the first
 * season already owns the id (ON CONFLICT (id) swallows it). A composite
 * (season_id, id) PK lets each season own its own projection of a transfer.
 *
 * 0027's CREATE TABLE now declares the composite PK directly, so a FRESH DB
 * never hits the branch below; this migration only repairs a DB that already
 * applied the old 0027 (where 0027 will not re-run). Idempotent: a no-op once
 * the PK is already composite, and a no-op if the table doesn't exist yet.
 *
 * down() is a no-op (same rule as 0012 / 0027 — tables are not altered back).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      DO $$
      DECLARE pk_name text;
      DECLARE pk_cols int;
      BEGIN
        IF to_regclass('season.score_event') IS NULL THEN RETURN; END IF;
        SELECT conname, cardinality(conkey) INTO pk_name, pk_cols
          FROM pg_constraint
         WHERE conrelid = 'season.score_event'::regclass AND contype = 'p';
        IF pk_name IS NOT NULL AND pk_cols = 1 THEN
          EXECUTE format('ALTER TABLE season.score_event DROP CONSTRAINT %I', pk_name);
          ALTER TABLE season.score_event ADD PRIMARY KEY (season_id, id);
        END IF;
      END $$;
    `)
  }

  async down() {
    // Empty — production tables are not altered back (same rule as 0012 / 0027).
  }
}
