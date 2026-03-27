import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

export default class PublicStatsController {
  async index({ response }: HttpContext) {
    let totalVolumeRow
    let totalTransfersRow
    let activeWalletsRow
    let registeredUsersRow
    let dailyVolumes
    try {
      ;[totalVolumeRow, totalTransfersRow, activeWalletsRow, registeredUsersRow, dailyVolumes] =
        await Promise.all([
          db
            .from('onchain.daily_volume')
            .select(db.raw('COALESCE(SUM(total_usdc_volume), 0)::text as total'))
            .first(),

          db
            .from('onchain.daily_volume')
            .select(db.raw('COALESCE(SUM(transfer_count), 0)::text as total'))
            .first(),

          db.from('onchain.account').where('tx_count', '>', 0).count('* as total').first(),

          db.from('phone_registry').whereNotNull('wallet_address').count('* as total').first(),

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
    } catch (error) {
      logger.error({ err: error }, 'Public stats query failed')
      return response.status(503).json({ error: 'Stats temporarily unavailable' })
    }

    const dailyVolumesData = (
      dailyVolumes as { date: string; totalUsdcVolume: string; transferCount: number }[]
    )
      .map((v) => ({
        date: v.date,
        totalUsdcVolume: String(v.totalUsdcVolume),
        transferCount: Number(v.transferCount),
      }))
      .reverse()

    return response.json({
      totalVolume: String(totalVolumeRow?.total ?? '0'),
      totalTransfers: Number(totalTransfersRow?.total ?? 0),
      activeWallets: Number(activeWalletsRow?.total ?? 0),
      registeredUsers: Number(registeredUsersRow?.total ?? 0),
      dailyVolumes: dailyVolumesData,
    })
  }
}
