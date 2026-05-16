/**
 * Admin QR Sheets Controller
 *
 * Single-page admin tool for generating event QR printables. Used to produce
 * Pizza Day assistant sheets (and any future events with assistant attribution).
 *
 * Routes:
 *   GET  /admin/qr-sheets/:eventSlug  — show existing QRs + creation form
 *   POST /admin/qr-sheets/:eventSlug  — create N event QRs in one shot
 *
 * Auth: protected by the admin group's `auth({ guards: ['web'] })`. Creation
 * is gated by `adminRole({ role: 'admin' })` to keep viewer accounts from
 * minting attribution QRs.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { getActiveEventBySlug } from '#services/event.service'
import { createQrLink, listEventQrLinks } from '#services/qr_link.service'
import { getOperatorWalletForUser } from '#services/operator_wallet.service'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { query } from '#services/db'

async function ownerExists(phoneNumber: string): Promise<boolean> {
  const r = await query<{ exists: number }>(
    'SELECT 1 AS exists FROM user_preferences WHERE phone_number = $1 LIMIT 1',
    [phoneNumber]
  )
  return r.rows.length > 0
}

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
  defaultOwnerPhone: string | null
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

    // Only show THE general event QR (sourceTag IS NULL). Legacy assistant
    // QRs minted under the old per-assistant pattern (sourceTag like
    // 'asst-carolina', 'smoke-diego', etc.) stay in DB for audit but are
    // hidden from this view — the product contract is now "one QR per
    // event". Cleanup of legacy rows is a manual DB op (see runbook).
    const allLinks = await listEventQrLinks(slug)
    const generalLink = allLinks.find((l) => l.sourceTag === null) ?? null

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
      defaultOwnerPhone: env.get('SIPPY_EVENT_QR_OWNER_PHONE') ?? null,
      scanUrlBase: getFrontendBase(),
      scanUrlIsFallback: !env.get('FRONTEND_URL'),
      flash: (session.flashMessages.all() as ShowProps['flash']) ?? null,
    }

    return inertia.render('admin/qr_sheets', props)
  }

  /**
   * POST /admin/qr-sheets/:eventSlug
   *
   * Creates ONE general event-onboarding QR per event. Idempotent: if a
   * general QR already exists for this event (sourceTag IS NULL OR
   * sourceTag = 'event'), returns it without re-creating.
   *
   * Body:
   *   { ownerPhoneNumber: string }  // must exist in user_preferences
   *
   * Pay-QRs (kind='pay') are minted via a different admin path — this
   * endpoint exclusively creates the single onboarding QR. The shared
   * `qr_links.short_id` PK + the dispatcher's per-kind branching guarantee
   * no event/pay confusion at runtime.
   */
  async create({ params, request, response, session }: HttpContext) {
    const slug = String(params.eventSlug ?? '').trim()
    const event = await getActiveEventBySlug(slug)
    if (!event) {
      session.flash('error', `Event '${slug}' not found or inactive`)
      return response.redirect().back()
    }

    const body = request.body() as { ownerPhoneNumber?: unknown }
    const ownerRaw = typeof body.ownerPhoneNumber === 'string' ? body.ownerPhoneNumber.trim() : ''
    if (!ownerRaw) {
      session.flash('error', 'Owner phone number is required')
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    const ownerKey = await resolveUserPrefKey(ownerRaw)
    if (!(await ownerExists(ownerKey))) {
      session.flash(
        'error',
        `Owner phone ${ownerRaw} not found in user_preferences. Onboard the account first, then retry.`
      )
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    // Idempotency — only the GENERAL (sourceTag=null) QR blocks creation.
    // Legacy assistant QRs (sourceTag='asst-carolina' etc.) don't count
    // toward the "already exists" check — they're hidden in the UI anyway.
    // Mirrors friend's pay-qr pattern: re-POST returns existing silently
    // instead of flashing an error.
    const existingAll = await listEventQrLinks(slug)
    const existingGeneral = existingAll.find((l) => l.sourceTag === null)
    if (existingGeneral) {
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    // Single insert — no transaction needed (1 row, atomic by definition).
    try {
      await createQrLink({
        kind: 'event',
        ownerPhoneNumber: ownerKey,
        eventSlug: slug,
        // sourceTag null = "general event QR, no per-channel attribution".
        // If you want attribution later, mint additional rows with non-null tags
        // via tinker / SQL; the dispatcher reads sourceTag straight through.
        sourceTag: null,
        displayName: event.name,
      })
    } catch (err) {
      logger.error({ eventSlug: slug, ownerPhone: ownerKey, err }, 'qr_sheets.create failed')
      session.flash('error', 'Failed to create QR. Check server logs for details.')
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    session.flash('created', 1)
    return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
  }
}
