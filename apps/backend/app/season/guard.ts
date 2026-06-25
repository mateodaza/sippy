/**
 * Season 1 — env guard + season identity.
 *
 * Kept in its own tiny module (no DB, no heavy imports) so the webhook hot
 * path can import `isSeason1Enabled()` without pulling in the scoring stack.
 *
 * Mirrors the SMART_MODE_ENABLED / SIPPY_CURRENT_EVENT_SLUG pattern: a
 * string env var, default OFF. Anything other than the literal "true"
 * (case-insensitive) is treated as disabled.
 */

import env from '#start/env'

/** The active season id for Phase A. Single season for now. */
export const ACTIVE_SEASON_ID = 's1'

/**
 * True only when SEASON1_ENABLED is explicitly "true". When false, nothing
 * under #season/* should perform writes — the bot must be unaffected.
 */
export function isSeason1Enabled(): boolean {
  return (env.get('SEASON1_ENABLED', '') || '').trim().toLowerCase() === 'true'
}
