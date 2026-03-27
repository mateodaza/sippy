/**
 * Sippy network constants
 *
 * Single source of truth for contract addresses, token decimals, and chain IDs.
 * Import from @sippy/shared/constants in any workspace app.
 */

// Chain IDs
export const ARBITRUM_CHAIN_ID = 42161

// USDC on Arbitrum One
export const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
export const USDC_DECIMALS = 6

// USDC on other networks
export const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}

// GasRefuelV2 contract address is read from REFUEL_CONTRACT_ADDRESS env var.
// V1 was 0xE4e5474E97E89d990082505fC5708A6a11849936 (deprecated, open allowlist).

// Minimum ETH balance before a gas refuel is needed.
// Must cover a CDP UserOp (~0.000462 ETH on Arbitrum).
// Keep in sync with GasRefuelV2.sol on-chain params (minBalance & refuelAmount).
export const GAS_MIN_BALANCE_ETH = 0.0005
