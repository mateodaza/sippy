'use client'

import { useEffect, useState } from 'react'

// Reads the Season 1 dashboard endpoint so VOLUME shows the un-blended hero
// (transacted volume = verified value-out), not the old deposits+sends blend.
// /api/stats is left intact for back-compat; no surface shows the blended
// headline after Phase B.
interface SeasonStats {
  transactedVolume: string
  transferCount: number
  registeredUsers: number
}

function formatUSDC(raw: string): string {
  const num = Number(raw) / 1_000_000
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${num.toFixed(0)}`
}

export function LiveStats() {
  const [stats, setStats] = useState<SeasonStats | null>(null)

  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001')

    fetch(`${url}/api/season/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => null)
  }, [])

  if (!stats) return null

  const items = [
    { label: 'VOLUME', value: formatUSDC(stats.transactedVolume) },
    { label: 'USERS', value: String(stats.registeredUsers) },
    { label: 'TRANSFERS', value: String(stats.transferCount) },
  ]

  return (
    <div className="inline-flex items-center gap-3 sm:gap-6 border border-[var(--border-default)] px-4 py-2 sm:px-6 sm:py-2.5">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-1.5 sm:gap-2">
          {i > 0 && <span className="text-brand-primary/30 mr-1 sm:mr-2 hidden sm:inline">|</span>}
          <span className="spec-label spec-label-muted text-[9px] sm:text-[11px]">
            {item.label}
          </span>
          <span className="font-mono text-xs sm:text-sm font-bold text-[var(--text-primary)]">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
