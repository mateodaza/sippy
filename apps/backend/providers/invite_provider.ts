import type { ApplicationService } from '@adonisjs/core/types'

export default class InviteProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { startRetryTimer } = await import('#services/invite.service')
    startRetryTimer()
  }

  async shutdown() {
    const { stopRetryTimer } = await import('#services/invite.service')
    stopRetryTimer()
  }
}
