'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider } from 'next-themes'

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const supportsTheme = pathname === '/' || pathname === '/stats'

  return (
    <ThemeProvider
      key={supportsTheme ? 'themed' : 'light'}
      attribute="class"
      defaultTheme={supportsTheme ? 'system' : 'light'}
      enableSystem={supportsTheme}
      forcedTheme={supportsTheme ? undefined : 'light'}
      storageKey="sippy_theme"
    >
      {children}
    </ThemeProvider>
  )
}
