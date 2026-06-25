/**
 * Admin Season controller (Phase A).
 *
 * The ONLY HTTP surface Season 1 exposes in Phase A, and it is admin-only
 * (gated by middleware.adminRole({ role: 'admin' }) in start/routes.ts) — there
 * is no public season endpoint until the dashboard ships in Phase B.
 *
 * Triggers a shadow-mode recompute of season.score from the event log. Refuses
 * unless SEASON1_ENABLED is on, so it can't populate tables in an env that
 * hasn't opted in.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { isSeason1Enabled } from '#season/guard'
import { recompute, rebuildAll } from '#season/recompute'

export default class SeasonController {
  /**
   * POST /admin/season/recompute
   * Body: { wallet?: string, rebuild?: boolean }
   *   - wallet present → recompute just that wallet
   *   - rebuild=true    → TRUNCATE season.score and rebuild every wallet
   *   - neither         → incremental project-all + rebuild
   */
  async recompute({ request, response }: HttpContext) {
    if (!isSeason1Enabled()) {
      return response.status(409).json({ ok: false, error: 'SEASON1_ENABLED is off' })
    }

    const wallet = (request.input('wallet') as string | undefined)?.trim() || undefined
    const rebuildRaw = request.input('rebuild')
    const rebuild = rebuildRaw === true || rebuildRaw === 'true'

    try {
      const summary = wallet
        ? await recompute(wallet)
        : rebuild
          ? await rebuildAll()
          : await recompute()
      return response.json({ ok: true, summary })
    } catch (err) {
      logger.error('[season1] admin recompute failed: %o', err)
      return response.status(500).json({ ok: false, error: 'recompute failed' })
    }
  }
}
