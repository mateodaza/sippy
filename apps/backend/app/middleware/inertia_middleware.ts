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

    return {
      auth: user
        ? {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            initials: user.initials,
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
