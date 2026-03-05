import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class SippyWallet extends BaseModel {
  static connection = 'indexer'
  static table = 'offchain.sippy_wallet'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare address: string

  @column()
  declare phoneHash: string | null

  @column()
  declare registeredAt: number

  @column()
  declare isActive: boolean
}
