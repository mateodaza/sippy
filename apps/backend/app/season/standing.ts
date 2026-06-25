/**
 * #season/standing — the READ-ONLY view a user sees of their own score.
 *
 * Phase D / D1. This module never writes. It reads the DERIVED aggregate
 * `season.score` (produced by the projector/recompute) and turns it into the
 * reputation-only shape the WhatsApp command + the web "your score" page render:
 *
 *   { score, tier, activeWeeks, distinctCounterparties, nextTier, topActions }
 *
 * Two hard rules this module exists to enforce, both audited:
 *
 *   1. NO FORMULA EXPOSURE. The output carries a tier, a "progress to the next
 *      tier", and 2-3 derived next actions — never the weights/caps/decay/base
 *      points. `topActions` are ACTION CODES (localized by each surface), derived
 *      from which tier gate is still open — guidance, not the scoring formula.
 *
 *   2. "to next tier" is computed from `params.tiers` (the same source the
 *      projector scores against), never hardcoded here. Change a threshold in
 *      params and the progress moves with it.
 *
 * Power-tier / KYC caveat (load-bearing, see SEASON1_PHASE_D_PROMPT.md): the
 * stored `tier` can realistically never be `power` yet (recompute feeds no KYC
 * signal and season.score stores none). So D1 NEVER presents Power as reachable
 * from score alone: the regular→power step DEFERS numeric progress and surfaces a
 * separate `verificationRequired` flag (identity verification), optionally
 * refined by the caller's existing KYC status. There is no scoreToGo-only path to
 * Power a user can't actually complete.
 */

import { createHmac } from 'node:crypto'
import env from '#start/env'
import { query as _query } from '#services/db'
import { ACTIVE_SEASON_ID } from '#season/guard'
import { loadParams, type SeasonParams, type Tier } from '#season/params'

// DI seam (mirrors invite.service.ts / params.ts) — overridable in tests.
let deps = { query: _query, loadParams }
export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}
export function __resetDeps() {
  deps = { query: _query, loadParams }
}

/** Tier ladder, low → high. The single ordering used everywhere. */
export const TIER_ORDER: readonly Tier[] = [
  'newcomer',
  'activated',
  'active',
  'regular',
  'power',
] as const

/**
 * Derived next-action codes. Locale-independent — each surface (WhatsApp
 * messages.ts, web i18n.ts) maps a code to copy in the user's language. These
 * describe what the user can DO to raise their standing; none implies a payout.
 */
export type ActionCode =
  | 'first_send' // make your first real send
  | 'new_counterparty' // send to a friend you haven't sent to before (breadth)
  | 'weekly' // keep using Sippy week to week (active weeks)
  | 'send_more' // keep sending / move more value
  | 'offramp' // cash out to local currency (a value-out)
  | 'invite' // bring a friend onto Sippy
  | 'verify' // verify identity (Power step only)

/** Progress toward the next tier, all computed from `params.tiers`. */
export interface NextTier {
  /** The next tier slug up the ladder. */
  tier: Tier
  /** Points still needed to reach the next score threshold (0 when met / n/a). */
  scoreToGo: number
  /** Score progress within the current band, 0-100 (0 for activation / deferred power). */
  progressPct: number
  /** Active weeks still needed (0 when met / n/a). */
  weeksToGo: number
  /** Distinct counterparties still needed (0 when met / n/a). */
  counterpartiesToGo: number
  /**
   * Identity verification needed for this step. True only for the Power step.
   * Sourced from the caller's EXISTING KYC status (never from season.score); when
   * the caller can't supply it, defaults to true so Power is never shown as
   * reachable from score alone.
   */
  verificationRequired: boolean
}

/** The reputation-only standing a user surface renders. */
export interface Standing {
  score: number
  tier: Tier
  activeWeeks: number
  distinctCounterparties: number
  /** null only when the user is already at the top tier. */
  nextTier: NextTier | null
  /** 2-3 derived action codes (localized per surface). */
  topActions: ActionCode[]
  /** Stable, non-reversible per-wallet-per-season id (for "find me on the board"). */
  displayId: string
}

/** Raw season.score row (the only table this module reads). */
interface ScoreRow {
  wallet: string
  score: number
  tier: Tier
  active_weeks: number
  distinct_counterparties: number
}

/**
 * The per-tier score floor used as the LOWER bound of a progress band. Derived
 * from params so it tracks the tunables. Activation has no score floor (it's a
 * binary "made a qualifying send"), so newcomer/activated sit at 0.
 */
function tierScoreFloor(tier: Tier, params: SeasonParams): number {
  switch (tier) {
    case 'active':
      return params.tiers.active.minScore
    case 'regular':
      return params.tiers.regular.minScore
    case 'power':
      return params.tiers.power.minScore
    default:
      return 0
  }
}

/**
 * Compute progress to the next tier from `params.tiers` — PURE, no I/O, unit
 * tested. `hasKyc` (from the caller's existing KYC status) only affects the Power
 * step's `verificationRequired`; it never gates the lower tiers.
 *
 * The regular→power step deliberately DEFERS numeric progress (scoreToGo = 0,
 * progressPct = 0) and returns `verificationRequired` instead, so a user is never
 * shown a points-only path to Power they can't complete.
 */
export function nextTierProgress(
  current: { tier: Tier; score: number; activeWeeks: number; distinctCounterparties: number },
  params: SeasonParams,
  hasKyc = false
): NextTier | null {
  const idx = TIER_ORDER.indexOf(current.tier)
  // Already at the top, or an unknown tier — no next step.
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  const next = TIER_ORDER[idx + 1]

  // The Power step: identity-verification gated, numeric progress deferred.
  if (next === 'power') {
    return {
      tier: 'power',
      scoreToGo: 0,
      progressPct: 0,
      weeksToGo: 0,
      counterpartiesToGo: 0,
      verificationRequired: !hasKyc,
    }
  }

  // newcomer → activated: activation is a binary "make your first qualifying
  // send", not a score threshold. No numeric bar; the 'first_send' action says it.
  if (next === 'activated') {
    return {
      tier: 'activated',
      scoreToGo: 0,
      progressPct: 0,
      weeksToGo: 0,
      counterpartiesToGo: 0,
      verificationRequired: false,
    }
  }

  // activated → active, active → regular: real score/weeks/breadth thresholds.
  const gate =
    next === 'active'
      ? {
          minScore: params.tiers.active.minScore,
          minWeeks: params.tiers.active.minActiveWeeks,
          minCp: 0,
        }
      : {
          minScore: params.tiers.regular.minScore,
          minWeeks: params.tiers.regular.minActiveWeeks,
          minCp: params.tiers.regular.minCounterparties,
        }

  const floor = tierScoreFloor(current.tier, params)
  const band = Math.max(1, gate.minScore - floor)
  const progressPct = Math.max(0, Math.min(100, Math.round(((current.score - floor) / band) * 100)))

  return {
    tier: next,
    scoreToGo: Math.max(0, gate.minScore - current.score),
    progressPct,
    weeksToGo: Math.max(0, gate.minWeeks - current.activeWeeks),
    counterpartiesToGo: Math.max(0, gate.minCp - current.distinctCounterparties),
    verificationRequired: false,
  }
}

/**
 * Derive 2-3 next actions from the open tier gates — PURE, unit tested. Returns
 * locale-independent ACTION CODES (never copy, never the formula). The order is
 * impact-first: breadth and weekly cadence move tiers fastest, then volume.
 */
export function deriveTopActions(
  current: { tier: Tier; activeWeeks: number; distinctCounterparties: number },
  next: NextTier | null
): ActionCode[] {
  // Not activated yet — the one thing that matters is the first real send.
  if (current.tier === 'newcomer') return ['first_send']

  // Top tier — graceful "keep it up", no "you're done" and no payout language.
  if (next === null) return ['weekly', 'invite']

  const actions: ActionCode[] = []
  if (next.verificationRequired) actions.push('verify')
  if (next.counterpartiesToGo > 0) actions.push('new_counterparty')
  if (next.weeksToGo > 0) actions.push('weekly')
  if (next.scoreToGo > 0) {
    actions.push('send_more')
    actions.push('offramp')
  }
  // Always leave the user with something concrete.
  if (actions.length === 0) actions.push('weekly', 'invite')

  return actions.slice(0, 3)
}

/**
 * D2 — HELD (do NOT build). Redeemable / behavior-changing tier perks — higher
 * send limits, priority off-ramp, fee reductions, anything a tier *unlocks*. D1
 * ships NOTHING redeemable, so this returns `[]` and no surface renders a perk.
 * Building D2 requires (a) Lina's sign-off on the reward language and (b) a real
 * product/eng design (changing limits/fees touches the send + off-ramp paths).
 * Keep this the single seam: when D2 lands, perks flow from here, never inline in
 * a surface. Until then it stays empty by contract.
 */
export function tierPerks(_tier: Tier): never[] {
  return [] // D2 — Lina-gated. Reputation-only in D1; nothing redeemable ships.
}

/**
 * Stable, non-reversible per-wallet-per-season display id for the public
 * leaderboard ("anonymous displayId only"). HMAC-SHA256 over `${seasonId}:${wallet}`
 * keyed by APP_KEY (always present), hex-truncated to 12 chars (48 bits —
 * collision-safe at our scale, short enough to show). Same wallet always maps to
 * the same id within a season, and the HMAC key means it can't be recomputed
 * off-server or reversed to a wallet/phone. Shared by the public leaderboard and
 * the per-user score endpoint (so a user can "find me on the board").
 */
export function makeDisplayId(wallet: string, seasonId: string = ACTIVE_SEASON_ID): string {
  const secret = env.get('APP_KEY').release()
  return createHmac('sha256', secret)
    .update(`${seasonId}:${wallet.toLowerCase()}`)
    .digest('hex')
    .slice(0, 12)
}

/** Read one wallet's season.score row, or null when it has none (empty state). */
export async function readScore(
  wallet: string,
  seasonId: string = ACTIVE_SEASON_ID
): Promise<ScoreRow | null> {
  const res = await deps.query<ScoreRow>(
    `SELECT wallet, score, tier, active_weeks, distinct_counterparties
       FROM season.score
      WHERE season_id = $1 AND LOWER(wallet) = LOWER($2)
      LIMIT 1`,
    [seasonId, wallet]
  )
  return res.rows[0] ?? null
}

/**
 * Build a wallet's full reputation standing, or null when it has no score row yet
 * (the surfaces render their friendly empty state on null). `displayId` is
 * computed here (HMAC) so the leaderboard and this per-user view always agree.
 *
 * `hasKyc` comes from the caller's EXISTING KYC status (Colombia onramp KYC) and
 * only refines the Power step's `verificationRequired`; omit it and Power simply
 * stays verification-gated.
 */
export async function getStanding(args: {
  wallet: string
  hasKyc?: boolean
  seasonId?: string
}): Promise<Standing | null> {
  const seasonId = args.seasonId ?? ACTIVE_SEASON_ID
  const row = await readScore(args.wallet, seasonId)
  if (!row) return null

  const params = await deps.loadParams(seasonId)
  const current = {
    tier: row.tier,
    score: row.score,
    activeWeeks: row.active_weeks,
    distinctCounterparties: row.distinct_counterparties,
  }
  const next = nextTierProgress(current, params, args.hasKyc ?? false)
  const topActions = deriveTopActions(current, next)

  return {
    score: row.score,
    tier: row.tier,
    activeWeeks: row.active_weeks,
    distinctCounterparties: row.distinct_counterparties,
    nextTier: next,
    topActions,
    displayId: makeDisplayId(row.wallet, seasonId),
  }
}

/** One public leaderboard row — the anonymous displayId only, NO PII. */
export interface LeaderboardRow {
  rank: number
  displayId: string
  score: number
  tier: Tier
}

/**
 * Resolve a phone (canonical, from the JWT) to its wallet address. Mirrors
 * embedded_wallet_controller.walletStatus: try the canonical row, then fall back
 * to the bare-digit form for pre-SH-003 rows. Returns null when the phone has no
 * wallet. Lives here (behind the DI seam) so the score endpoint can resolve the
 * caller's OWN wallet server-side and never trust a wallet/phone input.
 */
export async function resolveWalletForPhone(phoneNumber: string): Promise<string | null> {
  let res = await deps.query<{ wallet_address: string | null }>(
    `SELECT wallet_address FROM phone_registry WHERE phone_number = $1 LIMIT 1`,
    [phoneNumber]
  )
  if (res.rows.length === 0 && phoneNumber.startsWith('+')) {
    res = await deps.query<{ wallet_address: string | null }>(
      `SELECT wallet_address FROM phone_registry WHERE phone_number = $1 LIMIT 1`,
      [phoneNumber.slice(1)]
    )
  }
  return res.rows[0]?.wallet_address ?? null
}

/**
 * The anonymous, usage-ranked board (top `limit`). Only scored wallets (`score >
 * 0`) appear; season.score already excludes the spender/operators at the verified
 * floor and flagged sybil sends earn 0, so a positive score is personhood- and
 * sybil-filtered. Each row exposes ONLY the anonymous displayId — no phone, no
 * handle, no raw wallet.
 */
export async function getLeaderboard(
  seasonId: string = ACTIVE_SEASON_ID,
  limit = 50
): Promise<LeaderboardRow[]> {
  const res = await deps.query<{ wallet: string; score: number; tier: Tier }>(
    `SELECT wallet, score, tier
       FROM season.score
      WHERE season_id = $1 AND score > 0
      ORDER BY score DESC, wallet ASC
      LIMIT $2`,
    [seasonId, limit]
  )
  return res.rows.map((r, i) => ({
    rank: i + 1,
    displayId: makeDisplayId(r.wallet, seasonId),
    score: Number(r.score),
    tier: r.tier,
  }))
}
