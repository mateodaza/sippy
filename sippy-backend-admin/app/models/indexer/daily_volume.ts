import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class DailyVolume extends BaseModel {
  static connection = 'indexer'
  static table = 'daily_volume'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare date: string

  @column({ columnName: 'totalUsdcVolume' })
  declare totalUsdcVolume: bigint

  @column({ columnName: 'transferCount' })
  declare transferCount: number

  @column({ columnName: 'gasRefuelCount' })
  declare gasRefuelCount: number

  @column({ columnName: 'gasEthSpent' })
  declare gasEthSpent: bigint
}
