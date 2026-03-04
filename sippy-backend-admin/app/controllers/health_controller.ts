/**
 * HealthController
 *
 * Ported from Express server.ts: GET / and GET /api/health
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { getAllWallets } from '#services/cdp_wallet.service'

export default class HealthController {
  /**
   * GET /
   *
   * Liveness check — returns JSON with wallet count.
   * Express: calls getAllWallets(), returns 503 if wallet service not ready.
   */
  async index({ response }: HttpContext) {
    try {
      const wallets = await getAllWallets()
      return response.json({
        status: 'running',
        message: 'Sippy Webhook Server',
        timestamp: new Date().toISOString(),
        registeredWallets: wallets.length,
      })
    } catch (error) {
      logger.error('Health check failed (DB unreachable): %o', error)
      return response.status(503).json({
        status: 'error',
        message: 'Database unreachable',
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * GET /api/health
   *
   * CDP wallet service health check — verifies wallet service via getAllWallets().
   * Returns 503 if wallet service not ready.
   */
  async apiHealth({ response }: HttpContext) {
    try {
      const wallets = await getAllWallets()
      return response.json({
        status: 'ok',
        service: 'Sippy CDP Server Wallet',
        timestamp: new Date().toISOString(),
        wallets: wallets.length,
      })
    } catch (error) {
      logger.error('API health check failed (DB unreachable): %o', error)
      return response.status(503).json({
        status: 'error',
        service: 'Sippy CDP Server Wallet',
        timestamp: new Date().toISOString(),
        message: 'Database unreachable',
      })
    }
  }
}
