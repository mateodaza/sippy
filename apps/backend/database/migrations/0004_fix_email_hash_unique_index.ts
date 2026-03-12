import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_preferences'

  async up() {
    // Drop the unconditional unique index on email_hash.
    // An unconditional unique allows email squatting: an attacker can claim
    // someone else's email (unverified) and block the real owner from linking it.
    // Replace with a partial unique index that only enforces uniqueness for
    // verified emails — unverified claims don't block other accounts.
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['email_hash'])
    })

    // Partial unique index: only one verified account per email hash
    this.defer(async (db) => {
      await db.rawQuery(
        `CREATE UNIQUE INDEX user_preferences_email_hash_verified_unique
         ON ${this.tableName} (email_hash)
         WHERE email_verified = true`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP INDEX IF EXISTS user_preferences_email_hash_verified_unique')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['email_hash'])
    })
  }
}
