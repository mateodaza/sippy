/**
 * SMART MODE — cohort gate
 *
 * Decides whether a given phone should hit SMART MODE for the inbound
 * message it just sent. Two layers:
 *
 *   1. ENV killswitch — `SMART_MODE_ENABLED=true` must be set, otherwise
 *      every phone gets `false` and SMART code paths are bypassed entirely.
 *      Default off so a config-less deploy can't change behavior.
 *
 *   2. Cohort match — once the env flag is on:
 *        • If `SMART_MODE_COHORT_ALL=true`: everyone qualifies (post-event v2)
 *        • Else: phone must be linked to an event via the existing
 *          `user_event_links` table — specifically, an existing row whose
 *          `metadata.source` starts with the `pizza-day` prefix. (The table
 *          has no status column; presence of the row IS the activation.)
 *          Plumbed through PR #19 (`linkUserToEvent(phone, slug, step, source)`).
 *
 * Pure read against existing tables. No new migration, no new schema.
 * Defensive: any DB error returns `false` so SMART MODE failing-closed
 * means "use the existing parser" — never opens up a path that wasn't on.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'

const COHORT_SOURCE_PREFIX = 'pizza-day'

/**
 * True when the env killswitch is on. Cheap synchronous check used by the
 * dispatcher to short-circuit before any DB call.
 */
export function isSmartModeFeatureEnabled(): boolean {
  return env.get('SMART_MODE_ENABLED') === 'true'
}

/**
 * Returns true if this phone should hit SMART MODE on the current message.
 *
 * Layer order matters: env first (zero cost), then DB lookup. A `false`
 * return is the safe outcome — SMART MODE skipped, existing parser used.
 *
 * NEVER throws. DB errors degrade to `false` with a warn log so a flaky
 * postgres can't silently widen the rollout.
 */
export async function isSmartModeEnabledFor(phoneNumber: string): Promise<boolean> {
  if (!isSmartModeFeatureEnabled()) return false

  if (env.get('SMART_MODE_COHORT_ALL') === 'true') return true

  // Cohort match: phone must be event-linked with a source tag in the
  // pizza-day family. Resolves the user-pref key first to handle the
  // bare-digit/E.164 legacy split.
  try {
    const key = await resolveUserPrefKey(phoneNumber)
    const r = await query<{ source: string | null }>(
      `SELECT metadata->>'source' AS source
       FROM user_event_links
       WHERE phone_number = $1
         AND metadata->>'source' LIKE $2
       LIMIT 1`,
      [key, `${COHORT_SOURCE_PREFIX}%`]
    )
    return r.rows.length > 0
  } catch (err) {
    logger.warn(
      { phoneNumber, err },
      'smart_mode.cohort: DB error checking cohort — failing closed (skip SMART MODE)'
    )
    return false
  }
}
