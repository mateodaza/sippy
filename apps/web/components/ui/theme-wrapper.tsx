'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider } from 'next-themes'

// Pay-QR defaults to dark (sheet is white, glare at night is rough) and
// keeps its own storage key so toggling here doesn't change the rest of
// the site. The landing + stats pages still follow system preference
// under the shared `sippy_theme` key.
type ThemeMode = 'pay-qr' | 'system-themed' | 'light-only'

function modeFor(pathname: string): ThemeMode {
  if (pathname === '/wallet/pay-qr') return 'pay-qr'
  if (pathname === '/' || pathname === '/stats') return 'system-themed'
  return 'light-only'
}

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const mode = modeFor(usePathname())

  if (mode === 'pay-qr') {
    return (
      <ThemeProvider
        key="pay-qr"
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="sippy_theme_pay_qr"
      >
        {children}
      </ThemeProvider>
    )
  }

  const themed = mode === 'system-themed'
  return (
    <ThemeProvider
      key={themed ? 'themed' : 'light'}
      attribute="class"
      defaultTheme={themed ? 'system' : 'light'}
      enableSystem={themed}
      forcedTheme={themed ? undefined : 'light'}
      storageKey="sippy_theme"
    >
      {children}
    </ThemeProvider>
  )
}
