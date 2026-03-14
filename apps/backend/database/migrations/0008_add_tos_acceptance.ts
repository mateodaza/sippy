import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_preferences'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('tos_accepted_at').nullable()
      table.string('tos_version', 16).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tos_accepted_at')
      table.dropColumn('tos_version')
    })
  }
}
