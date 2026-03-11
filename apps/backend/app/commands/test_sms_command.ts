/**
 * Test SMS Command
 *
 * Sends a test OTP via Twilio to verify the SMS pipeline works.
 * Usage: node ace test:sms +573001234567
 *
 * This is a dev-only command — disabled in production.
 */

import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class TestSmsCommand extends BaseCommand {
  static commandName = 'test:sms'
  static description = 'Send a test OTP SMS via Twilio (dev only)'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Phone number in E.164 format (e.g. +573001234567)' })
  declare phone: string

  async run() {
    if (process.env.NODE_ENV === 'production') {
      this.logger.error('This command is disabled in production')
      return
    }

    const e164 = /^\+[1-9]\d{1,14}$/
    if (!e164.test(this.phone)) {
      this.logger.error('Invalid phone format. Use E.164: +573001234567')
      return
    }

    const { otpService } = await import('#services/otp_service')

    this.logger.info(`Sending test OTP to ${this.phone}...`)

    try {
      const result = await otpService.sendOtp(this.phone)

      if ('error' in result) {
        this.logger.error(`Rate limited. Retry after ${result.retryAfter}s`)
        return
      }

      this.logger.success(`OTP sent to ${this.phone}`)
      this.logger.info('Check your phone for the SMS from Twilio')
      this.logger.info('The OTP will expire in 5 minutes')
    } catch (error: any) {
      this.logger.error(`Failed to send SMS: ${error.message}`)
      if (error.response?.data) {
        this.logger.error(JSON.stringify(error.response.data, null, 2))
      }
    }
  }
}
