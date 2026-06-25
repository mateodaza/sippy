/**
 * SeasonScoreController unit tests — the AUTH BINDING + payload-shape audit.
 *
 * Critical, load-bearing assertions:
 *   - /api/season/score resolves the wallet SERVER-SIDE from cdpUser.phoneNumber
 *     and IGNORES any wallet/phone query/body param (it never reads `request`).
 *   - Empty state when the season is off (never an error).
 *   - /api/season/leaderboard rows are anonymous (displayId only, no PII) and the
 *     season-off state is an empty board, not an error.
 *
 * DB reads go through the #season/standing DI seam; the SEASON1_ENABLED flag is
 * toggled via env.set (Adonis env writes process.env, which the guard reads).
 */

import { test } from '@japa/runner'
import env from '#start/env'
import SeasonScoreController from '#controllers/season_score_controller'
import {
  __setDepsForTest as setStandingDeps,
  __resetDeps as resetStandingDeps,
  nextTierProgress,
} from '#season/standing'
import { DEFAULT_PARAMS } from '#season/params'
import { isFullKyc, type KycRecord } from '#services/colurs_kyc.service'

const stubParams = (async () => DEFAULT_PARAMS) as any

// Fake HttpContext. `request.input/qs/body` are spies that RECORD access, so a
// test can prove `score` never reads request input. `score` only destructures
// { response, cdpUser }, so for it these must stay untouched.
function buildCtx(opts: { phoneNumber?: string; input?: Record<string, unknown> }) {
  let capturedStatus: number | undefined
  let capturedBody: unknown
  const inputCalls: string[] = []
  const ctx = {
    request: {
      input(key: string) {
        inputCalls.push(key)
        return opts.input?.[key]
      },
      qs() {
        inputCalls.push('__qs__')
        return opts.input ?? {}
      },
      body() {
        inputCalls.push('__body__')
        return opts.input ?? {}
      },
    },
    response: {
      status(code: number) {
        capturedStatus = code
        return {
          json(body: unknown) {
            capturedBody = body
            return body
          },
        }
      },
      json(body: unknown) {
        capturedBody = body
        return body
      },
    },
    cdpUser: { phoneNumber: opts.phoneNumber ?? '+573001234567', walletAddress: '0xUNUSED' },
  }
  return {
    ctx,
    getStatus: () => capturedStatus,
    getBody: () => capturedBody as Record<string, any>,
    inputCalls,
  }
}

test.group('SeasonScoreController | score (auth binding)', (group) => {
  group.each.setup(() => env.set('SEASON1_ENABLED', 'true'))
  group.each.teardown(() => {
    env.set('SEASON1_ENABLED', '')
    resetStandingDeps()
  })

  test('resolves the wallet from cdpUser.phoneNumber and IGNORES wallet/phone input', async ({
    assert,
  }) => {
    const OWN_PHONE = '+573001111111'
    const OWN_WALLET = '0x00000000000000000000000000000000000000aa'

    // The mocked DB answers ONLY for the authenticated phone. If the controller
    // ever used the attacker-supplied wallet/phone, the phone_registry lookup
    // would carry the wrong param and this assertion would fire.
    setStandingDeps({
      loadParams: stubParams,
      query: (async (sql: string, params: unknown[]) => {
        if (sql.includes('phone_registry')) {
          assert.equal(params[0], OWN_PHONE) // never the attacker phone
          return { rows: [{ wallet_address: OWN_WALLET }] }
        }
        if (sql.includes('season.score')) {
          return {
            rows: [
              {
                wallet: OWN_WALLET,
                score: 410,
                tier: 'active',
                active_weeks: 2,
                distinct_counterparties: 2,
              },
            ],
          }
        }
        return { rows: [] }
      }) as any,
    })

    const controller = new SeasonScoreController()
    const { ctx, getBody, inputCalls } = buildCtx({
      phoneNumber: OWN_PHONE,
      // Attacker-supplied identity — must have NO effect.
      input: { wallet: '0xATTACKER', phone: '+573009999999' },
    })
    await controller.score(ctx as any)

    const body = getBody()
    assert.isTrue(body.scored)
    assert.equal(body.score, 410)
    assert.equal(body.tier, 'active')
    // The wallet/phone params were never read — score doesn't touch request.
    assert.notInclude(inputCalls, 'wallet')
    assert.notInclude(inputCalls, 'phone')
    assert.lengthOf(inputCalls, 0)
    // Response carries no raw wallet/phone.
    assert.notProperty(body, 'wallet')
    assert.notProperty(body, 'phone')
    assert.isString(body.displayId)
  })

  test('empty state when the wallet has no score row', async ({ assert }) => {
    setStandingDeps({
      loadParams: stubParams,
      query: (async (sql: string) => {
        if (sql.includes('phone_registry')) return { rows: [{ wallet_address: '0xabc' }] }
        return { rows: [] } // no season.score row
      }) as any,
    })
    const controller = new SeasonScoreController()
    const { ctx, getBody } = buildCtx({ phoneNumber: '+573002222222' })
    await controller.score(ctx as any)
    assert.isFalse(getBody().scored)
  })

  test('empty state when the user has no wallet at all', async ({ assert }) => {
    setStandingDeps({
      loadParams: stubParams,
      query: (async () => ({ rows: [] })) as any,
    })
    const controller = new SeasonScoreController()
    const { ctx, getBody } = buildCtx({ phoneNumber: '+573003333333' })
    await controller.score(ctx as any)
    assert.isFalse(getBody().scored)
  })

  test('season off → friendly empty state, never an error (no DB touched)', async ({ assert }) => {
    env.set('SEASON1_ENABLED', '')
    let touched = false
    setStandingDeps({
      loadParams: stubParams,
      query: (async () => {
        touched = true
        return { rows: [] }
      }) as any,
    })
    const controller = new SeasonScoreController()
    const { ctx, getBody } = buildCtx({ phoneNumber: '+573004444444' })
    await controller.score(ctx as any)
    assert.isFalse(getBody().scored)
    assert.isFalse(touched) // short-circuits before any DB read
  })
})

test.group('SeasonScoreController | leaderboard (anonymous)', (group) => {
  group.each.setup(() => env.set('SEASON1_ENABLED', 'true'))
  group.each.teardown(() => {
    env.set('SEASON1_ENABLED', '')
    resetStandingDeps()
  })

  test('returns anonymous rows — displayId only, no PII keys', async ({ assert }) => {
    setStandingDeps({
      query: (async () => ({
        rows: [
          { wallet: '0x00000000000000000000000000000000000000a1', score: 900, tier: 'regular' },
          { wallet: '0x00000000000000000000000000000000000000a2', score: 300, tier: 'active' },
        ],
      })) as any,
    })
    const controller = new SeasonScoreController()
    const { ctx, getBody } = buildCtx({ input: { limit: '10' } })
    await controller.leaderboard(ctx as any)
    const body = getBody()
    assert.isArray(body.leaderboard)
    assert.lengthOf(body.leaderboard, 2)
    for (const row of body.leaderboard) {
      assert.deepEqual(Object.keys(row).sort(), ['displayId', 'rank', 'score', 'tier'])
      assert.notProperty(row, 'phone')
      assert.notProperty(row, 'wallet')
      assert.notProperty(row, 'handle')
    }
  })

  test('season off → empty board, not an error', async ({ assert }) => {
    env.set('SEASON1_ENABLED', '')
    const controller = new SeasonScoreController()
    const { ctx, getBody } = buildCtx({ input: {} })
    await controller.leaderboard(ctx as any)
    assert.deepEqual(getBody().leaderboard, [])
  })
})

// ── Power-tier KYC gate (P2): quick-flow approval must NOT clear verification ──
//
// A Colurs quick-flow row can be `approved` with a counterparty at kycLevel 0
// ("no real verification"). That must NOT satisfy the Power personhood gate —
// only full, document-verified KYC (level >= 5) does. resolveHasKyc + the bot
// both route through `isFullKyc`, so this predicate is the single gate.
function kyc(overrides: Partial<KycRecord>): KycRecord {
  return {
    phoneNumber: '+573001234567',
    fullname: null,
    idType: null,
    idNumber: null,
    email: null,
    colursUserId: null,
    counterpartyId: null,
    kycLevel: 0,
    kycStatus: 'unregistered',
    ...overrides,
  }
}

test.group('SeasonScoreController | Power KYC gate', () => {
  test('approved level-0 quick-flow is NOT full KYC', ({ assert }) => {
    assert.isFalse(isFullKyc(kyc({ kycStatus: 'approved', kycLevel: 0, counterpartyId: 'cp_1' })))
  })

  test('approved level-5 with counterparty IS full KYC', ({ assert }) => {
    assert.isTrue(isFullKyc(kyc({ kycStatus: 'approved', kycLevel: 5, counterpartyId: 'cp_1' })))
  })

  test('level-5 but not approved is NOT full KYC', ({ assert }) => {
    assert.isFalse(
      isFullKyc(kyc({ kycStatus: 'documents_submitted', kycLevel: 5, counterpartyId: 'cp_1' }))
    )
  })

  test('null / unregistered is NOT full KYC', ({ assert }) => {
    assert.isFalse(isFullKyc(null))
    assert.isFalse(isFullKyc(kyc({})))
  })

  test('regular→Power with approved level-0 quick-flow still requires verification', ({
    assert,
  }) => {
    const hasKyc = isFullKyc(kyc({ kycStatus: 'approved', kycLevel: 0, counterpartyId: 'cp_1' }))
    const next = nextTierProgress(
      { tier: 'regular', score: 1000, activeWeeks: 5, distinctCounterparties: 5 },
      DEFAULT_PARAMS,
      hasKyc
    )
    assert.equal(next?.tier, 'power')
    assert.isTrue(next?.verificationRequired) // quick-flow does NOT clear Power
    assert.equal(next?.scoreToGo, 0) // and still no score-only path
  })

  test('regular→Power with full KYC clears verification (still no score-only path)', ({
    assert,
  }) => {
    const hasKyc = isFullKyc(kyc({ kycStatus: 'approved', kycLevel: 5, counterpartyId: 'cp_1' }))
    const next = nextTierProgress(
      { tier: 'regular', score: 1000, activeWeeks: 5, distinctCounterparties: 5 },
      DEFAULT_PARAMS,
      hasKyc
    )
    assert.isFalse(next?.verificationRequired)
    assert.equal(next?.scoreToGo, 0)
  })
})
