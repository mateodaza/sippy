import type { ApplicationService } from '@adonisjs/core/types'

export default class RateLimitProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('rateLimitService', async () => {
      const { default: RateLimitService } = await import('#services/rate_limit_service')
      return new RateLimitService()
    })
  }

  async boot() {
    const rateLimitService = await this.app.container.make('rateLimitService')
    const { default: logger } = await import('@adonisjs/core/services/logger')
    rateLimitService.setLogger(logger)
    rateLimitService.startCleanupTimers()

    // Fail fast in production if webhook signature verification is disabled
    const { default: env } = await import('#start/env')
    if (!env.get('WHATSAPP_APP_SECRET')) {
      if (env.get('NODE_ENV') === 'production') {
        throw new Error(
          'WHATSAPP_APP_SECRET is required in production. Webhook signature verification cannot be disabled.'
        )
      }
      console.warn('[warn] WHATSAPP_APP_SECRET not set — webhook signature verification is disabled')
    }
  }

  async shutdown() {
    const rateLimitService = await this.app.container.make('rateLimitService')
    rateLimitService.stopCleanupTimers()
  }
}
