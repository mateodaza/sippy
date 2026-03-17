'use client';

import { CDPHooksProvider } from '@coinbase/cdp-hooks';
import { ReactNode } from 'react';
import { getFreshToken } from '../../lib/auth';

const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || '';

interface CDPProviderProps {
  children: ReactNode;
}

const sharedConfig = {
  projectId: CDP_PROJECT_ID,
  ethereum: {
    createOnLogin: 'smart' as const,
    enableSpendPermissions: true,
  },
};

/**
 * CDP provider with custom JWT auth (Twilio flow).
 * Used for international numbers and all returning users.
 */
export function CDPProviderCustomAuth({ children }: CDPProviderProps) {
  if (!CDP_PROJECT_ID) {
    console.warn('CDP Project ID not configured. Embedded wallets will not work.');
    return <>{children}</>;
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
  );
}

/**
 * CDP provider without customAuth (native SMS flow).
 * Used for NANP (+1) numbers during initial setup — CDP sends SMS directly.
 */
export function CDPProviderNative({ children }: CDPProviderProps) {
  if (!CDP_PROJECT_ID) {
    console.warn('CDP Project ID not configured. Embedded wallets will not work.');
    return <>{children}</>;
  }

  return (
    <CDPHooksProvider
      config={sharedConfig}
    >
      {children}
    </CDPHooksProvider>
  );
}

/**
 * @deprecated Use CDPProviderCustomAuth or CDPProviderNative instead.
 * Kept for backward compatibility during migration.
 */
export function CDPProvider({ children }: CDPProviderProps) {
  return <CDPProviderCustomAuth>{children}</CDPProviderCustomAuth>;
}
