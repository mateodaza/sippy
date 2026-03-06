import { Head } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'

interface FundFlowRow {
  flowType: 'inbound' | 'outbound' | 'internal'
  volume: string
  txCount: string
}

interface TopUser {
  address: string
  totalSent: string
  totalReceived: string
  totalVolume: string
  txCount: number
}

interface DailyVolumeRow {
  date: string
  totalUsdcVolume: string
  transferCount: number
}

interface GasStatus {
  totalRefuels: number
  totalEthSpent: string
  isPaused: boolean
}

interface Props {
  totalVolume: string
  registeredUsers: number
  activeToday: number
  gasStatus: GasStatus | null
  fundFlow: FundFlowRow[]
  topUsers: TopUser[]
  dailyVolumes: DailyVolumeRow[]
}

function formatUSDC(raw: string): string {
  const num = Number(raw) / 1_000_000
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatETH(raw: string): string {
  const num = Number(raw) / 1e18
  return `${num.toFixed(4)} ETH`
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const FLOW_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  inbound: { label: 'Inbound', color: 'bg-sippy', bgColor: 'bg-sippy-lightest', icon: '↓' },
  outbound: { label: 'Outbound', color: 'bg-red-500', bgColor: 'bg-red-50', icon: '↑' },
  internal: { label: 'Internal', color: 'bg-blue-500', bgColor: 'bg-blue-50', icon: '↔' },
}

export default function Analytics({
  totalVolume,
  registeredUsers,
  activeToday,
  gasStatus,
  fundFlow,
  topUsers,
  dailyVolumes,
}: Props) {
  const maxVolume = Math.max(...dailyVolumes.map((d) => Number(d.totalUsdcVolume)), 1)
  const totalFlowVolume = fundFlow.reduce((s, r) => s + Number(r.volume), 0)

  // KPI progress
  const volumeUSD = Number(totalVolume) / 1_000_000
  const volumeTarget = 10_000
  const volumePct = Math.min(Math.round((volumeUSD / volumeTarget) * 100), 100)
  const usersTarget = 50
  const usersPct = Math.min(Math.round((registeredUsers / usersTarget) * 100), 100)

  return (
    <AdminLayout>
      <Head title="Analytics" />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">On-chain volume, users, and KPI tracking</p>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total USDC Volume */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-gray-200 hover:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sippy-lightest text-sippy shadow-inner">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className="rounded-full bg-sippy-lightest px-2.5 py-0.5 text-xs font-semibold text-sippy-darker">
              {volumePct}%
            </span>
          </div>
          <div className="text-3xl font-bold tracking-[-0.025em] text-slate-900">{formatUSDC(totalVolume)}</div>
          <div className="mt-1 text-sm font-medium text-gray-500">Total USDC Volume</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-sippy transition-all duration-700"
              style={{ width: `${volumePct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-gray-400">Target: ${volumeTarget.toLocaleString()}</div>
        </div>

        {/* Registered Users */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-gray-200 hover:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#dbeafe] text-[#2563eb] shadow-inner">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-semibold text-[#1e40af]">
              {usersPct}%
            </span>
          </div>
          <div className="text-3xl font-bold tracking-[-0.025em] text-slate-900">{registeredUsers}</div>
          <div className="mt-1 text-sm font-medium text-gray-500">Registered Users</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#2563eb] transition-all duration-700"
              style={{ width: `${usersPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-gray-400">Target: {usersTarget} testers</div>
        </div>

        {/* Active Today */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-gray-200 hover:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)]">
          <div className="mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f3e8ff] text-[#9333ea] shadow-inner">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-bold tracking-[-0.025em] text-slate-900">{activeToday}</div>
          <div className="mt-1 text-sm font-medium text-gray-500">Active Today</div>
          <div className="mt-1.5 text-xs text-gray-400">Unique wallets (24h)</div>
        </div>

        {/* Gas Sponsored */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-gray-200 hover:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)]">
          <div className="mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#fff7ed] text-[#ea580c] shadow-inner">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18v-6" />
                <path d="M9 15l3 3 3-3" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-bold tracking-[-0.025em] text-slate-900">
            {gasStatus?.totalRefuels ?? 0}
          </div>
          <div className="mt-1 text-sm font-medium text-gray-500">Gas Refuels</div>
          <div className="mt-1.5 text-xs text-gray-400">
            {gasStatus ? formatETH(gasStatus.totalEthSpent) : '0 ETH'} spent
            {gasStatus?.isPaused && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Paused
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Fund Flow + Top Users */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Fund Flow Breakdown */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">Fund Flow</h2>
          <div className="space-y-4">
            {fundFlow.length > 0 ? (
              fundFlow.map((row) => {
                const config = FLOW_CONFIG[row.flowType] ?? FLOW_CONFIG.internal
                const vol = Number(row.volume)
                const pct = totalFlowVolume > 0 ? Math.round((vol / totalFlowVolume) * 100) : 0
                return (
                  <div key={row.flowType}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${config.bgColor} text-xs font-bold`}>
                          {config.icon}
                        </span>
                        {config.label}
                        <span className="text-xs text-gray-400">({Number(row.txCount)} txs)</span>
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatUSDC(row.volume)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${config.color} transition-all duration-500`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-xs text-gray-400">{pct}%</div>
                  </div>
                )
              })
            ) : (
              <p className="py-4 text-center text-sm text-gray-400">No data yet</p>
            )}

            {fundFlow.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-500">Total Volume</span>
                  <span className="font-bold text-slate-900">{formatUSDC(String(totalFlowVolume))}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Users by Volume */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">Top Users by Volume</h2>
          <div className="space-y-2.5">
            {topUsers.length > 0 ? (
              topUsers.map((user, i) => (
                <div
                  key={user.address}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
                >
                  <span className="flex items-center gap-3 text-sm text-slate-700">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sippy-lightest text-xs font-bold text-sippy-darker">
                      {i + 1}
                    </span>
                    <span className="font-mono text-xs">{truncateAddress(user.address)}</span>
                  </span>
                  <div className="text-right">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                      {formatUSDC(user.totalVolume)}
                    </span>
                    <div className="mt-0.5 text-[10px] text-gray-400">{user.txCount} txs</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Daily Volume Chart */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Daily USDC Volume (Last 30 Days)
        </h2>

        {dailyVolumes.length > 0 ? (
          <div className="flex items-end gap-2">
            {dailyVolumes.map((row) => {
              const pct = (Number(row.totalUsdcVolume) / maxVolume) * 100
              const barHeight = Math.max(Math.round((pct / 100) * 180), 8)
              return (
                <div key={row.date} className="group flex flex-1 flex-col items-center gap-1" style={{ minWidth: 40, maxWidth: 80 }}>
                  <span className="text-xs font-semibold text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                    {formatUSDC(row.totalUsdcVolume)}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-sippy to-sippy-light transition-all duration-300 group-hover:from-sippy-dark group-hover:to-sippy"
                    style={{ height: barHeight }}
                  />
                  <span className="mt-1 text-[10px] text-gray-400">
                    {new Date(row.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">No data yet</p>
        )}
      </div>
    </AdminLayout>
  )
}
