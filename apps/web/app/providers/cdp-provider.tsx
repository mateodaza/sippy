'use client'

import { CDPHooksProvider } from '@coinbase/cdp-hooks'
import { ReactNode } from 'react'
import { getFreshToken } from '../../lib/auth'
import { getDefaultProviderType } from '../../lib/auth-mode'

const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

interface CDPProviderProps {
  children: ReactNode
}

const sharedConfig = {
  projectId: CDP_PROJECT_ID,
  ethereum: {
    createOnLogin: 'smart' as const,
    enableSpendPermissions: true,
  },
}

/**
 * CDP provider with custom JWT auth (Twilio flow).
 * Used for international (non-NANP) numbers when Twilio is enabled.
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
        ...sharedConfig,
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
 * CDP provider without customAuth (native SMS flow).
 * Default when Twilio is disabled — CDP sends SMS directly for all numbers.
 * Also used for NANP (+1) numbers when Twilio is enabled.
 */
export function CDPProviderNative({ children }: CDPProviderProps) {
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

  return <CDPHooksProvider config={sharedConfig}>{children}</CDPHooksProvider>
}

/**
 * @deprecated Use CDPProviderCustomAuth or CDPProviderNative instead.
 * Kept for backward compatibility during migration.
 */
export function CDPProvider({ children }: CDPProviderProps) {
  return <CDPProviderCustomAuth>{children}</CDPProviderCustomAuth>
}

/**
 * Default provider for returning-user pages (settings, wallet).
 * Picks CDPProviderNative when Twilio is disabled (default),
 * CDPProviderCustomAuth when Twilio is enabled.
 */
export function CDPProviderDefault({ children }: CDPProviderProps) {
  const providerType = getDefaultProviderType()
  return providerType === 'native' ? (
    <CDPProviderNative>{children}</CDPProviderNative>
  ) : (
    <CDPProviderCustomAuth>{children}</CDPProviderCustomAuth>
  )
}
