import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GasRefuelStatus extends BaseModel {
  static connection = 'indexer'
  static table = 'gas_refuel_status'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'totalRefuels' })
  declare totalRefuels: number

  @column({ columnName: 'totalEthSpent' })
  declare totalEthSpent: bigint

  @column({ columnName: 'isPaused' })
  declare isPaused: boolean

  @column({ columnName: 'lastRefuelAt' })
  declare lastRefuelAt: number
}
