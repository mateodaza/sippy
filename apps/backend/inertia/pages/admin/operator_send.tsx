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
import { Head, usePage } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'
import { getOperatorSendStrings, type AdminLang } from '../../lib/operator_strings.js'

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
    /** null when the on-chain balance read failed — render "—" not $0.00. */
    balanceUsdc: number | null
    balanceError: string | null
    active: boolean
  } | null
  caps: {
    perTxUsdc: number
    perHourUsdc: number
    spentLastHourUsdc: number
    /** Largest USDC step exposed in the amount dropdown. Driven by the
     * EVENT_LIMIT_USABLE_AIRDROP env; ≥5, ints only. */
    dropdownMaxUsdc: number
  }
  recentSends: RecentSend[]
  prefillRecipientPhone: string | null
  /** Non-null when admin@sippy.lat is acting through another operator's
   *  wallet via ?event=<slug>. Page surfaces a banner and POSTs eventSlug
   *  back so the controller resolves the same wallet. */
  superadminOverride: { eventSlug: string } | null
  /** Populated when the superadmin lands here without `?event=` and has no
   *  wallet of their own. Lets them pick which event to act through. */
  superadminWalletPicker: Array<{
    eventSlug: string
    eventName: string | null
    walletAddress: string
    operatorEmail: string | null
    operatorFullName: string | null
  }> | null
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

/**
 * Wallet-address row with a copy-to-clipboard button. The operator needs
 * the FULL address (not a truncated `0x123…abc`) to know where to send
 * funds when the wallet runs low — hiding it behind a short-mask was the
 * reason operators had no idea how to fund their own wallet.
 */
function WalletAddressBlock({
  address,
  hint,
  copyLabel,
  copiedLabel,
}: {
  address: string
  hint: string
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail under unfocused tabs or http origins.
      // Fall back to a noop visual; operator can still read the address.
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p
          className="font-mono text-xs admin-text break-all"
          style={{ wordBreak: 'break-all' }}
          title={address}
        >
          {address}
        </p>
        <button
          type="button"
          onClick={doCopy}
          className="shrink-0 rounded-md border border-current px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] hover:bg-current hover:text-white"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <p className="mt-1 font-mono text-[10px] text-neutral-500">{hint}</p>
    </div>
  )
}

// Shield's CSRF middleware rejects POSTs that don't echo the XSRF-TOKEN
// cookie back as an `X-XSRF-TOKEN` header. The reject path is a 302 to the
// referer, which then renders as HTML — so a missing token surfaces as
// "Unexpected token '<'" on the JSON.parse, not a 4xx. Always send it.
function readXsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export default function OperatorSendPage({
  event,
  wallet,
  caps,
  recentSends,
  prefillRecipientPhone,
  superadminOverride,
  superadminWalletPicker,
  flash,
}: Props) {
  const lang = ((usePage().props as { adminLang?: AdminLang }).adminLang ?? 'es') as AdminLang
  const t = getOperatorSendStrings(lang)
  const [recipientPhone, setRecipientPhone] = useState(prefillRecipientPhone ?? '')
  // Pre-select 4 USDC: that's the per-attendee disbursement target for the
  // Cartagena pre-event float ($500 / ~125 users). Operator can change it
  // via the dropdown for one-off adjustments.
  const [amount, setAmount] = useState('4')
  const [lookup, setLookup] = useState<RecipientLookupState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // When the backend returns 409 DUPLICATE_RECIPIENT, surface a separate
  // override flow instead of treating it as a fatal flash. Operator can
  // legitimately need to re-pay (first send never reached the attendee,
  // attendee handed over more cash, etc.) — gated by an explicit second
  // confirm so it stays deliberate.
  const [duplicateBlock, setDuplicateBlock] = useState<{
    message: string
    existing: {
      id: string | number
      amount_usdc: string
      status: string
      created_at: string
    } | null
  } | null>(null)
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
      // Forward the superadmin event override so /admin/operator/recipient
      // validates against the right event. Regular operators send nothing
      // here and the backend ignores the param.
      const lookupQs = superadminOverride
        ? `?event=${encodeURIComponent(superadminOverride.eventSlug)}`
        : ''
      const res = await fetch(`/admin/operator/recipient/${encodeURIComponent(phone)}${lookupQs}`, {
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

  async function doSend(override = false) {
    if (lookup.kind !== 'valid') return
    const amountNum = Number.parseFloat(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setLocalFlash({ kind: 'error', text: t.amountMustBePositive })
      return
    }
    setSubmitting(true)
    setLocalFlash(null)
    if (override) setDuplicateBlock(null)
    try {
      const xsrf = readXsrfToken()
      const res = await fetch('/admin/operator/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        },
        body: JSON.stringify({
          recipientPhone: lookup.phone,
          amountUsdc: amountNum,
          ...(override ? { override: true } : {}),
          // Superadmin override: tells the backend which event's wallet to
          // act through. Backend ignores it for non-superadmin callers, so
          // this is safe to always include.
          ...(superadminOverride ? { eventSlug: superadminOverride.eventSlug } : {}),
        }),
      })
      const body = await res.json()
      // 409 — backend's duplicate-recipient guard fired. Render an override
      // panel so operator can choose to re-send (with code=DUPLICATE_RECIPIENT
      // we know it's the dup guard, not a different conflict). Don't treat
      // as a generic flash error.
      if (res.status === 409 && body?.code === 'DUPLICATE_RECIPIENT') {
        setDuplicateBlock({
          message: body.error ?? t.dupFallback,
          existing: body.existingSend ?? null,
        })
        return
      }
      if (!res.ok || !body.success) {
        setLocalFlash({ kind: 'error', text: body.error ?? t.sendFailedFallback })
        return
      }
      setLocalFlash({
        kind: 'success',
        text: t.sendSuccessFlash(
          amountNum.toFixed(2),
          maskPhone(lookup.phone),
          body.txHash?.slice(0, 10) ?? ''
        ),
      })
      resetForm()
      // Reload to refresh balance + recent sends. Could use Inertia router
      // but full reload is simpler and matches operator mental model: each
      // send is a discrete event.
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setLocalFlash({
        kind: 'error',
        text: err instanceof Error ? err.message : t.networkError,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Dropdown values: base steps + 1-USDC steps from 6 up to the
  // EVENT_LIMIT_USABLE_AIRDROP ceiling that backend already clamped to ≥5.
  const amountOptions: string[] = (() => {
    const base = ['0.5', '1', '2', '3', '4', '5']
    if (caps.dropdownMaxUsdc <= 5) return base
    const extra: string[] = []
    for (let n = 6; n <= caps.dropdownMaxUsdc; n++) extra.push(String(n))
    return base.concat(extra)
  })()

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
      <Head title={t.headTitle} />

      <div className="mb-6">
        <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
          {t.heading}
        </h1>
        {event ? (
          <p className="spec-label mt-1">{t.eventLine(event.name, event.slug)}</p>
        ) : (
          <p className="spec-label mt-1 text-amber-700">{t.noWalletSubtitle}</p>
        )}
      </div>

      {/* Superadmin override banner. Makes it visually obvious that the
          superadmin is acting through an operator's wallet — Mateo's note:
          "the UI makes the active wallet/event obvious". */}
      {superadminOverride && (
        <div
          className="panel-frame mb-6 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-900"
          role="status"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
            Superadmin override
          </p>
          <p className="mt-1 font-mono text-sm">
            You are sending through the operator wallet for event{' '}
            <span className="font-bold">{superadminOverride.eventSlug}</span>. Hourly cap and
            duplicate-recipient guard apply as if the assigned operator were sending. Audit row will
            be attributed to the assigned operator; check server logs for the caller id.
          </p>
        </div>
      )}

      {/* Wallet header */}
      {wallet ? (
        <div className="panel-frame mb-6 grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <p className="spec-label">{t.walletLabel}</p>
            <div className="mt-1">
              <WalletAddressBlock
                address={wallet.address}
                hint={t.walletAddressCopyHint}
                copyLabel={t.walletAddressCopy}
                copiedLabel={t.walletAddressCopied}
              />
            </div>
          </div>
          <div>
            <p className="spec-label">{t.balanceLabel}</p>
            {wallet.balanceUsdc !== null ? (
              <p className="mt-1 font-mono text-2xl font-bold text-crypto-hover">
                ${wallet.balanceUsdc.toFixed(2)}
              </p>
            ) : (
              <>
                <p
                  className="mt-1 font-mono text-2xl font-bold text-amber-700"
                  title={wallet.balanceError ?? 'on-chain read failed'}
                >
                  —
                </p>
                <p className="mt-1 font-mono text-xs text-amber-700">{t.balanceRpcUnavailable}</p>
              </>
            )}
          </div>
          <div>
            <p className="spec-label">{t.hourCapLabel}</p>
            <p className="mt-1 font-mono text-2xl font-bold admin-text">
              ${remainingHour.toFixed(2)} / ${caps.perHourUsdc.toFixed(0)}
            </p>
            <p className="mt-1 font-mono text-xs text-neutral-500">
              {t.spentLastHour(caps.spentLastHourUsdc.toFixed(2))}
            </p>
          </div>
        </div>
      ) : superadminWalletPicker && superadminWalletPicker.length > 0 ? (
        // Superadmin landed here with no `?event=` override. Render a picker
        // of active operator wallets so they can choose one to act through.
        // Selecting routes back to /admin/operator/send?event=<slug>, which
        // hits the wallet-present branch.
        <div className="panel-frame mb-6 p-4">
          <p className="spec-label mb-1">Pick an event wallet to send through</p>
          <p className="mb-3 font-mono text-xs text-neutral-500">
            Superadmin override. Same caps and duplicate-recipient guard apply as if the assigned
            operator were sending.
          </p>
          <ul className="divide-y divide-[var(--admin-border-subtle)]">
            {superadminWalletPicker.map((row) => (
              <li
                key={row.eventSlug}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold admin-text">
                    {row.eventName ?? row.eventSlug}
                  </p>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {row.eventSlug} · op: {row.operatorFullName ?? row.operatorEmail ?? 'unknown'}
                  </p>
                  <p className="mt-1 font-mono text-[10px] break-all text-neutral-500">
                    {row.walletAddress}
                  </p>
                </div>
                <a
                  href={`/admin/operator/send?event=${encodeURIComponent(row.eventSlug)}`}
                  className="shrink-0 rounded-md border border-crypto-hover px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-crypto-hover hover:bg-crypto-hover hover:text-white"
                >
                  Send through this wallet
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : superadminWalletPicker && superadminWalletPicker.length === 0 ? (
        // Superadmin, but no active operator wallets exist anywhere yet.
        <div
          className="panel-frame mb-6 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-900"
          role="alert"
        >
          <p className="font-semibold">No active operator wallets</p>
          <p className="mt-1 text-sm">
            Provision an operator on an event's attendees page first, then come back here.
          </p>
        </div>
      ) : (
        <div
          className="panel-frame mb-6 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-900"
          role="alert"
        >
          <p className="font-semibold">{t.noWalletHeading}</p>
          <p className="mt-1 text-sm">
            {t.noWalletBodyPrefix}
            <code>POST /admin/events/:slug/operator</code>
            {t.noWalletBodySuffix}
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

      {/* Duplicate-recipient override panel. Backend guards against double-pay
          by default; this panel lets operator override deliberately. Two-click
          confirm keeps the override from being a single-tap mistake. */}
      {duplicateBlock && (
        <div
          className="mb-4 rounded border-l-4 border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <p className="font-semibold">{t.dupHeading}</p>
          {duplicateBlock.existing && (
            <p className="mt-1 font-mono text-xs">
              {t.dupDetail(
                duplicateBlock.existing.amount_usdc,
                duplicateBlock.existing.status,
                String(duplicateBlock.existing.id)
              )}
            </p>
          )}
          <p className="mt-2 text-xs">{t.dupWarning}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void doSend(true)}
              disabled={submitting}
              className="rounded-md bg-amber-700 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {submitting ? t.sendingButton : t.dupSendAnyway}
            </button>
            <button
              type="button"
              onClick={() => setDuplicateBlock(null)}
              className="rounded-md border border-amber-700 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-amber-800 hover:bg-amber-100"
            >
              {t.dupCancel}
            </button>
          </div>
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
              {t.recipientPhoneLabel}
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
                  setDuplicateBlock(null)
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
                {lookup.kind === 'loading' ? t.lookupLoading : t.lookupButton}
              </button>
            </div>
            {lookup.kind === 'valid' && (
              <p className="mt-2 text-sm text-emerald-700">
                {t.attendeeFound(formatDateTime(lookup.attendee.linkedAt), lookup.attendee.source)}
              </p>
            )}
            {lookup.kind === 'invalid' && (
              <p className="mt-2 text-sm text-red-700">
                {t.cannotSend(
                  lookup.reason === 'not-in-event'
                    ? t.reasonNotInEvent
                    : lookup.reason === 'invalid-phone'
                      ? t.reasonInvalidPhone
                      : lookup.reason
                )}
              </p>
            )}
            {lookup.kind === 'error' && (
              <p className="mt-2 text-sm text-red-700">{t.lookupError(lookup.reason)}</p>
            )}
          </div>

          <div>
            <label htmlFor="amount" className="spec-label block">
              {t.amountLabel}
            </label>
            <select
              id="amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setConfirming(false)
                setDuplicateBlock(null)
              }}
              className="mt-1 w-full rounded border border-[var(--admin-border-subtle)] bg-[var(--admin-surface)] px-3 py-2 font-mono text-sm admin-text"
              required
            >
              <option value="">{t.amountPlaceholder}</option>
              {amountOptions.map((v) => (
                <option key={v} value={v}>
                  ${Number(v).toFixed(2)} USDC
                </option>
              ))}
            </select>
            <div className="mt-1 flex flex-wrap gap-4 font-mono text-xs text-neutral-500">
              <span>{t.hourCapFootnote(remainingHour.toFixed(2))}</span>
            </div>
            {amountExceedsHourCap && (
              <p className="mt-1 text-xs text-red-700">
                {t.amountExceedsHourCap(remainingHour.toFixed(2))}
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
              ? t.sendingButton
              : confirming
                ? t.confirmSend(
                    amountNum.toFixed(2),
                    maskPhone(lookup.kind === 'valid' ? lookup.phone : '')
                  )
                : t.sendCta(
                    amountValid ? amountNum.toFixed(2) : '0.00',
                    lookup.kind === 'valid' ? maskPhone(lookup.phone) : '…'
                  )}
          </button>
        </form>
      )}

      {/* Recent sends */}
      {wallet && (
        <div className="panel-frame p-4">
          <p className="spec-label mb-3">{t.recentSendsHeading}</p>
          {recentSends.length === 0 ? (
            <p className="font-mono text-sm text-neutral-500">{t.noSendsYet}</p>
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
                    {t.sendStatus(s.status)}
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
