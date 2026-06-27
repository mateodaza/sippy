/**
 * Gas → AA onboarding-health monitor — unit tests. Part A (success-rate threshold/volume/
 * divide-by-zero) and Part B (each integrity invariant, pass + fail) run against pure
 * functions + injected deps, so no live chain or DB is needed.
 */

import { test } from '@japa/runner'
import { parseUnits } from 'viem'
import {
  evaluateHealth,
  auditOnboard,
  runOnboardingHealthOnce,
  shouldEscalateReadFailure,
  AUDIT_WINDOW_MS,
  type OnboardingHealthDeps,
  type NewlyDoneOnboard,
  type OnChainAudit,
} from '#services/gas_aa/onboarding_health'
import { SIPPY_SPENDER_ADDRESS, USDC_ADDRESSES, NETWORK } from '#config/network'
import { PIMLICO_PAYMASTER } from '#services/gas_aa/config'

const USDC = USDC_ADDRESSES[NETWORK]
const SPENDER = SIPPY_SPENDER_ADDRESS
const ACCOUNT = '0xf0aeAea578783e982749e6F3B439137F79Ae1833' // the prod canary account (checksummed)
const OWNER_EOA = '0x1111111111111111111111111111111111111111'
const ZERO_PM = '0x0000000000000000000000000000000000000000'
// The orchestration group's injected "now". A read failure on an onboard this recent is transient
// (warn), well inside the 48h window — distinct from the near-expiry escalation case.
const NOW_ISO = '2026-06-30T09:00:00Z'
const RECENT_MS = Date.parse(NOW_ISO) - 60 * 60 * 1000

function cleanOnboard(over: Partial<NewlyDoneOnboard> = {}): NewlyDoneOnboard {
  return {
    account: ACCOUNT,
    dailyLimit: 50,
    setupTxHash: '0xsetup',
    userEoa: OWNER_EOA,
    permissionCreatedAtMs: RECENT_MS,
    ...over,
  }
}
function cleanAudit(over: Partial<OnChainAudit> = {}): OnChainAudit {
  return {
    paymaster: PIMLICO_PAYMASTER,
    grant: { account: ACCOUNT, spender: SPENDER, token: USDC, allowance: parseUnits('50', 6) },
    grantCount: 1,
    ...over,
  }
}
const checks = (m: ReturnType<typeof auditOnboard>) => m.map((x) => x.check)

// ── Part A ────────────────────────────────────────────────────────────────────
test.group('onboarding health | Part A success-rate', () => {
  test('healthy rate → no alert', ({ assert }) => {
    const h = evaluateHealth({ reg7d: 10, done7d: 10 })
    assert.equal(h.rate, 1)
    assert.isFalse(h.alert)
  })

  test('below threshold with enough volume → alert (+ stuck count)', ({ assert }) => {
    const h = evaluateHealth({ reg7d: 10, done7d: 8 }) // 0.80
    assert.isTrue(h.alert)
    assert.equal(h.stuck, 2)
  })

  test('below threshold but low volume (reg < 5) → no alert', ({ assert }) => {
    const h = evaluateHealth({ reg7d: 4, done7d: 0 }) // 0% but suppressed
    assert.isFalse(h.alert)
  })

  test('zero registrations → no divide, no alert', ({ assert }) => {
    const h = evaluateHealth({ reg7d: 0, done7d: 0 })
    assert.isNull(h.rate)
    assert.isFalse(h.alert)
  })

  test('exactly at the 0.90 threshold → no alert (strictly below only)', ({ assert }) => {
    const h = evaluateHealth({ reg7d: 10, done7d: 9 }) // 0.90
    assert.isFalse(h.alert)
  })
})

// ── Part B ────────────────────────────────────────────────────────────────────
test.group('onboarding health | Part B integrity', () => {
  test('clean sponsored onboard → no misses (the canary marks clean)', ({ assert }) => {
    assert.lengthOf(
      auditOnboard(cleanOnboard(), cleanAudit(), { balanceWei: 0n, nonce: 0 }, false),
      0
    )
  })

  test('missing gas_aa setup row (flag on) → missing_setup_row', ({ assert }) => {
    assert.deepEqual(checks(auditOnboard(cleanOnboard({ setupTxHash: null }), null, null, false)), [
      'missing_setup_row',
    ])
  })

  test('self-paid (paymaster 0x0) → self_paid', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard(),
      cleanAudit({ paymaster: ZERO_PM }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.include(checks(m), 'self_paid')
  })

  test('wrong (non-Pimlico) paymaster → self_paid', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard(),
      cleanAudit({ paymaster: '0xdEAD000000000000000000000000000000000000' }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.include(checks(m), 'self_paid')
  })

  test('GasRefuel drip on the smart account → gas_refuel_drip', ({ assert }) => {
    const m = auditOnboard(cleanOnboard(), cleanAudit(), { balanceWei: 0n, nonce: 0 }, true)
    assert.include(checks(m), 'gas_refuel_drip')
  })

  test('owner EOA funded or used (balance/nonce nonzero) → owner_eoa_funded', ({ assert }) => {
    const m = auditOnboard(cleanOnboard(), cleanAudit(), { balanceWei: 1n, nonce: 0 }, false)
    assert.include(checks(m), 'owner_eoa_funded')
    const m2 = auditOnboard(cleanOnboard(), cleanAudit(), { balanceWei: 0n, nonce: 3 }, false)
    assert.include(checks(m2), 'owner_eoa_funded')
  })

  test('duplicate grant (2 approvals in window) → duplicate_or_malformed_grant', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard(),
      cleanAudit({ grantCount: 2 }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.include(checks(m), 'duplicate_or_malformed_grant')
  })

  // #1 fix: a normal post-onboard send/settings op does NOT inflate the grant count, so a
  // clean onboard with later activity (grantCount stays 1) never false-alarms as duplicate.
  test('normal post-onboard activity (grantCount stays 1) → no duplicate alarm', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard(),
      cleanAudit({ grantCount: 1 }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.notInclude(checks(m), 'duplicate_or_malformed_grant')
  })

  test('no grant in the setup tx (grant null) → duplicate_or_malformed_grant', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard(),
      cleanAudit({ grant: null, grantCount: 0 }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.include(checks(m), 'duplicate_or_malformed_grant')
  })

  test('allowance != registered daily_limit → grant_fields_mismatch', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard({ dailyLimit: 50 }),
      cleanAudit({
        grant: { account: ACCOUNT, spender: SPENDER, token: USDC, allowance: parseUnits('500', 6) },
      }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.include(checks(m), 'grant_fields_mismatch')
  })

  // A6 landmine: lowercase on-chain values must match checksummed expectations — no false miss.
  test('casing: lowercased on-chain account/spender/token still pass', ({ assert }) => {
    const m = auditOnboard(
      cleanOnboard({ account: ACCOUNT.toLowerCase() }),
      cleanAudit({
        grant: {
          account: ACCOUNT.toLowerCase(),
          spender: SPENDER.toLowerCase(),
          token: USDC.toLowerCase(),
          allowance: parseUnits('50', 6),
        },
      }),
      { balanceWei: 0n, nonce: 0 },
      false
    )
    assert.lengthOf(m, 0)
  })
})

// ── orchestration: the flag gate + error tolerance ─────────────────────────────
test.group('onboarding health | orchestration', () => {
  const NOW = new Date(NOW_ISO)
  function deps(over: Partial<OnboardingHealthDeps> = {}): OnboardingHealthDeps {
    return {
      countOnboards7d: async () => ({ reg7d: 10, done7d: 10 }),
      flagOn: () => true,
      monitorStartMs: () => 0,
      listNewlyDone: async () => [cleanOnboard()],
      auditOnChain: async () => cleanAudit(),
      getEoaState: async () => ({ balanceWei: 0n, nonce: 0 }),
      hasRefuelEvent: async () => false,
      ...over,
    }
  }

  test('flag OFF → Part B never runs (no audits) even with newly-done rows', async ({ assert }) => {
    const r = await runOnboardingHealthOnce(NOW, deps({ flagOn: () => false }))
    assert.equal(r.audited, 0)
    assert.lengthOf(r.misses, 0)
  })

  test('flag ON, clean rows → audited, no misses', async ({ assert }) => {
    const r = await runOnboardingHealthOnce(NOW, deps())
    assert.equal(r.audited, 1)
    assert.lengthOf(r.misses, 0)
  })

  test('flag ON, a self-paid onboard → integrity miss surfaced', async ({ assert }) => {
    const r = await runOnboardingHealthOnce(
      NOW,
      deps({ auditOnChain: async () => cleanAudit({ paymaster: ZERO_PM }) })
    )
    assert.isAbove(r.misses.length, 0)
    assert.include(
      r.misses.map((m) => m.check),
      'self_paid'
    )
  })

  test('a transient on-chain read error is swallowed (counted as a read failure, not paged)', async ({
    assert,
  }) => {
    const r = await runOnboardingHealthOnce(
      NOW,
      deps({
        auditOnChain: async () => {
          throw new Error('RPC down')
        },
      })
    )
    assert.equal(r.audited, 0) // the read failed → NOT counted as audited
    assert.equal(r.auditReadFailures, 1) // tracked instead
    assert.lengthOf(r.misses, 0) // skipped, not paged as an integrity miss
  })

  test('an onboard unreadable on its LAST pass before aging out is escalated (counted)', async ({
    assert,
  }) => {
    // ~30m before the 48h window edge → shouldEscalateReadFailure is true, so a persistent read
    // failure here pages (logger.error) instead of vanishing. The escalate decision itself is
    // unit-tested via shouldEscalateReadFailure; here we assert it's counted as a read failure.
    const nearExpiryMs = NOW.getTime() - (AUDIT_WINDOW_MS - 30 * 60 * 1000)
    const r = await runOnboardingHealthOnce(
      NOW,
      deps({
        listNewlyDone: async () => [cleanOnboard({ permissionCreatedAtMs: nearExpiryMs })],
        auditOnChain: async () => {
          throw new Error('bad tx_hash')
        },
      })
    )
    assert.equal(r.audited, 0)
    assert.equal(r.auditReadFailures, 1)
    assert.isTrue(shouldEscalateReadFailure(NOW.getTime() - nearExpiryMs))
  })

  // #3: the audit window is floored at monitorStartMs so legacy-era onboards (pre-flip but
  // still within 48h) aren't classified as sponsored failures.
  test('audit cutoff = monitorStartMs when it is newer than the 48h window', async ({ assert }) => {
    let cutoff = -1
    const start = NOW.getTime() - 6 * 60 * 60 * 1000 // 6h ago (newer than now-48h)
    await runOnboardingHealthOnce(
      NOW,
      deps({
        monitorStartMs: () => start,
        listNewlyDone: async (c) => {
          cutoff = c
          return []
        },
      })
    )
    assert.equal(cutoff, start)
  })

  test('audit cutoff = the 48h window when monitorStartMs is unset/older', async ({ assert }) => {
    let cutoff = -1
    await runOnboardingHealthOnce(
      NOW,
      deps({
        monitorStartMs: () => 0,
        listNewlyDone: async (c) => {
          cutoff = c
          return []
        },
      })
    )
    assert.equal(cutoff, NOW.getTime() - AUDIT_WINDOW_MS)
  })
})

// ── pure: the read-failure escalation gate ─────────────────────────────────────
test.group('onboarding health | read-failure escalation gate', () => {
  test('a recent read failure is transient → no escalation', ({ assert }) => {
    assert.isFalse(shouldEscalateReadFailure(0))
    assert.isFalse(shouldEscalateReadFailure(60 * 60 * 1000)) // 1h old
  })

  test('a read failure within one cron interval of the window edge escalates', ({ assert }) => {
    assert.isTrue(shouldEscalateReadFailure(AUDIT_WINDOW_MS - 60 * 60 * 1000)) // 1h before aging out
    assert.isTrue(shouldEscalateReadFailure(AUDIT_WINDOW_MS)) // already at the edge
  })
})
