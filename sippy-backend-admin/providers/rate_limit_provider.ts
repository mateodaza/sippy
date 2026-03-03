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
  }

  async shutdown() {
    const rateLimitService = await this.app.container.make('rateLimitService')
    rateLimitService.stopCleanupTimers()
  }
}
