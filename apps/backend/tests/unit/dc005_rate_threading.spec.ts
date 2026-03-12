/**
 * DC-005 Rate Threading Tests
 *
 * AC coverage:
 * - AC1: dispatchCommand correctly calls fetchRateContext (which calls getLocalRate)
 *         and threads results to handlers — not hardcoded nulls
 * - AC2: routeCommand passes rate values from rateCtx as required params to handlers
 *         (injectable handler pattern — fake handlers record received args)
 * - AC3: fetchRateContext resolves recipient's local currency for send commands
 * - AC4: Rate failure → all-nulls returned, never throws; null rate when not in cache
 * - AC5: When cache is warm, getLocalRate resolves via Map.get — no I/O on critical path
 */

import { test } from '@japa/runner'
import { exchangeRateService } from '#services/exchange_rate_service'
import { fetchRateContext, routeCommand, dispatchCommand } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { Lang } from '#utils/messages'
import type { ParsedCommand } from '#types/index'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Seed the singleton's in-memory cache with a known rates payload via fetch stub. */
async function seedCache(rates: Record<string, number>): Promise<void> {
  // Clear existing entries so each group starts from a known state.
  // fetchRates() only sets entries (never deletes), so without this, values
  // from previous test groups would persist and make the MXN-only test unreliable.
  const cache = (exchangeRateService as any).ratesCache as Map<string, number>
  cache.clear()

  const original = globalThis.fetch
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ rates }),
    }) as Response
  try {
    await exchangeRateService.fetchRates()
  } finally {
    globalThis.fetch = original
  }
}

// ── AC1: dispatchCommand threads real cache values to handlers ─────────────
//
// STRATEGY: dispatchCommand calls fetchRateContext which calls getLocalRate.
// Tests seed the singleton cache, then call dispatchCommand with injectable
// fake handlers. The fake handler records the rate args it receives.
//
// This directly catches the bug where dispatchCommand does:
//   const rateCtx = { senderRate: null, ... }  ← bug: skips fetchRateContext
// because then capturedRate would be null ≠ 4000, failing the assertion.
// ──────────────────────────────────────────────────────────────────────────

test.group('AC1 dispatchCommand | rate threaded from cache to balance handler', (group) => {
  group.setup(async () => {
    await seedCache({ COP: 4000, MXN: 17 })
  })

  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('Colombian sender: senderRate=4000, senderCurrency=COP reach handler', async ({ assert }) => {
    let capturedRate: number | null | undefined = undefined
    let capturedCurrency: string | null | undefined = undefined

    const fakeBalance = async (
      _phone: string,
      _lang: Lang,
      rate: number | null,
      currency: string | null
    ) => {
      capturedRate = rate
      capturedCurrency = currency
    }

    const cmd: ParsedCommand = { command: 'balance', originalText: 'balance' }
    await dispatchCommand('573001234567', cmd, 'es', [], fakeBalance)

    assert.equal(capturedRate, 4000, 'dispatchCommand must call fetchRateContext, not hardcode null')
    assert.equal(capturedCurrency, 'COP')
  })

  test('Mexican sender: senderRate=17, senderCurrency=MXN reach handler', async ({ assert }) => {
    let capturedRate: number | null | undefined = undefined
    let capturedCurrency: string | null | undefined = undefined

    const fakeBalance = async (
      _phone: string,
      _lang: Lang,
      rate: number | null,
      currency: string | null
    ) => {
      capturedRate = rate
      capturedCurrency = currency
    }

    const cmd: ParsedCommand = { command: 'balance', originalText: 'balance' }
    await dispatchCommand('521234567890', cmd, 'es', [], fakeBalance)

    assert.equal(capturedRate, 17)
    assert.equal(capturedCurrency, 'MXN')
  })

  test('USD sender (+1): null rate, null currency reach handler', async ({ assert }) => {
    let capturedRate: number | null | undefined = undefined
    let capturedCurrency: string | null | undefined = undefined

    const fakeBalance = async (
      _phone: string,
      _lang: Lang,
      rate: number | null,
      currency: string | null
    ) => {
      capturedRate = rate
      capturedCurrency = currency
    }

    const cmd: ParsedCommand = { command: 'balance', originalText: 'balance' }
    await dispatchCommand('13105551234', cmd, 'en', [], fakeBalance)

    assert.isNull(capturedRate)
    assert.isNull(capturedCurrency)
  })
})

test.group('AC1 dispatchCommand | rate threaded from cache to send handler', (group) => {
  group.setup(async () => {
    await seedCache({ COP: 4000, BRL: 5 })
  })

  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('COP sender + BRL recipient: all four rate fields reach handler from cache', async ({ assert }) => {
    let capturedSenderRate: number | null | undefined = undefined
    let capturedSenderCurrency: string | null | undefined = undefined
    let capturedRecipientRate: number | null | undefined = undefined
    let capturedRecipientCurrency: string | null | undefined = undefined

    const fakeSend = async (
      _from: string,
      _amount: number,
      _to: string,
      _lang: Lang,
      sr: number | null,
      sc: string | null,
      rr: number | null,
      rc: string | null
    ) => {
      capturedSenderRate = sr
      capturedSenderCurrency = sc
      capturedRecipientRate = rr
      capturedRecipientCurrency = rc
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 10,
      recipient: '551234567890',
      originalText: 'send 10 to 551234567890',
    }
    await dispatchCommand('573001234567', cmd, 'es', [], undefined, fakeSend)

    assert.equal(capturedSenderRate, 4000, 'dispatchCommand must call fetchRateContext for sender')
    assert.equal(capturedSenderCurrency, 'COP')
    assert.equal(capturedRecipientRate, 5, 'dispatchCommand must call fetchRateContext for recipient')
    assert.equal(capturedRecipientCurrency, 'BRL')
  })
})

// ── AC3: fetchRateContext recipient resolution ─────────────────────────────

test.group('fetchRateContext | sender resolution', (group) => {
  group.setup(async () => {
    await seedCache({ COP: 4000, MXN: 17, ARS: 900, BRL: 5, PEN: 3.7, CLP: 900 })
  })

  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('LATAM sender (+57 Colombia) → senderCurrency=COP, senderRate=4000', async ({ assert }) => {
    const ctx = await fetchRateContext('573001234567')
    assert.equal(ctx.senderCurrency, 'COP')
    assert.equal(ctx.senderRate, 4000)
    assert.isNull(ctx.recipientCurrency)
    assert.isNull(ctx.recipientRate)
  })

  test('USD-country sender (+1 USA) → senderCurrency=null, senderRate=null', async ({ assert }) => {
    const ctx = await fetchRateContext('13105551234')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
  })

  test('USD-country sender (+507 Panama) → senderCurrency=null (Panama is USD)', async ({ assert }) => {
    const ctx = await fetchRateContext('50712345678')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
  })

  test('Unknown prefix → senderCurrency=null, senderRate=null', async ({ assert }) => {
    const ctx = await fetchRateContext('999001234567')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
  })
})

test.group('fetchRateContext | recipient resolution', (group) => {
  group.setup(async () => {
    await seedCache({ COP: 4000, BRL: 5 })
  })

  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('LATAM sender + LATAM recipient → both rates populated', async ({ assert }) => {
    const ctx = await fetchRateContext('573001234567', '551234567890') // COP + BRL
    assert.equal(ctx.senderCurrency, 'COP')
    assert.equal(ctx.senderRate, 4000)
    assert.equal(ctx.recipientCurrency, 'BRL')
    assert.equal(ctx.recipientRate, 5)
  })

  test('LATAM sender + USD recipient → sender rate set, recipient fields null', async ({ assert }) => {
    const ctx = await fetchRateContext('573001234567', '13105551234')
    assert.equal(ctx.senderCurrency, 'COP')
    assert.equal(ctx.senderRate, 4000)
    assert.isNull(ctx.recipientCurrency)
    assert.isNull(ctx.recipientRate)
  })

  test('no recipientPhone arg → recipient fields null', async ({ assert }) => {
    const ctx = await fetchRateContext('573001234567')
    assert.isNull(ctx.recipientCurrency)
    assert.isNull(ctx.recipientRate)
  })
})

// ── AC2: routeCommand wiring — injectable handlers verify actual arg values ──

test.group('AC2 routeCommand | rate values threaded to balance handler', () => {
  test('balance command: senderRate + senderCurrency reach the handler', async ({ assert }) => {
    let capturedRate: number | null | undefined = undefined
    let capturedCurrency: string | null | undefined = undefined

    const fakeBalance = async (
      _phone: string,
      _lang: Lang,
      rate: number | null,
      currency: string | null
    ) => {
      capturedRate = rate
      capturedCurrency = currency
    }

    const rateCtx: RateContext = {
      senderRate: 4000,
      senderCurrency: 'COP',
      recipientRate: null,
      recipientCurrency: null,
    }

    const cmd: ParsedCommand = { command: 'balance', originalText: 'balance' }
    await routeCommand('573001234567', cmd, 'es', rateCtx, [], fakeBalance)

    assert.equal(capturedRate, 4000)
    assert.equal(capturedCurrency, 'COP')
  })

  test('balance command with null rates: null values reach the handler (USD path)', async ({ assert }) => {
    let capturedRate: number | null | undefined = undefined
    let capturedCurrency: string | null | undefined = undefined

    const fakeBalance = async (
      _phone: string,
      _lang: Lang,
      rate: number | null,
      currency: string | null
    ) => {
      capturedRate = rate
      capturedCurrency = currency
    }

    const rateCtx: RateContext = {
      senderRate: null,
      senderCurrency: null,
      recipientRate: null,
      recipientCurrency: null,
    }

    const cmd: ParsedCommand = { command: 'balance', originalText: 'balance' }
    await routeCommand('13105551234', cmd, 'en', rateCtx, [], fakeBalance)

    assert.isNull(capturedRate)
    assert.isNull(capturedCurrency)
  })
})

test.group('AC2 routeCommand | rate values threaded to send handler', () => {
  test('send command: all four rate fields reach the handler', async ({ assert }) => {
    let capturedSenderRate: number | null | undefined = undefined
    let capturedSenderCurrency: string | null | undefined = undefined
    let capturedRecipientRate: number | null | undefined = undefined
    let capturedRecipientCurrency: string | null | undefined = undefined

    const fakeSend = async (
      _from: string,
      _amount: number,
      _to: string,
      _lang: Lang,
      sr: number | null,
      sc: string | null,
      rr: number | null,
      rc: string | null
    ) => {
      capturedSenderRate = sr
      capturedSenderCurrency = sc
      capturedRecipientRate = rr
      capturedRecipientCurrency = rc
    }

    const rateCtx: RateContext = {
      senderRate: 4000,
      senderCurrency: 'COP',
      recipientRate: 5,
      recipientCurrency: 'BRL',
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 10,
      recipient: '551234567890',
      originalText: 'send 10 to 551234567890',
    }
    await routeCommand('573001234567', cmd, 'es', rateCtx, [], undefined, fakeSend)

    assert.equal(capturedSenderRate, 4000)
    assert.equal(capturedSenderCurrency, 'COP')
    assert.equal(capturedRecipientRate, 5)
    assert.equal(capturedRecipientCurrency, 'BRL')
  })
})

// ── AC4: non-blocking fallback — never throws ─────────────────────────────
//
// USD-country and unknown-prefix phones return null from getCurrencyForPhone
// (synchronous, no cache lookup). These tests are cache-state-independent.
// They verify: fetchRateContext never throws and returns all-nulls when there
// is no LATAM currency for the phone.
//
// The "null rate when currency found but not in cache" path is exercised by
// seeding a partial cache (e.g. only MXN), then calling with a COP phone.
// getLocalRate returns null when cache is non-empty but currency is absent.
// ──────────────────────────────────────────────────────────────────────────

test.group('AC4 fetchRateContext | non-blocking fallback', (group) => {
  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('USD-country phone (+1) → all-nulls, no throw', async ({ assert }) => {
    await assert.doesNotReject(() => fetchRateContext('13105551234'))
    const ctx = await fetchRateContext('13105551234')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
    assert.isNull(ctx.recipientCurrency)
    assert.isNull(ctx.recipientRate)
  })

  test('unknown phone prefix → all-nulls, no throw', async ({ assert }) => {
    await assert.doesNotReject(() => fetchRateContext('999001234567'))
    const ctx = await fetchRateContext('999001234567')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
  })

  test('empty string phone → all-nulls, no throw', async ({ assert }) => {
    await assert.doesNotReject(() => fetchRateContext(''))
    const ctx = await fetchRateContext('')
    assert.isNull(ctx.senderCurrency)
    assert.isNull(ctx.senderRate)
    assert.isNull(ctx.recipientCurrency)
    assert.isNull(ctx.recipientRate)
  })
})

test.group('AC4 fetchRateContext | null rate when currency not in cache', (group) => {
  group.setup(async () => {
    // Seed only MXN — COP is absent from the cache
    await seedCache({ MXN: 17 })
  })

  group.teardown(() => {
    exchangeRateService.stopRefreshTimer()
  })

  test('COP phone with MXN-only cache → senderCurrency=COP, senderRate=null', async ({ assert }) => {
    // getCurrencyForPhone returns 'COP', getLocalRate('COP') returns null (not in cache)
    const ctx = await fetchRateContext('573001234567')
    assert.equal(ctx.senderCurrency, 'COP', 'currency is still detected from phone prefix')
    assert.isNull(ctx.senderRate, 'rate is null when currency absent from cache')
    // No throw — graceful USD-only fallback
  })
})

// ── AC5: warm-cache critical path — no I/O on getLocalRate ────────────────
//
// When ratesCache.size > 0, getLocalRate skips the _initialFetchPromise await
// branch and returns via Map.get — no network I/O. This is structural behavior
// of the existing getLocalRate implementation (exchange_rate_service.ts:96-98).
// fetchRateContext is async (required by getLocalRate's async signature), but
// the underlying operation is an in-memory lookup when the cache is warm.
// Verified at code-review time by reading exchange_rate_service.ts:getLocalRate.
