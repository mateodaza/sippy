// TODO: Phase 5 — Admin dashboard auth.
// Uncomment defineConfig + guards when AdminUser model and admin_users table are ready.
// Current Sippy auth uses CdpAuthMiddleware (custom CDP token validation), not AdonisJS guards.
//
// import { defineConfig } from '@adonisjs/auth'
// import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'
// import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
// import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'
//
// const authConfig = defineConfig({
//   default: 'api',
//   guards: {
//     api: tokensGuard({
//       provider: tokensUserProvider({
//         tokens: 'accessTokens',
//         model: () => import('#models/user'),
//       }),
//     }),
//   },
// })
//
// export default authConfig
//
// declare module '@adonisjs/auth/types' {
//   export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
// }
// declare module '@adonisjs/core/types' {
//   interface EventsList extends InferAuthEvents<Authenticators> {}
// }
