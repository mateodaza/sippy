import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { getAdminLang } from '#utils/admin_lang'

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
        // Lucid query builder instead of `db.raw(?)` — the raw `?` binding
        // wasn't expanding reliably for the operator-lookup case, leaving
        // assignedEventSlug always null and breaking the operator sidebar.
        const row = (await db
          .from('event_operator_wallets')
          .where('operator_user_id', user.id)
          .where('active', true)
          .orderBy('updated_at', 'desc')
          .select('event_slug')
          .first()) as { event_slug: string } | null
        assignedEventSlug = row?.event_slug ?? null
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
      // Admin UI language ('es' | 'en'), driven by sippy_admin_lang cookie.
      // Defaults to 'es'. Read on every request so the toggle takes effect
      // on the next page load via router.reload after the cookie flips.
      adminLang: getAdminLang(ctx),
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    await next()
    this.dispose(ctx)
  }
}
