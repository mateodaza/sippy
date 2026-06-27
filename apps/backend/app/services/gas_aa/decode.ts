/**
 * Gas → AA — call encoding + decoding (the DB-binding crux).
 *
 * ONE source of truth for the free-send op shape. The submitter builds the
 * `spend + USDC.transfer` calls here and hashes them; the webhook decodes the
 * inbound UserOp's `callData` back into the same calls and recomputes the same
 * hash. The `calls_hash` only matches if the op is byte-identical to what was
 * authorized — so an attacker who crafts valid-looking calldata still can't
 * find a matching prepared-op row. Decoding is for deriving the bound fields;
 * authorization is the DB row, never the decode alone.
 *
 * Encoding is via viem (canonical ABI bytes), independent of the legacy ethers
 * path in embedded_wallet.service — the resulting on-chain calldata is identical
 * because ABI encoding is canonical, so the flag-off path is byte-for-byte.
 */

import {
  keccak256,
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionData,
  getAddress,
  pad,
  concat,
  type Hex,
  type Address,
} from 'viem'

/** A single 4337 call: target / value / calldata. */
export interface Call {
  to: Address
  value: bigint
  data: Hex
}

/** The raw spend-permission struct as CDP returns it (fields may be string|bigint|number). */
export interface RawPermission {
  account: string
  spender: string
  token: string
  allowance: bigint | string | number
  period: bigint | string | number
  start: bigint | string | number
  end: bigint | string | number
  salt: bigint | string | number
  extraData?: string
}

// ── ABIs (viem format) ───────────────────────────────────────────────────────

const SPEND_PERMISSION_COMPONENTS = [
  { name: 'account', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'token', type: 'address' },
  { name: 'allowance', type: 'uint160' },
  { name: 'period', type: 'uint48' },
  { name: 'start', type: 'uint48' },
  { name: 'end', type: 'uint48' },
  { name: 'salt', type: 'uint256' },
  { name: 'extraData', type: 'bytes' },
] as const

const SPEND_ABI = [
  {
    type: 'function',
    name: 'spend',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spendPermission', type: 'tuple', components: SPEND_PERMISSION_COMPONENTS },
      { name: 'value', type: 'uint160' },
    ],
    outputs: [],
  },
] as const

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// Coinbase Smart Wallet executors. The free-send is always a 2-call batch, so
// viem emits `executeBatch`; `execute` is handled defensively for single calls.
const SMART_WALLET_EXEC_ABI = [
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

// ABI parameter used to hash the calls array canonically (both sides).
const CALLS_HASH_ABI = [
  {
    name: 'calls',
    type: 'tuple[]',
    components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
] as const

// ── Encoding (submitter side) ────────────────────────────────────────────────

function toBig(v: bigint | string | number): bigint {
  return typeof v === 'bigint' ? v : BigInt(v)
}

/** Encode `SpendPermissionManager.spend(permission, amount)`. */
export function encodeSpendCall(
  spendManager: string,
  permission: RawPermission,
  amountUnits: bigint
): Call {
  const data = encodeFunctionData({
    abi: SPEND_ABI,
    functionName: 'spend',
    args: [
      {
        account: getAddress(permission.account),
        spender: getAddress(permission.spender),
        token: getAddress(permission.token),
        allowance: toBig(permission.allowance),
        period: Number(permission.period),
        start: Number(permission.start),
        end: Number(permission.end),
        salt: toBig(permission.salt),
        extraData: (permission.extraData as Hex) || '0x',
      },
      amountUnits,
    ],
  })
  return { to: getAddress(spendManager), value: 0n, data }
}

/** Encode `USDC.transfer(to, amount)`. */
export function encodeTransferCall(usdcAddress: string, to: string, amountUnits: bigint): Call {
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [getAddress(to), amountUnits],
  })
  return { to: getAddress(usdcAddress), value: 0n, data }
}

/** Build the atomic [spend, transfer] batch for a free-send. */
export function buildFreeSendCalls(params: {
  spendManager: string
  permission: RawPermission
  usdcAddress: string
  recipient: string
  amountUnits: bigint
}): Call[] {
  return [
    encodeSpendCall(params.spendManager, params.permission, params.amountUnits),
    encodeTransferCall(params.usdcAddress, params.recipient, params.amountUnits),
  ]
}

/**
 * Canonical hash of a calls array — identical on the submitter (from the built
 * calls) and the webhook (from the decoded calls). Addresses/values/bytes go
 * through ABI encoding, so input casing/representation can't change the hash.
 */
export function callsHash(calls: Call[]): Hex {
  const tuples = calls.map((c) => ({ target: getAddress(c.to), value: c.value, data: c.data }))
  return keccak256(encodeAbiParameters(CALLS_HASH_ABI, [tuples]))
}

/**
 * Encode a calls array as Coinbase Smart Wallet `executeBatch` callData — the
 * same encoding viem's `toCoinbaseSmartAccount` produces, so it round-trips with
 * `decodeCalls`. Used by tests (and any caller that needs the raw callData).
 */
export function encodeExecuteBatch(calls: Call[]): Hex {
  return encodeFunctionData({
    abi: SMART_WALLET_EXEC_ABI,
    functionName: 'executeBatch',
    args: [calls.map((c) => ({ target: getAddress(c.to), value: c.value, data: c.data }))],
  })
}

/**
 * Encode a single call as Coinbase Smart Wallet `execute` callData — the envelope
 * viem's `encodeCalls` emits for a ONE-call op (vs `executeBatch` for batches).
 * Round-trips with `decodeCalls`. Used by tests + any single-call caller.
 */
export function encodeExecute(call: Call): Hex {
  return encodeFunctionData({
    abi: SMART_WALLET_EXEC_ABI,
    functionName: 'execute',
    args: [getAddress(call.to), call.value, call.data],
  })
}

// ── Decoding (webhook side) ──────────────────────────────────────────────────

/** Decode a UserOp's `callData` into the underlying calls (executeBatch/execute). */
export function decodeCalls(callData: Hex): Call[] {
  const decoded = decodeFunctionData({ abi: SMART_WALLET_EXEC_ABI, data: callData })
  if (decoded.functionName === 'executeBatch') {
    const [calls] = decoded.args as readonly [
      readonly { target: Address; value: bigint; data: Hex }[],
    ]
    return calls.map((c) => ({ to: c.target, value: c.value, data: c.data }))
  }
  // execute(target, value, data)
  const [target, value, data] = decoded.args as readonly [Address, bigint, Hex]
  return [{ to: target, value, data }]
}

/** The bound fields the webhook authorizes against, derived purely from calldata. */
export interface DecodedFreeSend {
  calls: Call[]
  account: Address // permission.account — the real user
  spender: Address // permission.spender — must be the Sippy spender
  token: Address // permission.token — must be USDC
  recipient: Address // USDC.transfer recipient
  spendAmount: bigint // spend(value)
  transferAmount: bigint // transfer(amount)
  callsHash: Hex
}

/**
 * Decode + shape-check a free-send op: exactly [spend, transfer] where spend
 * targets the SpendPermissionManager and transfer targets USDC. Returns null if
 * the op isn't that shape — the caller treats null as "not a sponsorable
 * free-send" and refuses to sponsor.
 */
export function decodeFreeSendOp(
  callData: Hex,
  opts: { spendManager: string; usdcAddress: string }
): DecodedFreeSend | null {
  let calls: Call[]
  try {
    calls = decodeCalls(callData)
  } catch {
    return null
  }
  if (calls.length !== 2) return null

  const [spendCall, transferCall] = calls
  if (getAddress(spendCall.to) !== getAddress(opts.spendManager)) return null
  if (getAddress(transferCall.to) !== getAddress(opts.usdcAddress)) return null

  let permission: {
    account: Address
    spender: Address
    token: Address
  }
  let spendAmount: bigint
  let recipient: Address
  let transferAmount: bigint
  try {
    const spend = decodeFunctionData({ abi: SPEND_ABI, data: spendCall.data })
    if (spend.functionName !== 'spend') return null
    const [perm, value] = spend.args as readonly [
      { account: Address; spender: Address; token: Address },
      bigint,
    ]
    permission = { account: perm.account, spender: perm.spender, token: perm.token }
    spendAmount = value

    const transfer = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: transferCall.data })
    if (transfer.functionName !== 'transfer') return null
    const [to, amount] = transfer.args as readonly [Address, bigint]
    recipient = to
    transferAmount = amount
  } catch {
    return null
  }

  return {
    calls,
    account: getAddress(permission.account),
    spender: getAddress(permission.spender),
    token: getAddress(permission.token),
    recipient: getAddress(recipient),
    spendAmount,
    transferAmount,
    callsHash: callsHash(calls),
  }
}

/**
 * Cap bucket for the free-send lane — the dimension the per-account cap is
 * scoped to. Bound to the SENDING account (permission.account), never the
 * shared spender. Stable (no date component) so the webhook recomputes it
 * exactly. Per-day enforcement lives in the app velocity checks + the Pimlico
 * policy, not in this string.
 */
export function capBucketForAccount(account: string): string {
  return `acct:${account.toLowerCase()}`
}

// ── Setup lane (Track B) — sponsored cold deploy + approve ────────────────────
//
// The onboarding op is a SINGLE-call `approve(SpendPermission)` from the user's
// own (counterfactual) smart account, carrying the public-factory initCode that
// deploys it in the same op. This is the exact shape decoded from a real prod
// grant (~478k gas, self-paid today → Pimlico-sponsored here). The encode/decode
// + bindings below are the pure half of the lane; the row/webhook wiring is B1.1.

/**
 * Public Coinbase Smart Wallet Factory (v1.1) — the factory present in every real
 * grant's initCode on Arbitrum One. `createAccount([userEOA, SPM], 0)` → the user
 * account. (Convergence with viem's `toCoinbaseSmartAccount` is pinned by a test.)
 */
export const COINBASE_SMART_WALLET_FACTORY = '0xba5ed110efdba3d005bfc882d75358acbbb85842'

const APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spendPermission', type: 'tuple', components: SPEND_PERMISSION_COMPONENTS }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'payable',
    inputs: [
      { name: 'owners', type: 'bytes[]' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
] as const

/** RawPermission → the on-chain SpendPermission struct (canonical field order). */
function permToStruct(p: RawPermission) {
  return {
    account: getAddress(p.account),
    spender: getAddress(p.spender),
    token: getAddress(p.token),
    allowance: toBig(p.allowance),
    period: Number(p.period),
    start: Number(p.start),
    end: Number(p.end),
    salt: toBig(p.salt),
    extraData: (p.extraData as Hex) || '0x',
  }
}

/** Encode `SpendPermissionManager.approve(permission)`. */
export function encodeApproveCall(spendManager: string, permission: RawPermission): Call {
  const data = encodeFunctionData({
    abi: APPROVE_ABI,
    functionName: 'approve',
    args: [permToStruct(permission)],
  })
  return { to: getAddress(spendManager), value: 0n, data }
}

/** The single-call `[approve]` batch for a sponsored setup (the cold deploy+approve op). */
export function buildSetupCalls(params: {
  spendManager: string
  permission: RawPermission
}): Call[] {
  return [encodeApproveCall(params.spendManager, params.permission)]
}

/**
 * Expected `initCode` for a setup op: the public factory's
 * `createAccount([userEOA, SPM], 0)`. Part of the setup security boundary — the
 * webhook binds the op's initCode to exactly this. Owners are abi-encoded as
 * 32-byte words (the Coinbase Smart Wallet owner-bytes encoding for EOA owners).
 */
export function expectedSetupInitCode(
  userEOA: string,
  spendManager: string,
  factory: string = COINBASE_SMART_WALLET_FACTORY
): { initCode: Hex; initCodeHash: Hex } {
  const owners = [
    pad(getAddress(userEOA), { size: 32 }),
    pad(getAddress(spendManager), { size: 32 }),
  ]
  const factoryData = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'createAccount',
    args: [owners, 0n],
  })
  const initCode = concat([getAddress(factory), factoryData])
  return { initCode, initCodeHash: keccak256(initCode) }
}

export interface DecodedSetupOp {
  calls: Call[]
  account: Address // permission.account — must equal the op sender
  spender: Address
  token: Address
  allowance: bigint
  callsHash: Hex
}

/**
 * Decode + shape-check a setup op: EXACTLY one call, `approve(SpendPermission)`
 * targeting the SpendPermissionManager, with no ETH value. Returns null if the op
 * isn't that shape (caller treats null as "not a sponsorable setup op"). The
 * contextual bindings (account==sender, spender, token, allowance≤tier, initCode)
 * are checked by `checkSetupOp`.
 */
export function decodeSetupOp(
  callData: Hex,
  opts: { spendManager: string }
): DecodedSetupOp | null {
  let calls: Call[]
  try {
    calls = decodeCalls(callData)
  } catch {
    return null
  }
  if (calls.length !== 1) return null // exactly one call — no extra calls
  const [approveCall] = calls
  if (getAddress(approveCall.to) !== getAddress(opts.spendManager)) return null
  if (approveCall.value !== 0n) return null // no ETH value

  try {
    const decoded = decodeFunctionData({ abi: APPROVE_ABI, data: approveCall.data })
    if (decoded.functionName !== 'approve') return null
    const [perm] = decoded.args as readonly [
      { account: Address; spender: Address; token: Address; allowance: bigint },
    ]
    return {
      calls,
      account: getAddress(perm.account),
      spender: getAddress(perm.spender),
      token: getAddress(perm.token),
      allowance: perm.allowance,
      callsHash: callsHash(calls),
    }
  } catch {
    return null
  }
}

export interface SetupCheckContext {
  sender: string // the op sender (the user's smart account)
  userEOA: string // the account owner — for the initCode binding
  spender: string // the Sippy spender
  usdcAddress: string
  tierCapUnits: bigint // max allowance in USDC base units
  spendManager: string
  initCode: Hex // the op's initCode (from the UserOp)
  factory?: string
}

/**
 * The contextual setup bindings (§5 of GAS_AA_SETUP_OP_CONTRACT.md). Every check
 * has a matching negative test. The webhook runs this AFTER decodeSetupOp; the DB
 * row stays the authority — this only derives + checks the bound fields.
 */
export function checkSetupOp(
  decoded: DecodedSetupOp,
  ctx: SetupCheckContext
): { ok: true } | { ok: false; reason: string } {
  if (decoded.account.toLowerCase() !== ctx.sender.toLowerCase()) {
    return { ok: false, reason: 'permission.account != sender' }
  }
  if (decoded.spender.toLowerCase() !== ctx.spender.toLowerCase()) {
    return { ok: false, reason: 'permission.spender != Sippy spender' }
  }
  if (decoded.token.toLowerCase() !== ctx.usdcAddress.toLowerCase()) {
    return { ok: false, reason: 'token is not USDC' }
  }
  if (decoded.allowance > ctx.tierCapUnits) {
    return { ok: false, reason: 'allowance exceeds tier cap' }
  }
  const expected = expectedSetupInitCode(ctx.userEOA, ctx.spendManager, ctx.factory)
  if (ctx.initCode.toLowerCase() !== expected.initCode.toLowerCase()) {
    return { ok: false, reason: 'initCode != factory.createAccount([userEOA, SPM], 0)' }
  }
  return { ok: true }
}
