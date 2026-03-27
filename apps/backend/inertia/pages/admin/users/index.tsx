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
  created_at: string
  last_activity: string
  daily_limit: string | null
  onchain: OnchainData | null
}

interface PaginatedUsers {
  data: User[]
  meta: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
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

export default function UsersIndex({ users }: { users: PaginatedUsers }) {
  return (
    <AdminLayout>
      <Head title="Users" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-2xl font-bold uppercase tracking-[0.05em] text-brand-dark">
            Users
          </h1>
          <p className="spec-label mt-1" style={{ color: 'rgba(0, 175, 215, 0.5)' }}>
            {users.meta.total} REGISTERED
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator-dot indicator-dot-active" />
          <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-crypto-hover">
            {users.meta.total} TOTAL
          </span>
        </div>
      </div>

      <div className="panel-frame overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand/10 bg-brand-light">
              <th className="px-5 py-3 text-left spec-label">PHONE</th>
              <th className="px-5 py-3 text-left spec-label">WALLET</th>
              <th className="px-5 py-3 text-left spec-label">TOTAL SENT</th>
              <th className="px-5 py-3 text-left spec-label">TOTAL RECEIVED</th>
              <th className="px-5 py-3 text-left spec-label">TXS</th>
              <th className="px-5 py-3 text-left spec-label">LAST SEEN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand/5">
            {users.data.map((user) => (
              <tr key={user.phone_number} className="transition-colors hover:bg-brand-light/50">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/admin/users/${encodeURIComponent(user.phone_number)}`}
                    className="font-mono text-xs font-bold text-brand transition-colors hover:text-brand-hover"
                  >
                    {user.phone_number}
                  </Link>
                </td>
                <td className="px-5 py-3.5 font-mono text-[11px] text-brand-dark/50">
                  {user.wallet_address ? (
                    `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
                  ) : (
                    <span className="text-brand-dark/25">---</span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-brand-dark">
                  {user.onchain ? (
                    formatUSDC(user.onchain.totalSent)
                  ) : (
                    <span className="text-brand-dark/25">---</span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-brand-dark">
                  {user.onchain ? (
                    formatUSDC(user.onchain.totalReceived)
                  ) : (
                    <span className="text-brand-dark/25">---</span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-brand-dark/50">
                  {user.onchain ? (
                    user.onchain.txCount
                  ) : (
                    <span className="text-brand-dark/25">0</span>
                  )}
                </td>
                <td className="px-5 py-3.5 font-mono text-[10px] tracking-wider text-brand-dark/40">
                  {user.onchain?.lastActivity ? (
                    <span title="On-chain activity">
                      {new Date(user.onchain.lastActivity * 1000).toLocaleDateString()}
                    </span>
                  ) : (
                    <span title="Last WhatsApp message">
                      {new Date(Number(user.last_activity)).toLocaleDateString()}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {users.data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center font-mono text-[10px] tracking-wider text-brand-dark/40"
                >
                  NO USERS REGISTERED YET
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {users.meta.last_page > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          {Array.from({ length: users.meta.last_page }, (_, i) => i + 1).map((pg) => (
            <Link
              key={pg}
              href={`/admin/users?page=${pg}`}
              className={`px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider transition-colors ${
                pg === users.meta.current_page
                  ? 'bg-brand text-white'
                  : 'border border-brand/15 text-brand-dark/50 hover:border-brand/30 hover:text-brand'
              }`}
            >
              {pg}
            </Link>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
