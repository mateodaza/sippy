/**
 * VelocityService Unit Tests
 *
 * Groups A–I covering rolling-window checks, recordSend side effects,
 * trilingual messages, and cleanup.
 */

import { test } from '@japa/runner'
import VelocityService from '#services/velocity_service'

// ── Helpers ────────────────────────────────────────────────────────────────────

const SENDER = '+15550000001'
const RECIPIENT = '+15550000002'
const RECIPIENT_B = '+15550000003'
const RECIPIENT_C = '+15550000004'
const RECIPIENT_D = '+15550000005'

const SEND_WINDOW = 10 * 60 * 1000
const USD_WINDOW = 60 * 60 * 1000
const RECIPIENT_WINDOW = 60 * 60 * 1000

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
  test('B-01: 4 sends recorded, 5th check → allowed', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < 4; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('B-02: 5 sends recorded, 6th check → blocked with send_rate message', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    const result = svc.check(SENDER, RECIPIENT, 1)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many sends. Please wait a few minutes.')
  })

  test('B-03: 5 sends in the past (outside window), new check → allowed', ({ assert }) => {
    let now = 0
    const svc = new VelocityService(() => now)
    now = 1000
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    now = 1000 + SEND_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('B-04: different users are independent', ({ assert }) => {
    const svc = new VelocityService()
    const OTHER = '+15559999999'
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    assert.isTrue(svc.check(OTHER, RECIPIENT, 1).allowed)
  })
})

// ── Group C — USD total (rolling 1-hour window) ───────────────────────────────

test.group('VelocityService | Group C — USD limit', () => {
  test('C-01: $400 recorded, check $50 → allowed ($450 ≤ $500)', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 400)
    assert.isTrue(svc.check(SENDER, RECIPIENT, 50).allowed)
  })

  test('C-02: $400 recorded, check $150 → blocked with usd_limit message', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 400)
    const result = svc.check(SENDER, RECIPIENT, 150)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Hourly send limit reached. Please try again later.')
  })

  test('C-03: exactly $500 recorded, check $1 → blocked', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 500)
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('C-04: $500 recorded in the past (beyond USD_WINDOW), check $150 → allowed', ({
    assert,
  }) => {
    let now = 1000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, 500)
    now = 1000 + USD_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 150).allowed)
  })
})

// ── Group D — new recipients (rolling 1-hour window) ─────────────────────────

test.group('VelocityService | Group D — new recipients', () => {
  test('D-01: 2 new recipients recorded, 3rd new check → allowed', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    assert.isTrue(svc.check(SENDER, RECIPIENT_C, 1).allowed)
  })

  test('D-02: 3 new recipients recorded, 4th distinct check → blocked with new_recipient message', ({
    assert,
  }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    svc.recordSend(SENDER, RECIPIENT_C, 1)
    const result = svc.check(SENDER, RECIPIENT_D, 1)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many new recipients this hour. Please try again later.')
  })

  test('D-03: repeated recipient (already seen) → NOT counted as new → allowed after 3 others', ({
    assert,
  }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    svc.recordSend(SENDER, RECIPIENT_C, 1)
    // RECIPIENT is already known — not a new recipient
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('D-04: 3 recipients in the past (beyond RECIPIENT_WINDOW), 4th distinct → allowed', ({
    assert,
  }) => {
    let now = 1000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    svc.recordSend(SENDER, RECIPIENT_C, 1)
    now = 1000 + RECIPIENT_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT_D, 1).allowed)
  })
})

// ── Group E — rule priority / ordering ────────────────────────────────────────

test.group('VelocityService | Group E — rule priority', () => {
  test('E-01: send_rate AND usd_limit both violated → reason equals send_rate message', ({
    assert,
  }) => {
    const svc = new VelocityService()
    // Saturate both send rate and USD limit
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 100)
    const result = svc.check(SENDER, RECIPIENT, 100)
    assert.isFalse(result.allowed)
    assert.equal(result.reason, 'Too many sends. Please wait a few minutes.')
  })
})

// ── Group F — recordSend() side effects ───────────────────────────────────────

test.group('VelocityService | Group F — recordSend side effects', () => {
  test('F-01: recordSend increments send count', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < 4; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    // 4 recorded: still allowed
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
    svc.recordSend(SENDER, RECIPIENT, 1)
    // 5 recorded: now blocked
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('F-02: recordSend accumulates USD total', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 300)
    svc.recordSend(SENDER, RECIPIENT, 150)
    // $450 total: $60 more = $510 → blocked
    assert.isFalse(svc.check(SENDER, RECIPIENT, 60).allowed)
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
    // But check() sees it as 1 unique recipient
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    svc.recordSend(SENDER, RECIPIENT_C, 1)
    // 3 unique recipients (RECIPIENT, RECIPIENT_B, RECIPIENT_C) — RECIPIENT_D is new
    assert.isFalse(svc.check(SENDER, RECIPIENT_D, 1).allowed)
    // RECIPIENT itself is already known → allowed
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })
})

// ── Group G — trilingual messages ─────────────────────────────────────────────

test.group('VelocityService | Group G — trilingual messages', () => {
  test('G-01: lang es → Spanish send_rate message', ({ assert }) => {
    const svc = new VelocityService()
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    const result = svc.check(SENDER, RECIPIENT, 1, 'es')
    assert.equal(result.reason, 'Demasiados envios. Por favor espera unos minutos.')
  })

  test('G-02: lang pt → Portuguese usd_limit message', ({ assert }) => {
    const svc = new VelocityService()
    svc.recordSend(SENDER, RECIPIENT, 400)
    const result = svc.check(SENDER, RECIPIENT, 150, 'pt')
    assert.equal(result.reason, 'Limite de envio por hora atingido. Tente mais tarde.')
  })

  test('G-03: all three rules × all three langs produce non-empty, distinct strings', ({
    assert,
  }) => {
    const strings: string[] = []

    // send_rate
    const svcA_en = new VelocityService()
    for (let i = 0; i < 5; i++) svcA_en.recordSend(SENDER, RECIPIENT, 1)
    strings.push(svcA_en.check(SENDER, RECIPIENT, 1, 'en').reason!)
    strings.push(svcA_en.check(SENDER, RECIPIENT, 1, 'es').reason!)
    strings.push(svcA_en.check(SENDER, RECIPIENT, 1, 'pt').reason!)

    // usd_limit
    const svcB = new VelocityService()
    svcB.recordSend(SENDER, RECIPIENT, 400)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'en').reason!)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'es').reason!)
    strings.push(svcB.check(SENDER, RECIPIENT, 150, 'pt').reason!)

    // new_recipient
    const svcC = new VelocityService()
    svcC.recordSend(SENDER, RECIPIENT, 1)
    svcC.recordSend(SENDER, RECIPIENT_B, 1)
    svcC.recordSend(SENDER, RECIPIENT_C, 1)
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
  test('H-01: 5 sends at T, advance past SEND_WINDOW → allowed', ({ assert }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 1)
    now = 1_000_000 + SEND_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })

  test('H-02: $400 at T, advance past USD_WINDOW → check $200 allowed', ({ assert }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, 400)
    now = 1_000_000 + USD_WINDOW + 1
    assert.isTrue(svc.check(SENDER, RECIPIENT, 200).allowed)
  })

  test('H-03: 3 recipients at T, advance past RECIPIENT_WINDOW → 4th distinct allowed', ({
    assert,
  }) => {
    let now = 1_000_000
    const svc = new VelocityService(() => now)
    svc.recordSend(SENDER, RECIPIENT, 1)
    svc.recordSend(SENDER, RECIPIENT_B, 1)
    svc.recordSend(SENDER, RECIPIENT_C, 1)
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
    for (let i = 0; i < 5; i++) svc.recordSend(SENDER, RECIPIENT, 100)
    // Confirm blocked before reset
    assert.isFalse(svc.check(SENDER, RECIPIENT, 1).allowed)
    svc.reset()
    assert.isTrue(svc.check(SENDER, RECIPIENT, 1).allowed)
  })
})
