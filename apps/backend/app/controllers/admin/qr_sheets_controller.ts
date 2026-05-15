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
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { getActiveEventBySlug } from '#services/event.service'
import { createQrLink, listEventQrLinks } from '#services/qr_link.service'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { query } from '#services/db'

const MAX_ASSISTANTS_PER_CREATE = 50
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Lowercase, accent-strip, replace whitespace/punctuation with single dashes. */
function slugifyForSource(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Parse the assistants textarea. One assistant per line. Each line is either:
 *   "Carolina"                  → label="Carolina", sourceTag="carolina"
 *   "Carolina | asst-carolina"  → label="Carolina", sourceTag="asst-carolina"
 *
 * Empty lines and lines that slugify to nothing are skipped. Duplicate
 * sourceTags within the batch get a "-2", "-3", … suffix in input order.
 */
function parseAssistants(raw: unknown): Array<{ label: string; sourceTag: string }> {
  if (typeof raw !== 'string') return []
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const used = new Set<string>()
  const out: Array<{ label: string; sourceTag: string }> = []

  for (const line of lines) {
    const [labelPart, tagPart] = line.split('|').map((s) => s.trim())
    const label = labelPart?.slice(0, 80) || ''
    if (!label) continue

    let sourceTag = tagPart ? slugifyForSource(tagPart) : slugifyForSource(label)
    if (!sourceTag) continue

    // Dedupe within the batch (case where two assistants share a name).
    if (used.has(sourceTag)) {
      const base = sourceTag
      let n = 2
      while (used.has(`${base}-${n}`)) n++
      sourceTag = `${base}-${n}`
    }
    used.add(sourceTag)
    out.push({ label, sourceTag })
  }
  return out
}

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
  async show({ params, inertia, session, response }: HttpContext) {
    const slug = String(params.eventSlug ?? '').trim()
    const event = await getActiveEventBySlug(slug)
    if (!event) {
      return response.notFound({ error: `Event '${slug}' not found or inactive` })
    }

    const links = await listEventQrLinks(slug)

    const props: ShowProps = {
      event: {
        slug: event.slug,
        name: event.name,
        endsAt: event.endsAt ? event.endsAt.toISO() : null,
      },
      qrLinks: links.map((l) => ({
        shortId: l.shortId,
        sourceTag: l.sourceTag,
        scanUrl: buildScanUrl(l.shortId),
      })),
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
   * Body:
   *   {
   *     ownerPhoneNumber: string  // must exist in user_preferences
   *     assistants: string        // newline-separated. "Label" or "Label | sourceTag"
   *   }
   *
   * Validates everything before any insert — if any input is bad, nothing is
   * created. Successful runs flash `created=<count>` and redirect back to show
   * so the new QRs render in the print view.
   */
  async create({ params, request, response, session }: HttpContext) {
    const slug = String(params.eventSlug ?? '').trim()
    const event = await getActiveEventBySlug(slug)
    if (!event) {
      session.flash('error', `Event '${slug}' not found or inactive`)
      return response.redirect().back()
    }

    const body = request.body() as {
      ownerPhoneNumber?: unknown
      assistants?: unknown
    }

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

    const assistants = parseAssistants(body.assistants)
    if (assistants.length === 0) {
      session.flash('error', 'At least one assistant is required (one label per line)')
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }
    if (assistants.length > MAX_ASSISTANTS_PER_CREATE) {
      session.flash('error', `Too many assistants in one batch (max ${MAX_ASSISTANTS_PER_CREATE})`)
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    // Reject sourceTags that don't match the canonical slug pattern. parseAssistants
    // already slugifies, but a manual "label | weird_tag" could slip through.
    for (const a of assistants) {
      if (!SLUG_PATTERN.test(a.sourceTag)) {
        session.flash('error', `Invalid sourceTag '${a.sourceTag}' (use a-z, 0-9, hyphens)`)
        return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
      }
    }

    // Reject sourceTags that already exist on this event so we don't silently
    // create duplicate-attribution rows. Cheap pre-check; the underlying insert
    // would still succeed (no UNIQUE on source_tag per event) but the resulting
    // data would be confusing.
    const existing = await listEventQrLinks(slug)
    const existingTags = new Set(existing.map((l) => l.sourceTag).filter(Boolean))
    const collisions = assistants.filter((a) => existingTags.has(a.sourceTag))
    if (collisions.length > 0) {
      session.flash(
        'error',
        `Source tags already exist for this event: ${collisions.map((c) => c.sourceTag).join(', ')}`
      )
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    // All-or-nothing: wrap the inserts in a transaction so a mid-loop failure
    // (DB constraint, FK violation, lost-connection blip) leaves nothing behind.
    // Partial sheets are worse than no sheets — printed-but-missing assistants
    // would skew attribution and waste a print run.
    let created = 0
    try {
      await db.transaction(async (trx) => {
        for (const a of assistants) {
          await createQrLink(
            {
              kind: 'event',
              ownerPhoneNumber: ownerKey,
              eventSlug: slug,
              sourceTag: a.sourceTag,
              displayName: a.label,
            },
            trx
          )
          created++
        }
      })
    } catch (err) {
      // Server-side log carries the diagnostic detail (constraint name, query,
      // stack). The admin-facing flash is intentionally generic — we don't want
      // raw DB error strings (FK names, table schema hints) leaking into a
      // session flash that may persist past the read.
      logger.error(
        {
          eventSlug: slug,
          ownerPhone: ownerKey,
          assistantCount: assistants.length,
          err,
        },
        'qr_sheets.create transaction rolled back'
      )
      session.flash(
        'error',
        'Failed to create QRs (rolled back, no rows persisted). Check server logs for details.'
      )
      return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
    }

    session.flash('created', created)
    return response.redirect(`/admin/qr-sheets/${encodeURIComponent(slug)}`)
  }
}
