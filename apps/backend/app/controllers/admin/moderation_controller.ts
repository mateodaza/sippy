import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import UserPreference from '#models/user_preference'
import { canonicalizePhone } from '#utils/phone'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { stopGasRefuelPoller, startGasRefuelPoller } from '#services/gas_refuel_poller.service'
import { isSeason1Enabled } from '#season/guard'
import { listFlags, reviewFlag, type ReviewStatus } from '#season/flags'

/**
 * In-memory global pause flag.
 * Acceptable for single-replica deployment.
 */
let isPaused = false

/** Exported getter so other modules can read the pause state. */
export function getIsPaused(): boolean {
  return isPaused
}

/** Exported setter so tests can reset state between runs. */
export function setIsPaused(value: boolean) {
  isPaused = value
}

export default class ModerationController {
  /**
   * POST /admin/block-user
   * Body: { phone: string, reason?: string }
   */
  async blockUser({ request, response }: HttpContext) {
    const { phone, reason } = request.body() as { phone?: string; reason?: string }

    if (!phone || typeof phone !== 'string') {
      return response.status(422).json({ error: 'phone is required' })
    }

    const canonical = canonicalizePhone(phone)
    if (!canonical) {
      return response.status(422).json({ error: 'Invalid phone number' })
    }

    try {
      const prefKey = await resolveUserPrefKey(canonical)
      await UserPreference.updateOrCreate({ phoneNumber: prefKey }, { blocked: true })
    } catch (error) {
      logger.error('Failed to block user %s: %o', canonical, error)
      return response.status(500).json({ error: 'Failed to block user' })
    }

    logger.info('User blocked: %s — reason: %s', canonical, reason ?? '(none)')
    return response.status(200).json({ success: true, phone: canonical, blocked: true })
  }

  /**
   * POST /admin/unblock-user
   * Body: { phone: string }
   */
  async unblockUser({ request, response }: HttpContext) {
    const { phone } = request.body() as { phone?: string }

    if (!phone || typeof phone !== 'string') {
      return response.status(422).json({ error: 'phone is required' })
    }

    const canonical = canonicalizePhone(phone)
    if (!canonical) {
      return response.status(422).json({ error: 'Invalid phone number' })
    }

    try {
      const prefKey = await resolveUserPrefKey(canonical)
      await UserPreference.updateOrCreate({ phoneNumber: prefKey }, { blocked: false })
    } catch (error) {
      logger.error('Failed to unblock user %s: %o', canonical, error)
      return response.status(500).json({ error: 'Failed to unblock user' })
    }

    logger.info('User unblocked: %s', canonical)
    return response.status(200).json({ success: true, phone: canonical, blocked: false })
  }

  /**
   * POST /admin/pause
   * Sets global maintenance mode.
   */
  async pause({ response }: HttpContext) {
    isPaused = true
    logger.info('Global pause activated')
    return response.status(200).json({ success: true, paused: true })
  }

  /**
   * POST /admin/resume
   * Clears global maintenance mode.
   */
  async resume({ response }: HttpContext) {
    isPaused = false
    logger.info('Global pause deactivated')
    return response.status(200).json({ success: true, paused: false })
  }

  /**
   * POST /admin/restart-poller
   * Stops and restarts the GasRefuel log poller.
   */
  async restartPoller({ response }: HttpContext) {
    stopGasRefuelPoller()
    startGasRefuelPoller()
    logger.info('GasRefuel poller restarted via admin')
    return response.status(200).json({ success: true })
  }

  // ── Season 1 sybil flag review queue (Phase C / C2) ──────────────────────────
  // Guarded by SEASON1_ENABLED so the queue is dormant when the season is off.
  // Confirmed flags withhold (future) redeemable perks but NEVER block a send.

  /**
   * GET /admin/season/flags?status=open
   * Lists season.flag rows (detail is masked-only — no raw PII).
   */
  async seasonFlags({ request, response }: HttpContext) {
    if (!isSeason1Enabled()) {
      return response.status(409).json({ ok: false, error: 'SEASON1_ENABLED is off' })
    }
    const status = (request.input('status') as string | undefined)?.trim() || undefined
    const flags = await listFlags(status)
    return response.json({ ok: true, flags })
  }

  /**
   * POST /admin/season/flags/:id/review
   * Body: { status: 'confirmed' | 'cleared' }
   * Stamps reviewed_at + reviewed_by (the acting admin) for the audit trail.
   */
  async reviewSeasonFlag(ctx: HttpContext) {
    const { request, response, params } = ctx
    if (!isSeason1Enabled()) {
      return response.status(409).json({ ok: false, error: 'SEASON1_ENABLED is off' })
    }
    const id = Number.parseInt(params.id, 10)
    if (!Number.isFinite(id)) {
      return response.status(422).json({ ok: false, error: 'invalid flag id' })
    }
    const status = request.input('status') as ReviewStatus
    if (status !== 'confirmed' && status !== 'cleared') {
      return response
        .status(422)
        .json({ ok: false, error: "status must be 'confirmed' or 'cleared'" })
    }
    // The acting admin (auth.user) is the reviewer; fall back defensively.
    const u = ctx.auth?.user as { email?: string; id?: number | string } | undefined
    const reviewedBy = u?.email ?? (u?.id === undefined ? 'admin' : String(u.id))

    const result = await reviewFlag(id, status, reviewedBy)
    if (!result) {
      return response.status(404).json({ ok: false, error: 'flag not found or already reviewed' })
    }
    // Clearing lifts enforcement; recompute the affected wallets so the restored
    // points actually land. Best-effort — the review itself already succeeded.
    let recomputed = 0
    if (result.affectedWallets.length > 0) {
      try {
        const { recomputeWallet } = await import('#season/recompute')
        for (const w of result.affectedWallets) {
          await recomputeWallet(w)
          recomputed += 1
        }
      } catch (err) {
        logger.warn('[season1] post-clear recompute failed (non-blocking): %o', err)
      }
    }
    logger.info('[season1] flag %d %s by %s (recomputed %d)', id, status, reviewedBy, recomputed)
    return response.json({ ok: true, flag: result.flag, recomputed })
  }
}
