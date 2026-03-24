'use client'

import { CDPHooksProvider } from '@coinbase/cdp-hooks'
import { ReactNode } from 'react'
import { getFreshToken } from '../../lib/auth'

const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

interface CDPProviderProps {
  children: ReactNode
}

/**
 * CDP provider with Sippy JWT auth.
 * All users authenticate via Sippy OTP → JWT → authenticateWithJWT().
 */
export function CDPProviderCustomAuth({ children }: CDPProviderProps) {
  if (!CDP_PROJECT_ID) {
    console.error('CDP_PROJECT_ID is not set. Wallet functionality is unavailable.')
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="text-red-600 text-center">
          Wallet setup is temporarily unavailable. Please try again later.
        </div>
      </div>
    )
  }

  return (
    <CDPHooksProvider
      config={{
        projectId: CDP_PROJECT_ID,
        ethereum: {
          createOnLogin: 'smart' as const,
          enableSpendPermissions: true,
        },
        customAuth: {
          getJwt: async () => getFreshToken() ?? undefined,
        },
      }}
    >
      {children}
    </CDPHooksProvider>
  )
}

/**
 * Default provider for returning-user pages (settings, wallet).
 */
export function CDPProviderDefault({ children }: CDPProviderProps) {
  return <CDPProviderCustomAuth>{children}</CDPProviderCustomAuth>
}
