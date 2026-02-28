/**
 * Container binding type declarations
 *
 * Tells TypeScript what app.container.make() returns for each binding key.
 * Without this, container.make('rateLimitService') returns `never`.
 */

import type RateLimitService from '#services/rate_limit_service'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    rateLimitService: RateLimitService
  }
}
