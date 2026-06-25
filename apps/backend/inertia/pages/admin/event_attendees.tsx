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

import { useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { Head, router, usePage } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'
import { getEventAttendeesStrings, type AdminLang } from '../../lib/operator_strings.js'

interface Attendee {
  /** Already-masked for display; do NOT use for API actions. */
  phoneNumber: string
  /** Raw E.164 — used only to populate the Send link's `?to=` param. */
  phoneNumberRaw: string
  linkedAtStep: string | null
  source: string | null
  poapClaimed: boolean
  poapClaimedAt: string | null
  linkedAt: string
  /** Operator-send rollup from the LEFT JOIN against operator_sends. */
  operatorSend: {
    sent: boolean
    totalAmountUsdc: number
    lastTxHash: string | null
    lastSentAt: string | null
  }
}

interface OperatorWallet {
  walletAddress: string
  /** null = RPC failure; UI renders "—" not $0.00 (H1). */
  balanceUsdc: number | null
  balanceError: string | null
  active: boolean
  operatorUserId: number
  operatorEmail: string | null
  operatorFullName: string | null
}

interface AvailableOperator {
  id: number
  email: string
  fullName: string | null
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
  /** Admin-only: null when caller is operator (UI hides the section). */
  operatorWallet: OperatorWallet | null
  /** Admin-only: list of users with role=operator that admin can assign. */
  availableOperators: AvailableOperator[]
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
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

function OperatorWalletPanel({
  eventSlug,
  wallet,
  availableOperators,
  isSuperAdmin,
}: {
  eventSlug: string
  wallet: OperatorWallet | null
  availableOperators: AvailableOperator[]
  /** Only the superadmin (SUPER_ADMIN_EMAIL, defaults to admin@sippy.lat)
   *  may drain the wallet. Backend enforces the same check; the UI gate is
   *  just to avoid showing a button that always 403s. */
  isSuperAdmin: boolean
}) {
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('')
  const [drainAddress, setDrainAddress] = useState<string>('')
  /** Empty string = sweep full balance. Any positive number = partial. */
  const [drainAmount, setDrainAmount] = useState<string>('')
  const [busy, setBusy] = useState<null | string>(null) // 'assign' | 'revoke' | 'drain'
  const [addrCopied, setAddrCopied] = useState(false)

  async function copyWalletAddress() {
    if (!wallet) return
    try {
      await navigator.clipboard.writeText(wallet.walletAddress)
      setAddrCopied(true)
      setTimeout(() => setAddrCopied(false), 1500)
    } catch {
      // Clipboard API can fail under unfocused tabs / non-secure origins.
      // Address is still visible to read manually.
    }
  }

  function getCsrfToken(): string {
    // AdonisJS shield writes XSRF-TOKEN cookie; expects X-XSRF-TOKEN header
    // on POST/PUT/DELETE. Without it, shield issues a 302 redirect to the
    // referer and the request never reaches the controller.
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  }

  async function postJson(url: string, body: object | null, method: 'POST' | 'DELETE') {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-XSRF-TOKEN': getCsrfToken(),
      },
      credentials: 'include',
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    // M6: separate JSON parse failures from real responses. Non-JSON 5xx
    // (nginx HTML, gateway timeout) used to coerce to `{}` and alert
    // "Failed: undefined" — admin had no idea whether the request reached
    // the backend. Capture status + raw body snippet so the caller can
    // produce a meaningful error message.
    let data: any = {}
    let bodyText: string | null = null
    const cloned = res.clone()
    try {
      data = await res.json()
    } catch {
      try {
        bodyText = (await cloned.text()).slice(0, 200)
      } catch {
        bodyText = null
      }
    }
    return { ok: res.ok, status: res.status, data, bodyText }
  }

  function alertError(action: string, status: number, data: any, bodyText: string | null) {
    const msg =
      data?.error ?? (bodyText ? `non-JSON response: ${bodyText}` : `HTTP ${status} (no body)`)
    alert(`Failed to ${action} (status ${status}): ${msg}`)
  }

  async function doAssign() {
    if (!selectedOperatorId) return
    setBusy('assign')
    const { ok, status, data, bodyText } = await postJson(
      `/admin/events/${encodeURIComponent(eventSlug)}/operator`,
      { operatorUserId: Number(selectedOperatorId) },
      'POST'
    )
    setBusy(null)
    if (!ok) {
      alertError('assign', status, data, bodyText)
      return
    }
    router.reload({ only: ['operatorWallet'] })
  }

  async function doRevoke() {
    if (
      !confirm(
        'Revoke operator assignment? Wallet will be soft-disabled but funds remain accessible.'
      )
    ) {
      return
    }
    setBusy('revoke')
    const { ok, status, data, bodyText } = await postJson(
      `/admin/events/${encodeURIComponent(eventSlug)}/operator`,
      null,
      'DELETE'
    )
    setBusy(null)
    if (!ok) {
      alertError('revoke', status, data, bodyText)
      return
    }
    router.reload({ only: ['operatorWallet'] })
  }

  async function doDrain() {
    if (!drainAddress) return
    if (!/^0x[a-fA-F0-9]{40}$/.test(drainAddress)) {
      alert('Destination must be a valid 0x address')
      return
    }
    // Optional partial amount. Empty input ⇒ full sweep (legacy behavior).
    // Validate before hitting the server to avoid a confusing 422.
    let parsedAmount: number | undefined
    if (drainAmount.trim() !== '') {
      const n = Number.parseFloat(drainAmount)
      if (!Number.isFinite(n) || n <= 0) {
        alert('Amount must be a positive number (or leave blank to drain all)')
        return
      }
      parsedAmount = n
    }
    const promptMsg =
      parsedAmount === undefined
        ? `Drain ALL USDC to ${drainAddress}? This cannot be undone.`
        : `Drain $${parsedAmount.toFixed(2)} USDC to ${drainAddress}? This cannot be undone.`
    if (!confirm(promptMsg)) return
    setBusy('drain')
    const { ok, status, data, bodyText } = await postJson(
      `/admin/events/${encodeURIComponent(eventSlug)}/operator-wallet/drain`,
      {
        destinationAddress: drainAddress,
        ...(parsedAmount !== undefined ? { amountUsdc: parsedAmount } : {}),
      },
      'POST'
    )
    setBusy(null)
    if (!ok) {
      alertError('drain', status, data, bodyText)
      return
    }
    alert(
      data.amountSent === 0
        ? 'Wallet was empty; nothing drained.'
        : `Drained $${Number(data.amountSent).toFixed(2)} USDC. tx=${(data.txHash ?? '').slice(0, 10)}…`
    )
    setDrainAddress('')
    setDrainAmount('')
    router.reload({ only: ['operatorWallet'] })
  }

  return (
    <div className="panel-frame mb-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="spec-label">Operator wallet (admin only)</p>
        {wallet && (
          <span
            className={`font-mono text-xs uppercase tracking-[0.12em] ${
              wallet.active ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {wallet.active ? 'active' : 'revoked'}
          </span>
        )}
      </div>

      {wallet ? (
        <div className="space-y-3 font-mono text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="spec-label">Assigned to</p>
              <p className="mt-1 admin-text">
                {wallet.operatorFullName ?? wallet.operatorEmail ?? `#${wallet.operatorUserId}`}
              </p>
              {wallet.operatorEmail && wallet.operatorFullName && (
                <p className="text-xs text-neutral-500">{wallet.operatorEmail}</p>
              )}
            </div>
            <div>
              <p className="spec-label">Address</p>
              {/* Full address (not truncated): admin needs to copy it to
                  top up the operator wallet. Pairing with a copy button
                  keeps long addresses usable on narrow viewports. */}
              <div className="mt-1 flex items-start gap-2">
                <p
                  className="font-mono text-xs admin-text break-all"
                  style={{ wordBreak: 'break-all' }}
                  title={wallet.walletAddress}
                >
                  {wallet.walletAddress}
                </p>
                <button
                  type="button"
                  onClick={copyWalletAddress}
                  className="shrink-0 rounded-md border border-current px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] hover:bg-current hover:text-white"
                >
                  {addrCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <p className="spec-label">Balance</p>
              {wallet.balanceUsdc !== null ? (
                <p className="mt-1 text-lg font-bold text-crypto-hover">
                  ${wallet.balanceUsdc.toFixed(2)}
                </p>
              ) : (
                <p
                  className="mt-1 text-lg font-bold text-amber-700"
                  title={wallet.balanceError ?? 'on-chain read failed'}
                >
                  — <span className="text-xs">(unavailable)</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-[var(--admin-border-subtle)] pt-3">
            {/* Superadmin-only "act through this wallet" link. The operator
                send page resolves the wallet from ?event=<slug> when called
                by admin@sippy.lat — same caps, dup guard, recent-sends
                scope. Hidden for non-superadmin admins to keep the wallet
                identity per-operator. */}
            {isSuperAdmin && wallet.active && (
              <Link
                href={`/admin/operator/send?event=${encodeURIComponent(eventSlug)}`}
                className="rounded-md border border-crypto-hover px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-crypto-hover hover:bg-crypto-hover hover:text-white"
              >
                Send from this wallet
              </Link>
            )}
            {wallet.active && (
              <button
                type="button"
                onClick={doRevoke}
                disabled={busy !== null}
                className="rounded-md border border-amber-600 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-amber-700 hover:bg-amber-600 hover:text-white disabled:opacity-50"
              >
                {busy === 'revoke' ? 'Revoking…' : 'Revoke assignment'}
              </button>
            )}
            {/* Drain is irreversible: gated to the superadmin only. Other
                admins see a disabled hint instead of the form so they know
                the affordance exists but isn't theirs to use. Backend
                returns 403 if anyone bypasses the UI. */}
            {isSuperAdmin ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={drainAddress}
                  onChange={(e) => setDrainAddress(e.target.value)}
                  placeholder="0x destination for drain…"
                  className="flex-1 min-w-[260px] rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-1.5 font-mono text-xs admin-text"
                />
                {/* Optional partial amount. Blank = drain full balance. */}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={drainAmount}
                  onChange={(e) => setDrainAmount(e.target.value)}
                  placeholder="Amount (blank = all)"
                  className="w-40 rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-1.5 font-mono text-xs admin-text"
                  title="USDC amount to drain. Leave blank to sweep the full balance."
                />
                <button
                  type="button"
                  onClick={doDrain}
                  disabled={busy !== null || !drainAddress}
                  className="rounded-md border border-red-600 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-red-700 hover:bg-red-600 hover:text-white disabled:opacity-50"
                >
                  {busy === 'drain'
                    ? 'Draining…'
                    : drainAmount.trim() !== ''
                      ? `Drain $${drainAmount}`
                      : 'Drain all to address'}
                </button>
              </div>
            ) : (
              <p className="flex-1 font-mono text-xs text-neutral-500">
                Drain is restricted to the superadmin account.
              </p>
            )}
          </div>
        </div>
      ) : availableOperators.length === 0 ? (
        <p className="font-mono text-sm text-neutral-500">
          No operators created yet. Add an admin user with role=operator via{' '}
          <Link href="/admin/roles" className="underline">
            /admin/roles
          </Link>{' '}
          first.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="operatorSelect" className="spec-label block">
              Assign operator
            </label>
            <select
              id="operatorSelect"
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
            >
              <option value="">Select an operator…</option>
              {availableOperators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.fullName ? `${op.fullName} (${op.email})` : op.email}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={doAssign}
            disabled={!selectedOperatorId || busy !== null}
            className="rounded-md bg-crypto-hover px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50"
          >
            {busy === 'assign' ? 'Provisioning…' : 'Assign + create wallet'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function EventAttendeesPage({
  event,
  counts,
  attendees,
  operatorWallet,
  availableOperators,
}: Props) {
  const { meta } = attendees
  const pageProps = usePage().props as {
    auth?: { role?: string; isSuperAdmin?: boolean }
    adminLang?: AdminLang
  }
  const auth = pageProps.auth ?? null
  const isAdmin = auth?.role === 'admin'
  const isSuperAdmin = auth?.isSuperAdmin === true
  const lang: AdminLang = pageProps.adminLang ?? 'es'
  const t = getEventAttendeesStrings(lang)

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
      <Head title={t.headTitle(event.name)} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
            {t.heading}
          </h1>
          <p className="spec-label mt-1">
            {event.name} · {event.slug}
            {event.endsAt ? t.endsLabel(new Date(event.endsAt).toLocaleDateString()) : ''}
            {event.active ? '' : t.inactiveTag}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`indicator-dot ${event.active ? 'indicator-dot-active' : ''}`}
            aria-hidden="true"
          />
          <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-crypto-hover">
            {t.onboardedSummary(counts.total)}
          </span>
          <button
            type="button"
            onClick={() => goToPage(meta.page)}
            className="rounded-md border-2 border-crypto-hover bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-crypto-hover hover:bg-crypto-hover hover:text-white"
            aria-label={t.refresh}
          >
            {t.refresh}
          </button>
        </div>
      </div>

      {/* Admin-only operator-wallet management. Renders BEFORE counts so
          admin can read balance + status at a glance, then scan the
          attendee funnel below. Operators (role !== 'admin') see neither
          the panel nor the underlying props (server doesn't send them). */}
      {isAdmin && (
        <OperatorWalletPanel
          eventSlug={event.slug}
          wallet={operatorWallet}
          availableOperators={availableOperators}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {/* Top-row stats. Four key metrics every operator needs on glance. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.statTotalOnboarded} value={counts.total} />
        <StatCard label={t.statStepDone} value={counts.byStep.done} sub={t.statStepDoneSub} />
        <StatCard
          label={t.statStepReturning}
          value={counts.byStep.returning}
          sub={t.statStepReturningSub}
        />
        <StatCard
          label={t.statPoapsClaimed}
          value={`${counts.poap.claimed} / ${counts.total}`}
          sub={`${claimRate}%`}
          tone={claimRate >= 50 ? 'good' : 'warn'}
        />
      </div>

      {/* Per-assistant breakdown. Sorted by count DESC server-side; the
          "(no source)" bucket captures organic / typed-Hola-Sippy without a
          QR scan, useful for tuning the channel mix post-event. */}
      <div className="panel-frame mb-6 p-4">
        <p className="spec-label mb-3">{t.bySourceHeading}</p>
        {counts.bySource.length === 0 ? (
          <p className="font-mono text-sm text-neutral-500">{t.bySourceEmpty}</p>
        ) : (
          <ul className="divide-y divide-[var(--admin-border-subtle)]">
            {counts.bySource.map((row) => (
              <li
                key={row.source ?? '__none__'}
                className="flex items-center justify-between py-2 font-mono text-sm"
              >
                <span className="admin-text">
                  {row.source ?? <em className="text-neutral-500">{t.bySourceNone}</em>}
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
              <th className="px-4 py-3 spec-label">{t.thPhone}</th>
              <th className="px-4 py-3 spec-label">{t.thStep}</th>
              <th className="px-4 py-3 spec-label">{t.thSource}</th>
              <th className="px-4 py-3 spec-label">{t.thPoap}</th>
              <th className="px-4 py-3 spec-label">{t.thLinkedAt}</th>
              <th className="px-4 py-3 spec-label">{t.thSend}</th>
            </tr>
          </thead>
          <tbody>
            {attendees.data.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center font-mono text-sm text-neutral-500"
                >
                  {t.noAttendees}
                </td>
              </tr>
            ) : (
              attendees.data.map((a) => (
                <tr
                  key={`${a.phoneNumberRaw}-${a.linkedAt}`}
                  className="border-b border-[var(--admin-border-subtle)] last:border-0"
                >
                  {/* a.phoneNumber is already server-masked — don't double-mask. */}
                  <td className="px-4 py-3 admin-text">{a.phoneNumber}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${
                        a.linkedAtStep === 'done'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {t.stepLabel(a.linkedAtStep)}
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
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        href={`/admin/operator/send?to=${encodeURIComponent(a.phoneNumberRaw)}`}
                        className="inline-block rounded-md border border-current px-3 py-1 font-mono text-xs uppercase tracking-[0.1em] text-crypto-hover hover:bg-crypto-hover hover:text-white"
                      >
                        {a.operatorSend.sent ? t.sendAgainButton : t.sendButton}
                      </Link>
                      {a.operatorSend.sent && (
                        <span
                          className="font-mono text-xs text-emerald-700"
                          title={
                            a.operatorSend.lastSentAt
                              ? t.lastSent(formatDateTime(a.operatorSend.lastSentAt))
                              : undefined
                          }
                        >
                          {t.sentTotal(a.operatorSend.totalAmountUsdc.toFixed(2))}
                        </span>
                      )}
                    </div>
                  </td>
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
            {t.pageOf(meta.page, meta.lastPage, meta.perPage)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, meta.page - 1))}
              disabled={meta.page <= 1}
              className="rounded-md border-2 border-brand bg-white px-3 py-1 font-bold uppercase tracking-[0.1em] text-brand hover:bg-brand hover:text-white disabled:opacity-30"
            >
              {t.prev}
            </button>
            <button
              type="button"
              onClick={() => goToPage(Math.min(meta.lastPage, meta.page + 1))}
              disabled={meta.page >= meta.lastPage}
              className="rounded-md border-2 border-brand bg-white px-3 py-1 font-bold uppercase tracking-[0.1em] text-brand hover:bg-brand hover:text-white disabled:opacity-30"
            >
              {t.next}
            </button>
          </div>
        </div>
      ) : null}

      <p className="mt-6 font-mono text-xs text-neutral-500">
        {t.jsonFeedHint(event.slug)}
        <Link
          href={`/admin/events/${encodeURIComponent(event.slug)}/attendees`}
          className="underline"
        >
          /admin/events/{event.slug}/attendees
        </Link>{' '}
        — <code>Accept: application/json</code>.
      </p>
    </AdminLayout>
  )
}
