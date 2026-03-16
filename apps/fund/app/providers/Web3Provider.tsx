'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { arbitrum, mainnet, optimism, base, polygon } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { useTheme } from 'next-themes';
import { ReactNode } from 'react';

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [arbitrum, mainnet, optimism, base, polygon],
    transports: {
      [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
      [mainnet.id]: http(),
      [optimism.id]: http(),
      [base.id]: http(),
      [polygon.id]: http(),
    },

    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',

    appName: 'Sippy - Fund My Phone',
    appDescription: 'Send USDC to phone numbers from any chain',
    appUrl: 'https://fund.sippy.lat',
    appIcon: 'https://www.sippy.lat/images/logos/sippy-s-mark-cheetah.svg',

    enableFamily: false,
    ssr: true,
  })
);

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const mode = (resolvedTheme as 'light' | 'dark') ?? 'light';

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          mode={mode}
          options={{
            hideNoWalletCTA: true,
            hideRecentBadge: true,
            hideQuestionMarkCTA: true,
            hideTooltips: false,
            walletConnectCTA: 'link',
          }}
          customTheme={{
            '--ck-font-family': 'system-ui, sans-serif',
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
