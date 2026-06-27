/**
 * Spend-permission lookup for /api/register-permission (A3).
 *
 * Finding the just-created permission via `listSpendPermissions` is racy: CDP's
 * indexer can lag behind the on-chain grant by several seconds (F3/F4), so a
 * single read often misses a permission that DID land. This module centralises:
 *
 *   • the spender+token+network filter (which permissions are "ours"),
 *   • the specific-allowance match (the tier the user just requested), and
 *   • a bounded backoff that rides out indexing lag for a just-created grant —
 *     always targeting the SPECIFIC allowance, never the most-recent fallback
 *     (which could adopt a different/wrong permission).
 *
 * Adopt-existing (no specific allowance to wait for) does a single read and takes
 * the most-recent match — there's nothing freshly-granted to wait for.
 *
 * Pure + dependency-injected (`listFn`, `sleep`) so the backoff is unit-testable
 * without CDP or real timers.
 */

import { ethers } from 'ethers'

export interface RawSpendPermission {
  permissionHash: string
  network: string
  permission: {
    spender: string
    token: string
    allowance: bigint | string
    start: number
    [key: string]: unknown
  }
}

export interface FindPermissionOptions {
  /** Address-bound `listSpendPermissions` reader; invoked once per attempt. */
  listFn: () => Promise<RawSpendPermission[]>
  spender: string
  token: string
  network: string
  /**
   * The USD allowance the caller just requested (e.g. 50). `null` means
   * adopt-existing: no specific permission to wait for → single read,
   * most-recent match.
   */
  requestedAllowance: number | null
  decimals: number
  /** Total attempts. 1 = single read (no backoff). */
  attempts: number
  /** Delay between attempts; grows linearly (baseDelayMs * attemptIndex). */
  baseDelayMs: number
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>
  /** Optional per-attempt observer for logging. */
  onAttempt?: (info: { attempt: number; matched: boolean; matchingCount: number }) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const byStartDesc = (a: RawSpendPermission, b: RawSpendPermission): number =>
  Number(b.permission?.start || 0) - Number(a.permission?.start || 0)

/** Permissions matching Sippy's spender + the USDC token + the active network. */
export function filterSippyPermissions(
  perms: RawSpendPermission[],
  opts: { spender: string; token: string; network: string }
): RawSpendPermission[] {
  return perms.filter(
    (p) =>
      p.permission?.spender?.toLowerCase() === opts.spender.toLowerCase() &&
      p.permission?.token?.toLowerCase() === opts.token.toLowerCase() &&
      p.network === opts.network
  )
}

/** Of the matching permissions, those whose allowance equals the requested tier. */
export function findAllowanceMatches(
  perms: RawSpendPermission[],
  requestedAllowance: number,
  decimals: number
): RawSpendPermission[] {
  return perms.filter((p) => {
    const allowance = Number.parseFloat(ethers.utils.formatUnits(p.permission.allowance, decimals))
    return Math.abs(allowance - requestedAllowance) < 0.01
  })
}

/** Most-recent permission by `start` (used only for the no-target adopt path). */
export function pickMostRecent(perms: RawSpendPermission[]): RawSpendPermission | null {
  if (perms.length === 0) return null
  return [...perms].sort(byStartDesc)[0]
}

/**
 * Resolve the permission to register, riding out listSpendPermissions indexing lag.
 *
 * With a specific `requestedAllowance` (post-grant or specific-tier adopt): each
 * attempt lists → filters spender/token/network → matches the SPECIFIC allowance,
 * backing off (increasing delay) up to `attempts` times until it indexes. It never
 * falls back to the most-recent permission, so it can't register the wrong one.
 *
 * With `requestedAllowance === null` (adopt-existing, no target): one read, take
 * the most-recent matching permission. No backoff — nothing specific to wait for.
 *
 * Returns the selected permission, or `null` if none is found after all attempts.
 */
export async function findPermissionForRegistration(
  opts: FindPermissionOptions
): Promise<RawSpendPermission | null> {
  const sleep = opts.sleep ?? defaultSleep
  const totalAttempts = Math.max(1, opts.attempts)

  if (opts.requestedAllowance === null) {
    const matching = filterSippyPermissions(await opts.listFn(), opts)
    opts.onAttempt?.({ attempt: 1, matched: matching.length > 0, matchingCount: matching.length })
    return pickMostRecent(matching)
  }

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const matching = filterSippyPermissions(await opts.listFn(), opts)
    const allowanceMatches = findAllowanceMatches(matching, opts.requestedAllowance, opts.decimals)
    opts.onAttempt?.({
      attempt,
      matched: allowanceMatches.length > 0,
      matchingCount: matching.length,
    })
    if (allowanceMatches.length > 0) {
      // Break ties on the specific-allowance set by most-recent start.
      return [...allowanceMatches].sort(byStartDesc)[0]
    }
    if (attempt < totalAttempts) {
      await sleep(opts.baseDelayMs * attempt)
    }
  }
  return null
}
