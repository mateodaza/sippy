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
