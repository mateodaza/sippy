import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Transfer extends BaseModel {
  static connection = 'indexer'
  static table = 'transfer'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare from: string

  @column()
  declare to: string

  @column()
  declare amount: bigint

  @column()
  declare timestamp: number

  @column({ columnName: 'blockNumber' })
  declare blockNumber: number

  @column({ columnName: 'txHash' })
  declare txHash: string
}
