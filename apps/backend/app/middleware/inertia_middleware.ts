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
        // Discover Ponder's active schema dynamically so we survive version upgrades
        const schemaRow = await db
          .connection('indexer')
          .from('information_schema.tables')
          .where('table_name', '_ponder_meta')
          .whereILike('table_schema', 'ponder%')
          .select('table_schema')
          .first()
        if (schemaRow?.table_schema) {
          const schema = schemaRow.table_schema
          const row = await db
            .connection('indexer')
            .from(db.raw('??.??', [schema, '_ponder_meta']))
            .where('key', 'app')
            .select(db.raw("(value->>'heartbeat_at')::bigint as heartbeat"))
            .first()
          indexerHeartbeat = row?.heartbeat ? Number(row.heartbeat) : null
        }
      } catch (err) {
        console.warn('Failed to query indexer heartbeat:', (err as Error).message)
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
