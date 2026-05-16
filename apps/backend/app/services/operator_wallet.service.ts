/**
 * Operator Event Wallet Service
 *
 * Manages per-event CDP smart accounts that hold the USDC float operators
 * distribute to attendees at the venue (manual cash-for-USDC onramp).
 *
 *   provisionOperatorWallet  — admin assigns an operator to an event;
 *                              creates the CDP wallet idempotently and
 *                              persists the recovery handle
 *   getOperatorWalletForEvent — read the row for an event (admin views)
 *   getOperatorWalletForUser  — read the row for an operator (their session)
 *   rehydrateSmartAccount     — turn a DB row back into a CDP handle
 *   sendUsdcFromOperatorWallet — execute a transfer, atomic user-op
 *   drainOperatorWallet       — sweep full balance to a destination
 *   getOperatorWalletBalance  — on-chain USDC balance read
 *
 * CDP custody: private keys live in CDP. Sippy auth is via env vars
 * (CDP_API_KEY_*). The deterministic `name` argument to getOrCreate* is
 * the recovery key — as long as `event_operator_wallets.cdp_account_name`
 * survives, the wallet is recoverable. POLICY: never DELETE rows from
 * `event_operator_wallets` — only flip `active=false`.
 *
 * Spec: OPERATOR_FLOW_PLAN.md.
 */

import logger from '@adonisjs/core/services/logger'
import { CdpClient } from '@coinbase/cdp-sdk'
import { ethers } from 'ethers'
import db from '@adonisjs/lucid/services/db'
import { query } from '#services/db'
import { NETWORK, USDC_DECIMALS, getRpcUrl, getUsdcAddress } from '#config/network'

// ── CDP client (own singleton; cheap to instantiate) ────────────────────────

let cdpClient: CdpClient | null = null

function getCdpClient(): CdpClient {
  if (!cdpClient) {
    cdpClient = new CdpClient()
    logger.info('CDP Client initialized for operator wallets')
  }
  return cdpClient
}

type SmartAccount = Awaited<ReturnType<CdpClient['evm']['getOrCreateSmartAccount']>>

// ── Constants ───────────────────────────────────────────────────────────────

const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)']
const USDC_BALANCEOF_ABI = ['function balanceOf(address owner) view returns (uint256)']

// ── Types ───────────────────────────────────────────────────────────────────

export interface EventOperatorWalletRow {
  eventSlug: string
  operatorUserId: number
  walletAddress: string
  cdpAccountName: string
  cdpOwnerName: string
  active: boolean
}

// ── Naming convention (deterministic, recoverable) ──────────────────────────

/**
 * CDP names ARE the recovery key. Same (eventSlug, operatorId) pair always
 * resolves to the same on-chain address via CDP's getOrCreate semantics —
 * even if our DB row is gone, the wallet is recoverable by re-deriving
 * these strings.
 */
function deriveCdpNames(
  eventSlug: string,
  operatorUserId: number
): {
  ownerName: string
  accountName: string
} {
  return {
    ownerName: `event-${eventSlug}-op-${operatorUserId}-owner`,
    accountName: `event-${eventSlug}-op-${operatorUserId}`,
  }
}

// ── Provision ──────────────────────────────────────────────────────────────

/**
 * Assign an operator to an event. Creates the CDP wallet idempotently (CDP's
 * getOrCreate guarantees same name → same address) and persists the recovery
 * handle.
 *
 * Idempotency / reactivation matrix (for the same event_slug):
 *
 *   existing row state          | action
 *   ────────────────────────────┼──────────────────────────────────────────
 *   none                        | create CDP wallet + INSERT new row
 *   same operator, active=true  | no-op, return existing
 *   same operator, active=false | flip active=true (reactivate), return
 *   different operator, active  | reject (must revoke first, then drain
 *                                   manually if you really want a swap)
 *   different operator, revoked | reject — historical record preserved
 *                                   per policy (#2); the funds in that
 *                                   wallet are still drainable. Admin must
 *                                   intervene in DB if a hard reassignment
 *                                   is genuinely needed.
 *
 * Additional invariant enforced here: an operator can only have ONE active
 * event assignment at a time. `getOperatorWalletForUser` orders DESC and
 * LIMIT 1, so dual-assignment would silently hide one. Reject before INSERT.
 */
export async function provisionOperatorWallet(args: {
  operatorUserId: number
  eventSlug: string
}): Promise<EventOperatorWalletRow> {
  const { operatorUserId, eventSlug } = args

  // Existing row for this event?
  const existing = await getOperatorWalletForEvent(eventSlug)
  if (existing) {
    if (existing.operatorUserId !== operatorUserId) {
      throw new Error(
        `Event '${eventSlug}' is already assigned to operator ${existing.operatorUserId}. ` +
          `Revoke + drain first, then ask an engineer to clean the DB row before reassigning.`
      )
    }
    // Same operator. If revoked, reactivate (decision #3: revoke is reversible).
    if (!existing.active) {
      await query(
        `UPDATE event_operator_wallets
         SET active = TRUE, updated_at = now()
         WHERE event_slug = $1`,
        [eventSlug]
      )
      logger.info(
        `operator_wallet.reactivated event=${eventSlug} op=${operatorUserId} address=${existing.walletAddress}`
      )
      return { ...existing, active: true }
    }
    // Already active for this operator — no-op.
    return existing
  }

  // No row for this event. Guard against same-operator-already-active-elsewhere
  // — `getOperatorWalletForUser` would silently pick the most-recently-updated
  // one and the older event would lose access. Force admin to revoke first.
  const otherActive = await getOperatorWalletForUser(operatorUserId)
  if (otherActive) {
    throw new Error(
      `Operator ${operatorUserId} is already actively assigned to event '${otherActive.eventSlug}'. ` +
        `Revoke that assignment first before assigning to '${eventSlug}'.`
    )
  }

  const { ownerName, accountName } = deriveCdpNames(eventSlug, operatorUserId)

  // CDP provisioning. Both calls are idempotent on `name` — re-running with
  // the same arguments returns the same wallet, no side effects.
  const cdp = getCdpClient()
  const owner = await cdp.evm.getOrCreateAccount({ name: ownerName })
  const smart = await cdp.evm.getOrCreateSmartAccount({ name: accountName, owner })

  await query(
    `INSERT INTO event_operator_wallets
       (event_slug, operator_user_id, wallet_address, cdp_account_name, cdp_owner_name, active)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [eventSlug, operatorUserId, smart.address, accountName, ownerName]
  )

  logger.info(
    `operator_wallet.provisioned event=${eventSlug} op=${operatorUserId} address=${smart.address}`
  )

  return {
    eventSlug,
    operatorUserId,
    walletAddress: smart.address,
    cdpAccountName: accountName,
    cdpOwnerName: ownerName,
    active: true,
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

function rowToWallet(row: any): EventOperatorWalletRow {
  return {
    eventSlug: row.event_slug,
    operatorUserId: row.operator_user_id,
    walletAddress: row.wallet_address,
    cdpAccountName: row.cdp_account_name,
    cdpOwnerName: row.cdp_owner_name,
    active: row.active,
  }
}

export async function getOperatorWalletForEvent(
  eventSlug: string
): Promise<EventOperatorWalletRow | null> {
  const result = await query(
    `SELECT event_slug, operator_user_id, wallet_address, cdp_account_name, cdp_owner_name, active
     FROM event_operator_wallets
     WHERE event_slug = $1`,
    [eventSlug]
  )
  return result.rows[0] ? rowToWallet(result.rows[0]) : null
}

/**
 * Lookup the active wallet assigned to an operator. Used by the operator
 * dashboard to resolve "what event am I working today". Returns null if the
 * operator has no active assignment (admin must assign them first).
 */
export async function getOperatorWalletForUser(
  operatorUserId: number
): Promise<EventOperatorWalletRow | null> {
  const result = await query(
    `SELECT event_slug, operator_user_id, wallet_address, cdp_account_name, cdp_owner_name, active
     FROM event_operator_wallets
     WHERE operator_user_id = $1 AND active = TRUE
     ORDER BY updated_at DESC
     LIMIT 1`,
    [operatorUserId]
  )
  return result.rows[0] ? rowToWallet(result.rows[0]) : null
}

// ── Revoke (soft delete) ────────────────────────────────────────────────────

export async function revokeOperatorWallet(eventSlug: string): Promise<{ revoked: boolean }> {
  const result = await query(
    `UPDATE event_operator_wallets
     SET active = FALSE, updated_at = now()
     WHERE event_slug = $1 AND active = TRUE
     RETURNING event_slug`,
    [eventSlug]
  )
  return { revoked: (result.rows?.length ?? 0) > 0 }
}

// ── Re-hydrate CDP handle from DB row ───────────────────────────────────────

/**
 * Turn a stored DB row back into a usable CDP `SmartAccount`. Idempotent —
 * CDP's getOrCreate returns the same handle for the same `name` regardless
 * of how many times it's called. This is THE recovery path: even if the DB
 * row is the only thing surviving, we can drain the wallet.
 */
export async function rehydrateSmartAccount(wallet: EventOperatorWalletRow): Promise<SmartAccount> {
  const cdp = getCdpClient()
  const owner = await cdp.evm.getOrCreateAccount({ name: wallet.cdpOwnerName })
  return cdp.evm.getOrCreateSmartAccount({ name: wallet.cdpAccountName, owner })
}

// ── Send USDC ───────────────────────────────────────────────────────────────

/**
 * SUBMIT phase — broadcast a USDC transfer userOp without waiting for
 * confirmation. Returns immediately with the userOp hash (which is the
 * stable identifier for this in-flight transaction).
 *
 * Throws ONLY when submission itself fails (CDP API error, network blip
 * before broadcast). Once this returns successfully, the userOp IS on-chain
 * and will eventually confirm or fail at the EntryPoint level — but it
 * cannot be retried without double-paying. Callers MUST persist the
 * returned `userOpHash` BEFORE attempting any wait-for-confirmation, so a
 * post-submit crash doesn't lose the audit trail.
 *
 * Returns the SmartAccount + userOpResult handles so a follow-up wait/get
 * call can be issued by the caller (see `waitForOperatorSend`).
 */
export async function submitUsdcSend(args: {
  wallet: EventOperatorWalletRow
  toAddress: string
  amountUsdc: number
}): Promise<{
  userOpHash: string
  userOpResult: Awaited<ReturnType<CdpClient['evm']['sendUserOperation']>>
  smartAccount: SmartAccount
}> {
  const { wallet, toAddress, amountUsdc } = args
  if (!wallet.active) {
    throw new Error(`Wallet for event '${wallet.eventSlug}' is revoked (active=false)`)
  }
  if (amountUsdc <= 0) {
    throw new Error('amountUsdc must be > 0')
  }

  const cdp = getCdpClient()
  const smart = await rehydrateSmartAccount(wallet)

  const erc20Interface = new ethers.utils.Interface(ERC20_TRANSFER_ABI)
  const amountWei = ethers.utils.parseUnits(amountUsdc.toString(), USDC_DECIMALS)
  const transferCallData = erc20Interface.encodeFunctionData('transfer', [toAddress, amountWei])

  logger.info(
    `operator_wallet.send-submit event=${wallet.eventSlug} from=${wallet.walletAddress} to=${toAddress} amount=${amountUsdc}`
  )

  const userOpResult = await cdp.evm.sendUserOperation({
    smartAccount: smart,
    network: NETWORK as any,
    calls: [
      {
        to: getUsdcAddress() as `0x${string}`,
        value: 0n,
        data: transferCallData as `0x${string}`,
      },
    ],
  })

  return {
    userOpHash: (userOpResult as any).userOpHash ?? '',
    userOpResult,
    smartAccount: smart,
  }
}

/**
 * WAIT phase — block until the previously-submitted userOp confirms on-chain
 * and return the final transaction hash. Safe to time out: the userOp is
 * already in flight, so the caller can persist the userOpHash and finalize
 * the tx_hash later via re-query.
 *
 * Idempotent: re-calling with the same userOpResult returns the same hash
 * (CDP caches confirmation state).
 */
export async function waitForOperatorSend(args: {
  smartAccount: SmartAccount
  userOpResult: Awaited<ReturnType<CdpClient['evm']['sendUserOperation']>>
}): Promise<{ txHash: string }> {
  const { smartAccount, userOpResult } = args
  const receipt = await smartAccount.waitForUserOperation(userOpResult)
  const userOp = await smartAccount.getUserOperation({ userOpHash: receipt.userOpHash })
  const txHash = userOp.transactionHash ?? receipt.userOpHash
  return { txHash }
}

/**
 * Convenience wrapper for callers that don't care about the submit/wait
 * split (e.g. the drain endpoint where best-effort confirmation is fine).
 * For the operator send hot path, prefer the split functions above so the
 * audit row can record the userOp hash BEFORE the wait — that's what
 * prevents double-pay on confirmation timeout (see operator_send_controller).
 */
export async function sendUsdcFromOperatorWallet(args: {
  wallet: EventOperatorWalletRow
  toAddress: string
  amountUsdc: number
}): Promise<{ txHash: string }> {
  const submitted = await submitUsdcSend(args)
  return waitForOperatorSend({
    smartAccount: submitted.smartAccount,
    userOpResult: submitted.userOpResult,
  })
}

// ── Drain (admin recovery / post-event) ─────────────────────────────────────

/**
 * Sweep the full USDC balance of an operator wallet to a destination
 * (typically Sippy's treasury wallet). Works even if `active=false` — the
 * "drain regardless of state" is the explicit recovery guarantee.
 *
 * Reads current balance, transfers it all. If balance is zero, returns
 * `{ amountSent: 0, txHash: null }` without touching CDP.
 */
export async function drainOperatorWallet(args: {
  wallet: EventOperatorWalletRow
  destinationAddress: string
}): Promise<{ txHash: string | null; amountSent: number }> {
  const { wallet, destinationAddress } = args

  // Strict balance read — we MUST distinguish "wallet empty" from "RPC
  // failed" here. The display-safe variant returns 0 on RPC error, which
  // would silently mark drain as a clean no-op while funds remain stuck.
  // Propagate the read error so admin sees the real failure and retries.
  const balance = await getOperatorWalletBalanceStrict(wallet.walletAddress)
  if (balance === 0) {
    logger.info(`operator_wallet.drain event=${wallet.eventSlug} balance=0 — nothing to drain`)
    return { txHash: null, amountSent: 0 }
  }

  // Reuse the send pipeline — drain is just a "send full balance" call.
  // Note: we pass the wallet through `sendUsdc...` which enforces active=true.
  // For drains, we want to ignore that gate — so call sendUserOperation
  // directly here.
  const cdp = getCdpClient()
  const smart = await rehydrateSmartAccount(wallet)

  const erc20Interface = new ethers.utils.Interface(ERC20_TRANSFER_ABI)
  const amountWei = ethers.utils.parseUnits(balance.toString(), USDC_DECIMALS)
  const transferCallData = erc20Interface.encodeFunctionData('transfer', [
    destinationAddress,
    amountWei,
  ])

  logger.info(
    `operator_wallet.drain event=${wallet.eventSlug} amount=${balance} to=${destinationAddress}`
  )

  const userOpResult = await cdp.evm.sendUserOperation({
    smartAccount: smart,
    network: NETWORK as any,
    calls: [
      {
        to: getUsdcAddress() as `0x${string}`,
        value: 0n,
        data: transferCallData as `0x${string}`,
      },
    ],
  })

  const receipt = await smart.waitForUserOperation(userOpResult)
  const userOp = await smart.getUserOperation({ userOpHash: receipt.userOpHash })
  const txHash = userOp.transactionHash ?? receipt.userOpHash

  logger.info(`operator_wallet.drain-confirmed event=${wallet.eventSlug} tx=${txHash}`)
  return { txHash, amountSent: balance }
}

// ── Balance read ────────────────────────────────────────────────────────────

/**
 * Display-safe balance read. Swallows RPC errors and returns 0 so the
 * operator dashboard never crashes when the chain is flaky. Suitable for
 * the wallet card on the send page where 0 just means "nothing visible
 * right now, refresh later" and not "wallet definitively empty".
 *
 * DO NOT use this for drain or any decision-making logic — see
 * `getOperatorWalletBalanceStrict` for the throw-on-failure variant.
 */
export async function getOperatorWalletBalance(walletAddress: string): Promise<number> {
  try {
    return await getOperatorWalletBalanceStrict(walletAddress)
  } catch (err) {
    logger.warn({ walletAddress, err }, 'operator_wallet.balance failed (returning 0 for display)')
    return 0
  }
}

/**
 * Strict balance read — propagates RPC errors. Use for paths that need to
 * distinguish "wallet truly empty" from "we couldn't tell". Drain MUST use
 * this: a silent 0 there hides stuck funds exactly when admin is trying to
 * recover them.
 */
export async function getOperatorWalletBalanceStrict(walletAddress: string): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
  const usdcContract = new ethers.Contract(getUsdcAddress(), USDC_BALANCEOF_ABI, provider)
  const balance = await usdcContract.balanceOf(walletAddress)
  return Number.parseFloat(ethers.utils.formatUnits(balance, USDC_DECIMALS))
}

// ── Send-history helpers (used by the controller for caps + recent-sends UI) ─

/**
 * Sum of amount_usdc for operator_sends in the rolling 1-hour window for
 * a specific operator. Counts rows in 'pending', 'submitted', 'confirmed' —
 * NOT 'failed' (failed sends don't move money and shouldn't tighten caps).
 */
export async function getOperatorSpendInLastHour(operatorUserId: number): Promise<number> {
  const result = (await db
    .from('operator_sends')
    .where('operator_id', operatorUserId)
    .whereIn('status', ['pending', 'submitted', 'confirmed'])
    .where('created_at', '>', db.raw("now() - interval '1 hour'"))
    .sum('amount_usdc as total')
    .first()) as { total: string | number | null } | undefined
  return Number(result?.total ?? 0) || 0
}
