/**
 * Gas → AA Track B (B1.1d) — sponsored-onboarding `/prepare` orchestration.
 *
 * The money-path glue in front of `prepareSetupOp` (B1.1b). All security-bearing
 * fields are server-built; the request carries only PROOFS, never a trusted address:
 *   • the Sippy JWT → `phoneNumber` + `walletAddress` (phone_registry), and
 *   • a CDP access token → the authoritative owner EOA, via CDP `validateAccessToken`
 *     (O(1), token-scoped, throws on an invalid token — NOT a `listEndUsers` scan).
 *
 * The two proofs are cross-bound (the CDP token's smart account MUST equal the JWT's
 * walletAddress), so a valid CDP token for a DIFFERENT user can't prepare an op against
 * this account. The owner EOA then derives the account (convergence) — a hard
 * correctness precondition, since EntryPoint rejects any op whose `sender` !=
 * initCode-derived address. Adopt-first completes onboarding for an already-granted
 * permission rather than sponsoring a duplicate. Every address compare lowercases both
 * sides (A6 casing — a checksum skew would false-409 a real signup).
 *
 * Deps are injectable so the binding/adopt/convergence logic is unit-testable without
 * CDP or a DB (mirrors setup_submitter's pattern).
 */

import crypto from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import { CdpClient } from '@coinbase/cdp-sdk'
import { createPublicClient, http, getAddress, parseUnits, formatUnits } from 'viem'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { getRpcUrl, NETWORK, USDC_ADDRESSES, USDC_DECIMALS } from '#config/network'
import {
  SPEND_PERMISSION_MANAGER,
  ENTRY_POINT_V06,
  getChainId,
  getViemChain,
} from '#services/gas_aa/config'
import {
  prepareSetupOp,
  type PrepareSetupRequest,
  type PrepareSetupOutcome,
} from '#services/gas_aa/setup_submitter'
import { findInFlightSetupOp } from '#services/gas_aa/ledger'
import type { RawPermission } from '#services/gas_aa/decode'
import {
  findPermissionForRegistration,
  type RawSpendPermission,
} from '#services/spend_permission_lookup'
import { getSippySpenderAccount } from '#services/embedded_wallet.service'
import { getSecurityLimitStatus } from '#services/cdp_wallet.service'
import { findUserPrefByPhone } from '#utils/user_pref_lookup'
import { notifySetupCompleted } from '#services/notification.service'
import { query, getUserLanguage } from '#services/db'
import { maskPhone, getLanguageForPhone } from '#utils/phone'

const MAX_UINT48 = 281474976710655 // permission.end — effectively non-expiring
const PERMISSION_PERIOD_SECONDS = 86400 // daily window

// ── Public request/outcome shapes ────────────────────────────────────────────

export interface PrepareOnboardRequest {
  /** From the Sippy JWT (phone_registry). */
  phoneNumber: string
  walletAddress: string
  /** From the browser body — the user's CDP session token (proof of the owner EOA). */
  cdpAccessToken: string
}

export type PrepareOnboardOutcome =
  | { kind: 'prepared'; opId: string; unsignedUserOp: Record<string, unknown>; userOpHash: string }
  /** A valid on-chain permission already existed — adopted + onboarding completed. */
  | { kind: 'alreadyGranted'; permissionHash: string }
  /** A prior sponsored op is already broadcasting (`prepared`) for this user — the frontend
   *  must wait (NOT run legacy: that would duplicate the approve the in-flight op is landing). */
  | { kind: 'processing' }
  /** Pre-broadcast sponsorship failure — the frontend runs legacy GasRefuel onboarding. */
  | { kind: 'fallback'; reason: string }
  /** A hard rejection mapped straight to an HTTP status (401/403/409). */
  | { kind: 'error'; status: number; reason: string }

// ── Injectable dependencies (real impls + tests) ─────────────────────────────

export interface OnboardPrepareDeps {
  /** Validate the CDP token server-side → the authoritative owner EOA + smart account.
   *  THROWS on an invalid/expired token (caller maps to 401). */
  resolveCdpUser(accessToken: string): Promise<{ userEoa: string; smartAccount: string }>
  isTosAccepted(phoneNumber: string): Promise<boolean>
  /** Adopt an already-granted on-chain permission (sets phone_registry.spend_permission_hash). */
  adoptExisting(args: {
    phoneNumber: string
    walletAddress: string
  }): Promise<{ adopted: true; permissionHash: string } | { adopted: false }>
  /** Is a prior sponsored op already `prepared` (broadcasting) for this account? */
  hasInFlightOp(walletAddress: string): Promise<boolean>
  /** Our own derivation of the smart account from [userEoa, SPM] — the convergence check. */
  deriveSmartAccount(userEoa: string): Promise<string>
  /** Build the tier-capped SpendPermission to grant. */
  buildPermission(args: { walletAddress: string; phoneNumber: string }): Promise<RawPermission>
  prepare(req: PrepareSetupRequest): Promise<PrepareSetupOutcome>
}

let deps: OnboardPrepareDeps = makeDefaultOnboardDeps()
export function __setOnboardDepsForTest(partial: Partial<OnboardPrepareDeps>): void {
  deps = { ...deps, ...partial }
}
export function __resetOnboardDeps(): void {
  deps = makeDefaultOnboardDeps()
}

/**
 * Orchestrate `/prepare`. Order is deliberate: validate + cross-bind the two proofs
 * FIRST (reject invalid/cross-user tokens before any DB work), then ToS, then
 * adopt-first (short-circuits a duplicate), then convergence, then build + sponsor.
 */
export async function prepareOnboard(req: PrepareOnboardRequest): Promise<PrepareOnboardOutcome> {
  // 1. Resolve the owner EOA from the CDP token (authoritative; throws ⇒ 401).
  let cdp: { userEoa: string; smartAccount: string }
  try {
    cdp = await deps.resolveCdpUser(req.cdpAccessToken)
  } catch (e) {
    logger.warn(
      `gas_aa onboard: CDP token validation failed: ${e instanceof Error ? e.message : e}`
    )
    return { kind: 'error', status: 401, reason: 'invalid or expired CDP access token' }
  }
  if (!cdp.userEoa || !cdp.smartAccount) {
    return { kind: 'error', status: 401, reason: 'CDP token has no associated wallet' }
  }

  // 2. Cross-bind the CDP session to the Sippy session: the token's smart account MUST
  //    be the JWT-authenticated wallet (else a valid token for another user could
  //    prepare an op against this account). lower() both — both are checksummed.
  if (cdp.smartAccount.toLowerCase() !== req.walletAddress.toLowerCase()) {
    logger.warn(
      `gas_aa onboard: CDP smart account ${cdp.smartAccount} != JWT wallet for ${maskPhone(req.phoneNumber)}`
    )
    return { kind: 'error', status: 409, reason: 'CDP session does not match this account' }
  }

  // 3. ToS gate — a permission must never be prepared before the user accepts ToS.
  if (!(await deps.isTosAccepted(req.phoneNumber))) {
    return { kind: 'error', status: 403, reason: 'tos_required' }
  }

  // 4. Adopt-first (redline #3): if a valid permission already landed on-chain, ADOPT it
  //    (record the hash → onboarding completes) instead of sponsoring a duplicate. This
  //    closes the "permission on-chain, no DB hash" stuck state — never a silent no-op.
  const adopt = await deps.adoptExisting({
    phoneNumber: req.phoneNumber,
    walletAddress: req.walletAddress,
  })
  if (adopt.adopted) {
    logger.info(`gas_aa onboard: adopted existing permission for ${maskPhone(req.phoneNumber)}`)
    return { kind: 'alreadyGranted', permissionHash: adopt.permissionHash }
  }

  // 4b. In-flight guard: if a prior sponsored op is already `prepared` (broadcasting) for
  //     this account, do NOT build a second one — a fresh op claims nonce+1 on the still-
  //     undeployed account, fails, and returns a `fallback` that would send the frontend to
  //     legacy = a duplicate approve. Signal `processing`; the reconciler settles the op.
  if (await deps.hasInFlightOp(req.walletAddress)) {
    logger.info(`gas_aa onboard: in-flight setup op for ${maskPhone(req.phoneNumber)} — processing`)
    return { kind: 'processing' }
  }

  // 5. Convergence (redline #1): our [userEoa, SPM] derivation MUST equal walletAddress.
  //    Load-bearing, not defense — EntryPoint rejects an op whose sender != the
  //    initCode-derived address. A mismatch is a config/owner drift ⇒ 409, no row.
  const derived = await deps.deriveSmartAccount(cdp.userEoa)
  if (derived.toLowerCase() !== req.walletAddress.toLowerCase()) {
    logger.error(
      `gas_aa onboard: convergence failed — derive(${cdp.userEoa}) = ${derived} != ${req.walletAddress}`
    )
    return { kind: 'error', status: 409, reason: 'owner does not derive this account' }
  }

  // 6. Build the tier-capped permission and sponsor the cold deploy+approve op.
  const permission = await deps.buildPermission({
    walletAddress: req.walletAddress,
    phoneNumber: req.phoneNumber,
  })
  const outcome = await deps.prepare({
    walletAddress: req.walletAddress,
    userEoa: cdp.userEoa,
    permission,
    fromPhoneNumber: req.phoneNumber,
  })
  if (!outcome.sponsored) {
    return { kind: 'fallback', reason: outcome.reason }
  }
  return {
    kind: 'prepared',
    opId: outcome.opId,
    unsignedUserOp: outcome.unsignedUserOp,
    userOpHash: outcome.userOpHash,
  }
}

// ── Real dependency implementations ──────────────────────────────────────────

let cdpClient: CdpClient | null = null
function getCdp(): CdpClient {
  if (!cdpClient) cdpClient = new CdpClient()
  return cdpClient
}

let publicClient: ReturnType<typeof createPublicClient> | null = null
function getPublic() {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: getViemChain(), transport: http(getRpcUrl()) })
  }
  return publicClient
}

async function realResolveCdpUser(
  accessToken: string
): Promise<{ userEoa: string; smartAccount: string }> {
  const endUser = await getCdp().endUser.validateAccessToken({ accessToken })
  return {
    userEoa: endUser.evmAccounts?.[0] ?? '',
    smartAccount: endUser.evmSmartAccounts?.[0] ?? '',
  }
}

async function realIsTosAccepted(phoneNumber: string): Promise<boolean> {
  const pref = await findUserPrefByPhone(phoneNumber)
  return !!pref?.tosAcceptedAt
}

async function realDeriveSmartAccount(userEoa: string): Promise<string> {
  const account = await toCoinbaseSmartAccount({
    client: getPublic() as any,
    owners: [getAddress(userEoa), getAddress(SPEND_PERMISSION_MANAGER)],
    version: '1.1',
  })
  return account.address
}

async function realBuildPermission(args: {
  walletAddress: string
  phoneNumber: string
}): Promise<RawPermission> {
  const spenderAccount = await getSippySpenderAccount()
  const spender = spenderAccount.address
  const limit = await getSecurityLimitStatus(args.phoneNumber)
  const allowance = parseUnits(String(limit.effectiveLimit), USDC_DECIMALS)
  const salt = BigInt('0x' + crypto.randomBytes(32).toString('hex'))
  return {
    account: args.walletAddress,
    spender,
    token: USDC_ADDRESSES[NETWORK],
    allowance,
    period: PERMISSION_PERIOD_SECONDS,
    start: Math.floor(Date.now() / 1000),
    end: MAX_UINT48,
    salt,
    extraData: '0x',
  }
}

/** The IO `adoptOnchainPermission` depends on — injected so the tier-cap + zero-row
 *  guards are unit-testable without CDP or a DB. */
export interface AdoptIO {
  /** The most-recent on-chain permission for the wallet (spender/token/network-matched),
   *  with its USD allowance — or null when none exists. */
  findMatch(): Promise<{ permissionHash: string; allowanceUsd: number } | null>
  /** The user's CURRENT effective daily limit ($50 unverified / $500 verified). */
  getEffectiveLimit(phoneNumber: string): Promise<number>
  /** Record the hash + limit on phone_registry; returns the number of rows written. */
  recordHash(phoneNumber: string, permissionHash: string, allowanceUsd: number): Promise<number>
  notify(phoneNumber: string): Promise<void>
}

/**
 * Decide + complete adoption of an already-granted on-chain permission (a previous
 * sponsored op landed but the DB hash was never recorded — the F3/F4 stuck state). Two
 * money-path guards:
 *  • P1 tier cap — NEVER adopt an over-tier permission (e.g. a stale $500 from before a
 *    downgrade / the $500 cohort); return `{adopted:false}` so the caller sponsors a
 *    fresh current-tier grant instead of resurrecting the old limit.
 *  • P2 completion — a zero-row write is NOT success (else the stuck state returns
 *    silently); log + `{adopted:false}`, never `{adopted:true}` on a write that missed.
 */
export async function adoptOnchainPermission(
  args: { phoneNumber: string; walletAddress: string },
  io: AdoptIO
): Promise<{ adopted: true; permissionHash: string } | { adopted: false }> {
  const match = await io.findMatch()
  if (!match) return { adopted: false }

  // P1 — refuse an over-tier permission; sponsor a fresh one at the current cap instead.
  const effectiveLimit = await io.getEffectiveLimit(args.phoneNumber)
  if (match.allowanceUsd > effectiveLimit) {
    logger.warn(
      `gas_aa onboard: existing permission ($${match.allowanceUsd}) exceeds tier ($${effectiveLimit}) for ${maskPhone(args.phoneNumber)} — not adopting`
    )
    return { adopted: false }
  }

  // P2 — adoption MUST complete (write the hash). A miss is not success.
  const rows = await io.recordHash(args.phoneNumber, match.permissionHash, match.allowanceUsd)
  if (!rows) {
    logger.error(
      `gas_aa onboard: adopt matched a permission but wrote 0 phone_registry rows for ${maskPhone(args.phoneNumber)} — adoption NOT completed`
    )
    return { adopted: false }
  }

  // First-time setup magnet — best-effort, must never fail an adoption already written.
  await io.notify(args.phoneNumber).catch((err) => {
    logger.warn('gas_aa onboard: setup_completed notify failed (non-fatal): %o', err)
  })
  return { adopted: true, permissionHash: match.permissionHash }
}

async function realAdoptExisting(args: {
  phoneNumber: string
  walletAddress: string
}): Promise<{ adopted: true; permissionHash: string } | { adopted: false }> {
  const spenderAccount = await getSippySpenderAccount()
  const spender = spenderAccount.address
  return adoptOnchainPermission(args, {
    findMatch: async () => {
      const matching = await findPermissionForRegistration({
        listFn: async () => {
          const res = await getCdp().evm.listSpendPermissions({
            address: args.walletAddress as `0x${string}`,
          })
          return (res.spendPermissions ?? []) as unknown as RawSpendPermission[]
        },
        spender,
        token: USDC_ADDRESSES[NETWORK],
        network: NETWORK,
        requestedAllowance: null, // adopt-most-recent: nothing specific to wait for
        decimals: USDC_DECIMALS,
        attempts: 1,
        baseDelayMs: 0,
      })
      if (!matching) return null
      return {
        permissionHash: matching.permissionHash,
        allowanceUsd: Number.parseFloat(
          formatUnits(BigInt(matching.permission.allowance), USDC_DECIMALS)
        ),
      }
    },
    getEffectiveLimit: async (phone) => {
      const status = await getSecurityLimitStatus(phone)
      return status.effectiveLimit
    },
    recordHash: realRecordPermissionHash,
    notify: realNotifySetupCompleted,
  })
}

/** Canonical-then-bare-digit UPDATE (pre-SH-003 rows). Returns the rows written. */
async function realRecordPermissionHash(
  phoneNumber: string,
  permissionHash: string,
  allowanceUsd: number
): Promise<number> {
  let updated = await query(
    `UPDATE phone_registry
       SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
     WHERE phone_number = $4`,
    [permissionHash, allowanceUsd, Date.now(), phoneNumber]
  )
  if (updated.rowCount === 0 && phoneNumber.startsWith('+')) {
    updated = await query(
      `UPDATE phone_registry
         SET spend_permission_hash = $1, daily_limit = $2, permission_created_at = $3
       WHERE phone_number = $4`,
      [permissionHash, allowanceUsd, Date.now(), phoneNumber.slice(1)]
    )
  }
  return updated.rowCount ?? 0
}

async function realNotifySetupCompleted(phoneNumber: string): Promise<void> {
  const lang = (await getUserLanguage(phoneNumber)) ?? getLanguageForPhone(phoneNumber)
  await notifySetupCompleted({ phone: phoneNumber, lang })
}

async function realHasInFlightOp(walletAddress: string): Promise<boolean> {
  const row = await findInFlightSetupOp(getChainId(), ENTRY_POINT_V06, walletAddress)
  return row !== null
}

function makeDefaultOnboardDeps(): OnboardPrepareDeps {
  return {
    resolveCdpUser: realResolveCdpUser,
    isTosAccepted: realIsTosAccepted,
    adoptExisting: realAdoptExisting,
    hasInFlightOp: realHasInFlightOp,
    deriveSmartAccount: realDeriveSmartAccount,
    buildPermission: realBuildPermission,
    prepare: prepareSetupOp,
  }
}
