'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  return (
    <ThemeProvider
      attribute='class'
      defaultTheme='light'
      storageKey='sippy_theme'
      forcedTheme={isLanding ? undefined : 'light'}
    >
      {children}
    </ThemeProvider>
  );
}
