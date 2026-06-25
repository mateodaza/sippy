/**
 * Event Controller
 *
 * - POST /api/link-event          (JWT)    — tag the authenticated user to an event slug
 * - POST /api/event-poap-claimed  (JWT)    — mark the user's POAP as claimed
 * - GET  /api/events/:slug        (public) — minimal lookup for setup-page UI chip
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import '#types/container'
import {
  getActiveEventBySlug,
  linkUserToEvent,
  markPoapClaimed,
  type LinkedAtStep,
} from '#services/event.service'

const VALID_STEPS: ReadonlySet<LinkedAtStep> = new Set(['done', 'returning'])

// Accept simple lowercase tags like 'qr-booth', 'twitter', 'tg-channel-1'.
// Capped at 64 chars to keep metadata tidy. Anything not matching is dropped.
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

function sanitizeSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  return SOURCE_PATTERN.test(trimmed) ? trimmed : null
}

export default class EventController {
  /**
   * POST /api/link-event
   * Body: {
   *   eventSlug: string
   *   linkedAtStep?: 'done' | 'returning'
   *   source?: string  (optional channel attribution: 'qr-booth', 'twitter', ...)
   * }
   *
   * `linkedAtStep` defaults to 'done' for backwards compatibility with the
   * onboarding-completion path. Set to 'returning' from the retroactive flow
   * (user already had a wallet when they scanned the event QR).
   *
   * `source` is optional channel attribution stored in `user_event_links.metadata.source`.
   * Validated against /^[a-z0-9][a-z0-9-]{0,63}$/ — invalid values are silently dropped
   * (link still succeeds without source). First contact wins on re-link.
   *
   * Returns { linked: false } for unknown/inactive/expired slugs (silent reject).
   * Idempotent: repeated calls for the same (phone, slug) are safe.
   */
  async linkEvent(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const body = request.body() as {
        eventSlug?: unknown
        linkedAtStep?: unknown
        source?: unknown
      }
      const slug = typeof body.eventSlug === 'string' ? body.eventSlug.trim() : ''
      if (!slug) {
        return response.status(422).json({ error: 'eventSlug is required' })
      }

      const stepRaw = typeof body.linkedAtStep === 'string' ? body.linkedAtStep : 'done'
      const linkedAtStep: LinkedAtStep = VALID_STEPS.has(stepRaw as LinkedAtStep)
        ? (stepRaw as LinkedAtStep)
        : 'done'

      const source = sanitizeSource(body.source)

      const phoneNumber = ctx.cdpUser?.phoneNumber
      if (!phoneNumber) {
        return response.status(401).json({ error: 'Unauthorized' })
      }

      const result = await linkUserToEvent(phoneNumber, slug, linkedAtStep, source)
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, 'linkEvent error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * POST /api/event-poap-claimed
   * Body: { eventSlug: string }
   *
   * Marks the user's POAP claim for the given event as done. Idempotent —
   * repeated calls are no-ops once already claimed. Returns 200 with
   * `{ status: 'claimed' | 'already-claimed' | 'not-linked' }` so the caller
   * can distinguish a real claim from "user wasn't linked, nothing recorded".
   *
   * Note: this records intent to claim (user clicked the button). It does not
   * verify that POAP actually minted the NFT — that lives on POAP's domain.
   */
  async markPoapClaimed(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const body = request.body() as { eventSlug?: unknown }
      const slug = typeof body.eventSlug === 'string' ? body.eventSlug.trim() : ''
      if (!slug) {
        return response.status(422).json({ error: 'eventSlug is required' })
      }

      const phoneNumber = ctx.cdpUser?.phoneNumber
      if (!phoneNumber) {
        return response.status(401).json({ error: 'Unauthorized' })
      }

      const result = await markPoapClaimed(phoneNumber, slug)
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, 'markPoapClaimed error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * GET /api/events/:slug
   *
   * Public, IP-throttled. Returns only { name, active, endsAt } — never user
   * counts or sensitive fields. Returns 404 for unknown/inactive/expired so
   * the frontend chip falls back to "no event".
   */
  async getEventPublic({ params, response }: HttpContext) {
    try {
      const slug = typeof params.slug === 'string' ? params.slug.trim() : ''
      if (!slug) {
        return response.status(404).json({ error: 'Not found' })
      }

      const event = await getActiveEventBySlug(slug)
      if (!event) {
        return response.status(404).json({ error: 'Not found' })
      }

      return response.status(200).json({
        slug: event.slug,
        name: event.name,
        active: event.active,
        endsAt: event.endsAt ? event.endsAt.toISO() : null,
      })
    } catch (error) {
      logger.error({ err: error }, 'getEventPublic error')
      return response.status(500).json({ error: 'Internal server error' })
    }
  }
}
