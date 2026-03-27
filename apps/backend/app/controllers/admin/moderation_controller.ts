import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import UserPreference from '#models/user_preference'
import { canonicalizePhone } from '#utils/phone'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { stopGasRefuelPoller, startGasRefuelPoller } from '#services/gas_refuel_poller.service'

/**
 * In-memory global pause flag.
 * Acceptable for single-replica deployment.
 */
let isPaused = false

/** Exported getter so other modules can read the pause state. */
export function getIsPaused(): boolean {
  return isPaused
}

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

    const canonical = canonicalizePhone(phone)
    if (!canonical) {
      return response.status(422).json({ error: 'Invalid phone number' })
    }

    try {
      const prefKey = await resolveUserPrefKey(canonical)
      await UserPreference.updateOrCreate({ phoneNumber: prefKey }, { blocked: true })
    } catch (error) {
      logger.error('Failed to block user %s: %o', canonical, error)
      return response.status(500).json({ error: 'Failed to block user' })
    }

    logger.info('User blocked: %s — reason: %s', canonical, reason ?? '(none)')
    return response.status(200).json({ success: true, phone: canonical, blocked: true })
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

    const canonical = canonicalizePhone(phone)
    if (!canonical) {
      return response.status(422).json({ error: 'Invalid phone number' })
    }

    try {
      const prefKey = await resolveUserPrefKey(canonical)
      await UserPreference.updateOrCreate({ phoneNumber: prefKey }, { blocked: false })
    } catch (error) {
      logger.error('Failed to unblock user %s: %o', canonical, error)
      return response.status(500).json({ error: 'Failed to unblock user' })
    }

    logger.info('User unblocked: %s', canonical)
    return response.status(200).json({ success: true, phone: canonical, blocked: false })
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

  /**
   * POST /admin/restart-poller
   * Stops and restarts the GasRefuel log poller.
   */
  async restartPoller({ response }: HttpContext) {
    stopGasRefuelPoller()
    startGasRefuelPoller()
    logger.info('GasRefuel poller restarted via admin')
    return response.status(200).json({ success: true })
  }
}
