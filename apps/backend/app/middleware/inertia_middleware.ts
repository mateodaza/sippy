import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    const user = ctx.auth?.user

    let indexerStatus: { pollerAgo: number | null; webhookAgo: number | null } | null = null
    if (ctx.request.url().startsWith('/admin')) {
      try {
        const row = (await db.raw(`
          SELECT
            EXTRACT(EPOCH FROM (NOW() - (
              SELECT MAX(updated_at) FROM onchain.poller_cursor
            )))::int AS poller_age_secs,
            EXTRACT(EPOCH FROM (NOW() - (
              SELECT MAX(received_at) FROM onchain.webhook_delivery_log WHERE status = 'ok'
            )))::int AS webhook_age_secs
        `)) as { rows?: { poller_age_secs: number | null; webhook_age_secs: number | null }[] }
        const r = row.rows?.[0]
        indexerStatus = {
          pollerAgo: r?.poller_age_secs ?? null,
          webhookAgo: r?.webhook_age_secs ?? null,
        }
      } catch (err) {
        // M4: log instead of swallow. Onchain tables may not exist in dev,
        // but if they're absent in prod we want a paper trail.
        logger.warn({ err }, 'inertia_middleware: indexer status lookup failed')
      }
    }

    // For operators, surface the assigned event slug so the nav can render
    // the right links without each page re-querying. Cheap single-row lookup;
    // only fires when user.role === 'operator' so admin views pay nothing.
    let assignedEventSlug: string | null = null
    if (user?.role === 'operator') {
      try {
        const row = (await db.raw(
          `SELECT event_slug
           FROM event_operator_wallets
           WHERE operator_user_id = ? AND active = TRUE
           ORDER BY updated_at DESC
           LIMIT 1`,
          [user.id]
        )) as { rows?: { event_slug: string }[] }
        assignedEventSlug = row.rows?.[0]?.event_slug ?? null
      } catch (err) {
        // M4: log instead of swallow. Silent failure here strips the
        // operator's nav link, and they can't reach their send page —
        // critical to know about during the event.
        logger.warn(
          { user_id: user.id, err },
          'inertia_middleware: assigned_event_slug lookup failed; operator nav may be incomplete'
        )
      }
    }

    return {
      auth: user
        ? {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            initials: user.initials,
            assignedEventSlug,
          }
        : null,
      flash: {
        success: ctx.session?.flashMessages.get('success'),
        error: ctx.session?.flashMessages.get('error'),
      },
      indexerStatus,
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    await next()
    this.dispose(ctx)
  }
}
