/**
 * DebugController
 *
 * Debugging / observability endpoints.
 * Ported from Express GET /debug/wallets and GET /debug/parse-stats.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'
import { getAllWallets } from '#services/cdp_wallet.service'
import { getModelConfig_public, getRateLimitStats } from '#services/llm.service'

export default class DebugController {
  /**
   * GET /debug/wallets
   *
   * Returns all registered wallets from phone_registry.
   */
  async wallets({ response }: HttpContext) {
    try {
      const wallets = await getAllWallets()
      return response.json({
        wallets: wallets,
        totalWallets: wallets.length,
      })
    } catch (error) {
      logger.error('Error fetching wallets: %o', error)
      return response.status(503).json({
        error: 'Wallet service not ready',
        message: 'Please wait for wallet initialization to complete',
      })
    }
  }

  /**
   * GET /debug/parse-stats
   *
   * Returns parse pipeline statistics from the last 24 hours.
   * Aggregated by parse_source, status, and model.
   */
  async parseStats({ response }: HttpContext) {
    try {
      const result = await query(`
        SELECT
          parse_source,
          status,
          model,
          COUNT(*) as count,
          AVG(latency_ms)::int as avg_latency_ms,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens
        FROM parse_log
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY parse_source, status, model
        ORDER BY count DESC
      `)

      return response.json({
        stats: result.rows,
        models: getModelConfig_public(),
        rateLimits: getRateLimitStats(),
      })
    } catch (error) {
      logger.error('Error querying parse stats: %o', error)
      return response.status(500).json({ error: 'Failed to query parse stats' })
    }
  }
}
