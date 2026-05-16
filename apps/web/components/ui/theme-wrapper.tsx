'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider } from 'next-themes'

// Receive-money surfaces (pay-qr + the public /q scan landing) default to
// dark — sheet is white, glare at night is rough. Pay-qr uses its own
// storage key so its toggle doesn't bleed into the rest of the site; /q
// is forced dark with no toggle (server-rendered, single-purpose).
type ThemeMode = 'pay-qr' | 'q-scan' | 'system-themed' | 'light-only'

function modeFor(pathname: string): ThemeMode {
  if (pathname === '/wallet/pay-qr') return 'pay-qr'
  if (pathname.startsWith('/q/')) return 'q-scan'
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

  if (mode === 'q-scan') {
    return (
      <ThemeProvider key="q-scan" attribute="class" forcedTheme="dark" enableSystem={false}>
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
