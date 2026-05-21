/**
 * Admin Events Controller
 *
 * Live monitoring + operator-wallet management for events.
 *
 * Routes:
 *   GET    /admin/events/:slug/attendees                — counts + paginated
 *                                                          attendees list, with
 *                                                          per-row "sent"
 *                                                          status from
 *                                                          operator_sends
 *   POST   /admin/events/:slug/operator                  — assign operator
 *                                                          (admin only)
 *   DELETE /admin/events/:slug/operator                  — revoke (admin only)
 *   POST   /admin/events/:slug/operator-wallet/drain     — sweep balance to a
 *                                                          destination address
 *                                                          (admin only)
 *
 * Auth: cookie-based session via `auth({ guards: ['web'] })`. The attendees
 * endpoint is accessible to operator role (gated by the route-level
 * `adminRole({role:'operator'})`), but operators are scope-locked to their
 * assigned event via the controller-level check. Admin-only endpoints
 * (assign/revoke/drain) have their own route gates.
 *
 * Spec: OPERATOR_FLOW_PLAN.md + PIZZA_DAY_PLAN.md.
 */

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import Event from '#models/event'
import { maskPhone } from '#utils/phone'
import {
  provisionOperatorWallet,
  revokeOperatorWallet,
  getOperatorWalletForEvent,
  getOperatorWalletForUser,
  getOperatorWalletBalance,
  drainOperatorWallet,
} from '#services/operator_wallet.service'
import { isSuperAdmin } from '#utils/super_admin'

const DEFAULT_PER_PAGE = 50
const MAX_PER_PAGE = 200

const assignOperatorBody = vine.compile(
  vine.object({
    operatorUserId: vine.number().positive(),
  })
)

const drainBody = vine.compile(
  vine.object({
    destinationAddress: vine
      .string()
      .trim()
      .regex(/^0x[a-fA-F0-9]{40}$/),
    /**
     * Optional partial-drain amount in USDC. When omitted, the endpoint
     * sweeps the full balance (the original recovery behavior). When
     * provided, sends exactly this amount and leaves the rest. Used for
     * pre-event smoke tests where we want to pull a small portion out
     * before the floor opens. Service-layer validates against balance.
     */
    amountUsdc: vine.number().positive().optional(),
  })
)

interface AttendeeRow {
  phone_number: string
  linked_at_step: string | null
  poap_claimed: boolean
  poap_claimed_at: string | null
  metadata: { source?: string } | null
  created_at: string
  operator_sent: boolean
  operator_sent_amount: string | number | null
  operator_last_tx_hash: string | null
  operator_last_sent_at: string | null
}

interface AttendeePayload {
  /** Masked phone for display. JSON consumers (Mateo's external dashboard)
   *  only see the masked form — privacy-preserving by default. */
  phoneNumber: string
  /**
   * Raw E.164 phone, included so the admin Send button on the attendees
   * table can pass `?to=<phone>` to the operator send form. Operators
   * legitimately need the raw form to act on a recipient — masking only
   * matters for log lines, JSON dashboards, and audit trails. Authenticated
   * admin/operator users see this; anyone else can't reach the endpoint.
   */
  phoneNumberRaw: string
  linkedAtStep: string | null
  source: string | null
  poapClaimed: boolean
  poapClaimedAt: string | null
  linkedAt: string
  /**
   * Per-attendee operator-send rollup. Driven by the LEFT JOIN against
   * `operator_sends` in the attendees query. The `sent` boolean is the
   * primary affordance for the admin UI's per-row Send/Sent badge.
   */
  operatorSend: {
    sent: boolean
    totalAmountUsdc: number
    lastTxHash: string | null
    lastSentAt: string | null
  }
}

/**
 * Enforce operator scope: an operator can only view their assigned event's
 * data. Admin passes through. Returns true if the request should proceed,
 * false if the caller already wrote a 403 response.
 */
async function passesOperatorScope(ctx: HttpContext, requestedSlug: string): Promise<boolean> {
  const user = ctx.auth.user
  // M5 defense: route gate already requires auth, but if the gate is ever
  // misconfigured/missing, fail closed here rather than throwing TypeError
  // on auth.user!.
  if (!user) {
    ctx.response.unauthorized({ error: 'Authentication required' })
    return false
  }
  // M3: default-deny. Explicitly allow only known roles; anything else
  // (uppercase, future-added role, empty string) gets 403. Today the route
  // gate only admits admin/operator, so this is belt-and-suspenders, but it
  // prevents a leak if a new role is added without updating this branch.
  if (user.role === 'admin') return true
  if (user.role === 'operator') {
    const assignment = await getOperatorWalletForUser(user.id)
    if (assignment && assignment.eventSlug === requestedSlug) return true
    logger.warn(
      {
        user_id: user.id,
        requested: requestedSlug,
        assigned: assignment?.eventSlug ?? null,
      },
      'events_controller: operator scope violation'
    )
    ctx.response.forbidden({ error: 'Not authorized for this event' })
    return false
  }
  logger.warn(
    { user_id: user.id, role: user.role, requested: requestedSlug },
    'events_controller: unknown role attempted to access scoped endpoint'
  )
  ctx.response.forbidden({ error: 'Not authorized for this event' })
  return false
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
  /**
   * Admin-only block: surface the assigned operator wallet (if any) and the
   * list of users with role=operator who can be assigned. Inertia page hides
   * this section entirely when `auth.role !== 'admin'` — operator viewing
   * their own event's attendees doesn't see any management controls.
   */
  operatorWallet: {
    walletAddress: string
    /**
     * USDC balance. `null` when the on-chain read failed (RPC down, contract
     * revert, etc.). UI MUST render "—" or an unavailable badge for null —
     * NEVER `$0.00`, which is indistinguishable from a truly empty wallet
     * and could drive bad admin decisions (false-zero drain/reassignment).
     */
    balanceUsdc: number | null
    balanceError: string | null
    active: boolean
    operatorUserId: number
    operatorEmail: string | null
    operatorFullName: string | null
  } | null
  availableOperators: Array<{
    id: number
    email: string
    fullName: string | null
  }>
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
  async attendees(ctx: HttpContext) {
    const { params, request, response, inertia } = ctx
    const slug = String(params.slug ?? '').trim()
    if (!slug) {
      return response.badRequest({ error: 'Missing :slug' })
    }

    // Operator scope-check: operators can only view their assigned event's
    // attendees. Admin passes through. 403 written + returned if mismatch.
    if (!(await passesOperatorScope(ctx, slug))) {
      return
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
    // TEXT with a CHECK constraint that permits NULL plus the named values
    // ('done', 'returning') — so the "unknown" bucket catches NULL rows
    // and any future CHECK addition we don't yet recognize, rather than
    // silently miscounting.
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
    //
    // LEFT JOIN against operator_sends (grouped by to_phone) populates the
    // per-row "sent" rollup that drives the Send/Sent UI affordance. We use
    // a subquery rather than GROUP BY on the outer query because user_event_links
    // is already keyed by (phone_number, event_id) — outer GROUP BY would
    // require listing every column and is more error-prone.
    const offset = (page - 1) * perPage
    const rowsResult = await db.rawQuery(
      `SELECT
         uel.phone_number,
         uel.linked_at_step,
         uel.poap_claimed,
         uel.poap_claimed_at,
         uel.metadata,
         uel.created_at,
         (os.total_amount IS NOT NULL) AS operator_sent,
         os.total_amount AS operator_sent_amount,
         os.last_tx_hash AS operator_last_tx_hash,
         os.last_sent_at AS operator_last_sent_at
       FROM user_event_links uel
       LEFT JOIN (
         SELECT
           to_phone,
           SUM(amount_usdc) AS total_amount,
           MAX(tx_hash) AS last_tx_hash,
           MAX(created_at) AS last_sent_at
         FROM operator_sends
         WHERE event_slug = ? AND status IN ('submitted','confirmed')
         GROUP BY to_phone
       ) os ON os.to_phone = uel.phone_number
       WHERE uel.event_id = ?
       ORDER BY uel.created_at DESC
       LIMIT ? OFFSET ?`,
      [slug, event.id, perPage, offset]
    )
    const rows = (rowsResult.rows ?? []) as AttendeeRow[]

    // Mask phones in the controller (not in the Inertia view) so the JSON
    // variant of this endpoint never exposes raw E.164. Any authenticated
    // admin can hit `Accept: application/json` and read this payload — a
    // viewer-role admin shouldn't be able to scrape a full attendee phone
    // book. Display masking still happens in the Inertia component but
    // operates on already-masked input.
    const attendees: AttendeePayload[] = rows.map((r) => ({
      phoneNumber: maskPhone(r.phone_number),
      phoneNumberRaw: r.phone_number,
      linkedAtStep: r.linked_at_step,
      source: (r.metadata?.source as string | undefined) ?? null,
      poapClaimed: r.poap_claimed,
      poapClaimedAt: r.poap_claimed_at,
      linkedAt: r.created_at,
      operatorSend: {
        sent: !!r.operator_sent,
        totalAmountUsdc: Number(r.operator_sent_amount ?? 0) || 0,
        lastTxHash: r.operator_last_tx_hash,
        lastSentAt: r.operator_last_sent_at,
      },
    }))

    // Admin-only operator-management data. Operator viewing their own event
    // doesn't need this (and security-wise should not see the list of other
    // operator accounts). Compute only when caller is admin.
    let operatorWalletPayload: AttendeesProps['operatorWallet'] = null
    let availableOperators: AttendeesProps['availableOperators'] = []
    const callerRole = ctx.auth.user?.role
    if (callerRole === 'admin') {
      const wallet = await getOperatorWalletForEvent(slug)
      if (wallet) {
        const [balanceResult, operatorRow] = await Promise.all([
          getOperatorWalletBalance(wallet.walletAddress),
          db
            .from('admin_users')
            .where('id', wallet.operatorUserId)
            .select('id', 'email', 'full_name')
            .first(),
        ])
        operatorWalletPayload = {
          walletAddress: wallet.walletAddress,
          // Surface RPC failures explicitly — null + balanceError tells the
          // UI to render "—" instead of $0.00 (H1).
          balanceUsdc: balanceResult.kind === 'ok' ? balanceResult.value : null,
          balanceError: balanceResult.kind === 'error' ? balanceResult.error : null,
          active: wallet.active,
          operatorUserId: wallet.operatorUserId,
          operatorEmail: operatorRow?.email ?? null,
          operatorFullName: operatorRow?.full_name ?? null,
        }
      }
      const operators = await db
        .from('admin_users')
        .where('role', 'operator')
        .orderBy('email', 'asc')
        .select('id', 'email', 'full_name')
      availableOperators = operators.map((o: any) => ({
        id: o.id,
        email: o.email,
        fullName: o.full_name,
      }))
    }

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
      operatorWallet: operatorWalletPayload,
      availableOperators,
    }

    // Content negotiation: dashboard polls with Accept: application/json,
    // admin opens in browser and gets the Inertia React page. Same query,
    // same shape, two consumers.
    if (request.accepts(['html', 'json']) === 'json') {
      return response.ok(payload)
    }

    return inertia.render('admin/event_attendees', payload)
  }

  /**
   * POST /admin/events/:slug/operator
   *
   * Admin-only. Provisions a CDP smart-account wallet for the event,
   * assigned to the operator user-id in the body. Idempotent: re-running
   * with the same (slug, operatorUserId) returns the existing row + address.
   *
   * Returns the wallet address so admin can copy/paste it for off-chain
   * funding (decision #1 — funding is external).
   */
  async assignOperator({ params, request, response }: HttpContext) {
    const slug = String(params.slug ?? '').trim()
    if (!slug) return response.badRequest({ error: 'Missing :slug' })

    const event = await Event.findBy('slug', slug)
    if (!event) return response.notFound({ error: `Event '${slug}' not found` })

    let body: { operatorUserId: number }
    try {
      body = await request.validateUsing(assignOperatorBody)
    } catch (err) {
      return response.badRequest({ error: 'Invalid body', detail: (err as Error).message })
    }

    // Verify the admin_user exists AND has role='operator'. The vine schema
    // only checks that the id is a positive number; this guards against
    // typos / random IDs / promoting an admin or viewer by mistake.
    const targetUser = await db
      .from('admin_users')
      .where('id', body.operatorUserId)
      .select('id', 'role')
      .first()
    if (!targetUser) {
      return response.badRequest({
        error: `User ${body.operatorUserId} does not exist`,
      })
    }
    if (targetUser.role !== 'operator') {
      return response.badRequest({
        error:
          `User ${body.operatorUserId} has role='${targetUser.role}', not 'operator'. ` +
          `Promote them via /admin/roles first.`,
      })
    }

    try {
      const wallet = await provisionOperatorWallet({
        operatorUserId: body.operatorUserId,
        eventSlug: slug,
      })
      return response.ok({
        eventSlug: wallet.eventSlug,
        operatorUserId: wallet.operatorUserId,
        walletAddress: wallet.walletAddress,
        active: wallet.active,
      })
    } catch (err) {
      logger.error(
        { event_slug: slug, operator_user_id: body.operatorUserId, err },
        'events_controller.assignOperator failed'
      )
      return response.status(409).send({
        error: (err as Error).message ?? 'Assignment failed',
      })
    }
  }

  /**
   * DELETE /admin/events/:slug/operator
   *
   * Admin-only. Soft-revoke: sets `active=false` so the operator can no
   * longer send. The CDP wallet keeps existing and the row is preserved —
   * required so the drain endpoint can later sweep any leftover balance.
   * POLICY: never DELETE the row.
   */
  async revokeOperator({ params, response }: HttpContext) {
    const slug = String(params.slug ?? '').trim()
    if (!slug) return response.badRequest({ error: 'Missing :slug' })

    const result = await revokeOperatorWallet(slug)
    if (!result.revoked) {
      return response.notFound({ error: `No active operator assignment for '${slug}'` })
    }
    logger.info(`events_controller.revoked event=${slug}`)
    return response.ok({ eventSlug: slug, revoked: true })
  }

  /**
   * POST /admin/events/:slug/operator-wallet/drain
   *
   * Admin-only. Sweeps the full USDC balance of the event's operator
   * wallet to a destination address. Works regardless of `active` state —
   * decision #2 says draining must always be possible post-event. Uses
   * the stored `cdp_account_name` to re-hydrate the wallet handle.
   *
   * Returns `{txHash, amountSent}`. If balance is 0, returns
   * `{txHash: null, amountSent: 0}` without touching CDP.
   *
   * Superadmin-locked: even within `role='admin'`, only the SUPER_ADMIN_EMAIL
   * account can drain. Defense-in-depth against an admin account being
   * compromised or misused; the route-level role gate stays in place.
   */
  async drainOperatorWallet({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user || !isSuperAdmin(user.email)) {
      logger.warn(
        { user_id: user?.id, email: user?.email, path: request.url() },
        'drainOperatorWallet: blocked non-superadmin'
      )
      return response.forbidden({
        error: 'Draining the operator wallet is restricted to the superadmin account.',
      })
    }

    const slug = String(params.slug ?? '').trim()
    if (!slug) return response.badRequest({ error: 'Missing :slug' })

    let body: { destinationAddress: string; amountUsdc?: number }
    try {
      body = await request.validateUsing(drainBody)
    } catch (err) {
      return response.badRequest({ error: 'Invalid body', detail: (err as Error).message })
    }

    const wallet = await getOperatorWalletForEvent(slug)
    if (!wallet) {
      return response.notFound({ error: `No operator wallet provisioned for '${slug}'` })
    }

    try {
      const result = await drainOperatorWallet({
        wallet,
        destinationAddress: body.destinationAddress,
        amountUsdc: body.amountUsdc,
      })
      logger.info(
        `events_controller.drained event=${slug} amount=${result.amountSent} requested=${body.amountUsdc ?? 'all'} tx=${result.txHash}`
      )
      return response.ok({
        eventSlug: slug,
        ...result,
      })
    } catch (err) {
      logger.error(
        {
          event_slug: slug,
          destination: body.destinationAddress,
          requested_amount: body.amountUsdc,
          err,
        },
        'events_controller.drainOperatorWallet failed'
      )
      return response.status(500).send({
        error: (err as Error).message ?? 'Drain failed',
      })
    }
  }

  /**
   * GET /admin/events/:slug/operator-wallet
   *
   * Admin-only. Returns the operator wallet info + current balance. Useful
   * for the admin UI to display "address X has $Y USDC, assigned to op Z".
   */
  async getOperatorWallet({ params, response }: HttpContext) {
    const slug = String(params.slug ?? '').trim()
    if (!slug) return response.badRequest({ error: 'Missing :slug' })

    const wallet = await getOperatorWalletForEvent(slug)
    if (!wallet) {
      return response.notFound({ error: `No operator wallet provisioned for '${slug}'` })
    }

    const balanceResult = await getOperatorWalletBalance(wallet.walletAddress)
    return response.ok({
      eventSlug: wallet.eventSlug,
      operatorUserId: wallet.operatorUserId,
      walletAddress: wallet.walletAddress,
      active: wallet.active,
      // Mirror the shape used in the attendees payload for consistency:
      // null balance + non-null error → UI renders "unavailable".
      balanceUsdc: balanceResult.kind === 'ok' ? balanceResult.value : null,
      balanceError: balanceResult.kind === 'error' ? balanceResult.error : null,
    })
  }
}
