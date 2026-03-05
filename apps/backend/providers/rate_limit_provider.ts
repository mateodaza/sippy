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

    const { default: env } = await import('#start/env')
    if (!env.get('WHATSAPP_APP_SECRET')) {
      throw new Error(
        'WHATSAPP_APP_SECRET is required. Webhook signature verification cannot be disabled.'
      )
    }

    // Warn on missing security secrets that gate critical functionality
    if (env.get('INDEXER_URL') && !env.get('INDEXER_API_SECRET')) {
      console.warn('[warn] INDEXER_URL is set but INDEXER_API_SECRET is empty — indexer calls will fail auth')
    }
    if (!env.get('NOTIFY_SECRET')) {
      console.warn('[warn] NOTIFY_SECRET not set — /notify-fund endpoint will reject all requests')
    }
    if (!env.get('EXPORT_AUDIT_SECRET')) {
      console.warn('[warn] EXPORT_AUDIT_SECRET not set — phone hashes will be null in indexer registrations')
    }
  }

  async shutdown() {
    const rateLimitService = await this.app.container.make('rateLimitService')
    rateLimitService.stopCleanupTimers()
  }
}
