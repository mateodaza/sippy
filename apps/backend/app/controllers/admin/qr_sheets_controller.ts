/**
 * Admin QR Sheets Controller
 *
 * Single-page admin tool for the event QR printable. The QR is conceptually a
 * property of the event: if the event exists, the QR exists. The GET handler
 * lazy-creates the row on first read, so admin + operator both just navigate
 * to the page and print.
 *
 * Routes:
 *   GET /admin/qr-sheets/:eventSlug — render (and auto-provision) the QR
 *
 * Auth: admin group's `auth({ guards: ['web'] })`; the route is gated to
 * admin + operator roles. Operators are additionally scope-checked to their
 * assigned event.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { getActiveEventBySlug } from '#services/event.service'
import { createQrLink, listEventQrLinks } from '#services/qr_link.service'
import { getOperatorWalletForUser } from '#services/operator_wallet.service'

/** Build the public scan URL printed on the QR. */
function buildScanUrl(shortId: string): string {
  return `${getFrontendBase()}/q/${shortId}?v=1`
}

/** Return the normalized FRONTEND_URL or the documented fallback. */
function getFrontendBase(): string {
  return (env.get('FRONTEND_URL') || 'https://www.sippy.lat').replace(/\/+$/, '')
}

interface QrLinkProp {
  shortId: string
  sourceTag: string | null
  scanUrl: string
}

interface ShowProps {
  event: {
    slug: string
    name: string
    endsAt: string | null
  }
  qrLinks: QrLinkProp[]
  /**
   * Public URL prefix the printed QRs encode (`/q/<short-id>?v=1` gets appended).
   * Surfaced to the admin page so misconfig is visible BEFORE printing — printed
   * QRs are unrecoverable if the wrong URL is encoded.
   */
  scanUrlBase: string
  /** True when FRONTEND_URL was unset and we fell back to a default. */
  scanUrlIsFallback: boolean
  flash: { error?: string; created?: number } | null
}

export default class QrSheetsController {
  /**
   * GET /admin/qr-sheets/:eventSlug
   *
   * Renders the existing event QRs (if any) plus an inline form to create more.
   * Returns 404 if the event doesn't exist or isn't active — the admin should
   * already have the slug from elsewhere; this isn't a discovery endpoint.
   */
  async show({ params, inertia, session, response, auth }: HttpContext) {
    const slug = String(params.eventSlug ?? '').trim()

    // Operator scope-check: operators can only view their assigned event's
    // QR sheets. Admin passes through. 403 if mismatch.
    const user = auth.user!
    if (user.role === 'operator') {
      const assignment = await getOperatorWalletForUser(user.id)
      if (!assignment || assignment.eventSlug !== slug) {
        return response.forbidden({ error: 'Not authorized for this event' })
      }
    }

    const event = await getActiveEventBySlug(slug)
    if (!event) {
      return response.notFound({ error: `Event '${slug}' not found or inactive` })
    }

    // Only show THE general event QR (sourceTag = 'venue' going forward,
    // or NULL for pre-2026-05-18 rows that the backfill migration moves
    // to 'venue'). Legacy assistant QRs minted under the old
    // per-assistant pattern (sourceTag like 'asst-carolina',
    // 'smoke-diego', etc.) stay in DB for audit but are hidden from
    // this view — the product contract is now "one QR per event".
    // Cleanup of legacy rows is a manual DB op (see runbook).
    const allLinks = await listEventQrLinks(slug)
    let generalLink = allLinks.find((l) => l.sourceTag === 'venue' || l.sourceTag === null) ?? null

    // Auto-provision on first read. The QR is conceptually a property of
    // the event — if the event exists, the QR exists. Lazy-create lets the
    // operator (or admin) just navigate to the page and see the printable
    // sheet, no extra button click, no separate POST endpoint, no
    // admin/operator role gate confusion. Cheap operation: generates a
    // short_id + INSERTs one row.
    //
    // Race: two concurrent first-loads could both miss the existing-row
    // check and both INSERT. Unlikely in practice (single admin clicking
    // a link); worst case we get two QRs, the next load picks the first
    // via .find(). Tolerable. A partial unique index would harden this
    // but is overkill for the Pizza Day cadence.
    if (!generalLink) {
      try {
        const created = await createQrLink({
          kind: 'event',
          eventSlug: slug,
          // 'venue' tags this row as a physical, printed-sheet QR — read
          // by the Quest scoring CTE as proof-of-attendance when an
          // already-onboarded user scans it (linked_at_step='returning').
          // Without a named tag, the social-link path (also 'returning')
          // would be indistinguishable from a venue scan and existing
          // users could farm attendance entries from home.
          sourceTag: 'venue',
          displayName: event.name,
        })
        generalLink = created
        logger.info(`qr_sheets.auto-provisioned event=${slug} short_id=${created.shortId}`)
      } catch (err) {
        // Don't block the page render — surface a clear flash and let the
        // admin retry by refreshing. createQrLink failures here are usually
        // generator collisions (effectively never) or transient DB errors.
        logger.error({ eventSlug: slug, err }, 'qr_sheets.auto-provision failed')
        session.flash(
          'error',
          'Failed to auto-generate the event QR. Refresh to retry. If it keeps failing, check server logs.'
        )
      }
    }

    const props: ShowProps = {
      event: {
        slug: event.slug,
        name: event.name,
        endsAt: event.endsAt ? event.endsAt.toISO() : null,
      },
      qrLinks: generalLink
        ? [
            {
              shortId: generalLink.shortId,
              sourceTag: generalLink.sourceTag,
              scanUrl: buildScanUrl(generalLink.shortId),
            },
          ]
        : [],
      scanUrlBase: getFrontendBase(),
      scanUrlIsFallback: !env.get('FRONTEND_URL'),
      flash: (session.flashMessages.all() as ShowProps['flash']) ?? null,
    }

    return inertia.render('admin/qr_sheets', props)
  }
}
