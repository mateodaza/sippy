import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE user_event_links
         ADD COLUMN IF NOT EXISTS poap_invite_sent_at TIMESTAMPTZ`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`ALTER TABLE user_event_links DROP COLUMN IF EXISTS poap_invite_sent_at`)
    })
  }
}
