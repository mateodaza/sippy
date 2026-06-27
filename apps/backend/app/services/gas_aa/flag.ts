/**
 * Gas → AA — the master flag, in its own dependency-light module (no viem) so
 * the send hot path can gate on it without importing the off-CDP stack. Mirrors
 * #season/guard. Default OFF; only the literal "true" turns it on.
 */

import env from '#start/env'

export function isGasAaEnabled(): boolean {
  return (env.get('GAS_AA_ENABLED', '') || '').trim().toLowerCase() === 'true'
}

/**
 * Track B — sponsored onboarding (slice 2). Gates the setup lane (sponsored
 * deploy+approve in place of GasRefuel + self-paid createSpendPermission). Its
 * OWN flag, independent of the free-send flag: onboarding can be sponsored while
 * sends are not, or vice-versa. Default OFF; only the literal "true" turns it on.
 */
export function isGasAaOnboardEnabled(): boolean {
  return (env.get('GAS_AA_ONBOARD_ENABLED', '') || '').trim().toLowerCase() === 'true'
}
