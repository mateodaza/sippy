'use client'

/**
 * Live recent-transactions feed (Phase B proof asset).
 *
 * Reads GET /api/season/transactions — masked on-chain addresses + Arbiscan
 * links only (no phones, ever). Renders a today / this-week count ticker, a
 * scrolling list, and cursor-based "load more". The head silently refreshes
 * every 30s while the viewer is on the first page (auto-refresh pauses once
 * they start paging, so it never fights the cursor).
 *
 * Client-only (fetches after mount) so relative timestamps can't cause a
 * hydration mismatch.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')

const PAGE_SIZE = 25
const REFRESH_MS = 30_000

interface FeedTx {
  transferId: string
  usd: number
  timestamp: number
  from: string
  to: string
  txHash: string
  arbiscanUrl: string
}

interface FeedResponse {
  transactions: FeedTx[]
  nextCursor: string | null
  counts: { today: number; thisWeek: number }
}

function formatUsd(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function relativeTime(tsSeconds: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000) - tsSeconds)
  if (diff < 60) return `${diff}s`
  if (diff < 3_600) return `${Math.floor(diff / 60)}m`
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h`
  if (diff < 2_592_000) return `${Math.floor(diff / 86_400)}d`
  return `${Math.floor(diff / 2_592_000)}mo`
}

async function fetchPage(cursor: string | null): Promise<FeedResponse | null> {
  try {
    const url = new URL(`${BACKEND_URL}/api/season/transactions`)
    url.searchParams.set('limit', String(PAGE_SIZE))
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as FeedResponse
  } catch {
    return null
  }
}

export function TransactionsFeed() {
  const [txs, setTxs] = useState<FeedTx[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ today: number; thisWeek: number } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [nowMs, setNowMs] = useState(0)
  // True once the viewer has paged past the first page — pauses auto-refresh.
  const pagedRef = useRef(false)

  // Initialize the clock client-side (avoids SSR/CSR drift) and tick it so the
  // relative timestamps stay fresh without re-fetching.
  useEffect(() => {
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const loadHead = useCallback(async () => {
    const data = await fetchPage(null)
    if (!data) {
      setStatus((s) => (s === 'loading' ? 'error' : s))
      return
    }
    setTxs(data.transactions)
    setNextCursor(data.nextCursor)
    setCounts(data.counts)
    setStatus('ready')
  }, [])

  // Initial load.
  useEffect(() => {
    loadHead()
  }, [loadHead])

  // Silent head refresh every 30s while on the first page.
  useEffect(() => {
    const t = setInterval(() => {
      if (!pagedRef.current) loadHead()
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [loadHead])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    pagedRef.current = true
    const data = await fetchPage(nextCursor)
    if (data) {
      setTxs((prev) => [...prev, ...data.transactions])
      setNextCursor(data.nextCursor)
    }
    setLoadingMore(false)
  }, [nextCursor, loadingMore])

  return (
    <div className="panel-frame rounded-xl p-6 sm:p-8">
      {/* Header + count ticker */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
            <p className="spec-label">LIVE TRANSACTIONS</p>
          </div>
          {/* Scope is explicit: the feed/ticker are EVERY on-chain transfer (raw,
              verifiable proof) — distinct from the verified value-out hero above. */}
          <p className="mt-1.5 font-mono text-[10px] tracking-widest uppercase text-[var(--text-secondary)]">
            ALL ON-CHAIN TRANSFERS · VERIFIABLE ON ARBISCAN
          </p>
        </div>
        {counts && (
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-right">
              <span className="font-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                {counts.today.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                TODAY
              </span>
            </div>
            <span className="text-brand-primary/30 hidden sm:inline">|</span>
            <div className="text-right">
              <span className="font-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                {counts.thisWeek.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                THIS WEEK
              </span>
            </div>
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-16">
          <p className="font-mono text-xs text-[var(--text-secondary)]">LOADING FEED…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center justify-center py-16">
          <p className="font-mono text-xs text-[var(--text-secondary)]">
            FEED TEMPORARILY UNAVAILABLE
          </p>
        </div>
      )}

      {status === 'ready' && txs.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="font-mono text-xs text-[var(--text-secondary)]">NO TRANSACTIONS YET</p>
        </div>
      )}

      {status === 'ready' && txs.length > 0 && (
        <>
          <ul className="max-h-[480px] divide-y divide-[var(--border-default)] overflow-y-auto">
            {txs.map((tx) => (
              <li key={tx.transferId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-display text-lg font-bold tabular-nums text-[var(--text-primary)] sm:text-xl">
                    {formatUsd(tx.usd)}
                  </span>
                  <span className="truncate font-mono text-[11px] tracking-wider text-[var(--text-secondary)]">
                    {tx.from} <span className="text-brand-primary">→</span> {tx.to}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {nowMs ? relativeTime(tx.timestamp, nowMs) : ''}
                  </span>
                  <a
                    href={tx.arbiscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] uppercase tracking-wider text-brand-primary hover:underline focus-visible:underline focus-visible:outline-none"
                    aria-label={`View transaction ${tx.txHash} on Arbiscan`}
                  >
                    ARBISCAN ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="border border-[var(--border-strong)] px-6 py-2.5 font-mono text-[11px] uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:border-brand-primary hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:outline-none disabled:opacity-50"
              >
                {loadingMore ? 'LOADING…' : 'LOAD MORE'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
