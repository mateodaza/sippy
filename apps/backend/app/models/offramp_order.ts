import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OfframpOrder extends BaseModel {
  static table = 'offramp_orders'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phoneNumber: string

  @column()
  declare externalId: string

  @column()
  declare colursQuoteId: string | null

  @column()
  declare colursMovementId: string | null

  @column()
  declare bankAccountId: number

  @column()
  declare amountUsdc: string

  @column()
  declare amountCop: string | null

  @column()
  declare exchangeRate: string | null

  @column()
  declare pullTxHash: string | null

  @column()
  declare status: string

  @column()
  declare error: string | null

  @column.dateTime()
  declare polledAt: DateTime | null

  @column()
  declare pollCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
