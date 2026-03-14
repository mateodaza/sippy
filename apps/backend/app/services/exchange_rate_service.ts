import logger from '@adonisjs/core/services/logger'

// ── Constants ──────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000  // 24 hours (rates update daily)
const FETCH_TIMEOUT_MS    = 10_000            // abort fetch after 10s
const API_URL = 'https://open.er-api.com/v6/latest/USD'

const LATAM_CURRENCIES = [
  'COP', 'MXN', 'ARS', 'BRL', 'PEN', 'CLP',
  'UYU', 'PYG', 'BOB', 'VES', 'CRC', 'GTQ',
  'HNL', 'NIO', 'DOP', 'CUP', 'HTG', 'JMD',
  'TTD', 'BBD', 'GYD', 'SRD', 'BZD', 'AWG',
  'ANG', 'XCD',
] as const

// ── Phone Prefix Map (ordered longest-first to prevent prefix collisions) ──────

const PHONE_PREFIX_MAP: [string, string | null][] = [
  // 4-digit prefixes first (prevent +5X collisions)
  ['+1809', 'DOP'], // Dominican Republic
  ['+1829', 'DOP'], // Dominican Republic
  ['+1849', 'DOP'], // Dominican Republic
  ['+1868', 'TTD'], // Trinidad & Tobago
  ['+1876', 'JMD'], // Jamaica
  ['+1246', 'BBD'], // Barbados
  ['+1767', 'XCD'], // Dominica (EC$)
  ['+1784', 'XCD'], // St. Vincent (EC$)
  ['+1758', 'XCD'], // St. Lucia (EC$)
  ['+1473', 'XCD'], // Grenada (EC$)
  ['+1268', 'XCD'], // Antigua (EC$)
  ['+1869', 'XCD'], // St. Kitts (EC$)
  // 3-digit prefixes
  ['+598', 'UYU'], // Uruguay
  ['+595', 'PYG'], // Paraguay
  ['+591', 'BOB'], // Bolivia
  ['+593', null],   // Ecuador, USD
  ['+507', null],   // Panama, USD
  ['+506', 'CRC'], // Costa Rica
  ['+505', 'NIO'], // Nicaragua
  ['+504', 'HNL'], // Honduras
  ['+503', null],   // El Salvador, USD
  ['+502', 'GTQ'], // Guatemala
  ['+509', 'HTG'], // Haiti
  ['+599', 'ANG'], // Curaçao / Sint Maarten
  ['+297', 'AWG'], // Aruba
  ['+597', 'SRD'], // Suriname
  ['+501', 'BZD'], // Belize
  ['+592', 'GYD'], // Guyana
  // 2-digit prefixes
  ['+58',  'VES'], // Venezuela
  ['+57',  'COP'], // Colombia
  ['+56',  'CLP'], // Chile
  ['+55',  'BRL'], // Brazil
  ['+54',  'ARS'], // Argentina
  ['+53',  'CUP'], // Cuba
  ['+52',  'MXN'], // Mexico
  ['+51',  'PEN'], // Peru
  ['+1',   null],  // USA/Canada, USD (catch-all for +1)
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

    // Periodic refresh every 24 hours
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
        if (rate !== undefined && rate > 0) {
          this.ratesCache.set(code, rate)
        }
      }
    } catch (err) {
      // Keep existing cache intact — stale rates are better than breaking callers.
      // If cache is empty (first fetch failed), getLocalRate() will return null.
      logger.error('ExchangeRateService: fetch failed: %s', err instanceof Error ? err.message : err)
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
