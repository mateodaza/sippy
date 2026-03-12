import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_preferences'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('email_encrypted').nullable()
      table.text('email_hash').nullable().unique()
      table.boolean('email_verified').defaultTo(false).notNullable()
      table.timestamp('email_verified_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('email_encrypted')
      table.dropColumn('email_hash')
      table.dropColumn('email_verified')
      table.dropColumn('email_verified_at')
    })
  }
}
