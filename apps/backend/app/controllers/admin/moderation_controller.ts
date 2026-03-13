import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import UserPreference from '#models/user_preference'

/**
 * In-memory global pause flag.
 * Acceptable for single-replica deployment.
 * Exported so webhook_controller and tests can read it directly.
 */
export let isPaused = false

/** Exported setter so tests can reset state between runs. */
export function setIsPaused(value: boolean) {
  isPaused = value
}

export default class ModerationController {
  /**
   * POST /admin/block-user
   * Body: { phone: string, reason?: string }
   */
  async blockUser({ request, response }: HttpContext) {
    const { phone, reason } = request.body() as { phone?: string; reason?: string }

    if (!phone || typeof phone !== 'string') {
      return response.status(422).json({ error: 'phone is required' })
    }

    await UserPreference.updateOrCreate(
      { phoneNumber: phone },
      { blocked: true }
    )

    logger.info('User blocked: %s — reason: %s', phone, reason ?? '(none)')
    return response.status(200).json({ success: true, phone, blocked: true })
  }

  /**
   * POST /admin/unblock-user
   * Body: { phone: string }
   */
  async unblockUser({ request, response }: HttpContext) {
    const { phone } = request.body() as { phone?: string }

    if (!phone || typeof phone !== 'string') {
      return response.status(422).json({ error: 'phone is required' })
    }

    await UserPreference.updateOrCreate(
      { phoneNumber: phone },
      { blocked: false }
    )

    logger.info('User unblocked: %s', phone)
    return response.status(200).json({ success: true, phone, blocked: false })
  }

  /**
   * POST /admin/pause
   * Sets global maintenance mode.
   */
  async pause({ response }: HttpContext) {
    isPaused = true
    logger.info('Global pause activated')
    return response.status(200).json({ success: true, paused: true })
  }

  /**
   * POST /admin/resume
   * Clears global maintenance mode.
   */
  async resume({ response }: HttpContext) {
    isPaused = false
    logger.info('Global pause deactivated')
    return response.status(200).json({ success: true, paused: false })
  }
}
