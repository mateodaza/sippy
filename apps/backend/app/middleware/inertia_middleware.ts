import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import db from '@adonisjs/lucid/services/db'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    const user = ctx.auth?.user

    let indexerHeartbeat: number | null = null
    if (ctx.request.url().startsWith('/admin')) {
      try {
        // Check when the last webhook delivery or poller update arrived
        const row = await db
          .from('onchain.webhook_delivery_log')
          .where('status', 'ok')
          .select(db.raw('EXTRACT(EPOCH FROM MAX(received_at))::bigint * 1000 as heartbeat'))
          .first()

        if (row?.heartbeat) {
          indexerHeartbeat = Number(row.heartbeat)
        } else {
          // No webhook deliveries yet — check poller cursor as fallback
          const cursor = await db
            .from('onchain.poller_cursor')
            .select(db.raw('EXTRACT(EPOCH FROM MAX(updated_at))::bigint * 1000 as heartbeat'))
            .first()
          indexerHeartbeat = cursor?.heartbeat ? Number(cursor.heartbeat) : null
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
      indexerHeartbeat,
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    await next()
    this.dispose(ctx)
  }
}
