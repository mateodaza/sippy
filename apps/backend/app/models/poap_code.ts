import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * One pre-generated POAP claim URL in the per-event pool.
 *
 * Lifecycle:
 *  - Created via seeder before the event, `assigned_to_phone = NULL`.
 *  - Atomically claimed by `claimPendingPoapInvite` on first Pay-QR pay
 *    by an attendee: `assigned_to_phone` + `assigned_at` set together.
 *  - Released by `releasePoapInvite` when the WhatsApp DM fails — both
 *    fields reset to NULL so the code returns to the pool.
 */
export default class PoapCode extends BaseModel {
  static table = 'poap_codes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare eventId: string

  @column()
  declare claimUrl: string

  @column()
  declare assignedToPhone: string | null

  @column.dateTime()
  declare assignedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
