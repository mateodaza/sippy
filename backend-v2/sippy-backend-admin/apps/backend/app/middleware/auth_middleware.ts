// TODO: Phase 5 — Re-enable when AdminUser model + admin_users table are ready.
// Sippy uses CdpAuthMiddleware for user auth (CDP token validation), not AdonisJS guards.
//
// import type { HttpContext } from '@adonisjs/core/http'
// import type { NextFn } from '@adonisjs/core/types/http'
// import type { Authenticators } from '@adonisjs/auth/types'
//
// export default class AuthMiddleware {
//   async handle(
//     ctx: HttpContext,
//     next: NextFn,
//     options: {
//       guards?: (keyof Authenticators)[]
//     } = {}
//   ) {
//     await ctx.auth.authenticateUsing(options.guards)
//     return next()
//   }
// }
