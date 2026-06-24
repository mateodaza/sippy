/**
 * #season/params — the §8 tunables, single source of truth.
 *
 * Numbers come from docs/SEASON1_SCORE_SPEC.md §8 (and the verb/tier tables in
 * §1). `loadParams()` reads the JSONB snapshot persisted in season.config.params
 * (so a live season is scored against the params that were active when it
 * launched) and deep-merges it over DEFAULT_PARAMS, so a partial/older snapshot
 * still yields a complete param set.
 *
 * DEFAULT_PARAMS is kept in sync with the seed JSON in
 * 0027_create_season_tables.ts. No I/O here beyond reading config.
 */

import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'

/**
 * Score verbs. The DB `verb` column is free TEXT (like onchain.transfer), so
 * this union is the code-side contract, not a DB CHECK. Phase A only emits
 * `send` / `receive` / `first_send`; the rest are seams for Phase C.
 */
export type Verb =
  | 'first_send'
  | 'send'
  | 'receive'
  | 'onramp' // pending, realized=false — earns nothing until used
  | 'onramp_used' // realization of a pending on-ramp within the window
  | 'offramp'
  | 'active_week'
  | 'new_counterparty'
  | 'referral_unlock_referrer'
  | 'referral_unlock_referee'
  | 'referral_retained'

export type Tier = 'newcomer' | 'activated' | 'active' | 'regular' | 'power'

/** Verbs that carry a sub-linear volume bonus on top of their base points. */
export const VOLUME_BONUS_VERBS: ReadonlySet<Verb> = new Set<Verb>([
  'send',
  'offramp',
  'onramp_used',
])

/** Verbs that count as a "value-out" (drive active / activeWeeks / lastActive). */
export const VALUE_OUT_VERBS: ReadonlySet<Verb> = new Set<Verb>(['send', 'offramp'])

/**
 * Referral verbs — subject to the per-season referral cap + diminishing-after-N
 * (spec §1.3). Grouped here so #season/score has one classification source.
 */
export const REFERRAL_VERBS: ReadonlySet<Verb> = new Set<Verb>([
  'referral_unlock_referrer',
  'referral_unlock_referee',
  'referral_retained',
])

export interface SeasonParams {
  /** Volume slope: volumeBonus = round(min(vCap, K*sqrt(usd))). */
  K: number
  /** Per-tx volume-bonus cap. */
  vCap: number
  /** Per-day earned-points cap (anti-burst). */
  dailyCap: number
  /** Base points per verb. */
  base: Record<Verb, number>
  /** Per (sender→recipient) pair decay: base-only after N sends, 0 after M. */
  pairDecay: { baseOnlyAfter: number; zeroAfter: number }
  /** Recency: weight 1.0 if age ≤ fullDays, 0.5 if ≤ halfDays, else 0. */
  recency: { fullDays: number; halfDays: number }
  /** No qualifying activity in this many days → dormant (score frozen). */
  dormantDays: number
  /** Minimum USD for a send/off-ramp to count as a qualifying value-out. */
  minActiveUsd: number
  /** Referral milestones (Phase C — defaults carried here for the seam). */
  referral: {
    unlockMinSend: number
    unlockWindowDays: number
    retainedWindowDays: number
    seasonCap: number
    decayAfter: number
  }
  /** Pending on-ramp realizes only if used within this window (Phase C). */
  onrampRealizeWindowDays: number
  /** Cap on the +new_counterparty bonus per season (Phase C). */
  newCounterpartySeasonCap: number
  /** Tier gates (score + time + breadth). */
  tiers: {
    active: { minScore: number; minActiveWeeks: number }
    regular: { minScore: number; minActiveWeeks: number; minCounterparties: number }
    power: { minScore: number; minActiveWeeks: number; requiresKyc: boolean }
  }
}

/**
 * Defaults to ship (spec §8). Kept in sync with the season.config seed in
 * 0027_create_season_tables.ts.
 */
export const DEFAULT_PARAMS: SeasonParams = {
  K: 2,
  vCap: 20,
  dailyCap: 150,
  base: {
    first_send: 50,
    send: 10,
    receive: 3,
    onramp: 0,
    onramp_used: 10,
    offramp: 20,
    active_week: 15,
    new_counterparty: 8,
    referral_unlock_referrer: 40,
    referral_unlock_referee: 25,
    referral_retained: 30,
  },
  pairDecay: { baseOnlyAfter: 3, zeroAfter: 8 },
  recency: { fullDays: 30, halfDays: 90 },
  dormantDays: 21,
  minActiveUsd: 1,
  referral: {
    unlockMinSend: 5,
    unlockWindowDays: 14,
    retainedWindowDays: 30,
    seasonCap: 500,
    decayAfter: 10,
  },
  onrampRealizeWindowDays: 14,
  newCounterpartySeasonCap: 10,
  tiers: {
    active: { minScore: 150, minActiveWeeks: 1 },
    regular: { minScore: 600, minActiveWeeks: 4, minCounterparties: 3 },
    power: { minScore: 1500, minActiveWeeks: 8, requiresKyc: true },
  },
}

// DI seam (mirrors invite.service.ts) — overridable in tests.
let deps = { query: _query }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query }
}

/**
 * Deep-merge a (possibly partial) persisted param snapshot over the defaults.
 * Only the known nested objects are merged; unknown keys are ignored.
 */
function mergeParams(snapshot: Partial<SeasonParams> | null | undefined): SeasonParams {
  if (!snapshot || typeof snapshot !== 'object') return DEFAULT_PARAMS
  return {
    ...DEFAULT_PARAMS,
    ...snapshot,
    base: { ...DEFAULT_PARAMS.base, ...(snapshot.base ?? {}) },
    pairDecay: { ...DEFAULT_PARAMS.pairDecay, ...(snapshot.pairDecay ?? {}) },
    recency: { ...DEFAULT_PARAMS.recency, ...(snapshot.recency ?? {}) },
    referral: { ...DEFAULT_PARAMS.referral, ...(snapshot.referral ?? {}) },
    tiers: {
      active: { ...DEFAULT_PARAMS.tiers.active, ...(snapshot.tiers?.active ?? {}) },
      regular: { ...DEFAULT_PARAMS.tiers.regular, ...(snapshot.tiers?.regular ?? {}) },
      power: { ...DEFAULT_PARAMS.tiers.power, ...(snapshot.tiers?.power ?? {}) },
    },
  }
}

/**
 * Load the params for a season from season.config.params, falling back to
 * DEFAULT_PARAMS when the row (or the table) is missing. Never throws — a
 * config read failure degrades to defaults so scoring stays deterministic.
 */
export async function loadParams(seasonId: string = ACTIVE_SEASON_ID): Promise<SeasonParams> {
  try {
    const res = await deps.query<{ params: Partial<SeasonParams> | string }>(
      'SELECT params FROM season.config WHERE id = $1',
      [seasonId]
    )
    const raw = res.rows[0]?.params
    if (!raw) return DEFAULT_PARAMS
    // pg returns JSONB as a parsed object; tolerate a string just in case.
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as Partial<SeasonParams>) : raw
    return mergeParams(parsed)
  } catch {
    return DEFAULT_PARAMS
  }
}
