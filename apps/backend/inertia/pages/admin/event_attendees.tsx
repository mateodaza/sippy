/**
 * Event Attendees — live monitoring page for an event.
 *
 * Operator-facing dashboard during the event: total onboarded count,
 * per-assistant attribution, POAP claim split, and a paginated table
 * of recent landings ordered newest-first.
 *
 * Same data is available as JSON via `Accept: application/json` so the
 * standalone apps/web live dashboard can poll the same endpoint without
 * re-implementing the queries.
 */

import { Link } from '@adonisjs/inertia/react'
import { Head, router } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'

interface Attendee {
  phoneNumber: string
  linkedAtStep: string | null
  source: string | null
  poapClaimed: boolean
  poapClaimedAt: string | null
  linkedAt: string
}

interface Props {
  event: {
    slug: string
    name: string
    endsAt: string | null
    active: boolean
  }
  counts: {
    total: number
    byStep: { done: number; returning: number; unknown: number }
    bySource: Array<{ source: string | null; count: number }>
    poap: { claimed: number; unclaimed: number }
  }
  attendees: {
    data: Attendee[]
    meta: {
      page: number
      perPage: number
      total: number
      lastPage: number
    }
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function maskPhone(phone: string): string {
  // Server-side phone masking lives in app/utils/phone.ts but isn't exposed
  // to the Inertia layer; admin UI does its own light masking for display.
  // Keeps country code + last 2 digits visible so operators can match against
  // a printed list if needed.
  if (!phone) return '—'
  if (phone.length <= 5) return phone
  const cc = phone.startsWith('+') ? phone.slice(0, 3) : phone.slice(0, 2)
  const last2 = phone.slice(-2)
  return `${cc}${'*'.repeat(Math.max(0, phone.length - cc.length - 2))}${last2}`
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number | string
  sub?: string
  tone?: 'default' | 'good' | 'warn'
}) {
  const valueClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'admin-text'
  return (
    <div className="panel-frame p-4">
      <p className="spec-label">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-bold ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-1 font-mono text-xs text-neutral-500">{sub}</p> : null}
    </div>
  )
}

export default function EventAttendeesPage({ event, counts, attendees }: Props) {
  const { meta } = attendees
  const goToPage = (p: number) => {
    router.get(
      `/admin/events/${encodeURIComponent(event.slug)}/attendees`,
      { page: p, perPage: meta.perPage },
      { preserveState: false, preserveScroll: false }
    )
  }

  const claimRate = counts.total > 0 ? Math.round((counts.poap.claimed / counts.total) * 100) : 0

  return (
    <AdminLayout>
      <Head title={`Attendees — ${event.name}`} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
            Event Attendees
          </h1>
          <p className="spec-label mt-1">
            {event.name} · {event.slug}
            {event.endsAt ? ` · ends ${new Date(event.endsAt).toLocaleDateString()}` : ''}
            {event.active ? '' : ' · INACTIVE'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`indicator-dot ${event.active ? 'indicator-dot-active' : ''}`}
            aria-hidden="true"
          />
          <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-crypto-hover">
            {counts.total} ONBOARDED
          </span>
          <button
            type="button"
            onClick={() => goToPage(meta.page)}
            className="rounded-md border border-current px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] hover:bg-current hover:text-white"
            aria-label="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Top-row stats. Four key metrics every operator needs on glance. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total onboarded" value={counts.total} />
        <StatCard
          label="Step: done (here)"
          value={counts.byStep.done}
          sub="onboarded at the event"
        />
        <StatCard
          label="Step: returning"
          value={counts.byStep.returning}
          sub="already had a wallet"
        />
        <StatCard
          label="POAPs claimed"
          value={`${counts.poap.claimed} / ${counts.total}`}
          sub={`${claimRate}%`}
          tone={claimRate >= 50 ? 'good' : 'warn'}
        />
      </div>

      {/* Per-assistant breakdown. Sorted by count DESC server-side; the
          "(no source)" bucket captures organic / typed-Hola-Sippy without a
          QR scan, useful for tuning the channel mix post-event. */}
      <div className="panel-frame mb-6 p-4">
        <p className="spec-label mb-3">By assistant / source tag</p>
        {counts.bySource.length === 0 ? (
          <p className="font-mono text-sm text-neutral-500">No attribution data yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--admin-border-subtle)]">
            {counts.bySource.map((row) => (
              <li
                key={row.source ?? '__none__'}
                className="flex items-center justify-between py-2 font-mono text-sm"
              >
                <span className="admin-text">
                  {row.source ?? <em className="text-neutral-500">(no source)</em>}
                </span>
                <span className="font-bold text-crypto-hover">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent landings table. Ordered DESC so refresh shows the newest at
          top — operators watch this during the event. */}
      <div className="panel-frame overflow-x-auto p-0">
        <table className="w-full text-left font-mono text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-border-subtle)] bg-[var(--admin-surface)]">
              <th className="px-4 py-3 spec-label">Phone</th>
              <th className="px-4 py-3 spec-label">Step</th>
              <th className="px-4 py-3 spec-label">Source</th>
              <th className="px-4 py-3 spec-label">POAP</th>
              <th className="px-4 py-3 spec-label">Linked at</th>
            </tr>
          </thead>
          <tbody>
            {attendees.data.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center font-mono text-sm text-neutral-500"
                >
                  No attendees yet.
                </td>
              </tr>
            ) : (
              attendees.data.map((a) => (
                <tr
                  key={`${a.phoneNumber}-${a.linkedAt}`}
                  className="border-b border-[var(--admin-border-subtle)] last:border-0"
                >
                  <td className="px-4 py-3 admin-text">{maskPhone(a.phoneNumber)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${
                        a.linkedAtStep === 'done'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {a.linkedAtStep ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 admin-text">
                    {a.source ?? <em className="text-neutral-500">—</em>}
                  </td>
                  <td className="px-4 py-3">
                    {a.poapClaimed ? (
                      <span className="text-emerald-600">✓ {formatDateTime(a.poapClaimedAt)}</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 admin-text">{formatDateTime(a.linkedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination. Hidden when there's only one page so the page doesn't
          render dead UI for small events. */}
      {meta.lastPage > 1 ? (
        <div className="mt-4 flex items-center justify-between font-mono text-xs">
          <span className="text-neutral-500">
            Page {meta.page} of {meta.lastPage} · {meta.perPage} per page
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, meta.page - 1))}
              disabled={meta.page <= 1}
              className="rounded-md border border-current px-3 py-1 uppercase tracking-[0.1em] hover:bg-current hover:text-white disabled:opacity-30"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.min(meta.lastPage, meta.page + 1))}
              disabled={meta.page >= meta.lastPage}
              className="rounded-md border border-current px-3 py-1 uppercase tracking-[0.1em] hover:bg-current hover:text-white disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-6 font-mono text-xs text-neutral-500">
        JSON feed:{' '}
        <Link
          href={`/admin/events/${encodeURIComponent(event.slug)}/attendees`}
          className="underline"
        >
          /admin/events/{event.slug}/attendees
        </Link>{' '}
        — send <code>Accept: application/json</code>.
      </p>
    </AdminLayout>
  )
}
