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
import { drainPendingReferral } from '#services/quest/referral.service'

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

  // Sippy Quest — drain any pending referral attribution captured before
  // the user finished onboarding. Only fires on the 'done' transition
  // because that's the moment the FK row in user_preferences becomes
  // safe to reference from referral_attributions. Best-effort: a drain
  // failure must not break event linking (we'd block onboarding over a
  // bonus-mechanic write), so we swallow + log.
  //
  // Idempotent: drainPendingReferral is a no-op when no pending row
  // exists, so re-calling on every link is safe even though we expect
  // the row to vanish on the first 'done' link.
  if (linkedAtStep === 'done') {
    try {
      await drainPendingReferral(prefKey)
    } catch (err) {
      logger.error(
        { err, phone: maskPhone(prefKey), eventSlug: event.slug },
        'event.link: drainPendingReferral failed (non-fatal)'
      )
    }
  }

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

/**
 * Outcome of a `claimPendingPoapInvite` call.
 *  - `reserved`  — exactly one eligible row found + atomically stamped; caller
 *                  should send the WhatsApp DM.
 *  - `contended` — eligible row existed but the `FOR UPDATE … SKIP LOCKED`
 *                  guard handed it to a parallel call. Caller treats as a
 *                  silent no-op but ops can monitor the rate as a signal that
 *                  the user is double-paying within the same instant.
 *  - `none`      — phone simply isn't linked to any eligible event right now.
 */
export type PoapInviteOutcome =
  | {
      kind: 'reserved'
      reservation: { eventName: string; eventSlug: string; poapClaimUrl: string }
    }
  | { kind: 'contended' }
  | { kind: 'none' }

/**
 * Atomically reserves a POAP claim-link invite for a phone. Conditions: phone
 * is linked to an active event (within its date window), `poap_claim_url IS
 * NOT NULL`, POAP not yet claimed, and the invite hasn't already been sent.
 * Stamps `poap_invite_sent_at = now()` in the same UPDATE so two concurrent
 * successful sends can't double-fire the WhatsApp message.
 */
export async function claimPendingPoapInvite(phoneNumber: string): Promise<PoapInviteOutcome> {
  const prefKey = await resolveUserPrefKey(phoneNumber)

  // CTE picks exactly ONE eligible row (with `FOR UPDATE … SKIP LOCKED` so a
  // concurrent call for the same phone doesn't pick the same row), then the
  // outer UPDATE stamps `poap_invite_sent_at` on that single row. Without
  // LIMIT 1, every eligible event link gets stamped but only `rows[0]` is
  // delivered — silent data loss.
  //
  // Ordering: most-recently-started event first so the freshest invite
  // wins; falls back to user-event-link creation time for deterministic
  // tiebreak when starts_at is NULL.
  const res = await db.rawQuery(
    `WITH eligible AS (
       SELECT uel.event_id, uel.phone_number, e.name, e.slug, e.poap_claim_url
       FROM user_event_links uel
       JOIN events e ON e.id = uel.event_id
       WHERE uel.phone_number = ?
         AND uel.poap_invite_sent_at IS NULL
         AND uel.poap_claimed = FALSE
         AND e.active = TRUE
         AND e.poap_claim_url IS NOT NULL
         AND (e.starts_at IS NULL OR e.starts_at <= now())
         AND (e.ends_at IS NULL OR e.ends_at >= now())
       ORDER BY e.starts_at DESC NULLS LAST, uel.created_at DESC
       LIMIT 1
       FOR UPDATE OF uel SKIP LOCKED
     )
     UPDATE user_event_links uel
     SET poap_invite_sent_at = now()
     FROM eligible
     WHERE uel.event_id = eligible.event_id
       AND uel.phone_number = eligible.phone_number
     RETURNING eligible.name AS event_name,
               eligible.slug AS event_slug,
               eligible.poap_claim_url AS poap_claim_url`,
    [prefKey]
  )

  const row = res.rows?.[0] as
    | { event_name: string; event_slug: string; poap_claim_url: string }
    | undefined

  if (row) {
    logger.info(`event.poap-invite-reserved ${row.event_slug} -> ${maskPhone(prefKey)}`)
    return {
      kind: 'reserved',
      reservation: {
        eventName: row.event_name,
        eventSlug: row.event_slug,
        poapClaimUrl: row.poap_claim_url,
      },
    }
  }

  // UPDATE matched nothing. Two scenarios: (a) no eligible row exists at all,
  // (b) every eligible row is locked by a parallel claimant. Re-issue the
  // SELECT *without* the lock to disambiguate; if it returns a row, someone
  // else won the race. This is observability-only — caller still no-ops.
  const probe = await db.rawQuery(
    `SELECT 1
     FROM user_event_links uel
     JOIN events e ON e.id = uel.event_id
     WHERE uel.phone_number = ?
       AND uel.poap_invite_sent_at IS NULL
       AND uel.poap_claimed = FALSE
       AND e.active = TRUE
       AND e.poap_claim_url IS NOT NULL
       AND (e.starts_at IS NULL OR e.starts_at <= now())
       AND (e.ends_at IS NULL OR e.ends_at >= now())
     LIMIT 1`,
    [prefKey]
  )

  if ((probe.rows?.length ?? 0) > 0) {
    logger.warn(`event.poap-invite-contended ${maskPhone(prefKey)} (parallel claim won the race)`)
    return { kind: 'contended' }
  }

  return { kind: 'none' }
}

/**
 * Undo the reservation made by claimPendingPoapInvite. Called when the
 * WhatsApp send fails so the invite stays eligible for the next payment.
 *
 * Named-object args (vs positional) because both fields are strings and
 * swapping them silently no-ops the UPDATE — same pattern as captureReferral
 * elsewhere in the codebase. Race note: if a parallel claim arrives between
 * the failing send and this release, it sees `poap_invite_sent_at IS NOT NULL`
 * and no-ops; the release then wipes the reservation, but the parallel
 * claimer is already past the gate. Acceptable for this low-stakes path.
 */
export async function releasePoapInvite(args: {
  phoneNumber: string
  eventSlug: string
}): Promise<void> {
  const prefKey = await resolveUserPrefKey(args.phoneNumber)
  await db.rawQuery(
    `UPDATE user_event_links uel
     SET poap_invite_sent_at = NULL
     FROM events e
     WHERE uel.event_id = e.id
       AND uel.phone_number = ?
       AND e.slug = ?`,
    [prefKey, args.eventSlug]
  )
}
