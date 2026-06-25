/**
 * Gas → AA (Phase 2 slice 1) — config, constants, and the shared nonce lock.
 *
 * Kept dependency-light so the flag check and constants can be imported on the
 * send hot path without pulling in viem / the submitter. Mirrors the
 * SEASON1_ENABLED guard style (string env, default OFF, only literal "true" on).
 */

import env from '#start/env'
import { NETWORK } from '#config/network'
import { arbitrum, arbitrumSepolia, base, baseSepolia, type Chain } from 'viem/chains'

// Master flag lives in its own viem-free module (flag.ts) for the hot path;
// re-exported here so the off-CDP stack has one import surface.
export { isGasAaEnabled } from '#services/gas_aa/flag'

/** EntryPoint v0.6 — the version Phase 1 proved + the CDP Coinbase Smart Wallet targets. */
export const ENTRY_POINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

/** SpendPermissionManager (same address on every supported network). */
export const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad'

/** The lanes this slice serves. Free-send (spender) is the only one wired now. */
export type Lane = 'free_send'

/**
 * Map the app's NETWORK string (CDP-style: 'arbitrum', 'arbitrum-sepolia', …)
 * to the numeric chain id + the viem chain object the off-CDP stack needs.
 * Staging runs on arbitrum-sepolia (free Pimlico sponsorship); prod on arbitrum.
 */
const CHAINS: Record<string, { chainId: number; chain: Chain }> = {
  'arbitrum': { chainId: 42161, chain: arbitrum },
  'arbitrum-sepolia': { chainId: 421614, chain: arbitrumSepolia },
  'base': { chainId: 8453, chain: base },
  'base-sepolia': { chainId: 84532, chain: baseSepolia },
}

function chainEntry(): { chainId: number; chain: Chain } {
  const entry = CHAINS[NETWORK]
  if (!entry) throw new Error(`gas_aa: unsupported NETWORK '${NETWORK}' (no chain id mapping)`)
  return entry
}

export function getChainId(): number {
  return chainEntry().chainId
}

export function getViemChain(): Chain {
  return chainEntry().chain
}

/** Pimlico bundler+paymaster RPC URL for the current chain. */
export function getPimlicoUrl(): string {
  const apiKey = env.get('PIMLICO_API_KEY', '')
  if (!apiKey) throw new Error('gas_aa: PIMLICO_API_KEY not set')
  return `https://api.pimlico.io/v2/${getChainId()}/rpc?apikey=${apiKey}`
}

/**
 * The Pimlico sponsorship policy id, passed in the paymaster context so the
 * dashboard caps (per-account/day + global budget) apply and our webhook is
 * invoked. Never sponsor with an empty context.
 */
export function getSponsorshipPolicyId(): string {
  const id = env.get('PIMLICO_SPONSORSHIP_POLICY_ID', '')
  if (!id) throw new Error('gas_aa: PIMLICO_SPONSORSHIP_POLICY_ID not set')
  return id
}

// ── Per-(chain_id, entry_point, sender) nonce lock (P1) ──────────────────────
//
// The spender is a SHARED backend account: two concurrent free-sends could
// resolve the same current nonce and collide. The submitter holds this lock
// across the whole critical section (resolve nonce → write prepared row → sign
// → submit) so nonce allocation is serialised in-process. The DB partial-unique
// index on active rows is the backstop if two processes ever race.

const nonceTails = new Map<string, Promise<unknown>>()

export function nonceLockKey(chainId: number, entryPoint: string, sender: string): string {
  return `${chainId}:${entryPoint.toLowerCase()}:${sender.toLowerCase()}`
}

/**
 * Run `fn` while holding the lock for `key`. Calls on the same key run strictly
 * one-at-a-time (FIFO); different keys never block each other. The lock is
 * released whether `fn` resolves or throws, and `fn`'s own result/error is
 * propagated to the caller untouched.
 */
export async function withNonceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = nonceTails.get(key) ?? Promise.resolve()
  // fn runs after the prior holder settles — `.then(fn, fn)` so a prior failure
  // can't strand our turn. `result` carries fn's real outcome to our caller.
  const result = prior.then(fn, fn)
  // The chain tail the next waiter blocks on: result coerced to non-throwing void.
  const tail = result.then(
    () => {},
    () => {}
  )
  nonceTails.set(key, tail)
  // GC: once our tail settles, drop the entry if nobody queued behind us.
  void tail.then(() => {
    if (nonceTails.get(key) === tail) nonceTails.delete(key)
  })
  return result
}
