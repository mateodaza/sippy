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
    let onboardedResult
    let countriesResult
    try {
      ;[
        totalVolumeRow,
        totalTransfersRow,
        activeWalletsRow,
        registeredUsersRow,
        dailyVolumes,
        onboardedResult,
        countriesResult,
      ] = await Promise.all([
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

        // USDC onboarded: transfers from a non-Sippy address to a Sippy wallet.
        // Sippy wallets = phone_registry ∪ wallet_aliases.
        db.rawQuery(`
          WITH sippy_wallets AS (
            SELECT LOWER(wallet_address) AS addr
              FROM phone_registry
             WHERE wallet_address IS NOT NULL
            UNION
            SELECT LOWER(address) FROM wallet_aliases
          )
          SELECT COALESCE(SUM(amount::numeric), 0)::text AS total
            FROM onchain.transfer t
           WHERE LOWER(t."to")   IN (SELECT addr FROM sippy_wallets)
             AND LOWER(t."from") NOT IN (SELECT addr FROM sippy_wallets)
        `),

        // Country distribution: registered users by phone-prefix country code.
        db.rawQuery(`
          SELECT
            CASE
              WHEN phone_number LIKE '+57%'  THEN 'CO'
              WHEN phone_number LIKE '+52%'  THEN 'MX'
              WHEN phone_number LIKE '+54%'  THEN 'AR'
              WHEN phone_number LIKE '+55%'  THEN 'BR'
              WHEN phone_number LIKE '+51%'  THEN 'PE'
              WHEN phone_number LIKE '+56%'  THEN 'CL'
              WHEN phone_number LIKE '+58%'  THEN 'VE'
              WHEN phone_number LIKE '+593%' THEN 'EC'
              WHEN phone_number LIKE '+503%' THEN 'SV'
              WHEN phone_number LIKE '+502%' THEN 'GT'
              WHEN phone_number LIKE '+34%'  THEN 'ES'
              WHEN phone_number LIKE '+1%'   THEN 'US'
              ELSE 'OTHER'
            END AS code,
            COUNT(*)::int AS users
          FROM phone_registry
          WHERE wallet_address IS NOT NULL
          GROUP BY 1
          ORDER BY users DESC
        `),
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

    const countries = (countriesResult?.rows ?? []).map((r: { code: string; users: number }) => ({
      code: r.code,
      users: Number(r.users),
    }))

    return response.json({
      totalVolume: String(totalVolumeRow?.total ?? '0'),
      totalTransfers: Number(totalTransfersRow?.total ?? 0),
      activeWallets: Number(activeWalletsRow?.total ?? 0),
      registeredUsers: Number(registeredUsersRow?.total ?? 0),
      usdcOnboarded: String(onboardedResult?.rows?.[0]?.total ?? '0'),
      countries,
      dailyVolumes: dailyVolumesData,
    })
  }
}
