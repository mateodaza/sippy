/**
 * USDC Transfer Helpers
 *
 * Shared encoding + gas utilities for sweep-to-EOA and /wallet send.
 * Uses ethers.js v5 (already in dependencies).
 */

import { ethers } from 'ethers';
import { USDC_ADDRESS, USDC_DECIMALS } from './constants';

const ERC20_INTERFACE = new ethers.utils.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

/**
 * Encode a USDC transfer(address,uint256) call.
 * Returns hex calldata for use in sendUserOperation calls[].
 */
export function encodeUsdcTransfer(
  to: string,
  amountUsdc: string
): `0x${string}` {
  const data = ERC20_INTERFACE.encodeFunctionData('transfer', [
    to,
    ethers.utils.parseUnits(amountUsdc, USDC_DECIMALS),
  ]);
  return data as `0x${string}`;
}

/**
 * One-shot gas check via /api/ensure-gas.
 * Retries up to maxRetries times with exponential backoff on network failure.
 * Throws with the backend error message on failure so callers can surface it.
 *
 * @param smartAccountAddress - If provided, refuels this address instead of the
 *   JWT wallet address. Required for UserOps (createSpendPermission, sendUserOperation)
 *   because the smart account pays gas, not the EOA.
 */
export async function ensureGasReady(
  backendUrl: string,
  accessToken: string,
  maxRetries = 2,
  smartAccountAddress?: string
): Promise<boolean> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${backendUrl}/api/ensure-gas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(smartAccountAddress && { smartAccountAddress }),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.ready === true) return true;

      // Backend returned ready: false with a reason
      lastError = result.error || 'Gas preparation failed';
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error';
      if (attempt < maxRetries) {
        // Exponential backoff: 3s, 6s
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw new Error(lastError || 'Unable to prepare wallet for transaction');
}

/**
 * Build the calls array for a USDC transfer UserOperation.
 */
export function buildUsdcTransferCall(to: string, amountUsdc: string) {
  return {
    to: USDC_ADDRESS as `0x${string}`,
    value: BigInt(0),
    data: encodeUsdcTransfer(to, amountUsdc),
  };
}
