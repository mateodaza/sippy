/**
 * #season/score — PURE scoring. No I/O, no DB.
 *
 * Implements docs/SEASON1_SCORE_SPEC.md §1:
 *
 *   Score = Σ over actions [ base(verb) + volumeBonus(verb, usd) ]
 *           × recencyWeight(age) − penalties,  subject to the §1.3 caps.
 *
 * computeScore() takes the event log + the param table + a reference `now`
 * and returns { score, tier, activeWeeks, distinctCounterparties, lastActive,
 * dormant }. Deterministic and replayable — the same inputs always yield the
 * same numbers, which is what makes the score auditable ("here's why your
 * score is X") and recompute idempotent.
 *
 * Phase A only ever sees `send` / `receive` / `first_send` events, but the
 * function is verb-generic so Phase C verbs (onramp_used, offramp, referral_*,
 * active_week) score correctly the moment they're emitted — no change here.
 */

import {
  type SeasonParams,
  type Verb,
  type Tier,
  VOLUME_BONUS_VERBS,
  VALUE_OUT_VERBS,
  REFERRAL_VERBS,
} from '#season/params'

const DAY_SECONDS = 86_400
const WEEK_SECONDS = 7 * DAY_SECONDS

/**
 * Diminishing factor applied to a referrer's referral_unlock points once they
 * pass referral.decayAfter unlocked referrals (spec §1.3 "diminishing after the
 * 10th"). Parallel to the per-pair send decay — the seasonCap is the hard
 * ceiling, this just slows accrual for prolific referrers. Halving is the ship
 * default; tune via params if it needs to be a tunable later.
 */
const REFERRAL_DECAY_FACTOR = 0.5

/** One scoreable action. `timestamp` is unix seconds; `usd` is dollars at event time. */
export interface ScoreEvent {
  verb: Verb
  usd: number | null
  counterparty: string | null
  timestamp: number
  flagged: boolean
}

export interface ComputeResult {
  score: number
  tier: Tier
  activeWeeks: number
  distinctCounterparties: number
  lastActive: number | null
  dormant: boolean
}

/** Base points for a verb (0 for unknown verbs). */
export function base(verb: Verb, params: SeasonParams): number {
  return params.base[verb] ?? 0
}

/**
 * Sub-linear volume bonus — this is what keeps it a *usage* score, not a TVL
 * game. round(min(vCap, K*sqrt(usd))). $1→2, $25→10, $100→20 (capped), $10k→20.
 */
export function volumeBonus(usd: number | null | undefined, params: SeasonParams): number {
  if (!usd || usd <= 0) return 0
  return Math.round(Math.min(params.vCap, params.K * Math.sqrt(usd)))
}

/**
 * Recency weight over the rolling window: 1.0 if age ≤ fullDays, 0.5 if
 * ≤ halfDays, else 0.0. Events past halfDays contribute no points (but a
 * past value-out still counts toward lifetime activeWeeks / activation).
 */
export function recencyWeight(ageDays: number, params: SeasonParams): number {
  if (ageDays <= params.recency.fullDays) return 1.0
  if (ageDays <= params.recency.halfDays) return 0.5
  return 0.0
}

interface TierInputs {
  score: number
  activeWeeks: number
  distinctCounterparties: number
  hasActivation: boolean
  hasKyc: boolean
}

/**
 * Tiers require time + breadth, not just a score number (spec §1.5), so nobody
 * hits a high tier in a single day. Power additionally requires KYC/personhood
 * — unreachable in Phase A (no KYC signal wired), which is correct.
 */
export function computeTier(m: TierInputs, params: SeasonParams): Tier {
  const t = params.tiers
  if (
    m.score >= t.power.minScore &&
    m.activeWeeks >= t.power.minActiveWeeks &&
    (!t.power.requiresKyc || m.hasKyc)
  ) {
    return 'power'
  }
  if (
    m.score >= t.regular.minScore &&
    m.activeWeeks >= t.regular.minActiveWeeks &&
    m.distinctCounterparties >= t.regular.minCounterparties
  ) {
    return 'regular'
  }
  if (m.score >= t.active.minScore && m.activeWeeks >= t.active.minActiveWeeks) {
    return 'active'
  }
  if (m.hasActivation) return 'activated'
  return 'newcomer'
}

/**
 * Fold the event log into a score + derived signals.
 *
 * Order of operations per event (after dropping flagged events — they're kept
 * in the table but earn nothing):
 *   1. status: a qualifying value-out (send/off-ramp ≥ minActiveUsd) marks its
 *      7-day bucket active and advances lastActive; sends add their counterparty
 *      to the distinct set; a first_send ≥ minActiveUsd / any qualifying value-out
 *      flips activation.
 *   2. points: base(+volumeBonus) × recencyWeight, with per-pair send decay
 *      (base-only after N, 0 after M), then the verb-specific season caps
 *      (referral seasonCap + diminishing-after-N, new_counterparty cap), then
 *      clamped by the per-day cap. A value-out OR first_send below minActiveUsd
 *      earns nothing (real-usage floor); a send's breadth still counts above.
 *
 * Events are processed chronologically so pair-decay counts in send order, the
 * referral/new_counterparty caps fill earliest-first, and the daily cap fills
 * earliest-first (all deterministic).
 */
export function computeScore(
  events: ScoreEvent[],
  params: SeasonParams,
  opts: { now: number; hasKyc?: boolean }
): ComputeResult {
  const { now, hasKyc = false } = opts

  const ordered = events.filter((e) => !e.flagged).sort((a, b) => a.timestamp - b.timestamp)

  const pairSendCount = new Map<string, number>()
  const dayEarned = new Map<number, number>()
  const activeWeekSet = new Set<number>()
  const counterpartySet = new Set<string>()
  let score = 0
  let lastActive: number | null = null
  let hasActivation = false
  // Verb-specific season caps (spec §1.3), accumulated in chronological order.
  let referralEarned = 0 // total points from referral_* verbs (cap: referral.seasonCap)
  let referralUnlockCount = 0 // # of referral_unlock_referrer seen (for decay-after-N)
  let newCounterpartyEarned = 0 // # of new_counterparty bonuses that landed (cap: newCounterpartySeasonCap)

  for (const e of ordered) {
    const isValueOut = VALUE_OUT_VERBS.has(e.verb) && (e.usd ?? 0) >= params.minActiveUsd
    if (isValueOut) {
      activeWeekSet.add(Math.floor(e.timestamp / WEEK_SECONDS))
      if (lastActive === null || e.timestamp > lastActive) lastActive = e.timestamp
    }
    // Distinct counterparties come from sends — rewards breadth, not ping-pong.
    if (e.verb === 'send' && e.counterparty) counterpartySet.add(e.counterparty)
    const meetsFloor = (e.usd ?? 0) >= params.minActiveUsd
    if ((e.verb === 'first_send' && meetsFloor) || isValueOut) hasActivation = true

    // Real-usage floor (spec §2): a value-out OR a first_send below minActiveUsd
    // earns no points and (for first_send) confers no activation above — only a
    // send's distinct-counterparty breadth is recorded. Sub-$1 dust can neither
    // pump the score nor activate; activation comes from the first send that
    // clears $1 (the projector only emits first_send for sends that do).
    if (!meetsFloor && (VALUE_OUT_VERBS.has(e.verb) || e.verb === 'first_send')) continue

    const w = recencyWeight((now - e.timestamp) / DAY_SECONDS, params)
    if (w === 0) continue // confers status above, but no points

    let raw = base(e.verb, params)
    let withVolume = VOLUME_BONUS_VERBS.has(e.verb)

    if (e.verb === 'send') {
      const key = e.counterparty ?? '∅'
      const n = (pairSendCount.get(key) ?? 0) + 1
      pairSendCount.set(key, n)
      if (n > params.pairDecay.zeroAfter) {
        raw = 0
        withVolume = false
      } else if (n > params.pairDecay.baseOnlyAfter) {
        withVolume = false
      }
    }

    // new_counterparty bonus is capped at newCounterpartySeasonCap/season. A
    // capped-out event is still recorded (flagged-not-deleted), it just earns 0.
    // Checked after the recency `continue` above, so an old (zero-weight) one
    // never burns a cap slot.
    if (e.verb === 'new_counterparty' && newCounterpartyEarned >= params.newCounterpartySeasonCap) {
      continue
    }

    // Referral diminishing after referral.decayAfter unlocked referrals (spec
    // §1.3). Counts every unlock chronologically — your Nth referral is your Nth
    // regardless of recency — and reduces the referrer's points past the limit.
    if (e.verb === 'referral_unlock_referrer') {
      referralUnlockCount += 1
      if (referralUnlockCount > params.referral.decayAfter) {
        raw = Math.round(raw * REFERRAL_DECAY_FACTOR)
      }
    }

    if (raw === 0 && !withVolume) continue
    const points = raw + (withVolume ? volumeBonus(e.usd, params) : 0)
    let earned = Math.round(points * w)
    if (earned <= 0) continue

    // Referral season cap (spec §1.3): all referral_* verbs together earn at most
    // referral.seasonCap per wallet/season. Clamp before the per-day cap so the
    // season ceiling can't be sidestepped by spreading referrals across days.
    if (REFERRAL_VERBS.has(e.verb)) {
      earned = Math.min(earned, Math.max(0, params.referral.seasonCap - referralEarned))
      if (earned <= 0) continue
    }

    const day = Math.floor(e.timestamp / DAY_SECONDS)
    const already = dayEarned.get(day) ?? 0
    const allowed = Math.max(0, params.dailyCap - already)
    earned = Math.min(earned, allowed)
    if (earned <= 0) continue
    dayEarned.set(day, already + earned)
    // Commit the FINAL earned (post day-cap) to the season accumulators.
    if (REFERRAL_VERBS.has(e.verb)) referralEarned += earned
    if (e.verb === 'new_counterparty') newCounterpartyEarned += 1
    score += earned
  }

  const activeWeeks = activeWeekSet.size
  const distinctCounterparties = counterpartySet.size
  const dormant = lastActive !== null && (now - lastActive) / DAY_SECONDS > params.dormantDays
  const tier = computeTier(
    { score, activeWeeks, distinctCounterparties, hasActivation, hasKyc },
    params
  )

  return { score, tier, activeWeeks, distinctCounterparties, lastActive, dormant }
}
