import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ColursBankAccount extends BaseModel {
  static table = 'colurs_bank_accounts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare phoneNumber: string

  @column()
  declare colursId: string

  @column()
  declare holderName: string

  @column()
  declare documentType: string

  @column()
  declare documentNumber: string

  @column()
  declare accountNumber: string

  @column()
  declare accountType: string

  @column()
  declare bankId: number

  @column()
  declare bankName: string | null

  @column()
  declare countryCode: string

  @column()
  declare isDefault: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
