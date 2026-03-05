import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Account extends BaseModel {
  static connection = 'indexer'
  static table = 'account'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare address: string

  @column()
  declare balance: bigint

  @column({ columnName: 'totalSent' })
  declare totalSent: bigint

  @column({ columnName: 'totalReceived' })
  declare totalReceived: bigint

  @column({ columnName: 'txCount' })
  declare txCount: number

  @column({ columnName: 'lastActivity' })
  declare lastActivity: number
}
