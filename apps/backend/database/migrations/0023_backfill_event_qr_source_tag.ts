import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Sippy Quest — backfill event-kind qr_links source_tag → 'venue'.
 *
 * Context (2026-05-18 audit): the scoring CTE in
 * `quest/scoring.service.ts` credits the +1 activity entry to existing
 * onboarded users only when their `user_event_links.metadata->>'source'`
 * appears in a venue allowlist (currently just `'venue'`). Without this,
 * any 'returning' link — including a Twitter or SMS deep-link tap from
 * home — would earn an attendance entry without physical presence.
 *
 * Pre-this-migration, the auto-provisioned per-event QR was created with
 * `source_tag = NULL` (see qr_sheets_controller). That meant every
 * existing user who scanned the printed Pizza Day QR landed with
 * `metadata = null` and therefore earned zero activity entries — the
 * exact bug this slice exists to fix.
 *
 * Backfill scope: ONLY `kind = 'event'` rows whose `source_tag IS NULL`.
 * Legacy assistant QRs (`asst-*`, `smoke-*`) keep their existing tags;
 * non-event kinds (`referral`) are untouched.
 *
 * Forward fix: `qr_sheets_controller` now provisions new event QRs with
 * `source_tag = 'venue'` directly — this migration only repairs the
 * pre-fix rows already in prod.
 *
 * Idempotent: re-running is a no-op (no rows match the WHERE after the
 * first run). Safe to run on staging then prod.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE qr_links
        SET source_tag = 'venue'
        WHERE kind = 'event' AND source_tag IS NULL
      `)
    })
  }

  async down() {
    // Intentionally NOT reverting 'venue' → NULL. The original NULL state
    // was a defect that broke attendance scoring; rolling back the
    // backfill would re-introduce the bug, and there's no audit value in
    // restoring it. Down is a no-op so a rollback of LATER migrations
    // can still pass through this one without flipping the source tag.
    this.defer(async (_db) => {
      // no-op
    })
  }
}
