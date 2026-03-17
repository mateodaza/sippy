import { Head, Link } from '@inertiajs/react'
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
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function UserShow({ user, activity, onchain }: { user: User | null; activity: Activity[]; onchain: OnchainData | null }) {
  if (!user) {
    return (
      <AdminLayout>
        <Head title="User Not Found" />
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">User not found</h2>
          <Link href="/admin/users" className="mt-3 text-sm font-medium text-sippy hover:text-sippy-dark">
            Back to users
          </Link>
        </div>
      </AdminLayout>
    )
  }

  const details = [
    { label: 'Wallet Address', value: user.wallet_address, mono: true },
    { label: 'CDP Wallet', value: user.cdp_wallet_name, mono: false },
    {
      label: 'Total Sent',
      value: onchain ? formatUSDC(onchain.totalSent) : '---',
      mono: false,
    },
    {
      label: 'Total Received',
      value: onchain ? formatUSDC(onchain.totalReceived) : '---',
      mono: false,
    },
    {
      label: 'Transactions',
      value: onchain ? String(onchain.txCount) : '0',
      mono: false,
    },
    {
      label: 'Daily Limit',
      value: user.daily_limit ? `$${Number(user.daily_limit).toLocaleString()}` : 'No limit',
      mono: false,
    },
    {
      label: 'Permission',
      value: user.spend_permission_hash ? 'Active' : 'None',
      mono: false,
      badge: true,
      badgeActive: !!user.spend_permission_hash,
    },
    { label: 'Registered', value: new Date(Number(user.created_at)).toLocaleDateString(), mono: false },
    {
      label: 'Last On-chain Activity',
      value: onchain?.lastActivity
        ? new Date(onchain.lastActivity * 1000).toLocaleDateString()
        : '---',
      mono: false,
    },
    {
      label: 'Last Message',
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
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-sippy"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to users
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">{user.phone_number}</h1>
        <p className="mt-1 text-sm text-gray-500">User details and activity</p>
      </div>

      {/* User details card */}
      <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {details.map((d) => (
            <div key={d.label}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{d.label}</div>
              {d.badge ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    d.badgeActive
                      ? 'bg-sippy-lightest text-sippy-darker'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${d.badgeActive ? 'bg-sippy' : 'bg-gray-400'}`} />
                  {d.value}
                </span>
              ) : (
                <div className={`text-sm text-slate-700 ${d.mono ? 'break-all font-mono text-xs' : ''}`}>
                  {d.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activity section */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {activity.length} records
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Intent</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Source</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Latency</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {activity.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-sippy-lightest/30">
                <td className="px-5 py-3.5 font-medium text-slate-700">{a.intent}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.parse_source === 'llm'
                      ? 'bg-[#e9d5ff] text-[#7c3aed]'
                      : 'bg-sippy-lightest text-sippy-darker'
                  }`}>
                    {a.parse_source}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.status === 'success'
                      ? 'bg-sippy-lightest text-sippy-darker'
                      : a.status === 'error'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{a.latency_ms}ms</td>
                <td className="px-5 py-3.5 text-gray-400">{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {activity.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  No activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
