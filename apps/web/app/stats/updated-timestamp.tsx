'use client'

import { useEffect, useState } from 'react'

function formatLocal(iso: string): string {
  const d = new Date(iso)
  // Use user locale, force 24h to match the brand's technical feel.
  const datePart = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const timePart = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // Timezone abbreviation (e.g. "EST", "GMT-5") when available.
  const tz =
    new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  return `${datePart} ${timePart}${tz ? ' ' + tz : ''}`
}

export function UpdatedTimestamp({ iso }: { iso: string }) {
  // Initial render uses a stable UTC fallback so the SSR HTML matches the
  // first client render (no hydration warning). useEffect then swaps in the
  // user's local time after mount.
  const [text, setText] = useState(
    () => new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  )

  useEffect(() => {
    setText(formatLocal(iso))
  }, [iso])

  return <span suppressHydrationWarning>{text}</span>
}
