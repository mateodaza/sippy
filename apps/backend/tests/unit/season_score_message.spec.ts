/**
 * Season score WhatsApp reply tests (Phase D / D1).
 *
 *   - The reply renders tier + a progress line + the next actions in each language.
 *   - NO scoring formula ever appears (no weights/caps/decay/sqrt/base points).
 *   - LANGUAGE GUARD: no D1 reply string contains reward/token/redeem/airdrop/earn
 *     vocabulary (cheap regression against scope creep into D2).
 *   - The empty-state copy is the friendly "make your first send", not a zero.
 */

import { test } from '@japa/runner'
import { formatSeasonScoreMessage, formatSeasonScoreEmpty } from '#utils/messages'
import type { Tier } from '#season/params'
import type { ActionCode } from '#season/standing'

type Lang = 'en' | 'es' | 'pt'
const LANGS: Lang[] = ['en', 'es', 'pt']
const TIERS: Tier[] = ['newcomer', 'activated', 'active', 'regular', 'power']
const ALL_ACTIONS: ActionCode[] = [
  'first_send',
  'new_counterparty',
  'weekly',
  'send_more',
  'offramp',
  'invite',
  'verify',
]
const NEXTS = [
  null,
  { tier: 'active' as Tier, progressPct: 50, verificationRequired: false },
  { tier: 'activated' as Tier, progressPct: 0, verificationRequired: false },
  { tier: 'power' as Tier, progressPct: 0, verificationRequired: true },
]

// Banned reputation→payout vocabulary (the spec's D1 language rule). Word-boundary
// anchored so "learn" never trips "earn" and "scored" never trips a ban.
const BANNED =
  /\b(reward|rewards|rewarded|token|tokens|redeem|redeemable|airdrop|airdrops|earn|earns|earned|earning)\b|recompensa|recompensas|pr[eê]mio|pr[eê]mios|canjea|canjear|resgate/i

// Formula-exposing vocabulary that must NEVER reach a user surface.
const FORMULA =
  /sqrt|recency|decay|\bweights?\b|volume bonus|base points|daily cap|coefficient|f[oó]rmula/i

function everyReply(): string[] {
  const out: string[] = []
  for (const lang of LANGS) {
    for (const tier of TIERS) {
      for (const nextTier of NEXTS) {
        out.push(
          formatSeasonScoreMessage(
            { score: 320, tier, nextTier, topActions: ALL_ACTIONS, phoneNumber: '+573001234567' },
            lang
          )
        )
      }
    }
    out.push(formatSeasonScoreEmpty('+573001234567', lang))
  }
  return out
}

test.group('season score reply | shape', () => {
  test('renders tier name, score, an action, and the web link', ({ assert }) => {
    const msg = formatSeasonScoreMessage(
      {
        score: 320,
        tier: 'active',
        nextTier: { tier: 'regular', progressPct: 40, verificationRequired: false },
        topActions: ['new_counterparty', 'weekly'],
        phoneNumber: '+573001234567',
      },
      'es'
    )
    assert.include(msg, 'Activo') // tier name
    assert.include(msg, '320') // the score itself (reputation, allowed)
    assert.include(msg, 'Fiel') // next tier (regular slug → "Fiel" display)
    // WhatsApp bodies are accent-free (house style, like formatReferralCodeMessage).
    assert.include(msg, 'Enviale a un amigo') // a derived action
    assert.include(msg, '/score?phone=') // link to the web "your score" page
  })

  test('EN and PT variants render their own copy', ({ assert }) => {
    const en = formatSeasonScoreMessage(
      {
        score: 10,
        tier: 'newcomer',
        nextTier: { tier: 'activated', progressPct: 0, verificationRequired: false },
        topActions: ['first_send'],
        phoneNumber: '+15555550123',
      },
      'en'
    )
    assert.include(en, 'Your level')
    assert.include(en, 'Nuevo')
    const pt = formatSeasonScoreMessage(
      {
        score: 10,
        tier: 'active',
        nextTier: null,
        topActions: ['weekly'],
        phoneNumber: '+5511999999999',
      },
      'pt'
    )
    assert.include(pt, 'Seu nivel') // accent-free WhatsApp house style
  })

  test('power step shows identity verification, never a points-only path', ({ assert }) => {
    const msg = formatSeasonScoreMessage(
      {
        score: 1200,
        tier: 'regular',
        nextTier: { tier: 'power', progressPct: 0, verificationRequired: true },
        topActions: ['verify', 'weekly'],
        phoneNumber: '+573001234567',
      },
      'es'
    )
    assert.include(msg, 'verifica tu identidad')
    assert.include(msg, 'Estrella') // power slug → "Estrella" display
  })
})

test.group('season score reply | no formula', () => {
  test('no reply exposes weights/caps/decay/sqrt/base points', ({ assert }) => {
    for (const msg of everyReply()) {
      assert.notMatch(msg, FORMULA)
    }
  })
})

test.group('season score reply | language guard (no reward/token/redeem vocab)', () => {
  test('no D1 reply string implies a payout', ({ assert }) => {
    for (const msg of everyReply()) {
      assert.notMatch(msg, BANNED)
    }
  })
})

test.group('season score reply | empty state', () => {
  test('friendly "make your first send", not a zero score', ({ assert }) => {
    const es = formatSeasonScoreEmpty('+573001234567', 'es')
    assert.include(es, 'primer envio') // accent-free WhatsApp house style
    // No score label/number in the empty state — it nudges, it doesn't show "0".
    assert.notInclude(es, 'Puntaje')
    const en = formatSeasonScoreEmpty('+15555550123', 'en')
    assert.include(en, 'first send')
    assert.notInclude(en, 'Score')
    assert.include(en, '/score?phone=')
  })
})
