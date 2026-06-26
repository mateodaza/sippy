/**
 * Gas → AA Track B (B1.1d) — sponsored-onboarding endpoints.
 *
 * Thin HTTP layer over `prepareOnboard` (the two-token auth + adopt-first + convergence
 * orchestration) and `submitSetupOp` (B1.1b verify + broadcast). Both are gated on
 * `GAS_AA_ONBOARD_ENABLED` — 404 when off, so the lane is invisible until the flag flips.
 * Auth (JWT → phone + walletAddress) is the `jwtAuth` middleware on the route group.
 */

import type { HttpContext } from '@adonisjs/core/http'
import '#types/container'
import logger from '@adonisjs/core/services/logger'
import { isGasAaOnboardEnabled } from '#services/gas_aa/flag'
import { prepareOnboard } from '#services/gas_aa/onboard_prepare'
import { submitSetupOp } from '#services/gas_aa/setup_submitter'

export default class SetupOpController {
  /**
   * POST /api/setup-op/prepare — build + sponsor the cold deploy+approve op and return
   * it UNSIGNED for the browser to sign. Body: `{ cdpAccessToken }`. All trusted fields
   * are server-resolved (walletAddress from the JWT, userEoa from the CDP token).
   */
  async prepare({ request, response, cdpUser }: HttpContext) {
    if (!isGasAaOnboardEnabled()) return response.status(404).json({ error: 'not_found' })
    const { phoneNumber, walletAddress } = cdpUser!
    const { cdpAccessToken } = request.body()
    if (!cdpAccessToken || typeof cdpAccessToken !== 'string') {
      return response.status(400).json({ error: 'cdpAccessToken is required' })
    }

    try {
      const out = await prepareOnboard({ phoneNumber, walletAddress, cdpAccessToken })
      switch (out.kind) {
        case 'prepared':
          return response.json({
            opId: out.opId,
            unsignedOp: out.unsignedUserOp,
            userOpHash: out.userOpHash,
          })
        case 'alreadyGranted':
          return response.json({ alreadyGranted: true, permissionHash: out.permissionHash })
        case 'fallback':
          // Pre-broadcast sponsorship failure — the frontend runs legacy GasRefuel onboarding.
          return response.json({ sponsored: false, fallback: true, reason: out.reason })
        case 'error':
          return response.status(out.status).json({ error: out.reason })
      }
    } catch (err) {
      logger.error('gas_aa setup-op prepare error: %o', err)
      return response.status(500).json({ error: 'internal error' })
    }
  }

  /**
   * POST /api/setup-op/submit — verify the browser signature, broadcast, settle. Body:
   * `{ opId, signature }`. The op is bound to the caller INSIDE submitSetupOp
   * (`row.sender == walletAddress`), so a leaked opId can't be submitted by another user.
   */
  async submit({ request, response, cdpUser }: HttpContext) {
    if (!isGasAaOnboardEnabled()) return response.status(404).json({ error: 'not_found' })
    const { walletAddress } = cdpUser!
    const { opId, signature } = request.body()
    if (!opId || typeof opId !== 'string' || !signature || typeof signature !== 'string') {
      return response.status(400).json({ error: 'opId and signature are required' })
    }

    try {
      const out = await submitSetupOp({ opId, walletAddress, signature })
      switch (out.status) {
        case 'landed':
          return response.json({
            status: 'landed',
            transactionHash: out.transactionHash,
            userOpHash: out.userOpHash,
          })
        case 'fallback':
          // Pre-broadcast (bad sig / re-sim / bundler reject) — frontend runs legacy.
          return response.json({ status: 'fallback', reason: out.reason })
        case 'conflict':
          // Cancelled / already submitted / not this caller's op — do NOT retry.
          return response.status(409).json({ status: 'conflict', reason: out.reason })
      }
    } catch (err) {
      // SetupOpRevertedError or an unexpected throw — terminal, surfaced as 502.
      logger.error('gas_aa setup-op submit error: %o', err)
      return response.status(502).json({ error: 'sponsored op failed to settle' })
    }
  }
}
