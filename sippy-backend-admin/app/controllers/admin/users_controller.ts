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
        'daily_spent',
        'daily_limit'
      )
      .orderBy('last_activity', 'desc')
      .paginate(page, 20)

    return inertia.render('admin/users/index', { users: users.toJSON() })
  }

  async show({ params, inertia }: HttpContext) {
    const user = await db.from('phone_registry').where('phone_number', params.phone).first()

    if (!user) {
      return inertia.render('admin/users/show', { user: null, activity: [] })
    }

    const activity = await db
      .from('parse_log')
      .where('phone_number', params.phone)
      .orderBy('created_at', 'desc')
      .limit(50)

    return inertia.render('admin/users/show', { user, activity })
  }
}
