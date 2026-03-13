/**
 * HealthController
 *
 * Ported from Express server.ts: GET / and GET /api/health
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { getAllWallets } from '#services/cdp_wallet.service'
import { query } from '#services/db'
import { getRefuelService } from '#services/refuel.service'
import env from '#start/env'

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
   * GET /health
   *
   * Structured health check for Railway — returns JSON with db, uptime,
   * gasRefuel, whatsapp, and timestamp. Always returns HTTP 200.
   */
  async health({ response }: HttpContext) {
    // DB check
    let db: 'ok' | 'error' = 'error'
    try {
      await query('SELECT 1')
      db = 'ok'
    } catch (error) {
      logger.error('Health /health db check failed: %o', error)
    }

    // Gas refuel balance check
    const balanceStr = await getRefuelService().getContractBalance()
    const balance = Number.parseFloat(balanceStr)
    let gasRefuel: 'healthy' | 'low' | 'critical'
    if (balance > 0.05) {
      gasRefuel = 'healthy'
    } else if (balance > 0.01) {
      gasRefuel = 'low'
    } else {
      gasRefuel = 'critical'
    }

    // WhatsApp config check
    const hasPhoneId = env.get('WHATSAPP_PHONE_NUMBER_ID', '') !== ''
    const hasToken = env.get('WHATSAPP_ACCESS_TOKEN', '') !== ''
    const whatsapp: 'ok' | 'error' = hasPhoneId && hasToken ? 'ok' : 'error'

    return response.json({
      db,
      uptime: Math.floor(process.uptime()),
      gasRefuel,
      whatsapp,
      timestamp: new Date().toISOString(),
    })
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
