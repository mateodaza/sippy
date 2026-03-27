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
  contractBalance?: string
  contractAddress?: string
  spenderBalance?: string
  spenderAddress?: string
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
  return num.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatETH(raw: string): string {
  const negative = raw.startsWith('-')
  const abs = negative ? raw.slice(1) : raw
  const padded = abs.padStart(19, '0')
  const whole = padded.slice(0, padded.length - 18) || '0'
  const frac = padded.slice(padded.length - 18, padded.length - 14)
  return `${negative ? '-' : ''}${whole}.${frac} ETH`
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const FLOW_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  inbound: { label: 'INBOUND', color: 'text-crypto', icon: '↓' },
  outbound: { label: 'OUTBOUND', color: 'text-danger', icon: '↑' },
  internal: { label: 'INTERNAL', color: 'text-brand', icon: '↔' },
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

  const contractBalanceNum = gasStatus?.contractBalance
    ? Number.parseFloat(gasStatus.contractBalance)
    : 0
  const spenderBalanceNum = gasStatus?.spenderBalance
    ? Number.parseFloat(gasStatus.spenderBalance)
    : 0
  const LOW_BALANCE_THRESHOLD = 0.005
  const SPENDER_LOW_THRESHOLD = 0.0001
  const isLowBalance = contractBalanceNum < LOW_BALANCE_THRESHOLD && contractBalanceNum > 0
  const isEmpty = contractBalanceNum === 0
  const isSpenderLow = spenderBalanceNum < SPENDER_LOW_THRESHOLD

  const volumeUSD = Number(totalVolume) / 1_000_000
  const volumeTarget = 10_000
  const volumePct = Math.min(Math.round((volumeUSD / volumeTarget) * 100), 100)
  const usersTarget = 50
  const usersPct = Math.min(Math.round((registeredUsers / usersTarget) * 100), 100)

  return (
    <AdminLayout>
      <Head title="Analytics" />

      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
          Analytics
        </h1>
        <p className="spec-label mt-1">ON-CHAIN VOLUME // USERS // KPI TRACKING</p>
      </div>

      {/* Gas Warnings */}
      {(isEmpty || isLowBalance) && (
        <div
          className={`mb-6 flex items-center gap-3 border px-5 py-4 ${
            isEmpty ? 'border-danger/30 bg-danger-light' : 'border-warning/30 bg-warning-light'
          }`}
        >
          <span
            className={`indicator-dot ${isEmpty ? 'indicator-dot-danger' : 'indicator-dot-warning'}`}
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="font-mono text-sm font-bold tracking-wider uppercase admin-text">
              {isEmpty ? 'GASREFUEL CONTRACT EMPTY' : 'GASREFUEL BALANCE LOW'}
            </p>
            <p className="mt-1 font-mono text-[13px] tracking-wider admin-text-secondary">
              {isEmpty
                ? 'Users cannot receive gas sponsorship. Send ETH immediately.'
                : `Balance: ${contractBalanceNum.toFixed(4)} ETH (threshold: ${LOW_BALANCE_THRESHOLD} ETH)`}
            </p>
            <p className="mt-1 font-mono text-[13px] tracking-wider admin-text-muted">
              Contract: {gasStatus?.contractAddress || 'N/A'}
            </p>
            {gasStatus?.spenderAddress && (
              <p className="font-mono text-[13px] tracking-wider admin-text-muted">
                Payer: {gasStatus.spenderAddress}
              </p>
            )}
          </div>
          <span
            className={`font-mono text-[13px] font-bold tracking-[0.15em] uppercase ${isEmpty ? 'text-danger' : 'text-warning'}`}
          >
            {isEmpty ? 'CRITICAL' : 'WARNING'}
          </span>
        </div>
      )}
      {isSpenderLow && (
        <div className="mb-6 flex items-center gap-3 border border-warning/30 bg-warning-light px-5 py-4">
          <span className="indicator-dot indicator-dot-warning" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-mono text-sm font-bold tracking-wider uppercase admin-text">
              SPENDER NEEDS GAS
            </p>
            <p className="mt-1 font-mono text-[13px] tracking-wider admin-text-secondary">
              Balance: {spenderBalanceNum.toFixed(6)} ETH. Sends will fail without gas.
            </p>
            {gasStatus?.spenderAddress && (
              <p className="mt-1 font-mono text-[13px] tracking-wider admin-text-muted">
                Payer: {gasStatus.spenderAddress}
              </p>
            )}
          </div>
          <span className="font-mono text-[13px] font-bold tracking-[0.15em] uppercase text-warning">
            WARNING
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total USDC Volume */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-3">TOTAL VOLUME</p>
          <div className="font-sans text-4xl font-bold admin-text">{formatUSDC(totalVolume)}</div>
          <div className="mt-3 h-1 bg-brand/10">
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${volumePct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[13px] tracking-wider admin-text-muted">
            <span>{volumePct}%</span>
            <span>TARGET: ${volumeTarget.toLocaleString()}</span>
          </div>
        </div>

        {/* Registered Users */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-3">REGISTERED USERS</p>
          <div className="font-sans text-4xl font-bold admin-text">{registeredUsers}</div>
          <div className="mt-3 h-1 bg-brand/10">
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${usersPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[13px] tracking-wider admin-text-muted">
            <span>{usersPct}%</span>
            <span>TARGET: {usersTarget}</span>
          </div>
        </div>

        {/* Active Today */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-3">ACTIVE TODAY</p>
          <div className="font-sans text-4xl font-bold admin-text">{activeToday}</div>
          <p className="mt-3 font-mono text-[13px] tracking-wider admin-text-muted">
            UNIQUE WALLETS (24H)
          </p>
        </div>

        {/* Gas Refuels */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-3">GAS REFUELS</p>
          <div className="font-sans text-4xl font-bold admin-text">
            {gasStatus?.totalRefuels ?? 0}
          </div>
          <div className="mt-3 space-y-1 font-mono text-[13px] tracking-wider admin-text-muted">
            <div className="flex items-center gap-2">
              <span>{gasStatus ? formatETH(gasStatus.totalEthSpent) : '0 ETH'} SPENT</span>
              {gasStatus?.isPaused && <span className="font-bold text-danger">PAUSED</span>}
            </div>
            <div>
              <a
                href={`https://arbiscan.io/address/${gasStatus?.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
              >
                CONTRACT: {contractBalanceNum.toFixed(4)} ETH
              </a>
              {isLowBalance && <span className="ml-1 text-warning">LOW</span>}
              {isEmpty && <span className="ml-1 text-danger">EMPTY</span>}
            </div>
            <div>
              {gasStatus?.spenderAddress ? (
                <a
                  href={`https://arbiscan.io/address/${gasStatus.spenderAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
                >
                  SPENDER: {spenderBalanceNum.toFixed(6)} ETH
                </a>
              ) : (
                <>SPENDER: {spenderBalanceNum.toFixed(6)} ETH</>
              )}
              {isSpenderLow && <span className="ml-1 text-warning">LOW</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Fund Flow + Top Users */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Fund Flow */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-5">FUND FLOW</p>
          <div className="space-y-4">
            {fundFlow.length > 0 ? (
              fundFlow.map((row) => {
                const config = FLOW_LABELS[row.flowType] ?? FLOW_LABELS.internal
                const vol = Number(row.volume)
                const pct = totalFlowVolume > 0 ? Math.round((vol / totalFlowVolume) * 100) : 0
                return (
                  <div key={row.flowType}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wider">
                        <span className={config.color}>{config.icon}</span>
                        <span className="admin-text">{config.label}</span>
                        <span className="admin-text-muted">({Number(row.txCount)} TXS)</span>
                      </span>
                      <span className="font-mono text-sm font-bold admin-text">
                        {formatUSDC(row.volume)}
                      </span>
                    </div>
                    <div className="h-1 bg-brand/10">
                      <div
                        className="h-full bg-brand transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right font-mono text-[13px] tracking-wider admin-text-muted">
                      {pct}%
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="py-4 text-center font-mono text-[13px] tracking-wider admin-text-muted">
                NO DATA YET
              </p>
            )}

            {fundFlow.length > 0 && (
              <div className="mt-2 border-t border-brand/10 pt-3">
                <div className="flex items-center justify-between font-mono text-sm">
                  <span className="tracking-wider admin-text-muted">TOTAL</span>
                  <span className="font-bold admin-text">
                    {formatUSDC(String(totalFlowVolume))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Users */}
        <div className="panel-frame p-5">
          <p className="spec-label mb-5">TOP USERS BY VOLUME</p>
          <div className="space-y-1">
            {topUsers.length > 0 ? (
              topUsers.map((user, i) => (
                <div
                  key={user.address}
                  className="flex items-center justify-between px-2 py-2 transition-colors hover:bg-brand-light"
                >
                  <span className="flex items-center gap-3 font-mono text-[13px] tracking-wider">
                    <span className="w-5 font-bold text-brand">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="admin-text-secondary">{truncateAddress(user.address)}</span>
                  </span>
                  <div className="text-right">
                    <span className="font-mono text-[13px] font-bold tracking-wider admin-text">
                      {formatUSDC(user.totalVolume)}
                    </span>
                    <div className="font-mono text-xs tracking-wider admin-text-muted">
                      {user.txCount} TXS
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center font-mono text-[13px] tracking-wider admin-text-muted">
                NO DATA YET
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Daily Volume Chart */}
      <div className="panel-frame p-5">
        <p className="spec-label mb-5">DAILY USDC VOLUME // LAST 30 DAYS</p>

        {dailyVolumes.length > 0 ? (
          <div className="flex items-end gap-[2px]" style={{ height: 180 }}>
            {dailyVolumes.map((row) => {
              const pct = (Number(row.totalUsdcVolume) / maxVolume) * 100
              const barHeight = Math.max(Math.round((pct / 100) * 160), 2)
              const formattedDate = new Date(row.date + 'T00:00:00').toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })
              return (
                <div
                  key={row.date}
                  className="group flex flex-1 flex-col items-center justify-end"
                  style={{ height: '100%' }}
                  tabIndex={0}
                  role="img"
                  aria-label={`${formatUSDC(row.totalUsdcVolume)} on ${formattedDate}`}
                >
                  <span className="mb-1 font-mono text-xs font-bold admin-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {formatUSDC(row.totalUsdcVolume)}
                  </span>
                  <div
                    className="w-full bg-brand transition-colors group-hover:bg-brand-hover"
                    style={{ height: barHeight }}
                  />
                  <span className="mt-1 font-mono text-xs tracking-wider admin-text-muted">
                    {new Date(row.date + 'T00:00:00').toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-8 text-center font-mono text-[13px] tracking-wider admin-text-muted">
            NO DATA YET
          </p>
        )}
      </div>
    </AdminLayout>
  )
}
