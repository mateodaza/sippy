import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ExportAuditLog extends BaseModel {
  static table = 'export_audit_log'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare attemptId: string

  @column()
  declare event: string

  @column()
  declare phoneHash: string

  @column()
  declare walletAddress: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
