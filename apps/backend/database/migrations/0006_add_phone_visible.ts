import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE user_preferences ADD COLUMN phone_visible BOOLEAN NOT NULL DEFAULT true
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE user_preferences DROP COLUMN phone_visible
      `)
    })
  }
}
