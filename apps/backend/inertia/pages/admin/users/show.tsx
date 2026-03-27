import { Link } from '@adonisjs/inertia/react'
import { Head } from '@inertiajs/react'
import AdminLayout from '../../../layouts/admin_layout.js'

interface OnchainData {
  totalSent: string
  totalReceived: string
  txCount: number
  lastActivity: number
}

interface User {
  phone_number: string
  wallet_address: string
  cdp_wallet_name: string
  created_at: string
  last_activity: string
  daily_limit: string | null
  spend_permission_hash: string | null
}

interface Activity {
  id: number
  intent: string
  parse_source: string
  status: string
  latency_ms: number
  created_at: string
}

function formatUSDC(raw: string): string {
  const num = Number(raw) / 1_000_000
  return num.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function UserShow({
  user,
  activity,
  onchain,
}: {
  user: User | null
  activity: Activity[]
  onchain: OnchainData | null
}) {
  if (!user) {
    return (
      <AdminLayout>
        <Head title="User Not Found" />
        <div className="flex flex-col items-center justify-center py-20">
          <p className="spec-label mb-2">USER NOT FOUND</p>
          <Link
            href="/admin/users"
            className="mt-3 font-mono text-[11px] font-bold tracking-wider text-brand hover:text-brand-hover focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            BACK TO USERS
          </Link>
        </div>
      </AdminLayout>
    )
  }

  const details = [
    { label: 'WALLET ADDRESS', value: user.wallet_address, mono: true },
    { label: 'CDP WALLET', value: user.cdp_wallet_name, mono: false },
    {
      label: 'TOTAL SENT',
      value: onchain ? formatUSDC(onchain.totalSent) : '---',
      mono: false,
    },
    {
      label: 'TOTAL RECEIVED',
      value: onchain ? formatUSDC(onchain.totalReceived) : '---',
      mono: false,
    },
    {
      label: 'TRANSACTIONS',
      value: onchain ? String(onchain.txCount) : '0',
      mono: false,
    },
    {
      label: 'DAILY LIMIT',
      value: user.daily_limit ? `$${Number(user.daily_limit).toLocaleString()}` : 'No limit',
      mono: false,
    },
    {
      label: 'PERMISSION',
      value: user.spend_permission_hash ? 'Active' : 'None',
      mono: false,
      badge: true,
      badgeActive: !!user.spend_permission_hash,
    },
    {
      label: 'REGISTERED',
      value: new Date(Number(user.created_at)).toLocaleDateString(),
      mono: false,
    },
    {
      label: 'LAST ON-CHAIN',
      value: onchain?.lastActivity
        ? new Date(onchain.lastActivity * 1000).toLocaleDateString()
        : '---',
      mono: false,
    },
    {
      label: 'LAST MESSAGE',
      value: new Date(Number(user.last_activity)).toLocaleDateString(),
      mono: false,
    },
  ]

  return (
    <AdminLayout>
      <Head title={user.phone_number} />

      {/* Back link */}
      <Link
        href="/admin/users"
        className="mb-6 inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider admin-text-muted transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        BACK TO USERS
      </Link>

      <div className="mb-8">
        <h1 className="font-sans text-2xl font-bold uppercase tracking-[0.05em] admin-text">
          {user.phone_number}
        </h1>
        <p className="spec-label mt-1">USER DETAILS // ACTIVITY</p>
      </div>

      {/* User details */}
      <div className="panel-frame mb-8 p-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <p className="spec-label mb-1">{d.label}</p>
              {d.badge ? (
                <span className="inline-flex items-center gap-2 font-mono text-xs">
                  <span
                    className={`indicator-dot ${d.badgeActive ? 'indicator-dot-active' : 'indicator-dot-muted'}`}
                    aria-hidden="true"
                  />
                  <span className={d.badgeActive ? 'text-crypto-hover' : 'admin-text-muted'}>
                    {d.value}
                  </span>
                </span>
              ) : (
                <div
                  className={`text-sm admin-text ${d.mono ? 'break-all font-mono text-[11px]' : ''}`}
                >
                  {d.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activity */}
      <div className="mb-4 flex items-center justify-between">
        <p className="spec-label">RECENT ACTIVITY</p>
        <span className="font-mono text-[11px] tracking-wider admin-text-muted">
          {activity.length} RECORDS
        </span>
      </div>

      <div className="panel-frame overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Recent message parsing activity</caption>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--admin-border-subtle)',
                backgroundColor: 'var(--admin-surface)',
              }}
            >
              <th className="px-5 py-3 text-left spec-label">INTENT</th>
              <th className="px-5 py-3 text-left spec-label">SOURCE</th>
              <th className="px-5 py-3 text-left spec-label">STATUS</th>
              <th className="px-5 py-3 text-left spec-label">LATENCY</th>
              <th className="px-5 py-3 text-left spec-label">TIME</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--admin-border-subtle)' }}>
            {activity.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-brand-light/50">
                <td className="px-5 py-3 font-mono text-xs admin-text">{a.intent}</td>
                <td className="px-5 py-3">
                  <span
                    className={`font-mono text-[11px] font-bold tracking-wider uppercase ${
                      a.parse_source === 'llm' ? 'text-[#7c3aed]' : 'text-brand'
                    }`}
                  >
                    {a.parse_source}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider uppercase">
                    <span
                      className={`indicator-dot ${
                        a.status === 'success'
                          ? 'indicator-dot-active'
                          : a.status === 'error'
                            ? 'indicator-dot-danger'
                            : 'indicator-dot-muted'
                      }`}
                      aria-hidden="true"
                    />
                    {a.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[11px] tracking-wider admin-text-muted">
                  {a.latency_ms}MS
                </td>
                <td className="px-5 py-3 font-mono text-[11px] tracking-wider admin-text-muted">
                  {new Date(a.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {activity.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center font-mono text-[11px] tracking-wider admin-text-muted"
                >
                  NO ACTIVITY YET
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
