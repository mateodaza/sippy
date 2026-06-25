import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Partial unique index on (event_slug, source_tag) for active event QRs.
 *
 * Locks the durable invariant the admin bulk-create flow assumes: within a
 * single event, no two active QRs share the same source_tag. The controller
 * pre-checks for collisions, but a concurrent admin submission could race
 * past the check without this. Partial index pattern:
 *
 *  - Only event-kind links carry both event_slug and source_tag; pay/referral
 *    rows are null on at least one of those, so they're excluded from the
 *    index by `event_slug IS NOT NULL` (the implicit nullability of partial
 *    indexes on multi-column UNIQUE in Postgres treats NULLs as distinct
 *    anyway, but we make it explicit for readers).
 *  - `status = 'active'` exclusion lets a re-issue happen: revoke the old
 *    tag, create a new active one with the same tag. The historical revoked
 *    row stays for analytics, doesn't block the new one.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS qr_links_event_source_unique
          ON qr_links (event_slug, source_tag)
          WHERE event_slug IS NOT NULL
            AND source_tag IS NOT NULL
            AND status = 'active'
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP INDEX IF EXISTS qr_links_event_source_unique')
    })
  }
}
