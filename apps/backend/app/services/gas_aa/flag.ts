/**
 * Gas → AA — the master flag, in its own dependency-light module (no viem) so
 * the send hot path can gate on it without importing the off-CDP stack. Mirrors
 * #season/guard. Default OFF; only the literal "true" turns it on.
 */

import env from '#start/env'

export function isGasAaEnabled(): boolean {
  return (env.get('GAS_AA_ENABLED', '') || '').trim().toLowerCase() === 'true'
}
