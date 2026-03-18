import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { query } from '#services/db'
import GasRefuelStatus from '#models/indexer/gas_refuel_status'
import SippyWallet from '#models/indexer/sippy_wallet'
import { getRefuelService } from '#services/refuel.service'

export default class AnalyticsController {
  async index({ inertia }: HttpContext) {
    const todayUnix = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
    const idx = db.connection('indexer')

    const [totalVolumeRow, registeredUsers, activeTodayRow, gasStatus, fundFlow, topUsers, dailyVolumes] =
      await Promise.all([
        // 1. Total USDC volume (all-time)
        idx
          .from('daily_volume')
          .select(db.raw('COALESCE(SUM(total_usdc_volume), 0)::text as total'))
          .first(),

        // 2. Registered users count
        SippyWallet.query().where('is_active', true).count('* as total').first(),

        // 3. Active users in last 24h
        idx
          .from('transfer')
          .where('timestamp', '>=', todayUnix - 86400)
          .select(
            db.raw(`COUNT(DISTINCT CASE
              WHEN "from" IN (SELECT address FROM offchain.sippy_wallet) THEN "from"
              WHEN "to" IN (SELECT address FROM offchain.sippy_wallet) THEN "to"
            END) as total`)
          )
          .first(),

        // 4. Gas refuel status singleton
        GasRefuelStatus.first(),

        // 5. Fund flow classification
        idx.rawQuery(`
          SELECT
            CASE
              WHEN sf.address IS NOT NULL AND st.address IS NOT NULL THEN 'internal'
              WHEN sf.address IS NULL AND st.address IS NOT NULL THEN 'inbound'
              WHEN sf.address IS NOT NULL AND st.address IS NULL THEN 'outbound'
            END as flow_type,
            COALESCE(SUM(t.amount), 0)::text as volume,
            COUNT(*)::text as tx_count
          FROM transfer t
          LEFT JOIN offchain.sippy_wallet sf ON t."from" = sf.address
          LEFT JOIN offchain.sippy_wallet st ON t."to" = st.address
          WHERE sf.address IS NOT NULL OR st.address IS NOT NULL
          GROUP BY flow_type
          ORDER BY volume DESC
        `),

        // 6. Top users by volume (only sippy wallets, ranked by total volume)
        idx
          .from('account')
          .whereIn('address', idx.from('offchain.sippy_wallet').select('address'))
          .select('address', db.raw('total_sent::text as "totalSent"'), db.raw('total_received::text as "totalReceived"'), db.raw('tx_count as "txCount"'), db.raw('(total_sent + total_received)::text as "totalVolume"'))
          .orderBy(db.raw('total_sent + total_received'), 'desc')
          .limit(10),

        // 7. Daily volumes (last 30 days)
        idx
          .from('daily_volume')
          .select('date', db.raw('total_usdc_volume::text as "totalUsdcVolume"'), db.raw('transfer_count as "transferCount"'))
          .orderBy('date', 'desc')
          .limit(30),
      ])

    // Fetch live contract balance from on-chain
    const refuelService = getRefuelService()
    const contractBalanceEth = refuelService.isAvailable()
      ? await refuelService.getContractBalance()
      : '0'

    // Serialize for Inertia
    const gasStatusData = gasStatus
      ? {
          totalRefuels: gasStatus.totalRefuels,
          totalEthSpent: String(gasStatus.totalEthSpent),
          isPaused: gasStatus.isPaused,
          contractBalance: contractBalanceEth,
        }
      : null

    const topUsersData = (topUsers as { address: string; totalSent: string; totalReceived: string; txCount: number; totalVolume: string }[]).map((u) => ({
      address: u.address,
      totalSent: String(u.totalSent),
      totalReceived: String(u.totalReceived),
      totalVolume: String(u.totalVolume),
      txCount: Number(u.txCount),
    }))

    const dailyVolumesData = (dailyVolumes as { date: string; totalUsdcVolume: string; transferCount: number }[])
      .map((v) => ({
        date: v.date,
        totalUsdcVolume: String(v.totalUsdcVolume),
        transferCount: Number(v.transferCount),
      }))
      .reverse()

    const fundFlowData = (fundFlow.rows as { flow_type: string; volume: string; tx_count: string }[]).map(
      (r) => ({
        flowType: r.flow_type,
        volume: r.volume,
        txCount: r.tx_count,
      })
    )

    return inertia.render('admin/analytics', {
      totalVolume: String(totalVolumeRow?.total ?? '0'),
      registeredUsers: Number(registeredUsers?.$extras?.total ?? 0),
      activeToday: Number(activeTodayRow?.total ?? 0),
      gasStatus: gasStatusData,
      fundFlow: fundFlowData,
      topUsers: topUsersData,
      dailyVolumes: dailyVolumesData,
    })
  }

  /**
   * GET /admin/parse-patterns
   *
   * Returns the top 50 scrubbed phrases that the LLM successfully classified,
   * grouped by intent and language. Use this to find recurring patterns that
   * should be promoted to regex rules.
   *
   * Protected by admin session auth (same as other /admin routes).
   */
  async parsePatterns({ response }: HttpContext) {
    const result = await query<{
      matched_phrase: string
      intent: string
      detected_language: string | null
      frequency: string
    }>(
      `SELECT matched_phrase, intent, detected_language, COUNT(*)::text AS frequency
       FROM parse_log
       WHERE parse_source = 'llm'
         AND status = 'llm-success'
         AND matched_phrase IS NOT NULL
       GROUP BY matched_phrase, intent, detected_language
       ORDER BY COUNT(*) DESC
       LIMIT 50`
    )

    return response.json({ patterns: result.rows })
  }
}
