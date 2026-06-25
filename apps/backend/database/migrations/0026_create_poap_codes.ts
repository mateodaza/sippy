import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * POAP code pool — one row per pre-generated unique POAP claim URL.
 *
 * Replaces the single shared URL approach (`events.poap_claim_url`) for
 * events where the organizer supplies a finite pool of mint links (e.g.
 * Pizza Day: 300 unique URLs, one per attendee).
 *
 * Assignment is atomic via `FOR UPDATE … SKIP LOCKED LIMIT 1` against the
 * partial index — see claimPendingPoapInvite in event.service.ts. Once
 * `assigned_to_phone` is set, the row is permanently associated with that
 * phone (release happens by setting both fields back to NULL on send
 * failure, never by deleting).
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS poap_codes (
          id                  SERIAL PRIMARY KEY,
          event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          claim_url           TEXT NOT NULL UNIQUE,
          assigned_to_phone   TEXT REFERENCES user_preferences(phone_number),
          assigned_at         TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      // Partial index: SKIP LOCKED scans only the unassigned slice. As codes
      // fill in over the event, the index shrinks → assignment stays cheap
      // even when 290/300 are taken.
      await db.rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_poap_codes_event_unassigned
        ON poap_codes(event_id)
        WHERE assigned_to_phone IS NULL
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP TABLE IF EXISTS poap_codes')
    })
  }
}
