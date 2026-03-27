import { Link } from '@adonisjs/inertia/react'
import { router, usePage } from '@inertiajs/react'
import { type ReactNode, useState } from 'react'

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

interface IndexerStatus {
  pollerAgo: number | null
  webhookAgo: number | null
}

function formatAge(secs: number): string {
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

const navItems = [
  {
    href: '/admin',
    label: 'DASHBOARD',
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
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    label: 'USERS',
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
    href: '/admin/analytics',
    label: 'ANALYTICS',
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
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/admin/roles',
    label: 'ROLES',
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
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
]

function PollerStatus({
  indexerStatus,
  isAdmin,
}: {
  indexerStatus: IndexerStatus
  isAdmin: boolean
}) {
  const [restarting, setRestarting] = useState(false)
  const pollerStuck = indexerStatus.pollerAgo !== null && indexerStatus.pollerAgo > 120

  function handleRestart() {
    setRestarting(true)
    router.post(
      '/admin/restart-poller',
      {},
      {
        preserveScroll: true,
        onFinish: () => setRestarting(false),
      }
    )
  }

  return (
    <div className="mt-auto space-y-2 border-t border-brand/10 px-4 pt-4 pb-4">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider uppercase text-brand-dark/50">
        <span
          className={`indicator-dot ${
            indexerStatus.pollerAgo === null
              ? 'indicator-dot-muted'
              : pollerStuck
                ? 'indicator-dot-danger'
                : 'indicator-dot-active'
          }`}
        />
        {indexerStatus.pollerAgo === null
          ? 'Poller off'
          : pollerStuck
            ? `Poller stuck (${formatAge(indexerStatus.pollerAgo)})`
            : `Poller OK (${formatAge(indexerStatus.pollerAgo)})`}
      </div>
      {pollerStuck && isAdmin && (
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="ml-4 font-mono text-[10px] tracking-wider uppercase text-danger hover:underline disabled:opacity-50"
        >
          {restarting ? 'Restarting...' : 'Restart'}
        </button>
      )}
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider uppercase text-brand-dark/50">
        <span
          className={`indicator-dot ${
            indexerStatus.webhookAgo === null ? 'indicator-dot-muted' : 'indicator-dot-active'
          }`}
        />
        {indexerStatus.webhookAgo === null
          ? 'No webhooks'
          : `Webhook ${formatAge(indexerStatus.webhookAgo)}`}
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { auth, flash, indexerStatus } = usePage().props as {
    auth: AuthUser | null
    flash: FlashMessages
    indexerStatus: IndexerStatus | null
  }
  const currentPath = usePage().url

  function isActive(href: string) {
    if (href === '/admin') return currentPath === '/admin'
    return currentPath.startsWith(href)
  }

  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* Sidebar */}
      <nav className="flex w-[240px] flex-col border-r border-brand/15 bg-white">
        {/* Brand */}
        <div className="border-b border-brand/10 px-5 py-5">
          <div className="font-sans text-lg font-bold uppercase tracking-[0.1em] text-brand-dark">
            Sippy
          </div>
          <div className="spec-label mt-0.5" style={{ color: 'rgba(0, 175, 215, 0.5)' }}>
            ADMIN PANEL
          </div>
        </div>

        {/* Navigation */}
        <div className="space-y-0.5 px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded px-3 py-2.5 font-mono text-[11px] font-bold tracking-[0.12em] transition-colors ${
                isActive(item.href)
                  ? 'bg-brand-light text-brand'
                  : 'text-brand-dark/50 hover:bg-brand-light/50 hover:text-brand'
              }`}
            >
              <span className={isActive(item.href) ? 'text-brand' : 'text-brand-dark/40'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>

        {/* Indexer status */}
        {indexerStatus && (
          <PollerStatus indexerStatus={indexerStatus} isAdmin={auth?.role === 'admin'} />
        )}

        {/* User footer */}
        <div className={`${indexerStatus ? '' : 'mt-auto '}border-t border-brand/10 px-4 py-4`}>
          {auth && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded border border-brand/20 font-mono text-[10px] font-bold tracking-wider text-brand">
                  {auth.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-brand-dark">
                    {auth.fullName || auth.email}
                  </div>
                  <div className="spec-label" style={{ color: 'rgba(0, 175, 215, 0.5)' }}>
                    {auth.role.toUpperCase()}
                  </div>
                </div>
              </div>
              <Link
                href="/admin/logout"
                method="post"
                as="button"
                className="w-full rounded border border-brand/15 px-3 py-2 font-mono text-[10px] font-bold tracking-[0.12em] uppercase text-brand-dark/50 transition-colors hover:border-brand/30 hover:text-brand"
              >
                SIGN OUT
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 grid-bg p-8">
        {/* Flash messages */}
        {flash?.success && (
          <div className="mb-6 flex items-center gap-3 border border-crypto/30 bg-crypto-light px-5 py-4">
            <span className="indicator-dot indicator-dot-active" />
            <p className="font-mono text-xs font-bold tracking-wider uppercase text-crypto-hover">
              {flash.success}
            </p>
          </div>
        )}
        {flash?.error && (
          <div className="mb-6 flex items-center gap-3 border border-danger/30 bg-danger-light px-5 py-4">
            <span className="indicator-dot indicator-dot-danger" />
            <p className="font-mono text-xs font-bold tracking-wider uppercase text-danger">
              {flash.error}
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
