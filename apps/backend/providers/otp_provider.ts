import type { ApplicationService } from '@adonisjs/core/types'

export default class OtpProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const { otpService } = await import('#services/otp_service')
    otpService.startCleanupTimer()
  }

  async shutdown() {
    const { otpService } = await import('#services/otp_service')
    otpService.stopCleanupTimer()
  }
}
