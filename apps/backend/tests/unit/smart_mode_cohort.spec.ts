/**
 * SMART MODE — cohort gate regression tests
 *
 * Pins the killswitch + cohort-match rules:
 *
 *   • Env killswitch must be the first gate (DB never touched when off)
 *   • SMART_MODE_COHORT_ALL=true bypasses cohort check (post-event v2)
 *   • Cohort match looks at user_event_links.metadata.source LIKE 'pizza-day%'
 *   • DB errors fail closed → return false (never silently widens rollout)
 *
 * Mocks the db.rawQuery layer (matching the existing pattern in
 * bracket_token_service.spec.ts) so tests are pure — no real DB needed.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { isSmartModeEnabledFor, isSmartModeFeatureEnabled } from '#services/smart_mode/cohort'
import UserPreference from '#models/user_preference'

// ── Env helpers ─────────────────────────────────────────────────────────

function setEnv(name: string, value: string | null) {
  if (value === null) delete process.env[name]
  else process.env[name] = value
}

async function withEnv(
  values: Record<string, string | null>,
  fn: () => Promise<void> | void
): Promise<void> {
  const prev: Record<string, string | undefined> = {}
  for (const k of Object.keys(values)) prev[k] = process.env[k]
  try {
    for (const [k, v] of Object.entries(values)) setEnv(k, v)
    await fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// ── DB mock infrastructure ──────────────────────────────────────────────

interface RawQueryCall {
  sql: string
  bindings?: unknown[]
}

let rawQueryCalls: RawQueryCall[] = []
let mockedRows: Array<{ source: string | null }> = []
let shouldThrow = false
let origRawQuery: typeof db.rawQuery

function installDbMock() {
  rawQueryCalls = []
  mockedRows = []
  shouldThrow = false
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings?: unknown[]) => {
    rawQueryCalls.push({ sql, bindings })
    if (shouldThrow) throw new Error('simulated DB outage')
    return { rows: mockedRows, rowCount: mockedRows.length }
  }) as any
}

function restoreDbMock() {
  db.rawQuery = origRawQuery
}

// ── resolveUserPrefKey mock (called inside cohort) ──────────────────────

let origFindBy: typeof UserPreference.findBy
function installPrefMock() {
  origFindBy = UserPreference.findBy
  ;(
    UserPreference as unknown as { findBy: (col: string, val: string) => Promise<unknown> }
  ).findBy = async () => null
}
function restorePrefMock() {
  UserPreference.findBy = origFindBy
}

// ══════════════════════════════════════════════════════════════════════════════
// isSmartModeFeatureEnabled — synchronous env check
// ══════════════════════════════════════════════════════════════════════════════

test.group('cohort | isSmartModeFeatureEnabled', () => {
  test('returns false when SMART_MODE_ENABLED unset', () =>
    withEnv({ SMART_MODE_ENABLED: null }, () => {
      if (isSmartModeFeatureEnabled()) throw new Error('expected false')
    }))

  test('returns false when SMART_MODE_ENABLED is anything other than "true"', () =>
    withEnv({ SMART_MODE_ENABLED: '1' }, () => {
      if (isSmartModeFeatureEnabled()) throw new Error('only literal "true" should enable')
    }))

  test('returns true when SMART_MODE_ENABLED=true exactly', () =>
    withEnv({ SMART_MODE_ENABLED: 'true' }, () => {
      if (!isSmartModeFeatureEnabled()) throw new Error('expected true')
    }))
})

// ══════════════════════════════════════════════════════════════════════════════
// isSmartModeEnabledFor — env killswitch
// ══════════════════════════════════════════════════════════════════════════════

test.group('cohort | killswitch', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns false without touching DB when env is off', async ({ assert }) => {
    await withEnv({ SMART_MODE_ENABLED: null, SMART_MODE_COHORT_ALL: null }, async () => {
      const out = await isSmartModeEnabledFor('+573001234567')
      assert.isFalse(out)
      assert.equal(rawQueryCalls.length, 0, 'env-off short-circuits before DB')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// isSmartModeEnabledFor — COHORT_ALL bypass
// ══════════════════════════════════════════════════════════════════════════════

test.group('cohort | COHORT_ALL bypass', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns true for any phone, no DB call when COHORT_ALL=true', async ({ assert }) => {
    await withEnv({ SMART_MODE_ENABLED: 'true', SMART_MODE_COHORT_ALL: 'true' }, async () => {
      const out = await isSmartModeEnabledFor('+573009999999')
      assert.isTrue(out)
      assert.equal(rawQueryCalls.length, 0, 'COHORT_ALL skips the cohort lookup entirely')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// isSmartModeEnabledFor — cohort match
// ══════════════════════════════════════════════════════════════════════════════

test.group('cohort | pizza-day source match', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns true when phone has a user_event_link with source like "pizza-day%"', async ({
    assert,
  }) => {
    mockedRows = [{ source: 'pizza-day-ctg-2026' }]
    await withEnv({ SMART_MODE_ENABLED: 'true', SMART_MODE_COHORT_ALL: null }, async () => {
      const out = await isSmartModeEnabledFor('+573001234567')
      assert.isTrue(out)
      assert.equal(rawQueryCalls.length, 1)
      const call = rawQueryCalls[0]
      assert.include(call.sql, 'user_event_links')
      assert.include(call.sql, "metadata->>'source'")
      assert.deepInclude(call.bindings, 'pizza-day%')
    })
  })

  test('returns false when phone has no matching event link', async ({ assert }) => {
    mockedRows = []
    await withEnv({ SMART_MODE_ENABLED: 'true' }, async () => {
      const out = await isSmartModeEnabledFor('+573001234567')
      assert.isFalse(out)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// isSmartModeEnabledFor — DB errors fail closed
// ══════════════════════════════════════════════════════════════════════════════

test.group('cohort | DB error fail-closed', (group) => {
  group.each.setup(installDbMock)
  group.each.teardown(restoreDbMock)
  group.each.setup(installPrefMock)
  group.each.teardown(restorePrefMock)

  test('returns false on DB throw (never silently widens rollout)', async ({ assert }) => {
    shouldThrow = true
    await withEnv({ SMART_MODE_ENABLED: 'true' }, async () => {
      const out = await isSmartModeEnabledFor('+573001234567')
      assert.isFalse(out, 'flaky postgres must not opt users into SMART MODE')
    })
  })
})
