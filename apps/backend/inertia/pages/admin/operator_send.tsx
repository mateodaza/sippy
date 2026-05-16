/**
 * Operator Send Page
 *
 * Single-screen interface used by event-floor operators to dispatch USDC
 * to attendees in exchange for cash. Shows wallet info + balance + hourly
 * cap status, a recipient-validating form with two-step confirm, and a
 * recent-sends list for context.
 *
 * Pre-fills the recipient phone when navigated to from the attendees
 * table's per-row Send button (`?to=<phone>`).
 *
 * Spec: OPERATOR_FLOW_PLAN.md.
 */

import { useState, useEffect } from 'react'
import { Head } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'

interface RecentSend {
  id: string
  toPhone: string
  amountUsdc: number
  status: string
  txHash: string | null
  createdAt: string
}

interface Props {
  event: { slug: string; name: string } | null
  wallet: {
    address: string
    balanceUsdc: number
    active: boolean
  } | null
  caps: {
    perTxUsdc: number
    perHourUsdc: number
    spentLastHourUsdc: number
  }
  recentSends: RecentSend[]
  prefillRecipientPhone: string | null
  flash: { error?: string; success?: string } | null
}

type RecipientLookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'valid'
      phone: string
      attendee: {
        phoneNumber: string
        linkedAtStep: string | null
        source: string | null
        poapClaimed: boolean
        linkedAt: string
      }
    }
  | { kind: 'invalid'; reason: string }
  | { kind: 'error'; reason: string }

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 5) return phone
  const cc = phone.startsWith('+') ? phone.slice(0, 3) : phone.slice(0, 2)
  const last2 = phone.slice(-2)
  return `${cc}${'*'.repeat(Math.max(0, phone.length - cc.length - 2))}${last2}`
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function OperatorSendPage({
  event,
  wallet,
  caps,
  recentSends,
  prefillRecipientPhone,
  flash,
}: Props) {
  const [recipientPhone, setRecipientPhone] = useState(prefillRecipientPhone ?? '')
  const [amount, setAmount] = useState('')
  const [lookup, setLookup] = useState<RecipientLookupState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localFlash, setLocalFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    flash?.success
      ? { kind: 'success', text: flash.success }
      : flash?.error
        ? { kind: 'error', text: flash.error }
        : null
  )

  // Auto-lookup on mount if pre-filled. Runs only when the prop changes;
  // `doLookup` is closure-stable enough for this single-effect call and we
  // don't want to retrigger on every render. The backend's ESLint config
  // doesn't load react-hooks rules, so no disable directive is needed.
  useEffect(() => {
    if (prefillRecipientPhone) {
      void doLookup(prefillRecipientPhone)
    }
  }, [prefillRecipientPhone])

  async function doLookup(phoneInput?: string) {
    const phone = (phoneInput ?? recipientPhone).trim()
    if (!phone) return
    setLookup({ kind: 'loading' })
    try {
      const res = await fetch(`/admin/operator/recipient/${encodeURIComponent(phone)}`, {
        headers: { Accept: 'application/json' },
      })
      const body = await res.json()
      if (!res.ok) {
        setLookup({ kind: 'error', reason: body?.reason ?? body?.error ?? 'unknown' })
        return
      }
      if (body.valid) {
        setLookup({ kind: 'valid', phone, attendee: body.attendee })
      } else {
        setLookup({ kind: 'invalid', reason: body.reason ?? 'unknown' })
      }
    } catch (err) {
      setLookup({
        kind: 'error',
        reason: err instanceof Error ? err.message : 'network error',
      })
    }
  }

  function resetForm() {
    setRecipientPhone('')
    setAmount('')
    setLookup({ kind: 'idle' })
    setConfirming(false)
  }

  async function doSend() {
    if (lookup.kind !== 'valid') return
    const amountNum = Number.parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setLocalFlash({ kind: 'error', text: 'Amount must be a positive number' })
      return
    }
    setSubmitting(true)
    setLocalFlash(null)
    try {
      const res = await fetch('/admin/operator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ recipientPhone: lookup.phone, amountUsdc: amountNum }),
      })
      const body = await res.json()
      if (!res.ok || !body.success) {
        setLocalFlash({ kind: 'error', text: body.error ?? 'Send failed' })
        return
      }
      setLocalFlash({
        kind: 'success',
        text: `Sent $${amountNum.toFixed(2)} USDC to ${maskPhone(lookup.phone)}. tx=${body.txHash?.slice(0, 10)}…`,
      })
      resetForm()
      // Reload to refresh balance + recent sends. Could use Inertia router
      // but full reload is simpler and matches operator mental model: each
      // send is a discrete event.
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setLocalFlash({
        kind: 'error',
        text: err instanceof Error ? err.message : 'network error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const remainingHour = Math.max(0, caps.perHourUsdc - caps.spentLastHourUsdc)
  const amountNum = Number.parseFloat(amount)
  const amountValid = Number.isFinite(amountNum) && amountNum > 0
  const amountExceedsTxCap = amountValid && amountNum > caps.perTxUsdc
  const amountExceedsHourCap = amountValid && amountNum > remainingHour
  const canSend =
    lookup.kind === 'valid' &&
    amountValid &&
    !amountExceedsTxCap &&
    !amountExceedsHourCap &&
    !!wallet?.active

  return (
    <AdminLayout>
      <Head title="Operator — Send" />

      <div className="mb-6">
        <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
          Send to Attendee
        </h1>
        {event ? (
          <p className="spec-label mt-1">
            Event: {event.name} · {event.slug}
          </p>
        ) : (
          <p className="spec-label mt-1 text-amber-700">No event wallet assigned. Contact admin.</p>
        )}
      </div>

      {/* Wallet header */}
      {wallet ? (
        <div className="panel-frame mb-6 grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="spec-label">Wallet</p>
            <p className="mt-1 font-mono text-sm admin-text">{shortAddress(wallet.address)}</p>
          </div>
          <div>
            <p className="spec-label">Balance</p>
            <p className="mt-1 font-mono text-2xl font-bold text-crypto-hover">
              ${wallet.balanceUsdc.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="spec-label">Hour cap remaining</p>
            <p className="mt-1 font-mono text-2xl font-bold admin-text">
              ${remainingHour.toFixed(2)} / ${caps.perHourUsdc.toFixed(0)}
            </p>
            <p className="mt-1 font-mono text-xs text-neutral-500">
              spent last hour: ${caps.spentLastHourUsdc.toFixed(2)}
            </p>
          </div>
        </div>
      ) : (
        <div
          className="panel-frame mb-6 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-900"
          role="alert"
        >
          <p className="font-semibold">No event wallet assigned</p>
          <p className="mt-1 text-sm">
            An admin must assign you to an event via <code>POST /admin/events/:slug/operator</code>{' '}
            before you can send.
          </p>
        </div>
      )}

      {/* Local flash */}
      {localFlash && (
        <div
          className={`mb-4 rounded border-l-4 px-4 py-3 text-sm ${
            localFlash.kind === 'success'
              ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
              : 'border-red-600 bg-red-50 text-red-900'
          }`}
          role={localFlash.kind === 'success' ? 'status' : 'alert'}
        >
          {localFlash.text}
        </div>
      )}

      {/* Form */}
      {wallet && wallet.active && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!confirming) {
              setConfirming(true)
            } else {
              void doSend()
            }
          }}
          className="panel-frame mb-8 space-y-4 p-6"
        >
          <div>
            <label htmlFor="recipientPhone" className="spec-label block">
              Recipient phone
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="recipientPhone"
                type="tel"
                value={recipientPhone}
                onChange={(e) => {
                  setRecipientPhone(e.target.value)
                  setLookup({ kind: 'idle' })
                  setConfirming(false)
                }}
                placeholder="+573001234567"
                className="flex-1 rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
                required
              />
              <button
                type="button"
                onClick={() => doLookup()}
                disabled={lookup.kind === 'loading' || !recipientPhone.trim()}
                className="rounded-md border border-current px-4 py-2 font-mono text-xs uppercase tracking-[0.1em] hover:bg-current hover:text-white disabled:opacity-50"
              >
                {lookup.kind === 'loading' ? 'Looking up…' : 'Lookup'}
              </button>
            </div>
            {lookup.kind === 'valid' && (
              <p className="mt-2 text-sm text-emerald-700">
                ✓ Attendee found · linked at {formatDateTime(lookup.attendee.linkedAt)}
                {lookup.attendee.source ? ` · source: ${lookup.attendee.source}` : ''}
              </p>
            )}
            {lookup.kind === 'invalid' && (
              <p className="mt-2 text-sm text-red-700">
                Cannot send:{' '}
                {lookup.reason === 'not-in-event'
                  ? 'recipient is not registered for this event'
                  : lookup.reason === 'invalid-phone'
                    ? 'invalid phone number'
                    : lookup.reason}
              </p>
            )}
            {lookup.kind === 'error' && (
              <p className="mt-2 text-sm text-red-700">Lookup error: {lookup.reason}</p>
            )}
          </div>

          <div>
            <label htmlFor="amount" className="spec-label block">
              Amount (USDC)
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={caps.perTxUsdc}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setConfirming(false)
              }}
              placeholder="0.00"
              className="mt-1 w-full rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
              required
            />
            <div className="mt-1 flex flex-wrap gap-4 font-mono text-xs text-neutral-500">
              <span>Per-tx cap: ${caps.perTxUsdc.toFixed(0)}</span>
              <span>Hour cap remaining: ${remainingHour.toFixed(2)}</span>
            </div>
            {amountExceedsTxCap && (
              <p className="mt-1 text-xs text-red-700">
                Exceeds per-tx cap of ${caps.perTxUsdc.toFixed(0)}
              </p>
            )}
            {amountExceedsHourCap && !amountExceedsTxCap && (
              <p className="mt-1 text-xs text-red-700">
                Would exceed hourly cap (${remainingHour.toFixed(2)} remaining)
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSend || submitting}
            className={`w-full rounded-md py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              confirming ? 'bg-red-600 hover:bg-red-700' : 'bg-crypto-hover'
            }`}
          >
            {submitting
              ? 'Sending…'
              : confirming
                ? `Confirm send $${amountNum.toFixed(2)} to ${maskPhone(lookup.kind === 'valid' ? lookup.phone : '')} — click again`
                : `Send $${amountValid ? amountNum.toFixed(2) : '0.00'} to ${
                    lookup.kind === 'valid' ? maskPhone(lookup.phone) : '…'
                  }`}
          </button>
        </form>
      )}

      {/* Recent sends */}
      {wallet && (
        <div className="panel-frame p-4">
          <p className="spec-label mb-3">Recent sends</p>
          {recentSends.length === 0 ? (
            <p className="font-mono text-sm text-neutral-500">No sends yet from this wallet.</p>
          ) : (
            <ul className="divide-y divide-[var(--admin-border-subtle)]">
              {recentSends.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 font-mono text-sm">
                  <span className="admin-text">{maskPhone(s.toPhone)}</span>
                  <span className="text-neutral-600">${s.amountUsdc.toFixed(2)}</span>
                  <span
                    className={`text-xs uppercase tracking-[0.1em] ${
                      s.status === 'confirmed' || s.status === 'submitted'
                        ? 'text-emerald-700'
                        : s.status === 'failed'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {s.status}
                  </span>
                  <span className="text-xs text-neutral-500">{formatDateTime(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
