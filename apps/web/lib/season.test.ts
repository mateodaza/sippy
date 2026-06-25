/**
 * Language guard for the web D1 surfaces (Phase D).
 *
 * Asserts no user-facing Season string implies a payout — reputation-only. The
 * banned vocabulary is the spec's list (reward / token / redeem / airdrop / earn)
 * plus the obvious ES/PT equivalents. This is the cheap regression that keeps
 * D2 (redeemable perks) language from creeping into D1.
 *
 * Every user-facing web D1 string lives in lib/season.ts, so collecting them here
 * is exhaustive (the pages render only from these maps).
 */

import { describe, it, expect } from 'vitest'
import {
  SEASON_TIER_NAME,
  TIER_STANDING_LINE,
  ACTION_LINE,
  SCORE_COPY,
  TEMPORADA_COPY,
} from './season'

// Word-boundary anchored so "learn" never trips "earn" and "score" is fine.
const BANNED =
  /\b(reward|rewards|rewarded|token|tokens|redeem|redeemable|airdrop|airdrops|earn|earns|earned|earning|prize|prizes)\b|recompensa|recompensas|premio|premios|pr[eê]mio|canjea|canjear|resgate|resgatar/i

function collectStrings(): string[] {
  const out: string[] = []
  out.push(...Object.values(SEASON_TIER_NAME))
  for (const m of Object.values(TIER_STANDING_LINE)) out.push(...Object.values(m))
  for (const m of Object.values(ACTION_LINE)) out.push(...Object.values(m))
  for (const copy of Object.values(SCORE_COPY)) {
    for (const v of Object.values(copy)) {
      if (typeof v === 'string') out.push(v)
      // Localized templates — exercise both arities to capture their output.
      else if (typeof v === 'function') {
        out.push((v as (a: unknown, b: unknown) => string)(50, 'Fiel'))
        out.push((v as (a: unknown) => string)('Fiel'))
      }
    }
  }
  for (const copy of Object.values(TEMPORADA_COPY)) {
    for (const v of Object.values(copy)) if (typeof v === 'string') out.push(v)
  }
  return out
}

describe('Season D1 web copy — language guard', () => {
  it('contains no reward/token/redeem/airdrop/earn vocabulary', () => {
    const offenders = collectStrings().filter((s) => BANNED.test(s))
    expect(offenders, `payout-implying strings found: ${offenders.join(' | ')}`).toEqual([])
  })

  it('has the five final tier names', () => {
    expect(Object.values(SEASON_TIER_NAME)).toEqual([
      'Nuevo',
      'En marcha',
      'Activo',
      'Fiel',
      'Estrella',
    ])
  })
})
