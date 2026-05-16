/**
 * Admin Events Controller
 *
 * Live monitoring surface for the Pizza Day event (and any future event with
 * onboarding attribution). Renders an Inertia page that the operator opens
 * during the event to watch onboarding land in near-real-time, broken down
 * by assistant (`source_tag`).
 *
 * Routes:
 *   GET /admin/events/:slug/attendees  — counts + paginated attendee list
 *
 * Auth: protected by the admin group's `auth({ guards: ['web'] })`. Same
 * cookie-based session as the other admin pages — no separate token.
 *
 * Response contract: when `Accept: application/json` is sent, returns the
 * same payload as JSON so Mateo's separate live dashboard can poll it from
 * apps/web without re-implementing the queries.
 *
 * Spec: PIZZA_DAY_PLAN.md — "Admin endpoint: GET /admin/events/:slug/attendees".
 */

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Event from '#models/event'

const DEFAULT_PER_PAGE = 50
const MAX_PER_PAGE = 200

interface AttendeeRow {
  phone_number: string
  linked_at_step: string | null
  poap_claimed: boolean
  poap_claimed_at: string | null
  metadata: { source?: string } | null
  created_at: string
}

interface AttendeePayload {
  phoneNumber: string
  linkedAtStep: string | null
  source: string | null
  poapClaimed: boolean
  poapClaimedAt: string | null
  linkedAt: string
}

interface AttendeesProps {
  event: {
    slug: string
    name: string
    endsAt: string | null
    active: boolean
  }
  counts: {
    total: number
    byStep: { done: number; returning: number; unknown: number }
    bySource: Array<{ source: string | null; count: number }>
    poap: { claimed: number; unclaimed: number }
  }
  attendees: {
    data: AttendeePayload[]
    meta: {
      page: number
      perPage: number
      total: number
      lastPage: number
    }
  }
}

export default class EventsController {
  /**
   * GET /admin/events/:slug/attendees
   *
   * 404s when the event doesn't exist. Pagination via `?page=` and `?perPage=`
   * (capped at MAX_PER_PAGE). Counts are computed against the full event
   * cohort regardless of pagination — they're cohort-level aggregates, not a
   * window over the paginated rows.
   */
  async attendees({ params, request, response, inertia }: HttpContext) {
    const slug = String(params.slug ?? '').trim()
    if (!slug) {
      return response.badRequest({ error: 'Missing :slug' })
    }

    const event = await Event.findBy('slug', slug)
    if (!event) {
      return response.notFound({ error: `Event '${slug}' not found` })
    }

    // Use Number.isNaN to distinguish "explicitly 0/negative" from "unparseable"
    // — a `|| DEFAULT` short-circuit would mistakenly treat ?perPage=0 as if the
    // param was missing and silently return 50 rows. Clamp explicit zeroes to 1
    // instead so the caller's intent (small page) is honored even if degenerate.
    const pageRaw = Number.parseInt(String(request.input('page', '1')), 10)
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw)
    const perPageRaw = Number.parseInt(
      String(request.input('perPage', String(DEFAULT_PER_PAGE))),
      10
    )
    const perPage = Number.isNaN(perPageRaw)
      ? DEFAULT_PER_PAGE
      : Math.min(MAX_PER_PAGE, Math.max(1, perPageRaw))

    // Total count + step breakdown in one round-trip. linked_at_step is
    // TEXT with a CHECK constraint locking it to ('done', 'returning') so
    // the only "unknown" rows are pre-CHECK historical inserts (none in
    // prod today, but we surface the bucket so a future drift is visible
    // rather than silently miscounted).
    const stepRows = (await db
      .from('user_event_links')
      .where('event_id', event.id)
      .select('linked_at_step')
      .count('* as count')
      .groupBy('linked_at_step')) as Array<{
      linked_at_step: string | null
      count: string | number
    }>

    let total = 0
    const byStep = { done: 0, returning: 0, unknown: 0 }
    for (const row of stepRows) {
      const c = Number(row.count) || 0
      total += c
      if (row.linked_at_step === 'done') byStep.done = c
      else if (row.linked_at_step === 'returning') byStep.returning = c
      else byStep.unknown += c
    }

    // Source breakdown — pulled from JSONB metadata.source. NULL/missing
    // bucketed as `null` so the dashboard surfaces "no attribution" as its
    // own category (organic / typed `Hola Sippy` without a QR scan).
    // Raw SQL because Lucid's groupBy() doesn't type-accept a JSONB path
    // expression cleanly; the equivalent query-builder form fails typecheck.
    const sourceResult = await db.rawQuery(
      `SELECT metadata->>'source' AS source, COUNT(*)::int AS count
       FROM user_event_links
       WHERE event_id = ?
       GROUP BY metadata->>'source'
       ORDER BY count DESC`,
      [event.id]
    )
    const bySource = (sourceResult.rows as Array<{ source: string | null; count: number }>).map(
      (r) => ({ source: r.source ?? null, count: Number(r.count) || 0 })
    )

    // POAP claim split. Two-bucket count via filtered aggregates — single
    // round-trip rather than two separate WHERE queries.
    const poapRow = (await db
      .from('user_event_links')
      .where('event_id', event.id)
      .select(
        db.raw(`COUNT(*) FILTER (WHERE poap_claimed = true) AS claimed`),
        db.raw(`COUNT(*) FILTER (WHERE poap_claimed = false) AS unclaimed`)
      )
      .first()) as { claimed: string | number; unclaimed: string | number } | null
    const poap = {
      claimed: Number(poapRow?.claimed ?? 0) || 0,
      unclaimed: Number(poapRow?.unclaimed ?? 0) || 0,
    }

    // Paginated attendee list. Ordered by created_at DESC so the live
    // dashboard shows the most recent landings at the top — operators
    // refresh to watch the funnel.
    const offset = (page - 1) * perPage
    const rows = (await db
      .from('user_event_links')
      .where('event_id', event.id)
      .select(
        'phone_number',
        'linked_at_step',
        'poap_claimed',
        'poap_claimed_at',
        'metadata',
        'created_at'
      )
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset(offset)) as AttendeeRow[]

    const attendees: AttendeePayload[] = rows.map((r) => ({
      phoneNumber: r.phone_number,
      linkedAtStep: r.linked_at_step,
      source: (r.metadata?.source as string | undefined) ?? null,
      poapClaimed: r.poap_claimed,
      poapClaimedAt: r.poap_claimed_at,
      linkedAt: r.created_at,
    }))

    const payload: AttendeesProps = {
      event: {
        slug: event.slug,
        name: event.name,
        endsAt: event.endsAt ? event.endsAt.toISO() : null,
        active: event.active,
      },
      counts: { total, byStep, bySource, poap },
      attendees: {
        data: attendees,
        meta: {
          page,
          perPage,
          total,
          lastPage: Math.max(1, Math.ceil(total / perPage)),
        },
      },
    }

    // Content negotiation: dashboard polls with Accept: application/json,
    // admin opens in browser and gets the Inertia React page. Same query,
    // same shape, two consumers.
    if (request.accepts(['html', 'json']) === 'json') {
      return response.ok(payload)
    }

    return inertia.render('admin/event_attendees', payload)
  }
}
