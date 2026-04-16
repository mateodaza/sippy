import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ColursKyc extends BaseModel {
  static table = 'colurs_kyc'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare phoneNumber: string

  @column()
  declare fullname: string | null

  @column()
  declare idType: string | null

  @column()
  declare idNumber: string | null

  @column()
  declare email: string | null

  @column()
  declare colursUserId: number | null

  @column()
  declare counterpartyId: string | null

  @column()
  declare kycLevel: number

  @column()
  declare kycStatus: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
