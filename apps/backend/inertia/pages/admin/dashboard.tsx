import { Head } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'

interface Props {
  stats: {
    totalUsers: number
    activeWallets: number
    messagesToday: number
  }
}

const statCards = [
  {
    key: 'totalUsers' as const,
    label: 'Total Users',
    description: 'Registered phone numbers',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    color: 'bg-sippy-lightest text-sippy',
  },
  {
    key: 'activeWallets' as const,
    label: 'Active Wallets',
    description: 'With wallet addresses',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
      </svg>
    ),
    color: 'bg-[#dbeafe] text-[#2563eb]',
  },
  {
    key: 'messagesToday' as const,
    label: 'Messages Today',
    description: 'Parsed messages',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    color: 'bg-[#fce7f3] text-[#db2777]',
  },
]

export default function Dashboard({ stats }: Props) {
  return (
    <AdminLayout>
      <Head title="Dashboard" />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your Sippy platform</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-gray-200 hover:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.12)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.color} shadow-inner`}>
                {card.icon}
              </div>
            </div>
            <div className="text-3xl font-bold tracking-[-0.025em] text-slate-900">
              {stats[card.key].toLocaleString()}
            </div>
            <div className="mt-1 text-sm font-medium text-gray-500">{card.label}</div>
            <div className="mt-0.5 text-xs text-gray-400">{card.description}</div>
          </div>
        ))}
      </div>
    </AdminLayout>
  )
}
