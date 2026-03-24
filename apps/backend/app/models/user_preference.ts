import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserPreference extends BaseModel {
  static table = 'user_preferences'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare phoneNumber: string

  @column()
  declare preferredLanguage: string | null

  @column()
  declare emailEncrypted: string | null

  @column()
  declare emailHash: string | null

  @column()
  declare emailVerified: boolean

  @column()
  declare phoneVisible: boolean

  @column()
  declare blocked: boolean

  @column.dateTime()
  declare tosAcceptedAt: DateTime | null

  @column()
  declare tosVersion: string | null

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  @column.dateTime()
  declare emailNudgeSentAt: DateTime | null

  @column.dateTime()
  declare setupNotifiedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
