import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pending_invites'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.text('sender_phone').notNullable()
      table.text('recipient_phone').notNullable()
      table.text('status').notNullable().defaultTo('pending')
      table.bigint('created_at').notNullable()
      table.bigint('expires_at').notNullable()
      table.bigint('claimed_at').nullable()
      table.bigint('notified_at').nullable()

      table.index(['recipient_phone', 'status'])
      table.index(['sender_phone', 'created_at'])
    })

    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invites_active
        ON pending_invites (sender_phone, recipient_phone)
        WHERE status = 'pending'
      `)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
