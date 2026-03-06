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
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function UsersIndex({ users }: { users: PaginatedUsers }) {
  return (
    <AdminLayout>
      <Head title="Users" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">{users.meta.total} registered users</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#bbf7d0] bg-sippy-lightest px-3.5 py-1.5 text-sm font-medium text-[#15803d] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-sippy" />
          {users.meta.total} total
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Phone</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Wallet</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total Sent</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total Received</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Txs</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.data.map((user) => (
              <tr key={user.phone_number} className="transition-colors hover:bg-sippy-lightest/30">
                <td className="px-5 py-4">
                  <Link
                    href={`/admin/users/${encodeURIComponent(user.phone_number)}`}
                    className="font-medium text-sippy transition-colors hover:text-sippy-dark"
                  >
                    {user.phone_number}
                  </Link>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-gray-500">
                  {user.wallet_address
                    ? `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
                    : <span className="text-gray-300">---</span>}
                </td>
                <td className="px-5 py-4 font-medium text-slate-700">
                  {user.onchain ? formatUSDC(user.onchain.totalSent) : <span className="text-gray-300">---</span>}
                </td>
                <td className="px-5 py-4 font-medium text-slate-700">
                  {user.onchain ? formatUSDC(user.onchain.totalReceived) : <span className="text-gray-300">---</span>}
                </td>
                <td className="px-5 py-4 text-gray-500">
                  {user.onchain ? user.onchain.txCount : <span className="text-gray-300">0</span>}
                </td>
                <td className="px-5 py-4 text-gray-400">
                  {user.onchain?.lastActivity
                    ? new Date(user.onchain.lastActivity * 1000).toLocaleDateString()
                    : new Date(Number(user.last_activity)).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  No users registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {users.meta.last_page > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: users.meta.last_page }, (_, i) => i + 1).map((pg) => (
            <Link
              key={pg}
              href={`/admin/users?page=${pg}`}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                pg === users.meta.current_page
                  ? 'bg-sippy text-white shadow-[0_8px_24px_rgba(5,150,105,0.22)]'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
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
