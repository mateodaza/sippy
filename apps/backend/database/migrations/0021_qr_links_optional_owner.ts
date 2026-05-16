import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Make `qr_links.owner_phone_number` nullable.
 *
 * Background: the column was inherited from the pay-QR design where the
 * owner is the recipient of payments and MUST exist. For event-kind QRs,
 * the owner is purely decorative — the bracket-handler routes by event_slug
 * + source_tag and never reads owner_phone. Forcing event admins to pick a
 * phone is fake friction that produced bugs (env-var setup, CASCADE delete
 * risks if a stranger's phone was chosen).
 *
 * After this migration:
 *   - event-kind  → owner_phone_number can be NULL (event_slug is the anchor)
 *   - pay-kind    → owner_phone_number MUST be NOT NULL (recipient identity)
 *   - referral    → owner_phone_number can be NULL
 *
 * Enforced by a single named CHECK constraint. The legacy unnamed CHECK
 * (which only enforced event_slug presence) is dropped via introspection
 * since it auto-named by Postgres in the original migration.
 *
 * Spec: simplified QR onboarding flow — one general QR per event, no phone.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Allow NULL on the column. Existing rows keep their values; new
      // event-kind inserts can omit it.
      await db.rawQuery(`
        ALTER TABLE qr_links
        ALTER COLUMN owner_phone_number DROP NOT NULL
      `)

      // Drop the legacy unnamed CHECK constraint that enforced
      // "kind=event ⇔ event_slug NOT NULL". Postgres auto-named it (usually
      // `qr_links_check`) but we use introspection so the migration survives
      // any local naming variance.
      await db.rawQuery(`
        DO $$
        DECLARE
          cname text;
        BEGIN
          FOR cname IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'qr_links'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%event_slug%'
              AND conname NOT IN ('qr_links_kind_payload_check')
          LOOP
            EXECUTE format('ALTER TABLE qr_links DROP CONSTRAINT %I', cname);
          END LOOP;
        END $$
      `)

      // Add the new combined CHECK: enforces event_slug presence for events
      // AND owner_phone_number presence for pay. Named so future migrations
      // can target it directly.
      await db.rawQuery(`
        ALTER TABLE qr_links
        ADD CONSTRAINT qr_links_kind_payload_check CHECK (
          (kind = 'event' AND event_slug IS NOT NULL)
          OR (kind = 'pay' AND event_slug IS NULL AND owner_phone_number IS NOT NULL)
          OR (kind = 'referral' AND event_slug IS NULL)
        )
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      // Drop the named CHECK we added.
      await db.rawQuery(`
        ALTER TABLE qr_links
        DROP CONSTRAINT IF EXISTS qr_links_kind_payload_check
      `)

      // Re-create the legacy CHECK (event_slug presence only).
      await db.rawQuery(`
        ALTER TABLE qr_links
        ADD CHECK (
          (kind = 'event' AND event_slug IS NOT NULL)
          OR (kind IN ('pay', 'referral') AND event_slug IS NULL)
        )
      `)

      // Restore NOT NULL on owner_phone_number. NOTE: this will fail if any
      // event-kind rows minted post-migration have null owner_phone_number.
      // Down migration is best-effort for rollback in dev; not designed to
      // survive prod data drift.
      await db.rawQuery(`
        ALTER TABLE qr_links
        ALTER COLUMN owner_phone_number SET NOT NULL
      `)
    })
  }
}
