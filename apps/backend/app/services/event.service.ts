/**
 * Event Service
 *
 * Looks up server-side configured events and links onboarded users to them
 * at the end of /setup.
 */

import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { type LinkedAtStep, type LinkEventResponse } from '@sippy/shared'
import Event from '#models/event'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { maskPhone } from '#utils/phone'

// Re-export the wire types so existing internal imports (`#services/event.service`)
// keep working without each consumer needing to know about `@sippy/shared`.
export type { LinkedAtStep, LinkEventResponse }

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
export async function linkUserToEvent(
  phoneNumber: string,
  slug: string,
  linkedAtStep: LinkedAtStep = 'done',
  source: string | null = null
): Promise<LinkEventResponse> {
  const event = await getActiveEventBySlug(slug)
  if (!event) {
    logger.info(`event.link skipped — unknown/inactive slug=${slug}`)
    return { linked: false }
  }

  const prefKey = await resolveUserPrefKey(phoneNumber)

  // Composite PK (phone_number, event_id) lives at the DB level; Lucid can't
  // represent it cleanly, so we upsert via raw SQL. DO NOTHING preserves the
  // ORIGINAL `linked_at_step` and metadata on re-link — first contact wins.
  // That way a user who completed onboarding at the booth ('done', source=
  // 'qr-booth') stays attributed correctly even if they hit a Twitter link
  // later. Same row, same first-source.
  const metadata = source ? JSON.stringify({ source }) : null
  await db.rawQuery(
    `INSERT INTO user_event_links (phone_number, event_id, linked_at_step, metadata)
     VALUES (?, ?, ?, ?::jsonb)
     ON CONFLICT (phone_number, event_id) DO NOTHING`,
    [prefKey, event.id, linkedAtStep, metadata]
  )

  // Read back the row so we return the canonical state (esp. the original
  // linked_at_step, which DO NOTHING preserves on conflict, and poap_claimed
  // which may already be true from a prior claim).
  const row = await db.rawQuery(
    `SELECT linked_at_step, poap_claimed
     FROM user_event_links
     WHERE phone_number = ? AND event_id = ?`,
    [prefKey, event.id]
  )
  const stored = row.rows?.[0] as
    | { linked_at_step: LinkedAtStep | null; poap_claimed: boolean }
    | undefined

  logger.info(
    `event.link ${event.slug} <- ${maskPhone(prefKey)} (step=${linkedAtStep}${source ? `, source=${source}` : ''})`
  )

  const actions: string[] = []
  if (event.poapClaimUrl) actions.push('poap')

  return {
    linked: true,
    event: {
      slug: event.slug,
      name: event.name,
      endsAt: event.endsAt ? event.endsAt.toISO() : null,
    },
    actions,
    poapClaimUrl: event.poapClaimUrl,
    poapClaimed: stored?.poap_claimed ?? false,
    linkedAtStep: stored?.linked_at_step ?? linkedAtStep,
  }
}

/**
 * Outcome of a markPoapClaimed call. Distinguishes the three real cases so
 * the UI can react correctly: actually claimed, idempotent re-click, or the
 * user isn't linked at all (don't lie that we recorded it).
 */
export type PoapClaimResult =
  | { status: 'claimed' }
  | { status: 'already-claimed' }
  | { status: 'not-linked' }

/**
 * Marks the user's POAP claim for an event as done. Stamps both the boolean
 * flag and the timestamp atomically.
 *
 * Returns:
 *  - 'claimed'         — link row existed, we just flipped poap_claimed → true
 *  - 'already-claimed' — link row existed and was already true (idempotent)
 *  - 'not-linked'      — no link row (or unknown/inactive event); nothing recorded
 */
export async function markPoapClaimed(phoneNumber: string, slug: string): Promise<PoapClaimResult> {
  const event = await getActiveEventBySlug(slug)
  if (!event) return { status: 'not-linked' }

  const prefKey = await resolveUserPrefKey(phoneNumber)

  // RETURNING 1 lets us read "did the conditional update match" off rows.length
  // without depending on driver-specific rowCount semantics. The disambiguation
  // SELECT only fires when the UPDATE missed.
  const updateResult = await db.rawQuery(
    `UPDATE user_event_links
     SET poap_claimed = TRUE, poap_claimed_at = COALESCE(poap_claimed_at, now())
     WHERE phone_number = ? AND event_id = ? AND poap_claimed = FALSE
     RETURNING 1`,
    [prefKey, event.id]
  )

  if ((updateResult.rows?.length ?? 0) > 0) {
    logger.info(`event.poap-claimed ${event.slug} <- ${maskPhone(prefKey)}`)
    return { status: 'claimed' }
  }

  // Update missed — either no link row or already claimed. Disambiguate.
  const existing = await db.rawQuery(
    `SELECT 1 FROM user_event_links WHERE phone_number = ? AND event_id = ? LIMIT 1`,
    [prefKey, event.id]
  )
  if ((existing.rows?.length ?? 0) > 0) return { status: 'already-claimed' }
  return { status: 'not-linked' }
}
