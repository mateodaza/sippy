/**
 * Season dashboard CONTRACT tests (Phase B) — no DB.
 *
 * These guard the two load-bearing audit rules by reading the controller source
 * and the #season/definitions exports directly:
 *
 *   1. SINGLE-DEFINITION RULE — every usage metric (MAW / active / retained /
 *      distinct counterparties / transacted-volume hero) is imported from
 *      #season/definitions, NOT re-derived in SQL in the controller. The precise
 *      failure mode this prevents is MAW computed one way on the dashboard and
 *      another in the grant report. So: assert maw() is exported, assert the
 *      controller imports it, and assert the controller contains no second copy
 *      of the verified-floor SQL.
 *
 *   2. UN-BLEND — the hero (transactedVolume) and onboarded are separate fields
 *      and the hero is never the sum deposits+sends; the tx feed never carries a
 *      phone field and always builds a well-formed Arbiscan URL.
 */

import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as definitions from '#season/definitions'

const STATS_SRC = join(process.cwd(), 'app/controllers/season_stats_controller.ts')
const TXNS_SRC = join(process.cwd(), 'app/controllers/season_transactions_controller.ts')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

test.group('season/dashboard contract | single-definition rule', () => {
  test('#season/definitions exports the shared usage metrics the dashboard needs', ({ assert }) => {
    // maw is THE single code path (same function the grant report calls).
    assert.isFunction(definitions.maw)
    assert.isFunction(definitions.isActive)
    assert.isFunction(definitions.distinctVerifiedCounterparties)
    // Network rollups added for the dashboard live here too — never in the controller.
    assert.isFunction(definitions.transactedVolume)
    assert.isFunction(definitions.retention)
    assert.isFunction(definitions.distinctCounterpartiesNetwork)
    assert.isFunction(definitions.dailyTransactedVolume)
  })

  test('stats controller imports its usage metrics from #season/definitions', ({ assert }) => {
    const src = read(STATS_SRC)
    assert.match(src, /from\s+'#season\/definitions'/)
    for (const fn of [
      'maw',
      'transactedVolume',
      'retention',
      'distinctCounterpartiesNetwork',
      'dailyTransactedVolume',
    ]) {
      assert.include(src, fn, `controller must import ${fn} from #season/definitions`)
    }
  })

  test('stats controller does NOT re-inline the verified-floor / MAW SQL', ({ assert }) => {
    const src = read(STATS_SRC)
    // The verified CTE and the MAW count are the things that must exist in
    // exactly one place (#season/definitions). If any reappear here, the
    // dashboard has forked the definition.
    assert.notInclude(src, 'verified AS (', 'verified-floor CTE must not be re-derived here')
    assert.notInclude(
      src,
      'event_operator_wallets',
      'operator-exclusion floor belongs in definitions'
    )
    assert.notInclude(
      src,
      'COUNT(DISTINCT LOWER(t."from"))',
      'MAW SQL must not be re-implemented in the controller'
    )
  })
})

test.group('season/dashboard contract | un-blend invariant', () => {
  test('hero (transactedVolume) and onboarded are separate response fields', ({ assert }) => {
    const src = read(STATS_SRC)
    // Hero comes from the value-out definition (heroVolume), never the inflow query.
    assert.match(src, /transactedVolume\(\)/)
    assert.match(src, /transactedVolume:\s*String\(heroVolume\)/)
    // onboarded is its own returned field, sourced from the broad-set inflow query
    // (phone_registry ∪ wallet_aliases) — a distinct code path from the hero.
    assert.match(src, /\bonboarded\b/)
    assert.include(src, 'wallet_aliases')
    // Guard against an accidental blend: the hero is never onboarded + anything.
    assert.notMatch(src, /heroVolume[^\n]*onboard/i)
    assert.notMatch(src, /transactedVolume:[^\n]*onboard/i)
  })
})

test.group('season/dashboard contract | transactions feed privacy + links', () => {
  test('transactions controller never selects or returns a phone field', ({ assert }) => {
    const src = read(TXNS_SRC)
    // No phone table is ever joined, and no phone-shaped field is emitted in the
    // payload (a `phone:` / `phoneNumber:` key). The doc-comment may say the word
    // "phone" to explain WHY — so assert on code shape, not prose.
    assert.notInclude(src, 'phone_registry')
    assert.notMatch(src, /phone\w*\s*:/i, 'tx payload must not carry a phone field')
    // Positive proof: the SELECT pulls only public on-chain columns.
    assert.include(src, 'id, "from", "to", amount, timestamp, tx_hash')
  })

  test('transactions controller builds a well-formed Arbiscan tx URL', ({ assert }) => {
    const src = read(TXNS_SRC)
    assert.include(src, 'https://arbiscan.io/tx/')
  })

  test('transactions controller masks addresses and paginates on (timestamp DESC, id DESC)', ({
    assert,
  }) => {
    const src = read(TXNS_SRC)
    assert.include(src, 'maskAddress')
    assert.include(src, 'ORDER BY timestamp DESC, id DESC')
  })

  test('transactions payload exposes a stable transferId (the onchain.transfer PK)', ({
    assert,
  }) => {
    const src = read(TXNS_SRC)
    // One tx can emit multiple Transfer logs sharing hash/from/to/timestamp, so
    // the row identity exposed to the UI must be the PK (id), not txHash.
    assert.match(src, /transferId:\s*r\.id/)
  })
})
