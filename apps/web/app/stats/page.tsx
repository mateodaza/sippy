import type { Metadata } from 'next'
import Image from 'next/image'
import { UpdatedTimestamp } from './updated-timestamp'

// Always render on request so stats reflect the latest on-chain data.
// Backend /api/stats is a direct DB aggregate query with no caching, so
// every page load gets the current totals.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sippy Stats — Live On-Chain Analytics',
  description:
    'Real-time aggregate statistics for the Sippy network: USDC volume, transfers, and active wallets on Arbitrum.',
  alternates: {
    canonical: 'https://sippy.lat/stats',
  },
  openGraph: {
    title: 'Sippy Stats — Live On-Chain Analytics',
    description: 'Live aggregate data: USDC volume, transfers, and active wallets on Arbitrum.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sippy Stats — Live On-Chain Analytics',
    description: 'Live aggregate data: USDC volume, transfers, and active wallets on Arbitrum.',
  },
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('NEXT_PUBLIC_BACKEND_URL is required in production')
      })()
    : 'http://localhost:3001')

interface DailyVolume {
  date: string
  totalUsdcVolume: string
  transferCount: number
}

interface CountryRow {
  code: string
  users: number
}

interface StatsData {
  totalVolume: string
  totalTransfers: number
  activeWallets: number
  registeredUsers: number
  usdcOnboarded?: string
  countries?: CountryRow[]
  dailyVolumes: DailyVolume[]
}

const COUNTRY_FLAGS: Record<string, string> = {
  CO: '🇨🇴',
  MX: '🇲🇽',
  AR: '🇦🇷',
  BR: '🇧🇷',
  PE: '🇵🇪',
  CL: '🇨🇱',
  VE: '🇻🇪',
  EC: '🇪🇨',
  SV: '🇸🇻',
  GT: '🇬🇹',
  ES: '🇪🇸',
  US: '🇺🇸',
  OTHER: '🌎',
}

function formatUSDC(raw: string): string {
  const num = Number(raw) / 1_000_000
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

async function fetchStats(): Promise<StatsData | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stats`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function StatsPage() {
  const stats = await fetchStats()
  // Captured at server render time; the UpdatedTimestamp client component
  // reformats it to the viewer's local timezone on mount.
  const updatedAtIso = new Date().toISOString()

  if (!stats) {
    return (
      <main id="main-content" className="min-h-screen bg-[var(--bg-primary)]">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="panel-frame rounded-xl p-8 text-center">
            <p className="spec-label mb-2">CONNECTION ERROR</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Unable to load stats. Try again later.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const maxVolume = Math.max(...stats.dailyVolumes.map((d) => Number(d.totalUsdcVolume)), 1)

  const activationPct =
    stats.registeredUsers > 0 ? Math.round((stats.activeWallets / stats.registeredUsers) * 100) : 0

  const kpis = [
    {
      label: 'USDC MOVED',
      value: formatUSDC(stats.totalVolume),
      sublabel: 'DEPOSITS + SENDS',
    },
    {
      label: 'USDC ONBOARDED',
      value: formatUSDC(stats.usdcOnboarded ?? '0'),
      sublabel: 'FUNDS ENTERING SIPPY',
    },
    {
      label: 'TRANSFERS',
      value: formatCompact(stats.totalTransfers),
      sublabel: 'ALL-TIME',
    },
    {
      label: 'BETA USERS',
      value: formatCompact(stats.registeredUsers),
      sublabel: activationPct > 0 ? `${activationPct}% ACTIVATION RATE` : 'REGISTERED',
    },
  ]

  return (
    <main id="main-content" className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
            <span className="spec-label spec-label-muted">LIVE</span>
            <span className="font-mono text-[11px] tracking-widest uppercase text-[var(--text-secondary)]">
              · UPDATED <UpdatedTimestamp iso={updatedAtIso} />
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Image
              src="/images/logos/sippy-s-mark-cheetah.svg"
              alt=""
              aria-hidden="true"
              width={56}
              height={56}
              priority
              className="h-10 w-10 sm:h-14 sm:w-14"
            />
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-[var(--text-primary)] sm:text-4xl">
              Network Stats
            </h1>
          </div>
          <p className="mt-2 font-mono text-xs tracking-widest uppercase text-[var(--text-secondary)]">
            SIPPY // ARBITRUM ONE // LATAM BETA
          </p>
          {stats.countries && stats.countries.length > 0 && (
            <p className="mt-3 font-mono text-xs tracking-widest uppercase text-[var(--text-secondary)]">
              {stats.countries.map((c, i) => (
                <span key={c.code}>
                  {i > 0 && <span className="mx-2 opacity-40">·</span>}
                  <span className="mr-1.5 text-sm">{COUNTRY_FLAGS[c.code] ?? '🌎'}</span>
                  <span>{c.users}</span>
                  {i === 0 && c.code === 'CO' && (
                    <span className="ml-1.5 rounded-sm border border-[var(--border-default)] px-1 py-[1px] text-[9px] tracking-wider text-[var(--text-secondary)]">
                      HQ
                    </span>
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        {/* KPI Panels */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 mb-8 sm:mb-12">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="panel-frame rounded-xl p-6 sm:p-8">
              <p className="spec-label mb-4">{kpi.label}</p>
              <p className="font-display text-5xl font-bold leading-none text-[var(--text-primary)] sm:text-6xl">
                {kpi.value}
              </p>
              <p className="mt-4 font-mono text-xs font-semibold tracking-[0.12em] uppercase text-[var(--text-primary)] opacity-80">
                {kpi.sublabel}
              </p>
            </div>
          ))}
        </div>

        {/* Daily Volume Chart */}
        <div className="panel-frame rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="spec-label">DAILY VOLUME</p>
            <p className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--text-secondary)]">
              LAST 30 DAYS
            </p>
          </div>

          {stats.dailyVolumes.length > 0 ? (
            <div className="space-y-6">
              {/* Chart */}
              <div className="flex items-end gap-[2px] sm:gap-1" style={{ height: 200 }}>
                {stats.dailyVolumes.map((row) => {
                  const vol = Number(row.totalUsdcVolume)
                  const pct = (vol / maxVolume) * 100
                  const barHeight = Math.max(Math.round((pct / 100) * 180), 2)
                  return (
                    <div
                      key={row.date}
                      className="group relative flex-1 flex flex-col items-center justify-end"
                      style={{ height: '100%' }}
                      tabIndex={0}
                      role="img"
                      aria-label={`${formatUSDC(row.totalUsdcVolume)}, ${row.transferCount} transfers on ${row.date}`}
                    >
                      {/* Hover/focus tooltip */}
                      <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-10">
                        <div
                          className="whitespace-nowrap rounded-md bg-[var(--text-primary)] px-3 py-1.5 font-mono text-[11px] font-bold shadow-lg"
                          style={{ color: 'var(--bg-primary)' }}
                        >
                          {formatUSDC(row.totalUsdcVolume)}
                          <span className="ml-1.5 font-normal opacity-70">
                            {row.transferCount} txs
                          </span>
                        </div>
                      </div>
                      <div
                        className="w-full rounded-t-sm bg-brand-primary transition-colors group-hover:bg-brand-primary-hover"
                        style={{ height: barHeight }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* X-axis labels */}
              <div className="flex justify-between">
                <span className="font-mono text-[11px] tracking-wider text-[var(--text-secondary)]">
                  {stats.dailyVolumes.length > 0
                    ? new Date(stats.dailyVolumes[0].date + 'T00:00:00').toLocaleDateString(
                        'en-US',
                        { month: 'short', day: 'numeric' }
                      )
                    : ''}
                </span>
                <span className="font-mono text-[11px] tracking-wider text-[var(--text-secondary)]">
                  {stats.dailyVolumes.length > 0
                    ? new Date(
                        stats.dailyVolumes[stats.dailyVolumes.length - 1].date + 'T00:00:00'
                      ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : ''}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="font-mono text-xs text-[var(--text-secondary)]">NO DATA YET</p>
            </div>
          )}
        </div>

        {/* Footer spec strip */}
        <div className="mt-8 sm:mt-12 border-t border-[var(--border-default)] pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--text-secondary)]">
                NETWORK: ARBITRUM ONE
              </span>
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--text-secondary)]">
                TOKEN: USDC
              </span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--text-secondary)]">
              SIPPY.LAT // {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
