/**
 * Gas → AA — durability reconciler (P1).
 *
 * The submitter persists the signed op (`prepared`) BEFORE broadcasting, but its
 * own crash-recovery only runs inside the originating request. If the PROCESS
 * dies after markPrepared (deploy, OOM, kill) the row is orphaned: nothing
 * rebroadcasts the exact signed op or settles it, and a later user retry could
 * create a new op — violating "once prepared, never a new op". This sweep is the
 * out-of-band recovery: scheduled periodically + on boot (scheduler_provider).
 *
 * Runs regardless of GAS_AA_ENABLED — it must still clean up after a flag-off
 * rollback — and is cheap when idle: it only pulls the off-CDP submitter (viem)
 * when there's a genuinely stuck op to rebroadcast.
 */

import logger from '@adonisjs/core/services/logger'
import { sweepExpired, listStuckPrepared } from '#services/gas_aa/ledger'

// A prepared row must sit un-landed longer than this before we treat its owning
// request as dead — comfortably beyond a normal wait-for-receipt.
const GRACE_SEC = 120
// Alert (don't auto-fail) when an op is stuck pathologically long — it may yet
// mine, so failing it could mislabel a transfer that actually moved.
const ALERT_AGE_SEC = 3600

export interface ReconcileResult {
  swept: number
  reconciled: number
  stillStuck: number
}

export async function reconcileGasAaOnce(): Promise<ReconcileResult> {
  // 1. Release stale AUTHORIZED nonce reservations (never broadcast).
  const sweptIds = await sweepExpired()
  const swept = sweptIds.length

  // 2. Recover stuck PREPARED ops (broadcast, owning request died).
  const stuck = await listStuckPrepared(GRACE_SEC)
  if (stuck.length === 0) return { swept, reconciled: 0, stillStuck: 0 }

  // Only now is the viem submitter needed — there's real work.
  const { reconcilePrepared } = await import('#services/gas_aa/off_cdp_submitter')
  let reconciled = 0
  let stillStuck = 0
  for (const op of stuck) {
    try {
      await reconcilePrepared(op.id, op.userOpHash)
      reconciled++
      logger.info(`gas_aa reconciler: settled stuck op ${op.id} (age ${op.ageSec}s)`)
    } catch (e) {
      stillStuck++
      const msg = e instanceof Error ? e.message : String(e)
      // Never auto-fail: an idempotent rebroadcast is harmless and the op may yet
      // mine, so the next pass retries. Alert loudly only on pathological age.
      if (op.ageSec >= ALERT_AGE_SEC) {
        logger.error(
          { alert: 'gas-aa-stuck-op', opId: op.id, userOpHash: op.userOpHash, ageSec: op.ageSec },
          `gas_aa reconciler: op ${op.id} unrecovered after ${op.ageSec}s — needs manual review (${msg})`
        )
      } else {
        logger.warn(`gas_aa reconciler: op ${op.id} not yet settled (age ${op.ageSec}s): ${msg}`)
      }
    }
  }
  return { swept, reconciled, stillStuck }
}
