import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class UserPreference extends BaseModel {
  static table = 'user_preferences'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare phoneNumber: string

  @column()
  declare preferredLanguage: string | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
