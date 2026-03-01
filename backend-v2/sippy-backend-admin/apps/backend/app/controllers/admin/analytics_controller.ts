import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class AnalyticsController {
  async index({ inertia }: HttpContext) {
    const [parseBySource, topIntents, messagesPerDay] = await Promise.all([
      db.from('parse_log').select('parse_source').count('* as total').groupBy('parse_source'),
      db
        .from('parse_log')
        .select('intent')
        .count('* as total')
        .groupBy('intent')
        .orderBy('total', 'desc')
        .limit(10),
      db
        .from('parse_log')
        .select(db.raw('DATE(created_at) as day'))
        .count('* as total')
        .groupBy('day')
        .orderBy('day', 'desc')
        .limit(14),
    ])

    return inertia.render('admin/analytics', {
      parseBySource,
      topIntents,
      messagesPerDay,
    })
  }
}
