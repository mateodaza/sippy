import type { Metadata } from 'next'
import Image from 'next/image'
import { UpdatedTimestamp } from './updated-timestamp'
import { TransactionsFeed } from './transactions-feed'

// Always render on request so stats reflect the latest on-chain data.
// Backend /api/season/stats memoizes its aggregate query-set for a short TTL
// (~15s), so loads are near-live while bursty traffic can't hammer the DB.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sippy Stats — Live On-Chain Proof',
  description:
    'Real-time proof for the Sippy network: transacted volume (verified value-out), active wallets, retention, and a live on-chain transaction feed on Arbitrum.',
  alternates: {
    canonical: 'https://sippy.lat/stats',
  },
  openGraph: {
    title: 'Sippy Stats — Live On-Chain Proof',
    description:
      'Transacted volume, active wallets, retention, and a live on-chain transaction feed on Arbitrum.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sippy Stats — Live On-Chain Proof',
    description:
      'Transacted volume, active wallets, retention, and a live on-chain transaction feed on Arbitrum.',
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
  volume: string
  count: number
}

interface CountryRow {
  code: string
  users: number
}

interface ScoreBucket {
  tier: string
  count: number
}

interface TopSender {
  address: string
  score: number
  tier: string
}

interface SeasonStats {
  seasonId: string
  transactedVolume: string
  onboarded: string
  maw: number
  activeThisWeek: number
  retained: number
  retentionRate: number
  distinctCounterparties: number
  activatedCount: number
  activatedPct: number
  registeredUsers: number
  transferCount: number
  countries?: CountryRow[]
  dailyVolumes: DailyVolume[]
  scoreDistribution: ScoreBucket[] | null
  topSenders: TopSender[] | null
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

const TIER_LABELS: Record<string, string> = {
  newcomer: 'NEWCOMER',
  activated: 'ACTIVATED',
  active: 'ACTIVE',
  regular: 'REGULAR',
  power: 'POWER',
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

async function fetchStats(): Promise<SeasonStats | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/season/stats`, {
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

  const maxVolume = Math.max(...stats.dailyVolumes.map((d) => Number(d.volume)), 1)

  // Secondary tiles. The hero (Transacted Volume) is rendered separately and on
  // its own — on-ramped is a distinct tile here and is never folded into it.
  const tiles = [
    {
      label: 'ON-RAMPED',
      value: formatUSDC(stats.onboarded),
      sublabel: 'FUNDS ENTERING SIPPY',
    },
    {
      label: 'ACTIVE WALLETS',
      value: formatCompact(stats.maw),
      sublabel: 'MAW · LAST 30 DAYS',
    },
    {
      label: 'ACTIVE THIS WEEK',
      value: formatCompact(stats.activeThisWeek),
      sublabel: 'LAST 7 DAYS',
    },
    {
      label: 'RETAINED',
      value: formatCompact(stats.retained),
      sublabel: `${stats.retentionRate}% RETENTION RATE`,
    },
    {
      label: 'COUNTERPARTIES',
      value: formatCompact(stats.distinctCounterparties),
      sublabel: 'DISTINCT VERIFIED PAIRS',
    },
    {
      label: 'USERS',
      value: formatCompact(stats.registeredUsers),
      sublabel: stats.activatedPct > 0 ? `${stats.activatedPct}% ACTIVATED` : 'REGISTERED',
    },
    {
      label: 'TRANSFERS',
      value: formatCompact(stats.transferCount),
      sublabel: 'ALL-TIME ON-CHAIN',
    },
  ]

  const hasScores =
    (stats.scoreDistribution?.length ?? 0) > 0 || (stats.topSenders?.length ?? 0) > 0
  const maxBucket = Math.max(...(stats.scoreDistribution ?? []).map((b) => b.count), 1)

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
        {/* Hero — Transacted Volume (verified value-out). The un-blend: this is
            real money sent by Sippy users, NOT deposits+sends mixed together.
            On-ramped lives in its own tile below and is never added in here. */}
        <div className="panel-frame rounded-xl p-6 sm:p-10 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 mb-4">
            <p className="spec-label">TRANSACTED VOLUME</p>
            <span className="rounded-sm border border-brand-crypto/40 px-1.5 py-[1px] font-mono text-[9px] tracking-wider text-brand-crypto">
              VALUE-OUT
            </span>
          </div>
          <p className="font-display text-6xl font-bold leading-none text-[var(--text-primary)] sm:text-8xl">
            {formatUSDC(stats.transactedVolume)}
          </p>
          <p className="mt-4 font-mono text-xs font-semibold tracking-[0.12em] uppercase text-[var(--text-secondary)]">
            VERIFIED SENDS BY SIPPY USERS · ALL-TIME
          </p>
        </div>

        {/* Secondary KPI tiles — on-ramped is here, separate from the hero */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 sm:gap-6 mb-8 sm:mb-12">
          {tiles.map((tile) => (
            <div key={tile.label} className="panel-frame rounded-xl p-5 sm:p-6">
              <p className="spec-label mb-3">{tile.label}</p>
              <p className="font-display text-3xl font-bold leading-none text-[var(--text-primary)] sm:text-4xl">
                {tile.value}
              </p>
              <p className="mt-3 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-[var(--text-secondary)]">
                {tile.sublabel}
              </p>
            </div>
          ))}
        </div>

        {/* Live recent-transactions feed + today/this-week ticker */}
        <div className="mb-8 sm:mb-12">
          <TransactionsFeed />
        </div>

        {/* Daily value-out chart */}
        <div className="panel-frame rounded-xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <p className="spec-label">DAILY VALUE-OUT</p>
            <p className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--text-secondary)]">
              VERIFIED SENDS · LAST 30 DAYS
            </p>
          </div>

          {stats.dailyVolumes.length > 0 ? (
            <div className="space-y-6">
              {/* Chart */}
              <div className="flex items-end gap-[2px] sm:gap-1" style={{ height: 200 }}>
                {stats.dailyVolumes.map((row) => {
                  const vol = Number(row.volume)
                  const pct = (vol / maxVolume) * 100
                  const barHeight = Math.max(Math.round((pct / 100) * 180), 2)
                  return (
                    <div
                      key={row.date}
                      className="group relative flex-1 flex flex-col items-center justify-end"
                      style={{ height: '100%' }}
                      tabIndex={0}
                      role="img"
                      aria-label={`${formatUSDC(row.volume)}, ${row.count} verified sends on ${row.date}`}
                    >
                      {/* Hover/focus tooltip */}
                      <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-10">
                        <div
                          className="whitespace-nowrap rounded-md bg-[var(--text-primary)] px-3 py-1.5 font-mono text-[11px] font-bold shadow-lg"
                          style={{ color: 'var(--bg-primary)' }}
                        >
                          {formatUSDC(row.volume)}
                          <span className="ml-1.5 font-normal opacity-70">{row.count} sends</span>
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

        {/* Score distribution + top senders — present only once season.score is
            populated (post-enable). In shadow mode the API returns null and this
            entire section is omitted: no empty boxes, no errors. */}
        {hasScores && (
          <div className="mt-8 sm:mt-12 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            {stats.scoreDistribution && stats.scoreDistribution.length > 0 && (
              <div className="panel-frame rounded-xl p-6 sm:p-8">
                <p className="spec-label mb-6">SCORE DISTRIBUTION</p>
                <div className="space-y-4">
                  {stats.scoreDistribution.map((b) => (
                    <div key={b.tier} className="flex items-center gap-4">
                      <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                        {TIER_LABELS[b.tier] ?? b.tier.toUpperCase()}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-[var(--border-default)]">
                        <div
                          className="h-full bg-brand-primary"
                          style={{ width: `${Math.max((b.count / maxBucket) * 100, 4)}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                        {b.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.topSenders && stats.topSenders.length > 0 && (
              <div className="panel-frame rounded-xl p-6 sm:p-8">
                <p className="spec-label mb-6">MOST ACTIVE</p>
                <ul className="space-y-3">
                  {stats.topSenders.map((s, i) => (
                    <li key={s.address} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                          {i + 1}
                        </span>
                        <span className="font-mono text-[11px] tracking-wider text-[var(--text-primary)]">
                          {s.address}
                        </span>
                        <span className="rounded-sm border border-[var(--border-default)] px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">
                          {TIER_LABELS[s.tier] ?? s.tier.toUpperCase()}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                        {s.score.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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
