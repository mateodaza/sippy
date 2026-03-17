import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class DashboardController {
  async index({ inertia }: HttpContext) {
    const [userCount, walletCount, messagesToday] = await Promise.all([
      db.from('phone_registry').count('* as total').first(),
      db.from('phone_registry').whereNotNull('wallet_address').count('* as total').first(),
      db
        .from('parse_log')
        .whereRaw('created_at >= CURRENT_DATE')
        .whereIn('status', ['regex-matched', 'normalized-send', 'llm-success', 'loose-matched', 'format-hint'])
        .count('* as total')
        .first(),
    ])

    return inertia.render('admin/dashboard', {
      stats: {
        totalUsers: Number(userCount?.total ?? 0),
        activeWallets: Number(walletCount?.total ?? 0),
        messagesToday: Number(messagesToday?.total ?? 0),
      },
    })
  }
}
