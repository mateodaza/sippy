import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Event-linked onboarding.
 *
 * events             — server-side configured events (Pizza Day, ETHConf booth, etc.)
 * user_event_links   — ties a phone_number to an event at the end of /setup
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS events (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slug             TEXT UNIQUE NOT NULL,
          name             TEXT NOT NULL,
          description      TEXT,
          starts_at        TIMESTAMPTZ,
          ends_at          TIMESTAMPTZ,
          poap_claim_url   TEXT,
          welcome_message  JSONB,
          active           BOOLEAN NOT NULL DEFAULT true,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)

      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS user_event_links (
          phone_number     TEXT NOT NULL REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
          event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          linked_at_step   TEXT,
          poap_claimed_at  TIMESTAMPTZ,
          poap_tx_or_id    TEXT,
          metadata         JSONB,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (phone_number, event_id)
        )
      `)

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_user_event_links_event ON user_event_links(event_id)`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP TABLE IF EXISTS user_event_links')
      await db.rawQuery('DROP TABLE IF EXISTS events')
    })
  }
}
