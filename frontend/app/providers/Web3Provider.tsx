'use client';

import { WagmiProvider, createConfig, http, useAccount } from 'wagmi';
import { arbitrum, mainnet, optimism, base, polygon } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { ReactNode, useState, useEffect } from 'react';
import { NexusProvider } from './NexusProvider';

const config = createConfig(
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

    // App info
    appName: 'SIPPY - Fund My Phone',
    appDescription: 'Send ETH to phone numbers via cross-chain bridge',
    appUrl: 'https://sippy.app',
    appIcon: 'https://sippy.app/icon.png',

    enableFamily: false,
  })
);

const queryClient = new QueryClient();

function InternalProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const { isConnected: accountConnected } = useAccount();

  useEffect(() => {
    setIsConnected(accountConnected);
  }, [accountConnected]);

  return (
    <ConnectKitProvider
      options={{
        hideNoWalletCTA: true, // Hide "I don't have a wallet" link
        hideRecentBadge: true, // Hide "recent" badge
        hideQuestionMarkCTA: true, // Hide help button
        hideTooltips: false, // Keep tooltips for guidance
        walletConnectCTA: 'link', // Make WalletConnect less prominent (link instead of button)
      }}
      customTheme={{
        '--ck-font-family': 'system-ui, sans-serif',
      }}
    >
      <NexusProvider isConnected={isConnected}>{children}</NexusProvider>
    </ConnectKitProvider>
  );
}

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <InternalProvider>{children}</InternalProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
