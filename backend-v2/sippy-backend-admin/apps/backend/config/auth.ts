// TODO: Phase 5 — Admin dashboard auth.
// Uncomment when AdminUser model and admin_users table are ready.

import { defineConfig } from '@adonisjs/auth'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

const authConfig = defineConfig({
  default: 'api',
  guards: {
    // api: tokensGuard({
    //   provider: tokensUserProvider({
    //     tokens: 'accessTokens',
    //     model: () => import('#models/user'),
    //   }),
    // }),
    // web: sessionGuard({
    //   useRememberMeTokens: false,
    //   provider: sessionUserProvider({
    //     model: () => import('#models/user'),
    //   }),
    // }),
  },
})

export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
