/**
 * Gas → AA — OffCdpSubmitter (the shared sponsored-submit module).
 *
 * Phase 2 slice 1 wires only the spender FREE-SEND lane. The submit machine,
 * proven off-CDP in Phase 1 (viem builds + Pimlico sponsors + CDP only signs),
 * with the production guardrails layered on:
 *
 *   • Authorize first  — a gas_aa_prepared_user_ops row (status `authorized`)
 *     exists before anything is built. The webhook sponsors only a matching row.
 *   • Stored-address override — build against the CDP smart-account address (fail
 *     closed if the override doesn't take). CDP accounts are public-factory v1.1
 *     wallets (§2.0 gate: address == owner-derivation), so the override is correct
 *     + defensive; we only warn if the derivation diverges (load-bearing case).
 *   • Nonce lock (P1) — resolve nonce → write row → sign → submit run under a
 *     per-(chain, entryPoint, sender) lock; the shared spender can't double-spend
 *     a nonce. The DB active-nonce unique index is the backstop.
 *   • Persist-before-send — the FULL signed op + userOpHash land on the row
 *     (status `prepared`) BEFORE eth_sendUserOperation.
 *   • Fallback = pre-broadcast ONLY — a failure before `prepared` falls back to
 *     the legacy CDP submit + checkAndRefuel (no double-send). Once `prepared`,
 *     the lane is committed to that EXACT op: idempotent rebroadcast of the same
 *     signed op (same hash — the EntryPoint dedups), never a rebuild, never legacy.
 *
 * The network engine and the ledger are injected (`__setDepsForTest`) so the
 * safety transitions are unit-testable without RPC or a DB.
 */

import logger from '@adonisjs/core/services/logger'
import { CdpClient } from '@coinbase/cdp-sdk'
import { createPublicClient, http, type LocalAccount, type Hex } from 'viem'
import {
  toCoinbaseSmartAccount,
  createBundlerClient,
  getUserOperationHash,
  formatUserOperationRequest,
} from 'viem/account-abstraction'
import { maskPhone } from '#utils/phone'
import { getRpcUrl } from '#config/network'
import {
  ENTRY_POINT_V06,
  SPEND_PERMISSION_MANAGER,
  getChainId,
  getViemChain,
  getPimlicoUrl,
  getSponsorshipPolicyId,
  nonceLockKey,
  withNonceLock,
} from '#services/gas_aa/config'
import {
  buildFreeSendCalls,
  callsHash,
  capBucketForAccount,
  type Call,
  type RawPermission,
} from '#services/gas_aa/decode'
import * as ledger from '#services/gas_aa/ledger'

export interface FreeSendRequest {
  /** Sender's phone — only for the masked semantic-action label + logging. */
  fromPhoneNumber: string
  /** permission.account — the real user whose USDC moves. */
  userWalletAddress: string
  /** The CDP spend-permission struct for that user → the Sippy spender. */
  permission: RawPermission
  /** USDC.transfer recipient. */
  recipient: string
  /** Amount in USDC base units (6dp). */
  amountUnits: bigint
  /** Stored CDP spender smart-account address — the 4337 `sender`. */
  spenderAddress: string
  /** USDC token address on the active chain. */
  usdcAddress: string
  /**
   * The legacy submit, run ONLY on a pre-broadcast fallback: the exact
   * checkAndRefuel + CDP sendUserOperation the service does today. Never called
   * once the op is `prepared`.
   */
  legacySend: () => Promise<{ transactionHash: string; userOpHash?: string | null }>
}

export interface FreeSendOutcome {
  transactionHash: string
  userOpHash: string | null
  /** true = landed via off-CDP sponsorship; false = legacy pre-broadcast fallback. */
  sponsored: boolean
  preparedOpId: string
}

// ── Injectable dependencies ──────────────────────────────────────────────────

export interface SubmitterDeps {
  resolveNonce(sender: string): Promise<bigint>
  prepareAndSign(args: {
    sender: string
    calls: Call[]
    nonce: bigint
  }): Promise<{ rpcOp: Record<string, unknown>; userOpHash: string }>
  sendRaw(rpcOp: Record<string, unknown>): Promise<string>
  waitReceipt(userOpHash: string): Promise<{ success: boolean; transactionHash: string }>
  /** True if the bundler already knows this userOpHash (skip rebroadcast). */
  getByHash(userOpHash: string): Promise<boolean>
  ledger: {
    insertAuthorized: typeof ledger.insertAuthorized
    setNonce: typeof ledger.setNonce
    maxActiveNonce: typeof ledger.maxActiveNonce
    markPrepared: typeof ledger.markPrepared
    markLanded: typeof ledger.markLanded
    markFailed: typeof ledger.markFailed
    getById: typeof ledger.getById
  }
}

let deps: SubmitterDeps = makeDefaultDeps()

export function __setDepsForTest(partial: Partial<SubmitterDeps>): void {
  deps = { ...deps, ...partial, ledger: { ...deps.ledger, ...(partial.ledger ?? {}) } }
}

export function __resetDeps(): void {
  deps = makeDefaultDeps()
}

/**
 * Thrown when a broadcast op is CONFIRMED reverted on-chain — a terminal state.
 * The catch in submitFreeSend rethrows it directly: a confirmed revert must
 * never trigger reconcile (the op already settled) or legacy (it was broadcast).
 */
class OpRevertedError extends Error {
  constructor(userOpHash: string) {
    super(`gas_aa: sponsored user op reverted on-chain (${userOpHash})`)
    this.name = 'OpRevertedError'
  }
}

/**
 * Thrown when a clean nonce slot can't be claimed after bounded retries (heavy
 * concurrent contention on the shared spender). Terminal + pre-broadcast: the
 * catch rethrows it WITHOUT legacy — a legacy submit would re-resolve the same
 * contended on-chain nonce and could conflict. The send fails cleanly; retry.
 */
class NonceContentionError extends Error {
  constructor(sender: string) {
    super(`gas_aa: could not allocate a free nonce for ${sender} (contention)`)
    this.name = 'NonceContentionError'
  }
}

/** A Postgres unique-violation on the active-nonce index (concurrent collision). */
function isActiveNonceCollision(e: any): boolean {
  const code = e?.code ?? e?.cause?.code
  const text = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`
  return code === '23505' || text.includes('uniq_gas_aa_active_nonce')
}

const MAX_NONCE_ATTEMPTS = 8

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Resolve a free nonce and claim it on the prepared-op row (status still
 * `authorized`), retrying on a concurrent active-nonce collision.
 *
 * next nonce = max(on-chain getNonce, highest in-flight DB nonce + 1) — so a
 * second process allocates the NEXT nonce rather than re-using the on-chain value
 * while the first op is still pending (on-chain getNonce only advances on mine).
 * If another process won the slot (DB unique-violation), re-resolve — the DB
 * high-water mark now includes the winner — until claimed or the attempt budget
 * is exhausted (→ NonceContentionError; the caller fails cleanly, never legacy).
 * Runs inside the per-(chain,ep,sender) lock, so same-process calls are already
 * serialised; this loop closes the CROSS-process gap the in-memory lock can't.
 */
async function claimNonce(
  id: string,
  sender: string,
  chainId: number,
  entryPoint: string
): Promise<{ nonce: bigint; future: boolean }> {
  for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt++) {
    const onChain = await deps.resolveNonce(sender)
    const maxActive = await deps.ledger.maxActiveNonce(chainId, entryPoint, sender)
    const nonce = maxActive !== null && maxActive + 1n > onChain ? maxActive + 1n : onChain
    try {
      await deps.ledger.setNonce(id, nonce.toString())
      // `future` = allocated ABOVE the on-chain nonce because a lower op is still
      // pending. Such an op CANNOT safely legacy-fall-back: legacy would resolve
      // the on-chain (lower, pending) nonce and conflict on the shared spender.
      return { nonce, future: nonce > onChain }
    } catch (e) {
      if (isActiveNonceCollision(e)) continue // someone took it — re-resolve + retry
      throw e // a genuine error → pre-broadcast fallback upstream
    }
  }
  throw new NonceContentionError(sender)
}

/**
 * Submit a spender free-send through the sponsored path, falling back to legacy
 * ONLY pre-broadcast. Caller (the service) gates on isGasAaEnabled() — when off,
 * it never reaches here.
 */
export async function submitFreeSend(req: FreeSendRequest): Promise<FreeSendOutcome> {
  const chainId = getChainId()
  const entryPoint = ENTRY_POINT_V06

  const calls = buildFreeSendCalls({
    spendManager: SPEND_PERMISSION_MANAGER,
    permission: req.permission,
    usdcAddress: req.usdcAddress,
    recipient: req.recipient,
    amountUnits: req.amountUnits,
  })
  const cHash = callsHash(calls)
  const capBucket = capBucketForAccount(req.userWalletAddress)

  // Step 0 — authorize. The row is the only thing that authorizes sponsorship.
  const id = await deps.ledger.insertAuthorized({
    lane: 'free_send',
    semanticActionId: `free_send:${maskPhone(req.fromPhoneNumber)}`,
    sender: req.spenderAddress,
    decodedUser: req.userWalletAddress,
    chainId,
    entryPoint,
    callsHash: cHash,
    capBucket,
  })

  let prepared = false
  let futureNonce = false
  let signedOpHash: string | null = null

  try {
    const userOpHash = await withNonceLock(
      nonceLockKey(chainId, entryPoint, req.spenderAddress),
      async () => {
        // a+b. resolve a free nonce (accounting for in-flight rows across
        //      processes) and claim it on the row while still `authorized`.
        const claimed = await claimNonce(id, req.spenderAddress, chainId, entryPoint)
        futureNonce = claimed.future
        // c–e. build (paymaster fetch fires the webhook, which now matches on the
        //      nonce), sign via the CDP owner, derive the userOpHash.
        const signed = await deps.prepareAndSign({
          sender: req.spenderAddress,
          calls,
          nonce: claimed.nonce,
        })
        signedOpHash = signed.userOpHash
        // f. PERSIST the full signed op + hash BEFORE the bundler send.
        await deps.ledger.markPrepared(id, signed.userOpHash, signed.rpcOp)
        prepared = true
        // g. submit. Committed from here — never legacy, only idempotent rebroadcast.
        await deps.sendRaw(signed.rpcOp)
        return signed.userOpHash
      }
    )

    // Reconcile outside the lock (the nonce is already consumed by the send).
    const receipt = await deps.waitReceipt(userOpHash)
    if (!receipt.success) {
      await deps.ledger.markFailed(id, 'user op reverted on-chain')
      throw new OpRevertedError(userOpHash)
    }
    await deps.ledger.markLanded(id, receipt.transactionHash)
    logger.info(`gas_aa: free-send landed sponsored (op ${id}) tx ${receipt.transactionHash}`)
    return {
      transactionHash: receipt.transactionHash,
      userOpHash,
      sponsored: true,
      preparedOpId: id,
    }
  } catch (err) {
    // Terminal, non-fallback errors surface directly:
    //  • OpRevertedError — the op already settled (never reconcile, never legacy);
    //  • NonceContentionError — couldn't claim a clean nonce (a legacy submit
    //    would re-contend the same on-chain nonce, so fail cleanly instead).
    if (err instanceof OpRevertedError || err instanceof NonceContentionError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (!prepared) {
      // A pre-broadcast failure on a FUTURE nonce (one allocated above on-chain
      // because a lower spender op is still pending) must NOT legacy-fall-back —
      // legacy would resolve the on-chain (lower, pending) nonce and conflict.
      // Fail cleanly; the user retries once the lower op clears.
      if (futureNonce) {
        logger.warn(
          `gas_aa: pre-broadcast failure on a future nonce for op ${id} (no legacy): ${msg}`
        )
        await deps.ledger.markFailed(id, `future-nonce pre-broadcast: ${msg}`)
        throw new NonceContentionError(req.spenderAddress)
      }
      // Pre-broadcast failure on the on-chain nonce → legacy path is safe.
      logger.warn(`gas_aa: pre-broadcast fallback for op ${id}: ${msg}`)
      await deps.ledger.markFailed(id, `pre-broadcast: ${msg}`)
      const legacy = await req.legacySend()
      return {
        transactionHash: legacy.transactionHash,
        userOpHash: legacy.userOpHash ?? null,
        sponsored: false,
        preparedOpId: id,
      }
    }
    // Post-prepare: committed to the exact op. Rebroadcast the SAME signed op.
    logger.warn(`gas_aa: post-prepare reconcile for op ${id}: ${msg}`)
    return await reconcilePrepared(id, signedOpHash!)
  }
}

/**
 * Reconcile a `prepared` op after a post-broadcast ambiguity/crash: query the
 * bundler by hash, idempotently rebroadcast the IDENTICAL signed op if unknown
 * (same hash ⇒ EntryPoint dedups ⇒ no double-spend), then wait + settle. Never
 * builds a new op, never falls back to legacy.
 */
export async function reconcilePrepared(id: string, userOpHash: string): Promise<FreeSendOutcome> {
  const known = await deps.getByHash(userOpHash).catch(() => false)
  if (!known) {
    const row = await deps.ledger.getById(id)
    if (!row?.signedUserOp) {
      // prepared===true guarantees markPrepared persisted a signed op; its absence
      // here is a DB inconsistency. Fail fast rather than hang on waitReceipt for
      // an op that may never have been broadcast.
      await deps.ledger.markFailed(id, 'prepared row missing signed op at reconcile')
      throw new Error(`gas_aa: prepared op ${id} has no signed_user_op to rebroadcast`)
    }
    try {
      await deps.sendRaw(row.signedUserOp)
    } catch (e) {
      // The EntryPoint may reject a duplicate ("already known") — benign.
      logger.info(
        `gas_aa: rebroadcast of op ${id} returned ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }
  const receipt = await deps.waitReceipt(userOpHash)
  if (!receipt.success) {
    await deps.ledger.markFailed(id, 'reverted after rebroadcast')
    throw new Error('gas_aa: prepared op did not land after rebroadcast')
  }
  await deps.ledger.markLanded(id, receipt.transactionHash)
  return {
    transactionHash: receipt.transactionHash,
    userOpHash,
    sponsored: true,
    preparedOpId: id,
  }
}

// ── Default (real) network engine ────────────────────────────────────────────

function makeDefaultDeps(): SubmitterDeps {
  return {
    resolveNonce: realResolveNonce,
    prepareAndSign: realPrepareAndSign,
    sendRaw: realSendRaw,
    waitReceipt: realWaitReceipt,
    getByHash: realGetByHash,
    ledger: {
      insertAuthorized: ledger.insertAuthorized,
      setNonce: ledger.setNonce,
      maxActiveNonce: ledger.maxActiveNonce,
      markPrepared: ledger.markPrepared,
      markLanded: ledger.markLanded,
      markFailed: ledger.markFailed,
      getById: ledger.getById,
    },
  }
}

const ENTRYPOINT_NONCE_ABI = [
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  },
] as const

interface RealCtx {
  publicClient: ReturnType<typeof createPublicClient>
  bundler: any
  owner: any
}
let realCtx: RealCtx | null = null
const accountBySender = new Map<string, any>()

async function getCtx(): Promise<RealCtx> {
  if (realCtx) return realCtx
  const publicClient = createPublicClient({ chain: getViemChain(), transport: http(getRpcUrl()) })
  const cdp = new CdpClient()
  const owner = await cdp.evm.getOrCreateAccount({ name: 'sippy-spender-owner' })
  const bundler = createBundlerClient({
    client: publicClient,
    transport: http(getPimlicoUrl()),
    paymaster: true,
    paymasterContext: { sponsorshipPolicyId: getSponsorshipPolicyId() },
    userOperation: { estimateFeesPerGas: pimlicoGasPrice },
  })
  realCtx = { publicClient, bundler, owner }
  return realCtx
}

/** Wrap the CDP owner as a viem LocalAccount that delegates signing to CDP. */
function wrapOwner(owner: any): LocalAccount {
  return {
    address: owner.address,
    type: 'local',
    source: 'custom',
    publicKey: owner.address,
    sign: async ({ hash }: { hash: Hex }) => owner.sign({ hash }),
    signMessage: async ({ message }: any) => owner.signMessage({ message }),
    signTypedData: async (td: any) => owner.signTypedData(td),
  } as unknown as LocalAccount
}

/**
 * Build the Coinbase Smart Account at its STORED CDP address (override), fail
 * closed if the override didn't take. Cached per sender.
 */
async function getAccount(sender: string): Promise<any> {
  const key = sender.toLowerCase()
  const cached = accountBySender.get(key)
  if (cached) return cached
  const { publicClient, owner } = await getCtx()
  const wrapped = wrapOwner(owner)
  // viem's account-bearing client generics are stricter than a bare public
  // client; the runtime contract (a viem Client with a transport) is satisfied.
  const account = await toCoinbaseSmartAccount({
    client: publicClient as any,
    address: sender as Hex,
    owners: [wrapped],
    version: '1.1',
  })
  if (account.address.toLowerCase() !== key) {
    throw new Error('gas_aa: stored-address override did not take (built address != sender)')
  }
  // Invariant check (§2.0 gate, Arbitrum One): a CDP smart account's address
  // EQUALS viem's public-factory v1.1 derivation of its owner — CDP accounts are
  // standard public-factory v1.1 Coinbase Smart Wallets, so the override targets
  // the same address viem would derive. Convergence is EXPECTED. Warn on the
  // useful case instead: if the derivation DIVERGES from the stored sender, this
  // is a genuinely non-public-factory account type where the override is
  // load-bearing (and op1-style public-factory cold deploy would target the wrong
  // address) — worth surfacing. The override is kept either way (correct + defensive).
  const derived = await toCoinbaseSmartAccount({
    client: publicClient as any,
    owners: [wrapped],
    version: '1.1',
  })
  if (derived.address.toLowerCase() !== key) {
    logger.warn(
      'gas_aa: public-factory derivation != stored sender — override is load-bearing for this account (non-public-factory type?)'
    )
  }
  accountBySender.set(key, account)
  return account
}

async function pimlicoGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const r = await fetch(getPimlicoUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'pimlico_getUserOperationGasPrice',
      params: [],
    }),
  })
  const j: any = await r.json()
  return {
    maxFeePerGas: BigInt(j.result.fast.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(j.result.fast.maxPriorityFeePerGas),
  }
}

async function realResolveNonce(sender: string): Promise<bigint> {
  const { publicClient } = await getCtx()
  return (await publicClient.readContract({
    address: ENTRY_POINT_V06 as Hex,
    abi: ENTRYPOINT_NONCE_ABI,
    functionName: 'getNonce',
    args: [sender as Hex, 0n],
  })) as bigint
}

async function realPrepareAndSign(args: {
  sender: string
  calls: Call[]
  nonce: bigint
}): Promise<{ rpcOp: Record<string, unknown>; userOpHash: string }> {
  const { bundler } = await getCtx()
  const account = await getAccount(args.sender)
  // prepareUserOperation fetches gas + paymaster (firing the sponsorship webhook,
  // which matches on the now-persisted nonce). Explicit nonce ⇒ no re-resolve.
  const preparedOp = await bundler.prepareUserOperation({
    account,
    calls: args.calls,
    nonce: args.nonce,
  })
  const signature = await account.signUserOperation(preparedOp)
  const signedOp = { ...preparedOp, signature }
  const userOpHash = getUserOperationHash({
    chainId: getChainId(),
    entryPointAddress: ENTRY_POINT_V06 as Hex,
    entryPointVersion: '0.6',
    userOperation: signedOp as any,
  })
  // viem's own formatter handles the v0.6 RPC shape (initCode + paymasterAndData);
  // storing this exact request is what makes rebroadcast byte-identical.
  const rpcOp = formatUserOperationRequest(signedOp as any) as Record<string, unknown>
  return { rpcOp, userOpHash }
}

async function realSendRaw(rpcOp: Record<string, unknown>): Promise<string> {
  const { bundler } = await getCtx()
  return (await bundler.request({
    method: 'eth_sendUserOperation',
    params: [rpcOp, ENTRY_POINT_V06],
  })) as string
}

async function realWaitReceipt(
  userOpHash: string
): Promise<{ success: boolean; transactionHash: string }> {
  const { bundler } = await getCtx()
  const r = await bundler.waitForUserOperationReceipt({ hash: userOpHash as Hex })
  return { success: r.success, transactionHash: r.receipt.transactionHash }
}

async function realGetByHash(userOpHash: string): Promise<boolean> {
  const { bundler } = await getCtx()
  try {
    const op = await bundler.getUserOperation({ hash: userOpHash as Hex })
    return !!op
  } catch {
    return false
  }
}
