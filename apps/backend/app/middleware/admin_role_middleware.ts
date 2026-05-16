import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'

/**
 * Role-gate middleware.
 *
 *   `role: 'admin'`    — only admin
 *   `role: 'operator'` — operator OR admin (admin is a superset of operator)
 *
 * The semantics are inclusive UPWARD: specifying 'operator' allows both
 * operators and admins. Specifying 'admin' is the strictest gate. There is
 * no 'viewer' option — read-only authenticated routes don't need this
 * middleware at all (auth() is enough).
 *
 * Rejection: HTML routes (Inertia pages) get a flash + redirect-back so the
 * operator never lands on a blank 403 page. API/JSON routes that hit this
 * middleware get a 403 response. We detect by Accept header to choose.
 */
export default class AdminRoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { role: 'admin' | 'operator' }) {
    const user = ctx.auth.user!

    const allowed =
      options.role === 'admin' ? user.role === 'admin' : ['operator', 'admin'].includes(user.role)

    if (!allowed) {
      logger.warn(
        {
          user_id: user.id,
          role: user.role,
          required: options.role,
          path: ctx.request.url(),
        },
        'admin_role: 403'
      )
      // JSON consumers get a structured 403; HTML/Inertia consumers get a
      // flash + back-redirect so the nav doesn't dump them on a blank page.
      const wantsJson = ctx.request.accepts(['html', 'json']) === 'json'
      if (wantsJson) {
        return ctx.response.forbidden({ error: 'Insufficient permissions' })
      }
      ctx.session.flash('error', 'Insufficient permissions')
      return ctx.response.redirect().back()
    }

    return next()
  }
}
