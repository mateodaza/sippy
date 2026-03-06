import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GasRefuelStatus extends BaseModel {
  static connection = 'indexer'
  static table = 'gas_refuel_status'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column({ columnName: 'total_refuels' })
  declare totalRefuels: number

  @column({ columnName: 'total_eth_spent' })
  declare totalEthSpent: bigint

  @column({ columnName: 'is_paused' })
  declare isPaused: boolean

  @column({ columnName: 'last_refuel_at' })
  declare lastRefuelAt: number
}
