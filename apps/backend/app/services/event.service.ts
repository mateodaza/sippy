/**
 * Event Service
 *
 * Looks up server-side configured events and links onboarded users to them
 * at the end of /setup. See EVENT_ONBOARDING_PLAN.md.
 */

import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Event from '#models/event'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { maskPhone } from '#utils/phone'

export type LinkResult =
  | { linked: false }
  | {
      linked: true
      event: { slug: string; name: string; endsAt: string | null }
      actions: string[]
      poapClaimUrl: string | null
    }

/**
 * Returns the event if it exists, is active, and inside its date window
 * (if a window is configured). Returns null otherwise — callers should
 * treat that as "silent reject" and not leak which slugs exist.
 */
export async function getActiveEventBySlug(slug: string): Promise<Event | null> {
  const event = await Event.findBy('slug', slug)
  if (!event) return null
  if (!event.active) return null

  const now = DateTime.now()
  if (event.startsAt && now < event.startsAt) return null
  if (event.endsAt && now > event.endsAt) return null

  return event
}

/**
 * Idempotently links a phone to an event by slug.
 *
 * Returns `{ linked: false }` for unknown/inactive/expired slugs — the caller
 * should surface this as a no-op success to the user (don't leak existence).
 */
export async function linkUserToEvent(phoneNumber: string, slug: string): Promise<LinkResult> {
  const event = await getActiveEventBySlug(slug)
  if (!event) {
    logger.info(`event.link skipped — unknown/inactive slug=${slug}`)
    return { linked: false }
  }

  const prefKey = await resolveUserPrefKey(phoneNumber)

  // Composite PK (phone_number, event_id) lives at the DB level; Lucid can't
  // represent it cleanly, so we upsert via raw SQL. DO NOTHING is correct for
  // now — repeated link calls are no-ops since `linked_at_step` doesn't change.
  await db.rawQuery(
    `INSERT INTO user_event_links (phone_number, event_id, linked_at_step)
     VALUES (?, ?, ?)
     ON CONFLICT (phone_number, event_id) DO NOTHING`,
    [prefKey, event.id, 'done']
  )

  logger.info(`event.link ${event.slug} <- ${maskPhone(prefKey)}`)

  const actions: string[] = []
  if (event.poapClaimUrl) actions.push('poap')
  if (event.welcomeMessage) actions.push('welcome')

  return {
    linked: true,
    event: {
      slug: event.slug,
      name: event.name,
      endsAt: event.endsAt ? event.endsAt.toISO() : null,
    },
    actions,
    poapClaimUrl: event.poapClaimUrl,
  }
}
