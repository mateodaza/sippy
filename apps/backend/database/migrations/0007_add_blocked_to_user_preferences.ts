import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE user_preferences ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT false
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE user_preferences DROP COLUMN blocked
      `)
    })
  }
}
