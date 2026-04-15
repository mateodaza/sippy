import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OnrampOrder extends BaseModel {
  static table = 'onramp_orders'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phoneNumber: string

  @column()
  declare externalId: string

  @column()
  declare colursPaymentId: string | null

  @column()
  declare method: string

  @column()
  declare amountCop: string

  @column()
  declare amountUsdt: string | null

  @column()
  declare depositAddress: string

  @column()
  declare status: string

  @column()
  declare lifiTxHash: string | null

  @column()
  declare usdcReceived: string | null

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
