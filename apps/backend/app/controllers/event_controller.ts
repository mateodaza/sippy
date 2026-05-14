/**
 * Event Controller
 *
 * - POST /api/link-event   (JWT)    — tag the authenticated user to an event slug
 * - GET  /api/events/:slug (public) — minimal lookup for setup-page UI chip
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import '#types/container'
import { getActiveEventBySlug, linkUserToEvent } from '#services/event.service'

export default class EventController {
  /**
   * POST /api/link-event
   * Body: { eventSlug: string }
   *
   * Returns { linked: false } for unknown/inactive/expired slugs (silent reject).
   * Idempotent: repeated calls for the same (phone, slug) are safe.
   */
  async linkEvent(ctx: HttpContext) {
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

      const result = await linkUserToEvent(phoneNumber, slug)
      return response.status(200).json(result)
    } catch (error) {
      logger.error({ err: error }, 'linkEvent error')
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
