import { createConfig, EVM, getQuote, executeRoute, convertQuoteToRoute, getStatus } from '@lifi/sdk';
import type { Route, QuoteRequest, StatusResponse } from '@lifi/sdk';
import { getWalletClient, switchChain } from '@wagmi/core';
import { wagmiConfig } from '@/app/providers/Web3Provider';

const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

let configured = false;

function ensureConfig() {
  if (configured) return;
  createConfig({
    integrator: 'sippy',
    providers: [
      EVM({
        getWalletClient: () => getWalletClient(wagmiConfig) as any,
        switchChain: async (chainId: number) => {
          const chain = await switchChain(wagmiConfig, { chainId });
          return getWalletClient(wagmiConfig, { chainId: chain.id }) as any;
        },
      }),
    ],
  });
  configured = true;
}

export interface SourceOption {
  chainId: number;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  { chainId: 42161, chainName: 'Arbitrum', tokenAddress: NATIVE_TOKEN, tokenSymbol: 'ETH', tokenDecimals: 18 },
  { chainId: 42161, chainName: 'Arbitrum', tokenAddress: USDC_ARBITRUM, tokenSymbol: 'USDC', tokenDecimals: 6 },
  { chainId: 1, chainName: 'Ethereum', tokenAddress: NATIVE_TOKEN, tokenSymbol: 'ETH', tokenDecimals: 18 },
  { chainId: 1, chainName: 'Ethereum', tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', tokenSymbol: 'USDC', tokenDecimals: 6 },
  { chainId: 8453, chainName: 'Base', tokenAddress: NATIVE_TOKEN, tokenSymbol: 'ETH', tokenDecimals: 18 },
  { chainId: 8453, chainName: 'Base', tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', tokenSymbol: 'USDC', tokenDecimals: 6 },
  { chainId: 10, chainName: 'Optimism', tokenAddress: NATIVE_TOKEN, tokenSymbol: 'ETH', tokenDecimals: 18 },
  { chainId: 10, chainName: 'Optimism', tokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', tokenSymbol: 'USDC', tokenDecimals: 6 },
  { chainId: 137, chainName: 'Polygon', tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', tokenSymbol: 'USDC', tokenDecimals: 6 },
];

export interface FundQuote {
  route: Route;
  estimatedOutput: string;
  estimatedFees: string;
  estimatedTime: number;
}

export async function getFundQuote(
  source: SourceOption,
  amount: string,
  fromAddress: string,
  toAddress: string,
): Promise<FundQuote> {
  ensureConfig();

  const amountWei = BigInt(
    Math.floor(parseFloat(amount) * 10 ** source.tokenDecimals)
  ).toString();

  const request: QuoteRequest = {
    fromChain: source.chainId,
    toChain: 42161,
    fromToken: source.tokenAddress,
    toToken: USDC_ARBITRUM,
    fromAmount: amountWei,
    fromAddress,
    toAddress,
  };

  const quote = await getQuote(request);
  const route = convertQuoteToRoute(quote);

  const outputUsdc = (Number(quote.estimate.toAmount) / 1e6).toFixed(2);

  const feesUsdc = quote.estimate.feeCosts
    ? quote.estimate.feeCosts.reduce(
        (sum, fee) => sum + Number(fee.amountUSD || 0),
        0
      ).toFixed(2)
    : '0.00';

  return {
    route,
    estimatedOutput: outputUsdc,
    estimatedFees: feesUsdc,
    estimatedTime: quote.estimate.executionDuration,
  };
}

export type RouteUpdateCallback = (route: Route) => void;

export async function executeFundRoute(
  route: Route,
  onUpdate?: RouteUpdateCallback,
): Promise<Route> {
  ensureConfig();
  return executeRoute(route, { updateRouteHook: onUpdate });
}

export async function checkFundStatus(
  txHash: string,
  fromChain: number,
  toChain: number,
  bridge: string,
): Promise<StatusResponse> {
  ensureConfig();
  return getStatus({ txHash, fromChain, toChain, bridge });
}
