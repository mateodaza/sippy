import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'

interface AuthUser {
  id: number
  email: string
  fullName: string | null
  role: string
  initials: string
}

interface FlashMessages {
  success?: string
  error?: string
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/analytics',
    label: 'Analytics',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/admin/roles',
    label: 'Roles',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { auth, flash, indexerHeartbeat } = usePage().props as { auth: AuthUser | null; flash: FlashMessages; indexerHeartbeat: number | null }
  const currentPath = usePage().url

  function isActive(href: string) {
    if (href === '/admin') return currentPath === '/admin'
    return currentPath.startsWith(href)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-white via-[#eefaf4] to-[#f8fbff] font-sans">
      {/* Sidebar */}
      <nav className="flex w-[260px] flex-col border-r border-gray-100 bg-white/80 px-4 py-6 backdrop-blur-xl">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sippy to-sippy-dark shadow-[0_8px_32px_-8px_rgba(16,185,129,0.3)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-bold tracking-[-0.025em] text-slate-900">Sippy</div>
            <div className="text-xs font-medium text-gray-400">Admin Panel</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive(item.href)
                  ? 'bg-sippy-lightest text-sippy-darker shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={isActive(item.href) ? 'text-sippy' : 'text-gray-400'}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Indexer status */}
        {indexerHeartbeat && (
          <div className="mt-auto px-3 pb-3">
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sippy" />
              Indexer synced {timeAgo(indexerHeartbeat)}
            </div>
          </div>
        )}

        {/* User footer */}
        <div className={`${indexerHeartbeat ? '' : 'mt-auto '}border-t border-gray-100 pt-4`}>
          {auth && (
            <div className="rounded-xl bg-gray-50 p-3">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sippy-lighter text-xs font-bold text-sippy-darker">
                  {auth.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {auth.fullName || auth.email}
                  </div>
                  <div className="inline-flex items-center rounded-full bg-sippy-lightest px-2 py-0.5 text-xs font-medium capitalize text-sippy-darker">
                    {auth.role}
                  </div>
                </div>
              </div>
              <Link
                href="/admin/logout"
                method="post"
                as="button"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
              >
                Sign out
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 p-8">
        {/* Flash messages */}
        {flash?.success && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-[#bbf7d0] bg-gradient-to-r from-[#f0fdf4] to-sippy-lightest p-4">
            <svg className="h-5 w-5 flex-shrink-0 text-sippy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-sm font-medium text-[#15803d]">{flash.success}</p>
          </div>
        )}
        {flash?.error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-100 p-4">
            <svg className="h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium text-red-700">{flash.error}</p>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
