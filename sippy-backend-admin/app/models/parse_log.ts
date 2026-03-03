import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ParseLog extends BaseModel {
  static table = 'parse_log'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: string

  @column()
  declare phoneNumber: string | null

  @column()
  declare parseSource: string

  @column()
  declare intent: string

  @column()
  declare model: string | null

  @column()
  declare promptTokens: number | null

  @column()
  declare completionTokens: number | null

  @column()
  declare latencyMs: number

  @column()
  declare status: string

  @column()
  declare detectedLanguage: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
