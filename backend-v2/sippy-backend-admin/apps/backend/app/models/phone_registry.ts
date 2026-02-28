import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class PhoneRegistry extends BaseModel {
  static table = 'phone_registry'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare phoneNumber: string

  @column()
  declare cdpWalletName: string

  @column()
  declare walletAddress: string

  @column()
  declare createdAt: number

  @column()
  declare lastActivity: number

  @column()
  declare dailySpent: number

  @column()
  declare lastResetDate: string

  @column()
  declare spendPermissionHash: string | null

  @column()
  declare dailyLimit: number | null

  @column()
  declare permissionCreatedAt: number | null
}
