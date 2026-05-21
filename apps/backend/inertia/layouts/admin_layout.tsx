import { Link } from '@adonisjs/inertia/react'
import { router, usePage } from '@inertiajs/react'
import { type ReactNode, useState, useEffect } from 'react'

interface AuthUser {
  id: number
  email: string
  fullName: string | null
  role: string
  initials: string
  /** Populated for `role === 'operator'`. Drives nav scoping. */
  assignedEventSlug?: string | null
  /** True for `admin@sippy.lat` (SUPER_ADMIN_EMAIL). Surfaces the
   *  cross-event SEND nav entry — regular admins don't get it because
   *  they can't act through another operator's wallet anyway. */
  isSuperAdmin?: boolean
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

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('admin-theme', next ? 'dark' : 'light')
  }

  if (!mounted) return <div className="h-7 w-7" />

  return (
    <button
      onClick={toggle}
      className="flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
      style={{
        borderColor: 'var(--admin-border)',
        color: 'var(--admin-text-muted)',
        border: '1px solid var(--admin-border)',
      }}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

/**
 * Bilingual toggle, rendered globally in the admin layout header.
 *
 * The cookie is server-readable (plain, not signed) so the Inertia
 * middleware's share() hook can localize props on the next page load.
 * After a click we trigger `router.reload()` so the server re-evaluates
 * every component prop with the new lang — much simpler than threading
 * the value through every React subtree client-side.
 *
 * Scope of what actually changes when toggled: operator_send.tsx,
 * event_attendees.tsx, the operator-only sidebar nav labels, and JSON
 * error responses from operator_send_controller. Other admin pages
 * (users, analytics, roles, dashboard root, OperatorWalletPanel) remain
 * English regardless of the toggle state — they are admin-only surfaces.
 */
function LangToggle() {
  const page = usePage<{ adminLang?: 'es' | 'en' }>()
  const current = page.props.adminLang ?? 'es'
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function toggle() {
    const next: 'es' | 'en' = current === 'es' ? 'en' : 'es'
    // max-age = 1 year. Cookie name kept in sync with admin_lang.ts.
    document.cookie = `sippy_admin_lang=${next}; path=/; max-age=31536000; samesite=lax`
    router.reload()
  }

  if (!mounted) return <div className="h-7 w-9" />

  return (
    <button
      onClick={toggle}
      className="flex h-7 min-w-9 items-center justify-center rounded px-1.5 font-mono text-[10px] font-bold tracking-[0.1em] transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
      style={{
        borderColor: 'var(--admin-border)',
        color: 'var(--admin-text-muted)',
        border: '1px solid var(--admin-border)',
      }}
      title={current === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'}
      aria-label={current === 'es' ? 'Cambiar a inglés' : 'Switch to Spanish'}
    >
      {current === 'es' ? 'ES' : 'EN'}
    </button>
  )
}

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
    <div
      className="mt-auto space-y-2 px-4 pt-4 pb-4"
      style={{ borderTop: '1px solid var(--admin-border-subtle)' }}
    >
      <div className="flex items-center gap-2 font-mono text-[13px] tracking-wider uppercase admin-text-secondary">
        <span
          className={`indicator-dot ${
            indexerStatus.pollerAgo === null
              ? 'indicator-dot-muted'
              : pollerStuck
                ? 'indicator-dot-danger'
                : 'indicator-dot-active'
          }`}
          aria-hidden="true"
        />
        <span>
          {indexerStatus.pollerAgo === null
            ? 'Poller off'
            : pollerStuck
              ? `Poller stuck (${formatAge(indexerStatus.pollerAgo)})`
              : `Poller OK (${formatAge(indexerStatus.pollerAgo)})`}
        </span>
      </div>
      {pollerStuck && isAdmin && (
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="ml-4 font-mono text-[13px] tracking-wider uppercase text-danger hover:underline disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-danger/30 focus-visible:outline-none"
        >
          {restarting ? 'Restarting...' : 'Restart'}
        </button>
      )}
      <div className="flex items-center gap-2 font-mono text-[13px] tracking-wider uppercase admin-text-secondary">
        <span
          className={`indicator-dot ${
            indexerStatus.webhookAgo === null ? 'indicator-dot-muted' : 'indicator-dot-active'
          }`}
          aria-hidden="true"
        />
        <span>
          {indexerStatus.webhookAgo === null
            ? 'No webhooks'
            : `Webhook ${formatAge(indexerStatus.webhookAgo)}`}
        </span>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { auth, flash, indexerStatus, adminLang } = usePage().props as unknown as {
    auth: AuthUser | null
    flash: FlashMessages
    indexerStatus: IndexerStatus | null
    adminLang?: 'es' | 'en'
  }
  const currentPath = usePage().url
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const lang: 'es' | 'en' = adminLang ?? 'es'
  // Operator-nav labels live alongside everything else operator-facing.
  // The rest of the sidebar (admin-only nav) stays English by decision.
  const operatorNavLabels =
    lang === 'es'
      ? { send: 'ENVIAR', attendees: 'ASISTENTES', qrSheets: 'HOJAS QR' }
      : { send: 'SEND', attendees: 'ATTENDEES', qrSheets: 'QR SHEETS' }

  function isActive(href: string) {
    if (href === '/admin') return currentPath === '/admin'
    return currentPath.startsWith(href)
  }

  // Superadmin-only SEND entry — opens the operator UI cross-event so
  // admin@sippy.lat can pick a wallet to act through. Renders BEFORE the
  // generic admin nav so it's visually near the top. Regular admins don't
  // see this because the controller would refuse any override they tried.
  const superadminSendItem = {
    href: '/admin/operator/send',
    label: 'SEND',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  }

  // Role-aware nav. Operators see ONLY their send page, their assigned
  // event's attendees, and the same event's QR sheets. All other admin
  // surfaces (users, analytics, roles, dashboard root) are hidden.
  // Spec: OPERATOR_FLOW_PLAN.md — "Operator role is strict-scope".
  const effectiveNavItems =
    auth?.role === 'operator'
      ? (() => {
          const slug = auth.assignedEventSlug
          const items = [
            {
              href: '/admin/operator/send',
              label: operatorNavLabels.send,
              icon: (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              ),
            },
          ]
          if (slug) {
            items.push(
              {
                href: `/admin/events/${encodeURIComponent(slug)}/attendees`,
                label: operatorNavLabels.attendees,
                icon: (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
              {
                href: `/admin/qr-sheets/${encodeURIComponent(slug)}`,
                label: operatorNavLabels.qrSheets,
                icon: (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                  </svg>
                ),
              }
            )
          }
          return items
        })()
      : auth?.isSuperAdmin
        ? [superadminSendItem, ...navItems]
        : navItems

  const sidebarContent = (
    <>
      {/* Brand */}
      <div
        className="flex items-center justify-between px-5 py-5"
        style={{ borderBottom: '1px solid var(--admin-border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="80 376 864 272"
            className="h-6 w-auto text-brand"
            aria-label="Sippy"
            role="img"
          >
            <rect fill="currentColor" x="80" y="376" width="160" height="32" />
            <rect fill="currentColor" x="80" y="426" width="160" height="32" />
            <rect fill="currentColor" x="208" y="476" width="32" height="172" />
            <rect fill="currentColor" x="80" y="616" width="160" height="32" />
            <rect fill="currentColor" x="280" y="376" width="64" height="32" />
            <rect fill="currentColor" x="312" y="376" width="32" height="272" />
            <rect fill="currentColor" x="384" y="376" width="32" height="272" />
            <rect fill="currentColor" x="384" y="376" width="160" height="32" />
            <rect fill="currentColor" x="512" y="376" width="32" height="160" />
            <rect fill="currentColor" x="384" y="512" width="160" height="32" />
            <rect fill="currentColor" x="584" y="376" width="32" height="272" />
            <rect fill="currentColor" x="584" y="376" width="160" height="32" />
            <rect fill="currentColor" x="712" y="376" width="32" height="160" />
            <rect fill="currentColor" x="584" y="512" width="160" height="32" />
            <rect fill="currentColor" x="784" y="376" width="32" height="160" />
            <rect fill="currentColor" x="784" y="512" width="160" height="32" />
            <rect fill="currentColor" x="912" y="376" width="32" height="272" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded md:hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
            style={{ border: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)' }}
            aria-label="Close navigation"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="space-y-0.5 px-3 py-4">
        {effectiveNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded px-3 py-2.5 font-mono text-[13px] font-bold tracking-[0.12em] transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none ${
              isActive(item.href)
                ? 'bg-brand-light text-brand'
                : 'admin-text-secondary hover:bg-brand-light/50 hover:text-brand'
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <span
              className={isActive(item.href) ? 'text-brand' : 'admin-text-muted'}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
        {auth?.role === 'operator' && !auth.assignedEventSlug && (
          <div
            className="mt-3 rounded border-l-4 border-amber-600 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900"
            role="alert"
          >
            No event assigned. Ask an admin to assign you.
          </div>
        )}
      </div>

      {/* Indexer status */}
      {indexerStatus && (
        <PollerStatus indexerStatus={indexerStatus} isAdmin={auth?.role === 'admin'} />
      )}

      {/* User footer */}
      <div
        className={`${indexerStatus ? '' : 'mt-auto '}px-4 py-4`}
        style={{ borderTop: '1px solid var(--admin-border-subtle)' }}
      >
        {auth && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded font-mono text-xs font-bold tracking-wider text-brand"
                style={{ border: '1px solid var(--admin-border)' }}
              >
                {auth.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium admin-text">
                  {auth.fullName || auth.email}
                </div>
                <div className="spec-label">{auth.role.toUpperCase()}</div>
              </div>
            </div>
            <Link
              href="/admin/logout"
              method="post"
              as="button"
              className="w-full rounded px-3 py-2 font-mono text-[13px] font-bold tracking-[0.12em] uppercase admin-text-secondary transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
              style={{ border: '1px solid var(--admin-border)' }}
            >
              SIGN OUT
            </Link>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen font-sans" style={{ backgroundColor: 'var(--admin-bg)' }}>
      {/* Mobile hamburger */}
      <div
        className="fixed top-0 left-0 z-40 flex h-14 w-full items-center gap-3 px-4 md:hidden"
        style={{
          backgroundColor: 'var(--admin-surface)',
          borderBottom: '1px solid var(--admin-border-subtle)',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          style={{ border: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)' }}
          aria-label="Open navigation"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="80 376 864 272"
          className="h-5 w-auto text-brand"
          aria-label="Sippy"
          role="img"
        >
          <rect fill="currentColor" x="80" y="376" width="160" height="32" />
          <rect fill="currentColor" x="80" y="426" width="160" height="32" />
          <rect fill="currentColor" x="208" y="476" width="32" height="172" />
          <rect fill="currentColor" x="80" y="616" width="160" height="32" />
          <rect fill="currentColor" x="280" y="376" width="64" height="32" />
          <rect fill="currentColor" x="312" y="376" width="32" height="272" />
          <rect fill="currentColor" x="384" y="376" width="32" height="272" />
          <rect fill="currentColor" x="384" y="376" width="160" height="32" />
          <rect fill="currentColor" x="512" y="376" width="32" height="160" />
          <rect fill="currentColor" x="384" y="512" width="160" height="32" />
          <rect fill="currentColor" x="584" y="376" width="32" height="272" />
          <rect fill="currentColor" x="584" y="376" width="160" height="32" />
          <rect fill="currentColor" x="712" y="376" width="32" height="160" />
          <rect fill="currentColor" x="584" y="512" width="160" height="32" />
          <rect fill="currentColor" x="784" y="376" width="32" height="160" />
          <rect fill="currentColor" x="784" y="512" width="160" height="32" />
          <rect fill="currentColor" x="912" y="376" width="32" height="272" />
        </svg>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
      )}

      {/* Sidebar */}
      <nav
        aria-label="Admin navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col transition-transform duration-200 md:static md:w-[240px] md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          borderRight: '1px solid var(--admin-border)',
          backgroundColor: 'var(--admin-surface)',
        }}
      >
        {sidebarContent}
      </nav>

      {/* Main content */}
      <main className="flex-1 grid-bg p-4 pt-18 md:p-8 md:pt-8">
        {/* Flash messages */}
        {flash?.success && (
          <div
            className="mb-6 flex items-center gap-3 border border-crypto/30 bg-crypto-light px-5 py-4"
            role="alert"
          >
            <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
            <p className="font-mono text-sm font-bold tracking-wider uppercase text-crypto-hover">
              {flash.success}
            </p>
          </div>
        )}
        {flash?.error && (
          <div
            className="mb-6 flex items-center gap-3 border border-danger/30 bg-danger-light px-5 py-4"
            role="alert"
          >
            <span className="indicator-dot indicator-dot-danger" aria-hidden="true" />
            <p className="font-mono text-sm font-bold tracking-wider uppercase text-danger">
              {flash.error}
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
