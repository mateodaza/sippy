import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AdminRoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { role: 'admin' | 'viewer' }) {
    const user = ctx.auth.user!

    if (options.role === 'admin' && user.role !== 'admin') {
      ctx.session.flash('error', 'Insufficient permissions')
      return ctx.response.redirect().back()
    }

    return next()
  }
}
