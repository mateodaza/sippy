/**
 * VelocityService Unit Tests
 *
 * Groups A–I covering rolling-window checks, recordSend side effects,
 * trilingual messages, and cleanup.
 *
 * Thresholds match the service defaults:
 *   MAX_SENDS = 15  (per 10-min window)
 *   MAX_USD   = 1000 (per 1-hour window)
 *   MAX_NEW_RECIPIENTS = 10  (per 1-hour window)
 */

import { test } from '@japa/runner'
import VelocityService from '#services/velocity_service'

// ── Helpers ────────────────────────────────────────────────────────────────────

const SENDER = '+15550000001'
const RECIPIENT = '+15550000002'
const RECIPIENT_D = '+15550000005'

// Must match service defaults
const MAX_SENDS = 15
const MAX_USD = 1000
const MAX_NEW_RECIPIENTS = 10

const SEND_WINDOW = 10 * 60 * 1000
const USD_WINDOW = 60 * 60 * 1000
const RECIPIENT_WINDOW = 60 * 60 * 1000

// Generate distinct recipient phone numbers
function recipientN(n: number): string {
  return `+1555100${n.toString().padStart(4, '0')}`
}

// ── Group A — check() allows first-time users ─────────────────────────────────

test.group('VelocityService | Group A — first-time users', () => {
  test('A-01: new user $10 send → allowed', ({ assert }) => {
    const svc = new VelocityService()
    const result = svc.check(SENDER, RECIPIENT, 10)
    assert.isTrue(result.allowed)
  })

  test('A-02: reason is undefined when allowed', ({ assert }) => {
    const svc = new VelocityService()
    const result = svc.check(SENDER, RECIPIENT, 10)
    assert.isUndefined(result.reason)
  })
})

// ── Group B — send rate (rolling 10-min window) ───────────────────────────────

test.group('VelocityService | Group B — send rate', () => {
  test('B-01: MAX_SENDS-1 sends recorded, next check → allowed', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_SENDS - 1; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('B-02: MAX_SENDS sends recorded, next check → blocked with send_rate message', ({
    assert,
  }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    const result = svc.check(SENDER, RECIPIENT, 1)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many sends. Please wait a few minutes.')
  })

  test('B-03: MAX_SENDS sends in the past (outside window), new check → allowed', ({ assert }) => {
    let now = 0
    const svc = new VelocityService(() => now)
    now = 1000
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    now = 1000 + SEND_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('B-04: different users are independent', ({ assert }) => {
    const svc = new VelocityService()
    const OTHER = '+15559999999'
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    assert.isTrue(svc.check(OTHER, RECIPIENT, 1).allowed)
  })
})

// ── Group C — USD total (rolling 1-hour window) ───────────────────────────────

test.group('VelocityService | Group C — USD limit', () => {
  test('C-01: under limit → allowed', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, MAX_USD - 100)
    assert.isTrue(svc.check(SENDER, RECIPIENT, 50).allowed)
  })

  test('C-02: over limit → blocked with usd_limit message', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, MAX_USD - 100)
    const result = svc.check(SENDER, RECIPIENT, 150)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Hourly send limit reached. Please try again later.')
  })

  test('C-03: exactly MAX_USD recorded, check $1 → blocked', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, MAX_USD)
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('C-04: MAX_USD recorded in the past (beyond USD_WINDOW), check → allowed', ({ assert }) => {
    let now = 1000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, MAX_USD)
    now = 1000 + USD_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 150).allowed)
  })
})

// ── Group D — new recipients (rolling 1-hour window) ─────────────────────────

test.group('VelocityService | Group D — new recipients', () => {
  test('D-01: MAX_NEW_RECIPIENTS-1 new recipients, next new check → allowed', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_NEW_RECIPIENTS - 1; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    assert.isTrue(svc.check(SENDER, recipientN(MAX_NEW_RECIPIENTS), 1).allowed)
  })

  test('D-02: MAX_NEW_RECIPIENTS new recipients recorded, next distinct check → blocked with new_recipient message', ({
    assert,
  }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_NEW_RECIPIENTS; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    const result = svc.check(SENDER, recipientN(MAX_NEW_RECIPIENTS + 1), 1)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many new recipients this hour. Please try again later.')
  })

  test('D-03: repeated recipient (already seen) → NOT counted as new → allowed after max others', ({
    assert,
  }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_NEW_RECIPIENTS; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    // recipientN(0) is already known — not a new recipient
    assert.isTrue(svc.check(SENDER, recipientN(0), 1).allowed)
  })

  test('D-04: MAX_NEW_RECIPIENTS recipients in the past (beyond RECIPIENT_WINDOW), new distinct → allowed', ({
    assert,
  }) => {
    let now = 1000
    const svc = new VelocityService(() => now)
    for (let i = 0; i < MAX_NEW_RECIPIENTS; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    now = 1000 + RECIPIENT_WINDOW + 1
    assert.isTrue(svc.check(SENDER, recipientN(MAX_NEW_RECIPIENTS + 1), 1).allowed)
  })
})

// ── Group E — rule priority / ordering ────────────────────────────────────────

test.group('VelocityService | Group E — rule priority', () => {
  test('E-01: send_rate AND usd_limit both violated → reason equals send_rate message', ({
    assert,
  }) => {
    const svc = new VelocityService()
    // Saturate both send rate and USD limit
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, MAX_USD / MAX_SENDS + 1)
    const result = svc.check(SENDER, RECIPIENT, 100)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many sends. Please wait a few minutes.')
  })
})

// ── Group F — recordSend() side effects ───────────────────────────────────────

test.group('VelocityService | Group F — recordSend side effects', () => {
  test('F-01: recordSend increments send count', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_SENDS - 1; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    // MAX_SENDS-1 recorded: still allowed
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
    svc.recordSend(SENDER, RECIPIENT, 1)
    // MAX_SENDS recorded: now blocked
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('F-02: recordSend accumulates USD total', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, MAX_USD * 0.6)
    svc.recordSend(SENDER, RECIPIENT, MAX_USD * 0.3)
    // 90% of MAX_USD: adding 15% = 105% → blocked
    assert.isFalse(svc.check(SENDER, RECIPIENT, MAX_USD * 0.15).allowed)
  })

  test('F-03: same recipient twice → recipientEvents has 2 entries but treated as 1 unique', ({
    assert,
  }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT, 1)
    // Verify internal state has 2 raw entries
    const events = (svc as any).recipientEvents.get(SENDER) as {
      timestamp: number
      recipient: string
    }[]
    assert.equal(events.length, 2)
    // Fill up remaining unique recipient slots
    for (let i = 0; i < MAX_NEW_RECIPIENTS - 1; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    // MAX_NEW_RECIPIENTS unique recipients (RECIPIENT + MAX_NEW_RECIPIENTS-1 others) — next new one blocked
    assert.isFalse(svc.check(SENDER, recipientN(MAX_NEW_RECIPIENTS + 100), 1).allowed)
    // RECIPIENT itself is already known → allowed
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })
})

// ── Group G — trilingual messages ─────────────────────────────────────────────

test.group('VelocityService | Group G — trilingual messages', () => {
  test('G-01: lang es → Spanish send_rate message', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    const result = svc.check(SENDER, RECIPIENT, 1, 'es')
    assert.equal(result.reason, 'Demasiados envios. Por favor espera unos minutos.')
  })

  test('G-02: lang pt → Portuguese usd_limit message', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, MAX_USD - 100)
    const result = svc.check(SENDER, RECIPIENT, 150, 'pt')
    assert.equal(result.reason, 'Limite de envio por hora atingido. Tente mais tarde.')
  })

  test('G-03: all three rules × all three langs produce non-empty, distinct strings', ({
    assert,
  }) => {
    const strings: string[] = []

    // send_rate
    const svcA = new VelocityService()
    for (let i = 0; i < MAX_SENDS; i++) svcA.recordSend(SENDER, RECIPIENT, 1)
    strings.push(svcA.check(SENDER, RECIPIENT, 1, 'en').reason!)
    strings.push(svcA.check(SENDER, RECIPIENT, 1, 'es').reason!)
    strings.push(svcA.check(SENDER, RECIPIENT, 1, 'pt').reason!)

    // usd_limit
    const svcB = new VelocityService()
    svcB.recordSend(SENDER, RECIPIENT, MAX_USD - 100)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'en').reason!)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'es').reason!)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'pt').reason!)

    // new_recipient
    const svcC = new VelocityService()
    for (let i = 0; i < MAX_NEW_RECIPIENTS; i++) {
      svcC.recordSend(SENDER, recipientN(i), 1)
    }
    strings.push(svcC.check(SENDER, RECIPIENT_D, 1, 'en').reason!)
    strings.push(svcC.check(SENDER, RECIPIENT_D, 1, 'es').reason!)
    strings.push(svcC.check(SENDER, RECIPIENT_D, 1, 'pt').reason!)

    // All 9 strings must be non-empty
    for (const s of strings) assert.isNotEmpty(s)

    // All 9 strings must be distinct
    const unique = new Set(strings)
    assert.equal(unique.size, 9)
  })
})

// ── Group H — rolling window correctness (clock injection) ────────────────────

test.group('VelocityService | Group H — rolling window correctness', () => {
  test('H-01: MAX_SENDS sends at T, advance past SEND_WINDOW → allowed', ({ assert }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    now = 1_000_000 + SEND_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('H-02: MAX_USD at T, advance past USD_WINDOW → check $200 allowed', ({ assert }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, MAX_USD)
    now = 1_000_000 + USD_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 200).allowed)
  })

  test('H-03: MAX_NEW_RECIPIENTS recipients at T, advance past RECIPIENT_WINDOW → new distinct allowed', ({
    assert,
  }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    for (let i = 0; i < MAX_NEW_RECIPIENTS; i++) {
      svc.recordSend(SENDER, recipientN(i), 1)
    }
    now = 1_000_000 + RECIPIENT_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT_D, 1).allowed)
  })

  test('H-04: 3 sends at T, 2 more at T+SEND_WINDOW+1ms; at T+SEND_WINDOW+2ms → only 2 events → allowed', ({
    assert,
  }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    // Record 3 sends at T
    for (let i = 0; i < 3; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    // Advance to T + SEND_WINDOW + 1ms, record 2 more
    now = 1_000_000 + SEND_WINDOW + 1
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT, 1)
    // At T + SEND_WINDOW + 2ms: the first 3 are expired, only 2 remain
    now = 1_000_000 + SEND_WINDOW + 2
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })
})

// ── Group I — cleanup / TTL ───────────────────────────────────────────────────

test.group('VelocityService | Group I — cleanup', () => {
  test('I-01: stopCleanupTimers after startCleanupTimers throws no errors', ({ assert }) => {
    const svc = new VelocityService()
    assert.doesNotThrow(() => {
      svc.startCleanupTimers()
      svc.stopCleanupTimers()
    })
  })

  test('I-02: reset() clears all maps; subsequent check → allowed', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < MAX_SENDS; i++) svc.recordSend(SENDER, RECIPIENT, 100)
    // Confirm blocked before reset
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
    svc.reset()
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })
})
