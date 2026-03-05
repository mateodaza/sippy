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
  declare createdAt: bigint | number

  @column()
  declare lastActivity: bigint | number

  /** NUMERIC(18,6) — pg driver returns string to preserve precision */
  @column()
  declare dailySpent: string

  @column()
  declare lastResetDate: string

  @column()
  declare spendPermissionHash: string | null

  /** DECIMAL(18,6) — pg driver returns string to preserve precision */
  @column()
  declare dailyLimit: string | null

  @column()
  declare permissionCreatedAt: bigint | number | null
}
