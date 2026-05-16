import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import db from '@adonisjs/lucid/services/db'

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
      } catch {
        // onchain tables may not exist yet
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
      } catch {
        // table may not exist in legacy environments — leave as null
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
