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
    label: 'TOTAL USERS',
    sublabel: 'REGISTERED PHONE NUMBERS',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'activeWallets' as const,
    label: 'ACTIVE WALLETS',
    sublabel: 'WITH WALLET ADDRESSES',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
      </svg>
    ),
  },
  {
    key: 'messagesToday' as const,
    label: 'MESSAGES TODAY',
    sublabel: 'PARSED MESSAGES',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

export default function Dashboard({ stats }: Props) {
  return (
    <AdminLayout>
      <Head title="Dashboard" />

      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
          Dashboard
        </h1>
        <p className="spec-label mt-1">PLATFORM OVERVIEW</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.key} className="panel-frame p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-brand">{card.icon}</span>
              <span className="spec-label">{card.label}</span>
            </div>
            <div className="font-sans text-5xl font-bold admin-text">
              {stats[card.key].toLocaleString()}
            </div>
            <p className="mt-2 font-mono text-[13px] tracking-[0.15em] uppercase admin-text-muted">
              {card.sublabel}
            </p>
          </div>
        ))}
      </div>
    </AdminLayout>
  )
}
