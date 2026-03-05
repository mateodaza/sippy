import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class RefuelEvent extends BaseModel {
  static connection = 'indexer'
  static table = 'refuel_event'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user: string

  @column()
  declare amount: bigint

  @column()
  declare timestamp: number

  @column({ columnName: 'blockNumber' })
  declare blockNumber: number

  @column({ columnName: 'txHash' })
  declare txHash: string
}
