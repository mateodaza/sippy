/**
 * Network Configuration
 *
 * Central config for network settings, token addresses, and Sippy's spender wallet.
 * All values are env-driven for easy deployment changes.
 */

import env from '#start/env'

// Network to use for all operations
export const NETWORK = env.get('SIPPY_NETWORK', 'arbitrum')

// USDC addresses by network. Testnets included so the Gas → AA staging lane
// (SIPPY_NETWORK=arbitrum-sepolia) resolves a USDC address instead of throwing;
// all are Circle's official deployments.
export const USDC_ADDRESSES: Record<string, string> = {
  'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
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

// RPC URLs by network. Testnets included for the Gas → AA staging lane; each
// MUST point at the matching chain — a mismatch (e.g. an Arbitrum-mainnet RPC
// for arbitrum-sepolia) corrupts nonce/account reads.
export const RPC_URLS: Record<string, string> = {
  'arbitrum': env.get('ARBITRUM_RPC_URL', 'https://arb1.arbitrum.io/rpc'),
  'base': env.get('BASE_RPC_URL', 'https://mainnet.base.org'),
  'arbitrum-sepolia': env.get('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc'),
  'base-sepolia': env.get('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org'),
}

// Get RPC URL for current network. Fails closed — never silently fall back to a
// mainnet RPC for an unmapped network (that would give viem a sepolia chain
// object with a mainnet transport).
export function getRpcUrl(): string {
  const url = RPC_URLS[NETWORK]
  if (!url) {
    throw new Error(`No RPC URL configured for network: ${NETWORK}`)
  }
  return url
}
