/**
 * Blockscout API v2 Client for Arbitrum One
 * Fetches balances, transactions, and token transfers
 */

import { ethers } from 'ethers';

const BLOCKSCOUT_BASE_URL =
  process.env.NEXT_PUBLIC_BLOCKSCOUT_BASE_URL ||
  'https://arbitrum.blockscout.com/api/v2';
const BLOCKSCOUT_API_KEY = process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY || '';

const PYUSD_ADDRESS = '0x46850aD61C2B7d64d08c9C754F45254596696984';
const CHAIN_ID = 42161; // Arbitrum One

export interface NormalizedTransaction {
  hash: string;
  direction?: 'sent' | 'received'; // Optional when viewer context is unknown
  token: 'ETH' | 'PYUSD';
  amount: string;
  timestamp: number;
  counterparty: string;
  status: 'success' | 'pending' | 'failed';
}

export interface Balance {
  eth: string;
  pyusd: string;
}

interface BlockscoutTransaction {
  hash: string;
  from: { hash: string };
  to: { hash: string } | null;
  value: string;
  timestamp: string;
  status: string;
  tx_types?: string[];
}

interface BlockscoutTokenTransfer {
  transaction_hash: string;
  from: { hash: string };
  to: { hash: string };
  total: { value: string; decimals: string };
  timestamp: string;
  token: {
    address?: string;
    address_hash?: string;
    symbol: string;
    decimals: string;
  };
}

/**
 * Build API URL with optional API key
 */
function buildUrl(endpoint: string): string {
  const url = `${BLOCKSCOUT_BASE_URL}${endpoint}`;
  if (BLOCKSCOUT_API_KEY) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}apikey=${BLOCKSCOUT_API_KEY}`;
  }
  return url;
}

/**
 * Fetch with retry logic and AbortController
 */
async function fetchWithRetry(
  url: string,
  retries = 2,
  timeout = 10000
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        // Rate limited, retry after delay
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return fetchWithRetry(url, retries - 1, timeout);
      }
      // Log the URL for debugging
      console.error(`Blockscout API error: ${response.status} for URL: ${url}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    if (retries > 0 && !error.message?.includes('HTTP')) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchWithRetry(url, retries - 1, timeout);
    }
    throw error;
  }
}

/**
 * Get native ETH balance for an address
 */
export async function getNativeBalance(address: string): Promise<string> {
  try {
    const url = buildUrl(`/addresses/${address}`);
    const data = await fetchWithRetry(url);

    if (data?.coin_balance) {
      return ethers.utils.formatEther(data.coin_balance);
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch native balance:', error);
    return '0';
  }
}

/**
 * Get ERC-20 token balance for an address
 */
export async function getErc20Balance(
  address: string,
  tokenAddress: string,
  decimals: number
): Promise<string> {
  try {
    // Get all token balances and find the specific token
    const url = buildUrl(`/addresses/${address}/token-balances`);
    const data = await fetchWithRetry(url);

    if (Array.isArray(data) && data.length > 0) {
      // Find the token by address (case-insensitive)
      const tokenLower = tokenAddress.toLowerCase();
      const tokenBalance = data.find(
        (item: any) =>
          item.token?.address_hash?.toLowerCase() === tokenLower ||
          item.token?.address?.toLowerCase() === tokenLower
      );

      if (tokenBalance && tokenBalance.value) {
        return ethers.utils.formatUnits(tokenBalance.value, decimals);
      }
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch ERC-20 balance:', error);
    return '0';
  }
}

/**
 * Get balances for ETH and PYUSD
 */
export async function getBalances(address: string): Promise<Balance> {
  const [eth, pyusd] = await Promise.all([
    getNativeBalance(address),
    getErc20Balance(address, PYUSD_ADDRESS, 6),
  ]);

  return { eth, pyusd };
}

/**
 * Get native ETH transfers for an address
 */
export async function getEthTransfers(
  address: string,
  limit = 10
): Promise<NormalizedTransaction[]> {
  try {
    // Blockscout v2 API doesn't need filter parameter - it returns all transactions by default
    const url = buildUrl(`/addresses/${address}/transactions`);
    const data = await fetchWithRetry(url);

    if (!data?.items || !Array.isArray(data.items)) {
      return [];
    }

    const transactions: NormalizedTransaction[] = [];
    const addressLower = address.toLowerCase();

    for (const tx of data.items.slice(0, limit)) {
      const fromAddress = tx.from?.hash?.toLowerCase() || '';
      const toAddress = tx.to?.hash?.toLowerCase() || '';

      // Skip if value is 0 or null
      if (!tx.value || tx.value === '0') continue;

      const isSent = fromAddress === addressLower;
      const counterparty = isSent ? toAddress : fromAddress;

      transactions.push({
        hash: tx.hash,
        direction: isSent ? 'sent' : 'received',
        token: 'ETH',
        amount: ethers.utils.formatEther(tx.value),
        timestamp: new Date(tx.timestamp).getTime(),
        counterparty,
        status:
          tx.status === 'ok'
            ? 'success'
            : tx.status === 'pending'
            ? 'pending'
            : 'failed',
      });
    }

    return transactions;
  } catch (error) {
    console.error('Failed to fetch ETH transfers:', error);
    return [];
  }
}

/**
 * Get ERC-20 token transfers for an address
 */
export async function getErc20Transfers(
  address: string,
  tokenAddress: string,
  limit = 10
): Promise<NormalizedTransaction[]> {
  try {
    const url = buildUrl(
      `/addresses/${address}/token-transfers?token=${tokenAddress}&type=ERC-20`
    );
    const data = await fetchWithRetry(url);

    if (!data?.items || !Array.isArray(data.items)) {
      return [];
    }

    const transactions: NormalizedTransaction[] = [];
    const addressLower = address.toLowerCase();

    for (const transfer of data.items.slice(0, limit)) {
      const fromAddress = transfer.from?.hash?.toLowerCase() || '';
      const toAddress = transfer.to?.hash?.toLowerCase() || '';

      const isSent = fromAddress === addressLower;
      const counterparty = isSent ? toAddress : fromAddress;

      const decimals = parseInt(transfer.token?.decimals || '6', 10);
      const amount = ethers.utils.formatUnits(
        transfer.total?.value || '0',
        decimals
      );

      transactions.push({
        hash: transfer.transaction_hash,
        direction: isSent ? 'sent' : 'received',
        token: 'PYUSD',
        amount,
        timestamp: new Date(transfer.timestamp).getTime(),
        counterparty,
        status: 'success', // Token transfers are only indexed if confirmed
      });
    }

    return transactions;
  } catch (error) {
    console.error('Failed to fetch ERC-20 transfers:', error);
    return [];
  }
}

/**
 * Get combined activity (ETH + PYUSD transfers) sorted by timestamp
 */
export async function getActivity(
  address: string,
  limit = 10
): Promise<NormalizedTransaction[]> {
  const [ethTransfers, pyusdTransfers] = await Promise.all([
    getEthTransfers(address, limit),
    getErc20Transfers(address, PYUSD_ADDRESS, limit),
  ]);

  const combined = [...ethTransfers, ...pyusdTransfers];
  combined.sort((a, b) => b.timestamp - a.timestamp);

  return combined.slice(0, limit);
}

/**
 * Get transaction details by hash
 */
export async function getTransactionByHash(
  txHash: string
): Promise<NormalizedTransaction | null> {
  try {
    const url = buildUrl(`/transactions/${txHash}`);
    const tx = await fetchWithRetry(url);

    if (!tx) return null;

    // Check if it's a token transfer
    const tokenTransfers = tx.token_transfers || [];
    const pyusdTransfer = tokenTransfers.find(
      (t: any) =>
        t.token?.address_hash?.toLowerCase() === PYUSD_ADDRESS.toLowerCase() ||
        t.token?.address?.toLowerCase() === PYUSD_ADDRESS.toLowerCase()
    );

    if (pyusdTransfer) {
      // PYUSD transfer
      const fromAddress = pyusdTransfer.from?.hash?.toLowerCase() || '';
      const toAddress = pyusdTransfer.to?.hash?.toLowerCase() || '';
      const decimals = parseInt(pyusdTransfer.token?.decimals || '6', 10);
      const amount = ethers.utils.formatUnits(
        pyusdTransfer.total?.value || '0',
        decimals
      );

      return {
        hash: tx.hash,
        direction: undefined, // No viewer context available
        token: 'PYUSD',
        amount,
        timestamp: new Date(tx.timestamp).getTime(),
        counterparty: toAddress,
        status:
          tx.status === 'ok'
            ? 'success'
            : tx.status === 'pending'
            ? 'pending'
            : 'failed',
      };
    } else {
      // Native ETH transfer
      const fromAddress = tx.from?.hash?.toLowerCase() || '';
      const toAddress = tx.to?.hash?.toLowerCase() || '';
      const amount = ethers.utils.formatEther(tx.value || '0');

      return {
        hash: tx.hash,
        direction: undefined, // No viewer context available
        token: 'ETH',
        amount,
        timestamp: new Date(tx.timestamp).getTime(),
        counterparty: toAddress,
        status:
          tx.status === 'ok'
            ? 'success'
            : tx.status === 'pending'
            ? 'pending'
            : 'failed',
      };
    }
  } catch (error) {
    console.error('Failed to fetch transaction by hash:', error);
    return null;
  }
}

/**
 * Format relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format address to short form (0x1234...5678)
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get Blockscout explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string): string {
  return `https://arbitrum.blockscout.com/tx/${txHash}`;
}

/**
 * Get Blockscout explorer URL for an address
 */
export function getExplorerAddressUrl(address: string): string {
  return `https://arbitrum.blockscout.com/address/${address}`;
}
