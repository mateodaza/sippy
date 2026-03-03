import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WebSendLog extends BaseModel {
  static table = 'web_send_log'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare phoneHash: string

  @column()
  declare walletAddress: string

  @column()
  declare toAddress: string

  @column()
  declare amount: string

  @column()
  declare txHash: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
