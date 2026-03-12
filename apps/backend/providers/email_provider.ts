import type { ApplicationService } from '@adonisjs/core/types'

export default class EmailProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { emailService } = await import('#services/email_service')
    emailService.startCleanupTimer()
  }

  async shutdown() {
    const { emailService } = await import('#services/email_service')
    emailService.stopCleanupTimer()
  }
}
