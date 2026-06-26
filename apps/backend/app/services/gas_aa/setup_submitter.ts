/**
 * Gas → AA Track B (B1.1b) — SetupSubmitter: the sponsored cold deploy+approve
 * onboarding op, split prepare → (browser-sign) → submit.
 *
 * A PARALLEL module to off_cdp_submitter (the live free-send lane), NOT a refactor
 * of it — duplication-over-DRY for a money path. The free-send submitter signs
 * synchronously server-side; here the user EOA is non-custodial, so the op is
 * built + sponsored at `prepare`, returned UNSIGNED to the browser, then verified +
 * wrapped + broadcast at `submit`. The seam (hashToSign = userOpHash, no replay-safe
 * wrap; SignatureWrapper(ownerIndex=0)) is acceptance-proven (b11_sig_seam.mjs).
 *
 * Failure envelope (the review surface):
 *  • BROADCAST BOUNDARY = "Pimlico returned a userOpHash" (sendRaw resolved).
 *  • Before it — bad/abandoned sig, sponsorship/DB failure at prepare, AND a bundler
 *    VALIDATION reject — is pre-broadcast: the row is terminalized (cancel/fail) and
 *    the caller degrades to legacy GasRefuel onboarding. Never broadcast ⇒ no dup.
 *  • After it — idempotent rebroadcast of the EXACT signed op, or terminal; NEVER
 *    legacy (legacy would double-grant an op that may land).
 *  • R5 ordering: the row writes live INSIDE the try (a DB blip degrades to legacy,
 *    never hard-fails onboarding), and the SIGNED op is persisted
 *    (markPreparedFromAwaitingSignature) BEFORE the boundary — so a crash right after
 *    the bundler accepts recovers via rebroadcast off the stored op, not a re-sign.
 *  • cancel↔submit atomicity is the ledger's (shared `WHERE status='awaiting_signature'`).
 */

import logger from '@adonisjs/core/services/logger'
import {
  createPublicClient,
  http,
  recoverAddress,
  encodeAbiParameters,
  parseAbiParameters,
  getAddress,
  type Hex,
} from 'viem'
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
  getSetupSponsorshipPolicyId,
  nonceLockKey,
  withNonceLock,
} from '#services/gas_aa/config'
import {
  buildSetupCalls,
  callsHash,
  capBucketForAccount,
  expectedSetupInitCode,
  type RawPermission,
} from '#services/gas_aa/decode'
import * as ledger from '#services/gas_aa/ledger'

// ── Public request/outcome shapes ────────────────────────────────────────────

export interface PrepareSetupRequest {
  /** The user's (counterfactual) smart account — the 4337 sender. */
  walletAddress: string
  /** owner[0]: the user's owner EOA (the browser signs with this; non-custodial). */
  userEoa: string
  /** The SpendPermission to grant (account == walletAddress, spender = Sippy, …). */
  permission: RawPermission
  /** For the masked semantic-action label / logging only. */
  fromPhoneNumber: string
}

export type PrepareSetupOutcome =
  | { sponsored: true; opId: string; unsignedUserOp: Record<string, unknown>; userOpHash: string }
  /** Any pre-broadcast failure — the caller (endpoint) runs legacy GasRefuel onboarding. */
  | { sponsored: false; reason: string }

export interface SubmitSetupRequest {
  opId: string
  /**
   * The authenticated wallet (from the JWT/session) — bound against `row.sender`
   * INSIDE the service, so a leaked `opId` can't be used by another authenticated
   * user to cancel/strand someone else's sponsored op. The endpoint cannot forget it.
   */
  walletAddress: string
  /** The raw ECDSA signature from the browser over the row's userOpHash. */
  signature: string
}

export type SubmitSetupOutcome =
  | { status: 'landed'; transactionHash: string; userOpHash: string }
  /** Pre-broadcast failure (bad sig / re-sim reject / bundler reject) → run legacy. */
  | { status: 'fallback'; reason: string }
  /** Row cancelled or already submitted — 409, nothing broadcast. */
  | { status: 'conflict'; reason: string }

/** Confirmed on-chain revert — terminal. Never legacy, never reconcile. */
export class SetupOpRevertedError extends Error {
  constructor(userOpHash: string) {
    super(`gas_aa setup: op reverted on-chain (${userOpHash})`)
    this.name = 'SetupOpRevertedError'
  }
}

// ── Injectable dependencies (real engine + tests) ────────────────────────────

export interface SetupSubmitterDeps {
  resolveNonce(sender: string): Promise<bigint>
  /** Build the [userEOA, SPM] account + [approve] op, fetch the paymaster (fires the
   *  webhook), return the sponsored UNSIGNED op + its userOpHash. */
  buildAndSponsor(args: {
    walletAddress: string
    userEoa: string
    permission: RawPermission
    nonce: bigint
  }): Promise<{ unsignedUserOp: Record<string, unknown>; userOpHash: string }>
  /** Verify the browser sig recovers to userEoa over userOpHash; wrap → signed op. */
  verifyAndWrap(args: {
    unsignedUserOp: Record<string, unknown>
    userOpHash: string
    userEoa: string
    signature: string
  }): Promise<{ ok: boolean; signedUserOp?: Record<string, unknown> }>
  /** Optional local re-validation with the wrapped sig (belt-and-suspenders). */
  simulate?(signedUserOp: Record<string, unknown>): Promise<'ok' | 'reject' | 'unknown'>
  /** Broadcast. Resolves with the userOpHash on ACCEPT; throws on reject/network. */
  sendRaw(signedUserOp: Record<string, unknown>): Promise<string>
  /** Classify a sendRaw throw: a definite bundler VALIDATION reject vs ambiguous. */
  classifyRejection(err: unknown): 'reject' | 'ambiguous'
  waitReceipt(userOpHash: string): Promise<{ success: boolean; transactionHash: string }>
  getByHash(userOpHash: string): Promise<boolean>
  ledger: {
    insertAuthorized: typeof ledger.insertAuthorized
    setNonce: typeof ledger.setNonce
    maxActiveNonce: typeof ledger.maxActiveNonce
    markAwaitingSignature: typeof ledger.markAwaitingSignature
    cancelSetupOp: typeof ledger.cancelSetupOp
    markPreparedFromAwaitingSignature: typeof ledger.markPreparedFromAwaitingSignature
    failSetupOp: typeof ledger.failSetupOp
    markFailed: typeof ledger.markFailed
    markLanded: typeof ledger.markLanded
    getById: typeof ledger.getById
    findResumableSetupOp: typeof ledger.findResumableSetupOp
  }
}

let deps: SetupSubmitterDeps = makeDefaultDeps()
export function __setDepsForTest(partial: Partial<SetupSubmitterDeps>): void {
  deps = { ...deps, ...partial, ledger: { ...deps.ledger, ...(partial.ledger ?? {}) } }
}
export function __resetDeps(): void {
  deps = makeDefaultDeps()
}

const MAX_NONCE_ATTEMPTS = 8
function isActiveNonceCollision(e: any): boolean {
  const code = e?.code ?? e?.cause?.code
  const text = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`
  return code === '23505' || text.includes('uniq_gas_aa_active_nonce')
}

/**
 * Claim a free nonce on the row while it's still `authorized`. next nonce =
 * max(on-chain, in-flight high-water + 1); retry on the active-nonce collision.
 * Setup-local copy (the live free-send claimNonce stays untouched — R2). For a
 * fresh user account the on-chain nonce is 0; contention only across a user's own
 * concurrent /prepare calls, which the lock + DB index serialise.
 */
async function claimSetupNonce(
  id: string,
  sender: string,
  chainId: number,
  entryPoint: string
): Promise<bigint> {
  for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt++) {
    const onChain = await deps.resolveNonce(sender)
    const maxActive = await deps.ledger.maxActiveNonce(chainId, entryPoint, sender)
    const nonce = maxActive !== null && maxActive + 1n > onChain ? maxActive + 1n : onChain
    try {
      await deps.ledger.setNonce(id, nonce.toString())
      return nonce
    } catch (e) {
      if (isActiveNonceCollision(e)) continue
      throw e
    }
  }
  throw new Error(`gas_aa setup: could not allocate a free nonce for ${sender}`)
}

// ── prepare ──────────────────────────────────────────────────────────────────

/**
 * Build + sponsor the cold op, write the row (authorized → awaiting_signature), and
 * return the UNSIGNED op for the browser. Nothing is broadcast, so ANY failure here
 * is pre-broadcast: the row is terminalized (freeing the nonce) and we signal the
 * caller to fall back to legacy onboarding.
 */
export async function prepareSetupOp(req: PrepareSetupRequest): Promise<PrepareSetupOutcome> {
  const chainId = getChainId()
  const entryPoint = ENTRY_POINT_V06
  const calls = buildSetupCalls({
    spendManager: SPEND_PERMISSION_MANAGER,
    permission: req.permission,
  })
  const cHash = callsHash(calls)
  const capBucket = capBucketForAccount(req.walletAddress)
  const { initCodeHash } = expectedSetupInitCode(req.userEoa, SPEND_PERMISSION_MANAGER)

  // The whole critical section is inside the try (R5): a DB blip on insertAuthorized
  // or the sponsorship fetch degrades to legacy, it never hard-fails onboarding. The
  // per-sender nonce lock also makes /prepare IDEMPOTENT (redline #5): the resume
  // check + insert + build all run under it, so concurrent double-taps serialize and
  // the second sees the first's awaiting_signature op and resumes it — no second
  // sponsored op, no second nonce burned on the active-nonce index.
  let id: string | null = null
  try {
    const result = await withNonceLock(
      nonceLockKey(chainId, entryPoint, req.walletAddress),
      async (): Promise<{
        opId: string
        unsignedUserOp: Record<string, unknown>
        userOpHash: string
      }> => {
        // Resume an already-prepared op for this sender (double-tab / retried /prepare):
        // the user signs the one that's there. No insert, no nonce, no sponsorship fetch.
        const resumable = await deps.ledger.findResumableSetupOp(
          chainId,
          entryPoint,
          req.walletAddress
        )
        if (resumable?.unsignedUserOp && resumable.userOpHash) {
          logger.info(
            `gas_aa setup: resuming awaiting_signature op ${resumable.id} for ${maskPhone(req.fromPhoneNumber)}`
          )
          return {
            opId: resumable.id,
            unsignedUserOp: resumable.unsignedUserOp,
            userOpHash: resumable.userOpHash,
          }
        }

        id = await deps.ledger.insertAuthorized({
          lane: 'setup',
          semanticActionId: `setup:${maskPhone(req.fromPhoneNumber)}`,
          sender: req.walletAddress,
          decodedUser: req.walletAddress, // permission.account == sender
          chainId,
          entryPoint,
          callsHash: cHash,
          capBucket,
          initCodeHash,
          meta: { userEoa: req.userEoa.toLowerCase() },
        })
        const opId = id
        const nonce = await claimSetupNonce(opId, req.walletAddress, chainId, entryPoint)
        // paymaster fetch fires the webhook, which matches this authorized row (incl.
        // init_code_hash) and sponsors. Returns the UNSIGNED op + its userOpHash.
        const built = await deps.buildAndSponsor({
          walletAddress: req.walletAddress,
          userEoa: req.userEoa,
          permission: req.permission,
          nonce,
        })
        await deps.ledger.markAwaitingSignature(opId, {
          userOpHash: built.userOpHash,
          unsignedUserOp: built.unsignedUserOp,
          userEoa: req.userEoa,
        })
        return { opId, unsignedUserOp: built.unsignedUserOp, userOpHash: built.userOpHash }
      }
    )
    return {
      sponsored: true,
      opId: result.opId,
      unsignedUserOp: result.unsignedUserOp,
      userOpHash: result.userOpHash,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Pre-broadcast: terminalize the row (best-effort — if the gas_aa DB is the thing
    // that's down, its own write fails too, and that must NOT break the legacy path).
    if (id) await deps.ledger.markFailed(id, `setup prepare: ${msg}`).catch(() => {})
    logger.warn(`gas_aa setup: prepare failed (→ legacy) for op ${id ?? '(no row)'}: ${msg}`)
    return { sponsored: false, reason: msg }
  }
}

// ── submit ───────────────────────────────────────────────────────────────────

/**
 * Return `fallback` (→ legacy onboarding) ONLY if `terminalize()` durably won the
 * row. The B1.1a contract: legacy may run only after the sponsored op is atomically
 * terminalized, else it double-grants. A `false` (the row advanced/landed
 * concurrently) or a throw (DB blip — can't confirm) becomes `conflict`: the endpoint
 * 409s and does NOT run legacy; any still-`prepared` row is owned by the reconciler.
 */
async function fallbackIfTerminalized(
  terminalize: () => Promise<boolean>,
  reason: string
): Promise<SubmitSetupOutcome> {
  let won: boolean
  try {
    won = await terminalize()
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    logger.warn(`gas_aa setup: terminalize-for-fallback failed (→ conflict, NOT legacy): ${m}`)
    return { status: 'conflict', reason: `could not terminalize op for fallback: ${m}` }
  }
  if (!won) {
    return {
      status: 'conflict',
      reason: `op advanced before terminalization; not legacy-safe (${reason})`,
    }
  }
  return { status: 'fallback', reason }
}

/**
 * Verify the browser signature, persist the signed op, and broadcast — with the
 * failure envelope above. The op is identified ONLY by opId; the verify is against
 * the row's PERSISTED userOpHash + userEoa (never request-supplied values).
 */
export async function submitSetupOp(req: SubmitSetupRequest): Promise<SubmitSetupOutcome> {
  const row = await deps.ledger.getById(req.opId)
  if (!row || row.status !== 'awaiting_signature') {
    return { status: 'conflict', reason: 'op is not awaiting signature' }
  }
  // Same-session binding FIRST, before ANY side effect (cancel / verify / send): the
  // op must belong to the authenticated wallet. A mismatch returns `conflict` with no
  // effects, so a leaked opId can't strand or cancel another user's sponsored op.
  if (row.sender.toLowerCase() !== req.walletAddress.toLowerCase()) {
    return { status: 'conflict', reason: 'op does not belong to this session' }
  }
  if (!row.userOpHash || !row.unsignedUserOp || !row.userEoa) {
    return { status: 'conflict', reason: 'awaiting-signature row is missing persisted op fields' }
  }

  // 1. Verify the sig recovers to the persisted owner over the persisted hash, then
  //    wrap. A bad/abandoned signature is pre-broadcast → cancel (atomic) → legacy.
  const verified = await deps.verifyAndWrap({
    unsignedUserOp: row.unsignedUserOp,
    userOpHash: row.userOpHash,
    userEoa: row.userEoa,
    signature: req.signature,
  })
  if (!verified.ok || !verified.signedUserOp) {
    // Pre-broadcast: cancel must WIN the row before we let legacy run (a concurrent
    // submit may have flipped it to prepared; a DB blip can't confirm).
    return await fallbackIfTerminalized(
      () => deps.ledger.cancelSetupOp(req.opId),
      'signature did not recover to the wallet owner'
    )
  }
  const signedOp = verified.signedUserOp

  // 2. Optional local re-sim with the ACTUAL wrapped sig — catches a stale nonce /
  //    expired sponsorship and fails clean (cancel → legacy) instead of as a bundler
  //    reject. A flaky-RPC 'unknown' does NOT block (the bundler will validate).
  if (deps.simulate) {
    const sim = await deps.simulate(signedOp).catch(() => 'unknown' as const)
    if (sim === 'reject') {
      return await fallbackIfTerminalized(
        () => deps.ledger.cancelSetupOp(req.opId),
        'local validation re-sim rejected the op'
      )
    }
  }

  // 3. Persist the SIGNED op + flip to prepared BEFORE the broadcast boundary (R5).
  //    The atomic guard (shared with cancelSetupOp) is the mutual exclusion: if it
  //    didn't flip, the row was cancelled by a fallback or already submitted.
  const flipped = await deps.ledger.markPreparedFromAwaitingSignature(req.opId, signedOp)
  if (!flipped) {
    return { status: 'conflict', reason: 'op was cancelled or already submitted' }
  }

  // 4. Cross the broadcast boundary.
  let userOpHash: string
  try {
    userOpHash = await deps.sendRaw(signedOp)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (deps.classifyRejection(err) === 'reject') {
      // Bundler VALIDATION reject — the op was never accepted (no on-chain effect).
      // The row is already `prepared`, so legacy is safe ONLY if we DURABLY fail it
      // first: a still-`prepared` row would be rebroadcast by the reconciler and race
      // the legacy grant. failSetupOp reports whether it won; if not, → conflict.
      logger.warn(`gas_aa setup: bundler rejected op ${req.opId}: ${msg}`)
      return await fallbackIfTerminalized(
        () => deps.ledger.failSetupOp(req.opId, `bundler rejected: ${msg}`),
        `bundler rejected the op: ${msg}`
      )
    }
    // Ambiguous (network/timeout — the bundler MAY have accepted) → reconcile by hash,
    // NEVER legacy (that could double-grant a landed op).
    logger.warn(`gas_aa setup: post-prepare ambiguity for op ${req.opId} (reconcile): ${msg}`)
    return await reconcileSetup(req.opId, row.userOpHash)
  }

  // 5. Accepted → wait + settle. In correct 4337 the bundler's returned hash equals
  //    the userOpHash we persisted; a mismatch means a formatter/hash drift between
  //    prepare and send (the row + reconciler track row.userOpHash) — alert loudly.
  if (userOpHash.toLowerCase() !== row.userOpHash.toLowerCase()) {
    logger.error(
      {
        alert: 'gas-aa-setup-hash-drift',
        opId: req.opId,
        persisted: row.userOpHash,
        returned: userOpHash,
      },
      `gas_aa setup: sendRaw returned a userOpHash != persisted for op ${req.opId} — reconciler may drift`
    )
  }
  const receipt = await deps.waitReceipt(userOpHash)
  if (!receipt.success) {
    await deps.ledger.markFailed(req.opId, 'setup op reverted on-chain').catch(() => {})
    throw new SetupOpRevertedError(userOpHash)
  }
  await deps.ledger.markLanded(req.opId, receipt.transactionHash).catch(() => {})
  logger.info(`gas_aa setup: op ${req.opId} landed sponsored, tx ${receipt.transactionHash}`)
  return { status: 'landed', transactionHash: receipt.transactionHash, userOpHash }
}

/**
 * Post-boundary reconcile (a crash/ambiguity after markPrepared): query the bundler
 * by hash, idempotently rebroadcast the IDENTICAL stored signed op if unknown (same
 * hash ⇒ EntryPoint dedups), then wait + settle. Never legacy, never a rebuild.
 */
export async function reconcileSetup(
  opId: string,
  userOpHash: string
): Promise<SubmitSetupOutcome> {
  const known = await deps.getByHash(userOpHash).catch(() => false)
  if (!known) {
    const row = await deps.ledger.getById(opId)
    if (!row?.signedUserOp) {
      await deps.ledger
        .markFailed(opId, 'prepared row missing signed op at reconcile')
        .catch(() => {})
      throw new Error(`gas_aa setup: prepared op ${opId} has no signed op to rebroadcast`)
    }
    try {
      await deps.sendRaw(row.signedUserOp)
    } catch (e) {
      logger.info(
        `gas_aa setup: rebroadcast of op ${opId} returned ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }
  const receipt = await deps.waitReceipt(userOpHash)
  if (!receipt.success) {
    await deps.ledger.markFailed(opId, 'reverted after rebroadcast').catch(() => {})
    throw new SetupOpRevertedError(userOpHash)
  }
  await deps.ledger.markLanded(opId, receipt.transactionHash).catch(() => {})
  return { status: 'landed', transactionHash: receipt.transactionHash, userOpHash }
}

// ── Default (real) network engine ────────────────────────────────────────────

const SIGNATURE_WRAPPER = parseAbiParameters('(uint256 ownerIndex, bytes signatureData)')

function makeDefaultDeps(): SetupSubmitterDeps {
  return {
    resolveNonce: realResolveNonce,
    buildAndSponsor: realBuildAndSponsor,
    verifyAndWrap: realVerifyAndWrap,
    simulate: undefined, // wired in a later slice if we adopt the belt-and-suspenders re-sim
    sendRaw: realSendRaw,
    classifyRejection: classifyBundlerRejection,
    waitReceipt: realWaitReceipt,
    getByHash: realGetByHash,
    ledger: {
      insertAuthorized: ledger.insertAuthorized,
      setNonce: ledger.setNonce,
      maxActiveNonce: ledger.maxActiveNonce,
      markAwaitingSignature: ledger.markAwaitingSignature,
      cancelSetupOp: ledger.cancelSetupOp,
      markPreparedFromAwaitingSignature: ledger.markPreparedFromAwaitingSignature,
      failSetupOp: ledger.failSetupOp,
      markFailed: ledger.markFailed,
      markLanded: ledger.markLanded,
      getById: ledger.getById,
      findResumableSetupOp: ledger.findResumableSetupOp,
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
}
let realCtx: RealCtx | null = null
async function getCtx(): Promise<RealCtx> {
  if (realCtx) return realCtx
  const publicClient = createPublicClient({ chain: getViemChain(), transport: http(getRpcUrl()) })
  const bundler = createBundlerClient({
    client: publicClient,
    transport: http(getPimlicoUrl()),
    paymaster: true,
    paymasterContext: { sponsorshipPolicyId: getSetupSponsorshipPolicyId() },
    userOperation: { estimateFeesPerGas: pimlicoGasPrice },
  })
  realCtx = { publicClient, bundler }
  return realCtx
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

/** Build the user's [userEOA, SPM] account (owners as ADDRESSES — non-custodial, no
 *  signer), the [approve] op + initCode, fetch the paymaster, return the unsigned op. */
async function realBuildAndSponsor(args: {
  walletAddress: string
  userEoa: string
  permission: RawPermission
  nonce: bigint
}): Promise<{ unsignedUserOp: Record<string, unknown>; userOpHash: string }> {
  const { publicClient, bundler } = await getCtx()
  const account = await toCoinbaseSmartAccount({
    client: publicClient as any,
    owners: [getAddress(args.userEoa), getAddress(SPEND_PERMISSION_MANAGER)],
    version: '1.1',
  })
  if (account.address.toLowerCase() !== args.walletAddress.toLowerCase()) {
    throw new Error('gas_aa setup: derived account != phone_registry.wallet_address (convergence)')
  }
  const calls = buildSetupCalls({
    spendManager: SPEND_PERMISSION_MANAGER,
    permission: args.permission,
  }).map((c) => ({ to: c.to, value: c.value, data: c.data }))
  const prepared = await bundler.prepareUserOperation({ account, calls, nonce: args.nonce })
  const userOpHash = getUserOperationHash({
    chainId: getChainId(),
    entryPointAddress: ENTRY_POINT_V06 as Hex,
    entryPointVersion: '0.6',
    userOperation: prepared as any,
  })
  // Store the op WITHOUT a signature — the browser signs userOpHash; submit wraps it.
  const rpcOp = formatUserOperationRequest({ ...prepared, signature: '0x' } as any) as Record<
    string,
    unknown
  >
  return { unsignedUserOp: rpcOp, userOpHash }
}

async function realVerifyAndWrap(args: {
  unsignedUserOp: Record<string, unknown>
  userOpHash: string
  userEoa: string
  signature: string
}): Promise<{ ok: boolean; signedUserOp?: Record<string, unknown> }> {
  let recovered: string
  try {
    recovered = await recoverAddress({
      hash: args.userOpHash as Hex,
      signature: args.signature as Hex,
    })
  } catch {
    return { ok: false }
  }
  if (recovered.toLowerCase() !== args.userEoa.toLowerCase()) return { ok: false }
  // SignatureWrapper(ownerIndex=0, sig) — owner[0] is the userEOA in [userEOA, SPM].
  const wrapped = encodeAbiParameters(SIGNATURE_WRAPPER, [
    { ownerIndex: 0n, signatureData: args.signature as Hex },
  ])
  return { ok: true, signedUserOp: { ...args.unsignedUserOp, signature: wrapped } }
}

async function realSendRaw(rpcOp: Record<string, unknown>): Promise<string> {
  const { bundler } = await getCtx()
  return (await bundler.request({
    method: 'eth_sendUserOperation',
    params: [rpcOp, ENTRY_POINT_V06],
  })) as string
}

/**
 * A bundler VALIDATION reject (the op was never accepted) vs an ambiguous failure
 * (network/timeout — it might have been accepted). Conservative: only a recognised
 * 4337 validation error counts as a definite 'reject' → legacy-safe; everything else
 * is 'ambiguous' → reconcile (never legacy), so we never double-grant a landed op.
 */
export function classifyBundlerRejection(err: any): 'reject' | 'ambiguous' {
  const text =
    `${err?.message ?? ''} ${err?.details ?? ''} ${err?.cause?.message ?? ''}`.toLowerCase()
  if (text.includes('already known') || text.includes('already exists')) return 'ambiguous'
  // EntryPoint v0.6 validation failures + paymaster rejections are definite no-accepts.
  if (
    /\baa[0-9]{2}\b/.test(text) ||
    text.includes('validation reverted') ||
    text.includes('invalid userop') ||
    text.includes('signature error')
  ) {
    return 'reject'
  }
  return 'ambiguous'
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
