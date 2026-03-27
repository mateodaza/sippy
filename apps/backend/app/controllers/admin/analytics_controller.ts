import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { query } from '#services/db'
import { getRefuelService } from '#services/refuel.service'
import { getSippySpenderAccount } from '#services/embedded_wallet.service'
import { getRpcUrl } from '#config/network'
import { ethers } from 'ethers'

export default class AnalyticsController {
  async index({ inertia }: HttpContext) {
    const todayUnix = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)

    const [
      totalVolumeRow,
      registeredUsers,
      activeTodayRow,
      gasStatus,
      fundFlow,
      topUsers,
      dailyVolumes,
    ] = await Promise.all([
      // 1. Total USDC volume (all-time)
      db
        .from('onchain.daily_volume')
        .select(db.raw('COALESCE(SUM(total_usdc_volume), 0)::text as total'))
        .first(),

      // 2. Registered users count
      db.from('phone_registry').whereNotNull('wallet_address').count('* as total').first(),

      // 3. Active users in last 24h
      db
        .from('onchain.transfer')
        .where('timestamp', '>=', todayUnix - 86400)
        .select(
          db.raw(`COUNT(DISTINCT CASE
              WHEN "from" IN (SELECT LOWER(wallet_address) FROM phone_registry WHERE wallet_address IS NOT NULL UNION SELECT address FROM wallet_aliases) THEN "from"
              WHEN "to" IN (SELECT LOWER(wallet_address) FROM phone_registry WHERE wallet_address IS NOT NULL UNION SELECT address FROM wallet_aliases) THEN "to"
            END) as total`)
        )
        .first(),

      // 4. Gas refuel status singleton
      db.from('onchain.gas_refuel_status').where('id', 'singleton').first(),

      // 5. Fund flow classification (registered wallets + legacy aliases)
      db.rawQuery(`
          WITH sippy_wallets AS (
            SELECT LOWER(wallet_address) as address FROM phone_registry WHERE wallet_address IS NOT NULL
            UNION
            SELECT address FROM wallet_aliases
          )
          SELECT
            CASE
              WHEN sf.address IS NOT NULL AND st.address IS NOT NULL THEN 'internal'
              WHEN sf.address IS NULL AND st.address IS NOT NULL THEN 'inbound'
              WHEN sf.address IS NOT NULL AND st.address IS NULL THEN 'outbound'
            END as flow_type,
            COALESCE(SUM(t.amount), 0)::text as volume,
            COUNT(*)::text as tx_count
          FROM onchain.transfer t
          LEFT JOIN sippy_wallets sf ON t."from" = sf.address
          LEFT JOIN sippy_wallets st ON t."to" = st.address
          WHERE sf.address IS NOT NULL OR st.address IS NOT NULL
          GROUP BY flow_type
          ORDER BY volume DESC
        `),

      // 6. Top users by volume (only registered wallets)
      db
        .from('onchain.account')
        .whereIn(
          'address',
          db.raw(`
            SELECT LOWER(wallet_address) FROM phone_registry WHERE wallet_address IS NOT NULL
            UNION SELECT address FROM wallet_aliases
          `)
        )
        .select(
          'address',
          db.raw('total_sent::text as "totalSent"'),
          db.raw('total_received::text as "totalReceived"'),
          db.raw('tx_count as "txCount"'),
          db.raw('(total_sent + total_received)::text as "totalVolume"')
        )
        .orderBy(db.raw('total_sent + total_received'), 'desc')
        .limit(10),

      // 7. Daily volumes (last 30 days)
      db
        .from('onchain.daily_volume')
        .select(
          'date',
          db.raw('total_usdc_volume::text as "totalUsdcVolume"'),
          db.raw('transfer_count as "transferCount"')
        )
        .orderBy('date', 'desc')
        .limit(30),
    ])

    // Fetch live balances from on-chain
    const refuelService = getRefuelService()
    const contractBalanceEth = refuelService.isAvailable()
      ? await refuelService.getContractBalance()
      : '0'

    let spenderBalanceEth = '0'
    let spenderAddress = ''
    try {
      const spender = await getSippySpenderAccount()
      spenderAddress = spender.address
      const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
      const balance = await provider.getBalance(spenderAddress)
      spenderBalanceEth = ethers.utils.formatEther(balance)
    } catch {
      // Spender not initialized or RPC error — show 0
    }

    // Serialize for Inertia
    const gasStatusData = gasStatus
      ? {
          totalRefuels: gasStatus.total_refuels,
          totalEthSpent: String(gasStatus.total_eth_spent),
          isPaused: gasStatus.is_paused,
          contractBalance: contractBalanceEth,
          spenderBalance: spenderBalanceEth,
          spenderAddress,
        }
      : null

    const topUsersData = (
      topUsers as {
        address: string
        totalSent: string
        totalReceived: string
        txCount: number
        totalVolume: string
      }[]
    ).map((u) => ({
      address: u.address,
      totalSent: String(u.totalSent),
      totalReceived: String(u.totalReceived),
      totalVolume: String(u.totalVolume),
      txCount: Number(u.txCount),
    }))

    const dailyVolumesData = (
      dailyVolumes as { date: string; totalUsdcVolume: string; transferCount: number }[]
    )
      .map((v) => ({
        date: v.date,
        totalUsdcVolume: String(v.totalUsdcVolume),
        transferCount: Number(v.transferCount),
      }))
      .reverse()

    const fundFlowData = (
      fundFlow.rows as { flow_type: string; volume: string; tx_count: string }[]
    ).map((r) => ({
      flowType: r.flow_type,
      volume: r.volume,
      txCount: r.tx_count,
    }))

    return inertia.render('admin/analytics', {
      totalVolume: String(totalVolumeRow?.total ?? '0'),
      registeredUsers: Number(registeredUsers?.total ?? 0),
      activeToday: Number(activeTodayRow?.total ?? 0),
      gasStatus: gasStatusData,
      fundFlow: fundFlowData,
      topUsers: topUsersData,
      dailyVolumes: dailyVolumesData,
    })
  }

  /**
   * GET /admin/parse-patterns
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
