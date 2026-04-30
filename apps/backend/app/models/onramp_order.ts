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
  declare idempotencyKey: string | null

  @column()
  declare paymentLink: string | null

  @column()
  declare trackingKey: string | null

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

  // ── COP→USDT dispersion (post R2P, pre LiFi) ──────────────────────────────

  @column()
  declare colursDispersionQuoteId: string | null

  @column()
  declare colursDispersionQuoteUuid: string | null

  @column()
  declare colursDispersionMovementId: string | null

  @column.dateTime()
  declare dispersionPolledAt: DateTime | null

  @column()
  declare dispersionPollCount: number

  @column()
  declare fxRateCopUsd: string | null

  @column()
  declare usdtAmountReceived: string | null

  @column()
  declare usdtTxHash: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
