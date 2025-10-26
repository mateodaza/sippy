import { NexusSDK } from '@avail-project/nexus-core';

export interface BridgeParams {
  fromChainId?: number; // Optional - will auto-detect from connected wallet if not provided
  toChainId: number;
  token: string;
  amount: string;
  toAddress?: string;
}

export interface BridgeResult {
  success: boolean;
  error?: string;
  transactionHash?: string;
}

export interface ChainInfo {
  id: number;
  name: string;
  logo: string;
  tokens: any[];
}

/**
 * Get supported chains from Nexus SDK
 */
export function getSupportedChains(sdk: NexusSDK | undefined): ChainInfo[] {
  if (!sdk) return [];
  try {
    const chains = sdk.utils.getSupportedChains();
    return Array.isArray(chains) ? chains : [];
  } catch (error) {
    console.error('Failed to get supported chains:', error);
    return [];
  }
}

/**
 * Get chain name by ID
 */
export function getChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    137: 'Polygon',
    8453: 'Base',
    42161: 'Arbitrum',
    // Add more chains as needed
  };
  return chainNames[chainId] || `Chain ${chainId}`;
}

/**
 * Bridge ETH to Arbitrum (to a specific recipient address)
 * Uses transfer() which automatically bridges if needed
 */
export async function bridgeEthToArbitrum(
  sdk: NexusSDK,
  params: BridgeParams
): Promise<BridgeResult> {
  try {
    console.log('Starting transfer transaction:', params);

    // If toAddress is provided, use transfer() which auto-detects source chain and bridges if needed
    // If not provided, use bridge() which requires explicit source chain
    const result = params.toAddress
      ? await sdk.transfer({
          token: params.token as any,
          amount: params.amount,
          chainId: params.toChainId as any, // Destination chain - SDK auto-finds funds
          recipient: params.toAddress as `0x${string}`,
        })
      : await sdk.bridge({
          chainId: params.fromChainId as any, // Source chain - must be provided for bridge()
          token: params.token as any,
          amount: params.amount,
        });

    if (!result?.success) {
      return {
        success: false,
        error: result.error || 'Transaction failed',
      };
    }

    return {
      success: true,
      transactionHash: result.transactionHash,
    };
  } catch (error) {
    console.error('Transaction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Simulate bridge transaction
 */
export async function simulateBridge(
  sdk: NexusSDK,
  params: BridgeParams
): Promise<any> {
  try {
    const simulation = await sdk.simulateBridge({
      chainId: params.fromChainId as any, // Source chain for simulation
      token: params.token as any,
      amount: params.amount,
    });
    return simulation;
  } catch (error) {
    console.error('Simulation failed:', error);
    return null;
  }
}
