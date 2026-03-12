// ── Constants ──────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 15 * 60 * 1_000  // 15 minutes
const FETCH_TIMEOUT_MS    = 10_000            // abort fetch after 10s
const API_URL = 'https://open.er-api.com/v6/latest/USD'

const LATAM_CURRENCIES = ['COP', 'MXN', 'ARS', 'BRL', 'PEN', 'CLP'] as const

// ── Phone Prefix Map (ordered longest-first to prevent prefix collisions) ──────

const PHONE_PREFIX_MAP: [string, string | null][] = [
  ['+507', null],  // Panama, USD — must precede +5X
  ['+593', null],  // Ecuador, USD
  ['+503', null],  // El Salvador, USD
  ['+57',  'COP'], // Colombia
  ['+52',  'MXN'], // Mexico
  ['+54',  'ARS'], // Argentina
  ['+55',  'BRL'], // Brazil
  ['+51',  'PEN'], // Peru
  ['+56',  'CLP'], // Chile
  ['+1',   null],  // USA/Canada, USD
]

// ── Service ────────────────────────────────────────────────────────────────────

class ExchangeRateService {
  private ratesCache: Map<string, number> = new Map()
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private _initialFetchPromise: Promise<void> | null = null

  constructor() {
    this.startRefreshTimer()
  }

  // ── Public: timer lifecycle ────────────────────────────────────────────────

  startRefreshTimer(): void {
    // Fire initial fetch; store promise so getLocalRate() can await it
    this._initialFetchPromise = this.fetchRates().finally(() => {
      this._initialFetchPromise = null
    })

    // Periodic refresh every 15 minutes
    this.refreshTimer = setInterval(() => {
      this.fetchRates().catch(() => {})
    }, REFRESH_INTERVAL_MS)

    // .unref() allows process to exit naturally (e.g., in verify command / tests)
    // without the interval keeping the event loop alive
    this.refreshTimer.unref()
  }

  stopRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  // ── Public: fetchRates ─────────────────────────────────────────────────────

  async fetchRates(): Promise<void> {
    try {
      const response = await fetch(API_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`ExchangeRateService: HTTP ${response.status}`)
      }
      const data = (await response.json()) as { rates: Record<string, number> }
      for (const code of LATAM_CURRENCIES) {
        const rate = data.rates[code]
        if (rate !== undefined) {
          this.ratesCache.set(code, rate)
        }
      }
    } catch (_err) {
      // Keep existing cache intact — stale rates are better than breaking callers.
      // If cache is empty (first fetch failed), getLocalRate() will return null.
    }
  }

  // ── Public: getCurrencyForPhone ────────────────────────────────────────────

  getCurrencyForPhone(phoneNumber: string): string | null {
    for (const [prefix, currency] of PHONE_PREFIX_MAP) {
      if (phoneNumber.startsWith(prefix)) return currency
    }
    return null
  }

  // ── Public: getLocalRate ───────────────────────────────────────────────────

  async getLocalRate(currencyCode: string): Promise<number | null> {
    // First call before initial fetch completes: wait for it
    if (this.ratesCache.size === 0 && this._initialFetchPromise !== null) {
      await this._initialFetchPromise
    }
    return this.ratesCache.get(currencyCode) ?? null
  }
}

// ── Lazy Singleton Export ──────────────────────────────────────────────────────

let _instance: ExchangeRateService | null = null

function getInstance(): ExchangeRateService {
  if (!_instance) _instance = new ExchangeRateService()
  return _instance
}

export const exchangeRateService = new Proxy({} as ExchangeRateService, {
  get(_target, prop: string | symbol) {
    const instance = getInstance()
    const value = Reflect.get(instance, prop, instance)
    if (typeof value === 'function') {
      return (value as Function).bind(instance)
    }
    return value
  },
})

export default ExchangeRateService
