import type { ApplicationService } from '@adonisjs/core/types'

export default class VelocityProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { velocityService } = await import('#services/velocity_service')
    const { default: logger } = await import('@adonisjs/core/services/logger')
    velocityService.setLogger(logger)
    velocityService.startCleanupTimers()
  }

  async shutdown() {
    const { velocityService } = await import('#services/velocity_service')
    velocityService.stopCleanupTimers()
  }
}
