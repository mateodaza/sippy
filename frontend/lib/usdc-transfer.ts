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
 * Returns true if wallet has gas, false otherwise.
 */
export async function ensureGasReady(
  backendUrl: string,
  accessToken: string,
  maxRetries = 2
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${backendUrl}/api/ensure-gas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.ready === true;
    } catch (err) {
      if (attempt < maxRetries) {
        // Exponential backoff: 3s, 6s
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      console.error('ensureGasReady failed after retries:', err);
      return false;
    }
  }
  return false;
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
