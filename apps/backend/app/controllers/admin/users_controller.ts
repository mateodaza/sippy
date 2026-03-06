import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class UsersController {
  async index({ inertia, request }: HttpContext) {
    const page = request.input('page', 1)
    const users = await db
      .from('phone_registry')
      .select(
        'phone_number',
        'wallet_address',
        'created_at',
        'last_activity',
        'daily_limit'
      )
      .orderBy('last_activity', 'desc')
      .paginate(page, 20)

    // Enrich with on-chain data from indexer DB
    const idx = db.connection('indexer')
    const walletAddresses = users
      .all()
      .map((u) => u.wallet_address?.toLowerCase())
      .filter(Boolean)

    let onchainMap: Record<string, { totalSent: string; totalReceived: string; txCount: number; lastActivity: number }> = {}
    if (walletAddresses.length > 0) {
      try {
        const accounts = await idx
          .from('account')
          .whereIn('address', walletAddresses)
          .select('address', db.raw('total_sent::text as "totalSent"'), db.raw('total_received::text as "totalReceived"'), db.raw('tx_count as "txCount"'), db.raw('last_activity as "lastActivity"'))

        for (const acc of accounts) {
          onchainMap[acc.address] = {
            totalSent: acc.totalSent,
            totalReceived: acc.totalReceived,
            txCount: Number(acc.txCount),
            lastActivity: Number(acc.lastActivity),
          }
        }
      } catch {
        // Indexer DB may not be available — graceful fallback
      }
    }

    const usersJson = users.toJSON()
    usersJson.data = usersJson.data.map((u: any) => {
      const onchain = onchainMap[u.wallet_address?.toLowerCase()] ?? null
      return { ...u, onchain }
    })

    return inertia.render('admin/users/index', { users: usersJson })
  }

  async show({ params, inertia }: HttpContext) {
    const user = await db.from('phone_registry').where('phone_number', params.phone).first()

    if (!user) {
      return inertia.render('admin/users/show', { user: null, activity: [], onchain: null })
    }

    const activity = await db
      .from('parse_log')
      .where('phone_number', params.phone)
      .orderBy('created_at', 'desc')
      .limit(50)

    // Fetch on-chain data for this user
    let onchain = null
    if (user.wallet_address) {
      try {
        const idx = db.connection('indexer')
        onchain = await idx
          .from('account')
          .where('address', user.wallet_address.toLowerCase())
          .select('address', db.raw('total_sent::text as "totalSent"'), db.raw('total_received::text as "totalReceived"'), db.raw('tx_count as "txCount"'), db.raw('last_activity as "lastActivity"'))
          .first()
      } catch {
        // Indexer DB may not be available
      }
    }

    return inertia.render('admin/users/show', { user, activity, onchain })
  }
}
