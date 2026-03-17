import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Account extends BaseModel {
  static connection = 'indexer'
  static table = 'account'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare address: string

  @column()
  declare balance: bigint

  @column({ columnName: 'total_sent' })
  declare totalSent: bigint

  @column({ columnName: 'total_received' })
  declare totalReceived: bigint

  @column({ columnName: 'tx_count' })
  declare txCount: number

  @column({ columnName: 'last_activity' })
  declare lastActivity: number
}
