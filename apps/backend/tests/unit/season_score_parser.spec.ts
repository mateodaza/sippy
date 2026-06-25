/**
 * Season score command routing (Phase D / D1).
 *
 * All of `puntos` / `mi nivel` / `mi puntaje` / `score` are EQUAL aliases — any of
 * them must classify as `season_score`, both via the strict regex (parseMessage-
 * WithRegex) and the pre-LLM high-confidence gate. Plus the natural EN/PT forms.
 * Negative cases ensure no collision with `mi codigo` / `saldo`.
 */

import { test } from '@japa/runner'
import { parseMessageWithRegex, matchHighConfidencePreLlm } from '#utils/message_parser'

test.group('season_score | strict regex aliases', () => {
  const HITS = [
    'puntos',
    'mi nivel',
    'mi puntaje',
    'score',
    'mi puntos',
    'mi score',
    'nivel',
    'puntaje',
    'my score',
    'my level',
    'mi puntaje?',
    'Puntos',
    'meu nível',
    'pontos',
  ]
  for (const text of HITS) {
    test(`"${text}" → season_score`, ({ assert }) => {
      assert.equal(parseMessageWithRegex(text).command, 'season_score')
    })
  }
})

test.group('season_score | pre-LLM gate (conversational)', () => {
  const HITS = [
    'cuantos puntos tengo?',
    'cuántos puntos tengo',
    'cual es mi nivel',
    'cuál es mi puntaje?',
    'como voy de puntaje',
    'mi nivel',
    'puntos',
  ]
  for (const text of HITS) {
    test(`"${text}" → season_score`, ({ assert }) => {
      assert.equal(matchHighConfidencePreLlm(text)?.command, 'season_score')
    })
  }
})

test.group('season_score | no collision', () => {
  test('"mi codigo" still routes to referral_code', ({ assert }) => {
    assert.equal(parseMessageWithRegex('mi codigo').command, 'referral_code')
  })
  test('"saldo" still routes to balance', ({ assert }) => {
    assert.equal(parseMessageWithRegex('saldo').command, 'balance')
  })
  test('"mi quest" still routes to quest_status', ({ assert }) => {
    assert.equal(parseMessageWithRegex('mi quest').command, 'quest_status')
  })
})
