import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { LinkedAtStep } from '#services/event.service'

/**
 * The underlying table has a composite PRIMARY KEY (phone_number, event_id)
 * enforced at the database level. Lucid's BaseModel only supports a single
 * primary key, so we declare `phoneNumber` here for read-side helpers
 * (find/findBy) and rely on a raw INSERT ... ON CONFLICT for idempotent
 * upserts — see event.service.ts.
 *
 * `linkedAtStep` is also gated by a CHECK constraint in the migration so
 * arbitrary strings can't be inserted directly via raw SQL.
 */
export default class UserEventLink extends BaseModel {
  static table = 'user_event_links'

  @column({ isPrimary: true })
  declare phoneNumber: string

  @column()
  declare eventId: string

  @column()
  declare linkedAtStep: LinkedAtStep | null

  @column()
  declare poapClaimed: boolean

  @column.dateTime()
  declare poapClaimedAt: DateTime | null

  @column()
  declare poapTxOrId: string | null

  @column.dateTime()
  declare poapInviteSentAt: DateTime | null

  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
  })
  declare metadata: Record<string, unknown> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
