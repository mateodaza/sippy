import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from './i18n'

// Regression: formatRelativeTime takes MILLISECONDS (matching NormalizedTransaction.timestamp
// and blockscout.ts). A stray `* 1000` made it expect seconds, so ms timestamps went far into
// the future → negative diff → every /wallet row rendered "Just now".
describe('formatRelativeTime (milliseconds in)', () => {
  const now = Date.now()

  it('a few seconds ago → "Just now"', () => {
    expect(formatRelativeTime(now - 5_000, 'en')).toBe('Just now')
  })

  it('minutes ago is NOT "Just now" (the bug)', () => {
    const out = formatRelativeTime(now - 10 * 60_000, 'en')
    expect(out).not.toBe('Just now')
    expect(out).toBe('10m ago')
  })

  it('hours ago → "Nh ago"', () => {
    expect(formatRelativeTime(now - (3 * 3_600_000 + 60_000), 'en')).toBe('3h ago')
  })

  it('days ago → "Nd ago"', () => {
    expect(formatRelativeTime(now - (2 * 86_400_000 + 3_600_000), 'en')).toBe('2d ago')
  })

  it('localizes (es) — minutes ago is not the Spanish "just now"', () => {
    expect(formatRelativeTime(now - 10 * 60_000, 'es')).not.toBe('Ahora mismo')
  })
})
