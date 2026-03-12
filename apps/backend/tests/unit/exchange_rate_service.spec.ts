/**
 * DC-006 Exchange Rate Service Tests
 *
 * AC coverage:
 * - getCurrencyForPhone: all LATAM codes map correctly
 * - getCurrencyForPhone: USD codes return null
 * - getCurrencyForPhone: unknown prefix returns null
 * - getLocalRate: cache behavior
 * - fetchRates: caches rates from API response
 */

import { test } from '@japa/runner'
import ExchangeRateService from '#services/exchange_rate_service'

// ── Setup pattern helper ────────────────────────────────────────────────────
//
// Must stub globalThis.fetch BEFORE new ExchangeRateService() because the
// constructor calls startRefreshTimer() which immediately fires fetchRates().

async function createService(): Promise<{
  svc: ExchangeRateService
  originalFetch: typeof globalThis.fetch
}> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    ({ ok: true, json: async () => ({ rates: {} }) }) as Response

  const svc = new ExchangeRateService()
  svc.stopRefreshTimer()

  // Drain in-flight initial fetch promise before assertions
  await (svc as any)._initialFetchPromise

  globalThis.fetch = originalFetch
  return { svc, originalFetch }
}

// ── Group A: getCurrencyForPhone — LATAM codes ──────────────────────────────

test.group('getCurrencyForPhone | LATAM codes map correctly', (group) => {
  let svc: ExchangeRateService
  let originalFetch: typeof globalThis.fetch

  group.setup(async () => {
    const result = await createService()
    svc = result.svc
    originalFetch = result.originalFetch
  })

  group.teardown(() => {
    svc.stopRefreshTimer()
    globalThis.fetch = originalFetch
  })

  test('Colombia +57 → COP', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+573001234567'), 'COP')
  })

  test('Mexico +52 → MXN', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+5215551234567'), 'MXN')
  })

  test('Argentina +54 → ARS', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+541151234567'), 'ARS')
  })

  test('Brazil +55 → BRL', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+5511987654321'), 'BRL')
  })

  test('Peru +51 → PEN', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+51987654321'), 'PEN')
  })

  test('Chile +56 → CLP', ({ assert }) => {
    assert.equal(svc.getCurrencyForPhone('+56912345678'), 'CLP')
  })
})

// ── Group B: getCurrencyForPhone — USD codes ────────────────────────────────

test.group('getCurrencyForPhone | USD codes return null', (group) => {
  let svc: ExchangeRateService
  let originalFetch: typeof globalThis.fetch

  group.setup(async () => {
    const result = await createService()
    svc = result.svc
    originalFetch = result.originalFetch
  })

  group.teardown(() => {
    svc.stopRefreshTimer()
    globalThis.fetch = originalFetch
  })

  test('Panama +507 → null (USD; must match before +57 Colombia)', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+50761234567'))
  })

  test('Ecuador +593 → null (USD)', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+59312345678'))
  })

  test('El Salvador +503 → null (USD)', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+50371234567'))
  })

  test('USA/Canada +1 → null (USD)', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+13105551234'))
  })
})

// ── Group C: getCurrencyForPhone — unknown prefix ───────────────────────────

test.group('getCurrencyForPhone | unknown prefix returns null', (group) => {
  let svc: ExchangeRateService
  let originalFetch: typeof globalThis.fetch

  group.setup(async () => {
    const result = await createService()
    svc = result.svc
    originalFetch = result.originalFetch
  })

  group.teardown(() => {
    svc.stopRefreshTimer()
    globalThis.fetch = originalFetch
  })

  test('European number +44 → null', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+447700900123'))
  })

  test('Empty string → null', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone(''))
  })

  test('Unknown prefix +999 → null', ({ assert }) => {
    assert.isNull(svc.getCurrencyForPhone('+9991234567'))
  })
})

// ── Group D: getLocalRate — cache behavior ──────────────────────────────────

test.group('getLocalRate | cache behavior', (group) => {
  let svc: ExchangeRateService
  let originalFetch: typeof globalThis.fetch

  group.setup(async () => {
    const result = await createService()
    svc = result.svc
    originalFetch = result.originalFetch
  })

  group.teardown(() => {
    svc.stopRefreshTimer()
    globalThis.fetch = originalFetch
  })

  test('returns cached rate when present', async ({ assert }) => {
    ;(svc as any).ratesCache.set('COP', 4150)
    assert.equal(await svc.getLocalRate('COP'), 4150)
  })

  test('returns null for missing currency when cache is empty', async ({ assert }) => {
    ;(svc as any).ratesCache.clear()
    assert.isNull(await svc.getLocalRate('MXN'))
  })

  test('returns null for unknown code when cache has other entries', async ({ assert }) => {
    ;(svc as any).ratesCache.set('COP', 4150)
    assert.isNull(await svc.getLocalRate('EUR'))
  })
})

// ── Group E: fetchRates — caches rates from API response ────────────────────

test.group('fetchRates | caches rates from API response', (group) => {
  let svc: ExchangeRateService
  let originalFetch: typeof globalThis.fetch

  group.setup(async () => {
    const result = await createService()
    svc = result.svc
    originalFetch = result.originalFetch
  })

  group.teardown(() => {
    svc.stopRefreshTimer()
    globalThis.fetch = originalFetch
  })

  test('caches COP and MXN from API response', async ({ assert }) => {
    globalThis.fetch = async () =>
      ({ ok: true, json: async () => ({ rates: { COP: 4200, MXN: 17.5 } }) }) as Response
    await svc.fetchRates()
    globalThis.fetch = originalFetch

    assert.equal(await svc.getLocalRate('COP'), 4200)
    assert.equal(await svc.getLocalRate('MXN'), 17.5)
  })

  test('keeps stale cache on fetch error', async ({ assert }) => {
    ;(svc as any).ratesCache.set('COP', 9999)
    globalThis.fetch = async () => { throw new Error('network failure') }
    await svc.fetchRates()
    globalThis.fetch = originalFetch

    assert.equal(await svc.getLocalRate('COP'), 9999)
  })

  test('handles non-ok response without throwing', async ({ assert }) => {
    ;(svc as any).ratesCache.clear()
    globalThis.fetch = async () => ({ ok: false, status: 500 }) as Response
    await assert.doesNotReject(() => svc.fetchRates())
    globalThis.fetch = originalFetch
  })
})
