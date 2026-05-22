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
import { VENUE_ATTENDANCE_SOURCES } from '#services/quest/scoring.service'

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
  // represent it cleanly, so we upsert via raw SQL.
  //
  // "First contact wins" is the default — DO UPDATE preserves the original
  // `linked_at_step` and metadata on re-link. So a user who completed
  // onboarding at the booth ('done', source='qr-booth') stays attributed
  // correctly even if they later tap a Twitter link.
  //
  // EXCEPTION — venue source upgrade (added 2026-05-21 for Pizza Day):
  // when the incoming source is 'venue' AND the stored source is missing
  // or non-venue, upgrade `metadata.source` to 'venue'. Without this,
  // anyone who was pre-linked via a deep-link or social tap (source=NULL
  // or 'twitter') gets stuck failing the venue-source gate even after
  // they physically scan the venue QR on event day — they never earn
  // their Quest activity ticket, and any pending referrer they brought
  // in never gets credited via the attendance branch.
  //
  // Only `metadata.source` is updated; linked_at_step stays the original
  // value so "first contact wins" still applies to the step. Drain re-
  // fires after the upgrade if the new state satisfies the venue gate
  // (see below).
  const metadata = source ? JSON.stringify({ source }) : null
  await db.rawQuery(
    `INSERT INTO user_event_links (phone_number, event_id, linked_at_step, metadata)
     VALUES (?, ?, ?, ?::jsonb)
     ON CONFLICT (phone_number, event_id) DO UPDATE
       SET metadata = jsonb_set(
         COALESCE(user_event_links.metadata, '{}'::jsonb),
         '{source}',
         '"venue"'::jsonb
       )
       WHERE EXCLUDED.metadata->>'source' = 'venue'
         AND COALESCE(user_event_links.metadata->>'source', '') <> 'venue'`,
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
  // the user attended this event. Fires on any GENUINE attendance:
  //
  //   • 'done' — new user finished onboarding via the venue QR flow
  //     (bracket dispatcher deferred the link, /setup completed it).
  //   • 'returning' AND source ∈ venue allowlist — already-onboarded
  //     user physically scanned the venue QR.
  //
  // The 'returning + venue' branch closes the 2026-05-18 bug where a
  // viral-referral attendee (signs up via /r/<code>, then attends) was
  // landing as `linked_at_step='returning'` and the original `done`-only
  // gate skipped drain — their referrer lost credit even though the
  // friend showed up. We use the same venue-source allowlist the scoring
  // CTE uses so the two write/read paths share one anti-farming rule.
  //
  // Off-venue 'returning' (Twitter/SMS deep-link tap from home) stays
  // out: drain shouldn't fire on a remote tap any more than it should
  // credit attendance. Same fail-closed posture as scoring.
  //
  // Best-effort: a drain failure must not break event linking (we'd
  // block onboarding over a bonus-mechanic write), so we swallow + log.
  // Idempotent: drainPendingReferral is a no-op when no pending row
  // exists, so re-calling on every venue link is safe.
  const isVenueAttendance =
    linkedAtStep === 'done' ||
    (linkedAtStep === 'returning' &&
      source !== null &&
      (VENUE_ATTENDANCE_SOURCES as readonly string[]).includes(source))

  if (isVenueAttendance) {
    try {
      // Drain uses the pending row's own event_slug (the campaign the
      // referee was captured under), not this event slug. linkUserToEvent
      // is now a best-effort fallback for users who never visit /setup —
      // primary drain is at /setup completion (see auth flow), which fires
      // even for referees who join Sippy but never attend any event.
      await drainPendingReferral(prefKey)
    } catch (err) {
      logger.error(
        { err, phone: maskPhone(prefKey), eventSlug: event.slug },
        'event.link: drainPendingReferral failed (non-fatal)'
      )
    }
  }

  // `actions: ['poap']` here means "show the static Claim-POAP button on
  // /setup with `poapClaimUrl` as its href" — the LEGACY shared-URL
  // delivery model. Events that use the per-attendee pool (poap_codes
  // table, e.g. Pizza Day) deliberately DO NOT surface here: their POAP
  // is delivered post-payment via WhatsApp DM by sendPoapInviteIfPending,
  // not via the /setup web button. /setup correctly reports "no static
  // POAP" for pool events; the DM closes the loop after the user pays.
  // If you ever want /setup to advertise pool-event POAP availability
  // ("you'll get yours by WhatsApp when you pay"), the change is here:
  // add a parallel action that signals DM-delivery without a URL.
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
 * Outcome of a `findAssignedPoapForPhone` call:
 *
 *  - `assigned`     — we found a claim URL to send. Source is either the
 *                     per-attendee pool (`poap_codes.assigned_to_phone`)
 *                     or the legacy shared URL (`events.poap_claim_url`,
 *                     gated on `user_event_links.poap_invite_sent_at`).
 *  - `pool_pending` — user is linked to an active pool-using event but no
 *                     code has been assigned to them yet (pool exhausted,
 *                     not paid yet, or a send-then-release roundtrip). We
 *                     can't show a URL — caller should use the "POAP on
 *                     the way / pool restock pending" copy instead of
 *                     the generic "not qualified yet" message.
 *  - `none`         — no assignment and no active-event link. Caller uses
 *                     the generic "get paid at the event" fallback.
 *
 * Both `assigned` paths return one row (latest first). Multi-event is
 * deliberately deferred — see POAP_POOL_PLAN.md "Deferred: multi-event
 * lookup" for the upgrade plan when a second event runs concurrently.
 */
export type PoapLookupOutcome =
  | { kind: 'assigned'; claimUrl: string; eventName: string }
  | { kind: 'pool_pending'; eventName: string }
  | { kind: 'none' }

/**
 * Look up the latest POAP claim link already assigned to a phone, if any.
 * Used by the WhatsApp `poap_code` handler so a user who lost the original
 * claim DM can ask the bot ("mi poap") and get it re-sent inline.
 *
 * Covers BOTH delivery models:
 *  - Pool path: per-attendee row in `poap_codes` with `assigned_to_phone`
 *  - Legacy path: shared `events.poap_claim_url`, gated by the per-user
 *    `user_event_links.poap_invite_sent_at` stamp (so we don't surface
 *    the shared URL to users who never qualified for it)
 *
 * When neither path returns a URL but the user IS linked to an active
 * event, we return `pool_pending` so the caller can pick honest copy
 * instead of the misleading "not qualified yet" line.
 */
export async function findAssignedPoapForPhone(phoneNumber: string): Promise<PoapLookupOutcome> {
  const prefKey = await resolveUserPrefKey(phoneNumber)

  // Pool path. Most events use this; check first because it has the per-
  // user URL. `assigned_at IS NOT NULL` is defensive — paired with
  // `assigned_to_phone` in the same UPDATE, but a future back-fill could
  // split them.
  const poolRes = await db.rawQuery(
    `SELECT pc.claim_url, e.name AS event_name
     FROM poap_codes pc
     JOIN events e ON e.id = pc.event_id
     WHERE pc.assigned_to_phone = ?
       AND pc.assigned_at IS NOT NULL
     ORDER BY pc.assigned_at DESC
     LIMIT 1`,
    [prefKey]
  )
  const poolRow = poolRes.rows?.[0] as { claim_url: string; event_name: string } | undefined
  if (poolRow) {
    return { kind: 'assigned', claimUrl: poolRow.claim_url, eventName: poolRow.event_name }
  }

  // Legacy path: shared `events.poap_claim_url`, with the per-user link
  // stamp as the qualification gate. `claimPendingPoapInvite`'s legacy
  // branch stamps `poap_invite_sent_at` and uses the shared URL; nothing
  // is written to `poap_codes` (see `releasePoapInvite` comment). We
  // require the URL to still be set on the event row in case ops nulls
  // it post-event.
  const legacyRes = await db.rawQuery(
    `SELECT e.poap_claim_url AS claim_url, e.name AS event_name
     FROM user_event_links uel
     JOIN events e ON e.id = uel.event_id
     WHERE uel.phone_number = ?
       AND uel.poap_invite_sent_at IS NOT NULL
       AND e.poap_claim_url IS NOT NULL
     ORDER BY uel.poap_invite_sent_at DESC
     LIMIT 1`,
    [prefKey]
  )
  const legacyRow = legacyRes.rows?.[0] as { claim_url: string; event_name: string } | undefined
  if (legacyRow) {
    return { kind: 'assigned', claimUrl: legacyRow.claim_url, eventName: legacyRow.event_name }
  }

  // No URL to send. Distinguish "linked to an active pool event but no
  // code yet" from "not linked at all" so the caller can pick honest copy.
  // A linked-but-no-code state covers: (a) pool exhausted, (b) not paid
  // yet at the event, (c) a send-then-release roundtrip. We don't try
  // to discriminate further — the copy for all three reads the same
  // ("your POAP is on the way / pool is filling").
  const linkedRes = await db.rawQuery(
    `SELECT e.name AS event_name
     FROM user_event_links uel
     JOIN events e ON e.id = uel.event_id
     WHERE uel.phone_number = ?
       AND e.active = TRUE
       AND (e.starts_at IS NULL OR e.starts_at <= now())
       AND (e.ends_at IS NULL OR e.ends_at >= now())
       AND EXISTS(SELECT 1 FROM poap_codes pc WHERE pc.event_id = e.id)
     ORDER BY uel.created_at DESC
     LIMIT 1`,
    [prefKey]
  )
  const linkedRow = linkedRes.rows?.[0] as { event_name: string } | undefined
  if (linkedRow) {
    return { kind: 'pool_pending', eventName: linkedRow.event_name }
  }

  return { kind: 'none' }
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
 *  - `reserved`       — exactly one eligible row found + atomically stamped;
 *                       caller should send the WhatsApp DM with the URL.
 *  - `pool_exhausted` — event uses a per-attendee pool and every code is
 *                       already assigned. `poap_invite_sent_at` is NOT
 *                       stamped so a restock makes the user eligible again.
 *  - `contended`      — eligible row existed but the `FOR UPDATE … SKIP
 *                       LOCKED` guard handed it to a parallel call.
 *  - `none`           — phone isn't linked to any eligible event right now.
 */
export type PoapInviteOutcome =
  | {
      kind: 'reserved'
      reservation: { eventName: string; eventSlug: string; poapClaimUrl: string }
    }
  | { kind: 'pool_exhausted'; eventName: string; eventSlug: string }
  | { kind: 'contended' }
  | { kind: 'none' }

/**
 * Atomically reserves a POAP claim-link invite for a phone. Two paths,
 * picked per-event:
 *
 *  - **Pool path** (event has ≥1 row in `poap_codes`): assigns the next
 *    unassigned code by FIFO (`ORDER BY pc.id LIMIT 1`). Both the link
 *    stamp and the code assignment happen in the same statement so they
 *    can't desync. If the pool is exhausted, the link is NOT stamped —
 *    a restock then re-opens the user as eligible.
 *
 *  - **Legacy path** (no `poap_codes` rows but `events.poap_claim_url`
 *    is set): single shared URL, stamps the link as before.
 *
 * Eligibility is otherwise unchanged: active event in its date window,
 * `poap_claimed = FALSE`, `poap_invite_sent_at IS NULL`. Both paths use
 * `FOR UPDATE … SKIP LOCKED` so concurrent payments by the same phone
 * fail closed (contended) rather than double-firing the DM.
 */
export async function claimPendingPoapInvite(phoneNumber: string): Promise<PoapInviteOutcome> {
  const prefKey = await resolveUserPrefKey(phoneNumber)

  // Phase 1 — eligibility + path selection.
  //
  // No locks here. Race-safe because phase 2 is the locking step; if a
  // parallel call locks the row between phases, phase 2 returns no rows
  // and we fall to the contended/none probe below. The `has_pool` flag
  // tells us whether to take the pool path or the legacy shared-URL
  // path; eligibility relaxes the URL requirement to "(has shared URL)
  // OR (event has a pool)" so pool-only events still qualify.
  // Eligibility includes an ORPHAN-STAMP heal path: when the event has a
  // pool AND the user's `poap_invite_sent_at` is set BUT no row in
  // `poap_codes` is actually assigned to them, treat them as eligible
  // again. This happens when the legacy shared-URL path stamped the
  // user before a pool was provisioned — the stamp is real but the
  // intended POAP delivery never landed. Phase 2 will re-stamp the now()
  // timestamp and atomically assign a fresh code in the same CTE.
  //
  // Note: the orphan check only applies to events that currently have a
  // pool. Pure-legacy events (no pool, just a shared URL) stay strictly
  // gated on `poap_invite_sent_at IS NULL` because there's nothing to
  // assign — the stamp itself is the delivery record.
  const eligible = await db.rawQuery(
    `SELECT uel.event_id, e.slug AS event_slug, e.name AS event_name,
            e.poap_claim_url AS shared_url,
            EXISTS(SELECT 1 FROM poap_codes pc WHERE pc.event_id = e.id) AS has_pool
     FROM user_event_links uel
     JOIN events e ON e.id = uel.event_id
     WHERE uel.phone_number = ?
       AND uel.poap_claimed = FALSE
       AND e.active = TRUE
       AND (e.starts_at IS NULL OR e.starts_at <= now())
       AND (e.ends_at IS NULL OR e.ends_at >= now())
       AND (
         e.poap_claim_url IS NOT NULL
         OR EXISTS(SELECT 1 FROM poap_codes pc2 WHERE pc2.event_id = e.id)
       )
       AND (
         uel.poap_invite_sent_at IS NULL
         OR (
           -- Orphan-stamp: pool event, stamped, no assignment.
           EXISTS(SELECT 1 FROM poap_codes pc3 WHERE pc3.event_id = e.id)
           AND NOT EXISTS(
             SELECT 1 FROM poap_codes pc4
             WHERE pc4.event_id = e.id
               AND pc4.assigned_to_phone = uel.phone_number
           )
         )
       )
     ORDER BY e.starts_at DESC NULLS LAST, uel.created_at DESC
     LIMIT 1`,
    [prefKey]
  )

  const target = eligible.rows?.[0] as
    | {
        event_id: string
        event_slug: string
        event_name: string
        shared_url: string | null
        has_pool: boolean
      }
    | undefined

  if (!target) {
    return { kind: 'none' }
  }

  if (target.has_pool) {
    // Pool path: lock the user_event_link AND the next unassigned code in
    // the same multi-CTE, stamp both atomically. If the pool is empty,
    // neither stamp fires (both UPDATEs depend on `FROM next_code`), so
    // the user stays eligible for restock.
    const poolRes = await db.rawQuery(
      `WITH eligible AS (
         SELECT uel.event_id, uel.phone_number
         FROM user_event_links uel
         JOIN events e ON e.id = uel.event_id
         WHERE uel.phone_number = ?
           AND uel.event_id = ?
           AND uel.poap_claimed = FALSE
           AND e.active = TRUE
           AND (e.starts_at IS NULL OR e.starts_at <= now())
           AND (e.ends_at IS NULL OR e.ends_at >= now())
           AND (
             uel.poap_invite_sent_at IS NULL
             OR NOT EXISTS(
               -- Orphan-stamp heal: stamped but no code assigned.
               SELECT 1 FROM poap_codes pc_self
               WHERE pc_self.event_id = uel.event_id
                 AND pc_self.assigned_to_phone = uel.phone_number
             )
           )
         LIMIT 1
         FOR UPDATE OF uel SKIP LOCKED
       ),
       next_code AS (
         SELECT pc.id, pc.claim_url
         FROM poap_codes pc, eligible
         WHERE pc.event_id = eligible.event_id
           AND pc.assigned_to_phone IS NULL
         ORDER BY pc.id
         LIMIT 1
         FOR UPDATE OF pc SKIP LOCKED
       ),
       stamp_link AS (
         UPDATE user_event_links uel
         SET poap_invite_sent_at = now()
         FROM eligible, next_code
         WHERE uel.event_id = eligible.event_id
           AND uel.phone_number = eligible.phone_number
         RETURNING 1
       ),
       assign_code AS (
         UPDATE poap_codes pc
         SET assigned_to_phone = ?, assigned_at = now()
         FROM next_code
         WHERE pc.id = next_code.id
         RETURNING pc.claim_url
       )
       SELECT
         (SELECT EXISTS(SELECT 1 FROM eligible)) AS eligible_locked,
         (SELECT claim_url FROM assign_code) AS claim_url`,
      [prefKey, target.event_id, prefKey]
    )

    const poolRow = poolRes.rows?.[0] as
      | { eligible_locked: boolean; claim_url: string | null }
      | undefined

    // No row means the SELECT itself failed structurally — defensive.
    if (!poolRow) return { kind: 'none' }

    if (!poolRow.eligible_locked) {
      // Couldn't lock the user_event_link (parallel claimer took it). The
      // existence of `target` from phase 1 means a row WAS eligible an
      // instant ago, so this is contention, not absence.
      logger.warn(
        `event.poap-invite-contended ${maskPhone(prefKey)} (parallel claim won the race, pool path)`
      )
      return { kind: 'contended' }
    }

    if (poolRow.claim_url) {
      logger.info(`event.poap-invite-reserved ${target.event_slug} -> ${maskPhone(prefKey)} (pool)`)
      return {
        kind: 'reserved',
        reservation: {
          eventName: target.event_name,
          eventSlug: target.event_slug,
          poapClaimUrl: poolRow.claim_url,
        },
      }
    }

    // Pool exhausted: link is locked but neither UPDATE fired (their FROM
    // included `next_code`, which returned no rows). poap_invite_sent_at
    // stays NULL → user is restock-eligible.
    logger.warn(`event.poap-invite-pool-exhausted ${target.event_slug} for ${maskPhone(prefKey)}`)
    return {
      kind: 'pool_exhausted',
      eventName: target.event_name,
      eventSlug: target.event_slug,
    }
  }

  // Legacy path: single shared URL, single-row reservation as before.
  const legacyRes = await db.rawQuery(
    `WITH eligible AS (
       SELECT uel.event_id, uel.phone_number, e.name, e.slug, e.poap_claim_url
       FROM user_event_links uel
       JOIN events e ON e.id = uel.event_id
       WHERE uel.phone_number = ?
         AND uel.event_id = ?
         AND uel.poap_invite_sent_at IS NULL
         AND uel.poap_claimed = FALSE
         AND e.poap_claim_url IS NOT NULL
         AND e.active = TRUE
         AND (e.starts_at IS NULL OR e.starts_at <= now())
         AND (e.ends_at IS NULL OR e.ends_at >= now())
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
    [prefKey, target.event_id]
  )

  const legacyRow = legacyRes.rows?.[0] as
    | { event_name: string; event_slug: string; poap_claim_url: string }
    | undefined

  if (legacyRow) {
    logger.info(
      `event.poap-invite-reserved ${legacyRow.event_slug} -> ${maskPhone(prefKey)} (legacy shared-url)`
    )
    return {
      kind: 'reserved',
      reservation: {
        eventName: legacyRow.event_name,
        eventSlug: legacyRow.event_slug,
        poapClaimUrl: legacyRow.poap_claim_url,
      },
    }
  }

  // Legacy path didn't lock the row → parallel call beat us.
  logger.warn(
    `event.poap-invite-contended ${maskPhone(prefKey)} (parallel claim won the race, legacy path)`
  )
  return { kind: 'contended' }
}

/**
 * Undo the reservation made by claimPendingPoapInvite. Called when the
 * WhatsApp send fails so the invite stays eligible for the next payment.
 *
 * Two writes (in a single transaction):
 *  1. Un-stamp `poap_invite_sent_at` on the user_event_link.
 *  2. Un-assign any pool code that was assigned to this phone for this
 *     event. The code goes back to the unassigned pool, ready for the
 *     next eligible payer.
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
  await db.transaction(async (trx) => {
    await trx.rawQuery(
      `UPDATE user_event_links uel
       SET poap_invite_sent_at = NULL
       FROM events e
       WHERE uel.event_id = e.id
         AND uel.phone_number = ?
         AND e.slug = ?`,
      [prefKey, args.eventSlug]
    )
    // Pool path only — un-assign any code held by this phone for this event.
    // Legacy events (no pool) get no rows touched here.
    await trx.rawQuery(
      `UPDATE poap_codes pc
       SET assigned_to_phone = NULL, assigned_at = NULL
       FROM events e
       WHERE pc.event_id = e.id
         AND pc.assigned_to_phone = ?
         AND e.slug = ?`,
      [prefKey, args.eventSlug]
    )
  })
}

/**
 * Look up the POAP claim URL ALREADY assigned to a phone for an event.
 *
 * Distinct from `claimPendingPoapInvite`: this one is read-only and does
 * NOT reserve anything. Returns the same URL on every call. Used by the
 * operator-drop orchestrator so repeat sends to the same attendee can
 * keep including the POAP link in the combined message — the link was
 * minted once on the first send, but the recipient may have lost the
 * earlier WhatsApp message, so resending it is useful.
 *
 * Two paths, identical to `claimPendingPoapInvite`:
 *   - Pool path: look up `poap_codes` where `assigned_to_phone = ?`.
 *   - Legacy path: if the event has a shared `poap_claim_url` AND the
 *     user_event_links row has `poap_invite_sent_at IS NOT NULL`, return
 *     the shared URL.
 *
 * Returns `null` when the phone has no POAP assignment for this event
 * (never invited, or pool-path event with no assignment yet).
 */
export async function getAssignedPoapClaimUrl(
  phoneNumber: string,
  eventSlug: string
): Promise<{ eventName: string; poapClaimUrl: string } | null> {
  const prefKey = await resolveUserPrefKey(phoneNumber)

  // Pool path: any assigned code for this phone + event.
  const poolRes = await db.rawQuery(
    `SELECT e.name AS event_name, pc.claim_url
     FROM poap_codes pc
     JOIN events e ON e.id = pc.event_id
     WHERE pc.assigned_to_phone = ?
       AND e.slug = ?
     LIMIT 1`,
    [prefKey, eventSlug]
  )
  const poolRow = poolRes.rows?.[0] as { event_name: string; claim_url: string } | undefined
  if (poolRow) {
    return { eventName: poolRow.event_name, poapClaimUrl: poolRow.claim_url }
  }

  // Legacy path: shared URL with an invite stamp.
  const legacyRes = await db.rawQuery(
    `SELECT e.name AS event_name, e.poap_claim_url
     FROM user_event_links uel
     JOIN events e ON e.id = uel.event_id
     WHERE uel.phone_number = ?
       AND e.slug = ?
       AND uel.poap_invite_sent_at IS NOT NULL
       AND e.poap_claim_url IS NOT NULL
     LIMIT 1`,
    [prefKey, eventSlug]
  )
  const legacyRow = legacyRes.rows?.[0] as
    | { event_name: string; poap_claim_url: string }
    | undefined
  if (legacyRow) {
    return { eventName: legacyRow.event_name, poapClaimUrl: legacyRow.poap_claim_url }
  }

  return null
}

/**
 * Diagnostic snapshot of a phone's POAP state for an event. Read-only;
 * never mutates state. Used by the admin debug endpoint to answer "why
 * didn't this user get a POAP" questions during/after an event.
 */
export interface PoapStatusSnapshot {
  phone: string
  eventSlug: string
  eventFound: boolean
  preferredLanguage: string | null
  link: {
    linkedAt: string
    linkedAtStep: string | null
    poapClaimed: boolean
    poapClaimedAt: string | null
    poapInviteSentAt: string | null
  } | null
  assignedCode: { claimUrl: string; assignedAt: string } | null
  poolStatus: {
    total: number
    unassigned: number
    assignedToThisPhone: number
  } | null
}

export async function getPoapStatusForPhone(
  phoneNumber: string,
  eventSlug: string
): Promise<PoapStatusSnapshot> {
  const prefKey = await resolveUserPrefKey(phoneNumber)

  const prefRes = await db.rawQuery(
    `SELECT preferred_language FROM user_preferences WHERE phone_number = ? LIMIT 1`,
    [prefKey]
  )
  const preferredLanguage =
    (prefRes.rows?.[0] as { preferred_language: string | null } | undefined)?.preferred_language ??
    null

  const eventRes = await db.rawQuery(`SELECT id FROM events WHERE slug = ? LIMIT 1`, [eventSlug])
  const eventRow = eventRes.rows?.[0] as { id: string } | undefined
  if (!eventRow) {
    return {
      phone: prefKey,
      eventSlug,
      eventFound: false,
      preferredLanguage,
      link: null,
      assignedCode: null,
      poolStatus: null,
    }
  }

  const linkRes = await db.rawQuery(
    `SELECT
       uel.created_at AS linked_at,
       uel.linked_at_step,
       uel.poap_claimed,
       uel.poap_claimed_at,
       uel.poap_invite_sent_at
     FROM user_event_links uel
     WHERE uel.phone_number = ? AND uel.event_id = ?
     LIMIT 1`,
    [prefKey, eventRow.id]
  )
  const linkRow = linkRes.rows?.[0] as
    | {
        linked_at: string
        linked_at_step: string | null
        poap_claimed: boolean
        poap_claimed_at: string | null
        poap_invite_sent_at: string | null
      }
    | undefined

  const codeRes = await db.rawQuery(
    `SELECT pc.claim_url, pc.assigned_at
     FROM poap_codes pc
     WHERE pc.event_id = ? AND pc.assigned_to_phone = ?
     LIMIT 1`,
    [eventRow.id, prefKey]
  )
  const codeRow = codeRes.rows?.[0] as { claim_url: string; assigned_at: string } | undefined

  const poolRes = await db.rawQuery(
    `SELECT
       COUNT(*) FILTER (WHERE assigned_to_phone IS NULL) AS unassigned,
       COUNT(*) FILTER (WHERE assigned_to_phone = ?) AS assigned_to_this_phone,
       COUNT(*) AS total
     FROM poap_codes
     WHERE event_id = ?`,
    [prefKey, eventRow.id]
  )
  const poolRow = poolRes.rows?.[0] as
    | {
        unassigned: string | number
        assigned_to_this_phone: string | number
        total: string | number
      }
    | undefined
  // Pool counters return strings for COUNT(*) on some PG drivers — coerce.
  const poolStatus =
    poolRow && Number(poolRow.total) > 0
      ? {
          total: Number(poolRow.total),
          unassigned: Number(poolRow.unassigned),
          assignedToThisPhone: Number(poolRow.assigned_to_this_phone),
        }
      : null

  return {
    phone: prefKey,
    eventSlug,
    eventFound: true,
    preferredLanguage,
    link: linkRow
      ? {
          linkedAt: linkRow.linked_at,
          linkedAtStep: linkRow.linked_at_step,
          poapClaimed: linkRow.poap_claimed,
          poapClaimedAt: linkRow.poap_claimed_at,
          poapInviteSentAt: linkRow.poap_invite_sent_at,
        }
      : null,
    assignedCode: codeRow ? { claimUrl: codeRow.claim_url, assignedAt: codeRow.assigned_at } : null,
    poolStatus,
  }
}
