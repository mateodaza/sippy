/**
 * Network Configuration
 *
 * Central config for network settings, token addresses, and Sippy's spender wallet.
 * All values are env-driven for easy deployment changes.
 */

import env from '#start/env'

// Network to use for all operations
export const NETWORK = env.get('SIPPY_NETWORK', 'arbitrum')

// USDC addresses by network
export const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}

// Get USDC address for current network
export function getUsdcAddress(): string {
  const address = USDC_ADDRESSES[NETWORK]
  if (!address) {
    throw new Error(`No USDC address configured for network: ${NETWORK}`)
  }
  return address
}

// Sippy's spender wallet address (receives spend permissions from users)
export const SIPPY_SPENDER_ADDRESS = env.get('SIPPY_SPENDER_ADDRESS', '')

// USDC decimals (same across all networks)
export const USDC_DECIMALS = 6

// RPC URLs by network
export const RPC_URLS: Record<string, string> = {
  arbitrum: env.get('ARBITRUM_RPC_URL', 'https://arb1.arbitrum.io/rpc'),
  base: env.get('BASE_RPC_URL', 'https://mainnet.base.org'),
}

// Get RPC URL for current network
export function getRpcUrl(): string {
  return RPC_URLS[NETWORK] || 'https://arb1.arbitrum.io/rpc'
}
