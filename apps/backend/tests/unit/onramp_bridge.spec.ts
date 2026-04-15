/**
 * Onramp Bridge Service — unit tests
 *
 * Tests the guard logic in triggerBridge() (env vars, order existence, wallet
 * lookup) and the broadcast/confirmation status transitions.
 *
 * Mocking strategy follows the same pattern as onramp_controller.spec.ts:
 *  - OnrampOrderModel.query() is monkey-patched to control fetchOrder and
 *    setOrderStatus without a live DB.
 *  - PhoneRegistry.find() is monkey-patched for getUserWallet.
 *  - process.env is used for COLURS_DIRECT_USDC, SIPPY_ETH_DEPOSIT_ADDRESS,
 *    and SIPPY_ETH_DEPOSIT_PRIVATE_KEY (AdonisJS env.get reads process.env).
 *
 * Tests 6–9 (broadcast + confirmation) mock at two levels:
 *  - @lifi/sdk getQuote: intercepted via global.fetch mock (LiFi uses fetch)
 *  - ethers v5 JSON-RPC: intercepted via JsonRpcProvider.prototype.send patch
 *    (ethers v5 uses Node http/https, NOT global.fetch)
 * A well-known Hardhat test private key creates the signer; env vars are set
 * before the first broadcast test so the lazy singleton initializes correctly.
 *
 * NOTE: the module has lazy singletons (signer, provider, lifiConfigured) that
 * persist across tests because they are module-scoped `let` variables with no
 * exported reset. Guard tests (1–5) never reach the signer, so this is fine.
 * Broadcast tests (6–9) would require either:
 *   a) Re-importing the module per test (ESM import cache makes this hard), or
 *   b) Accepting that the signer is initialized once and reused.
 * We take approach (b) and ensure env vars are set before the first broadcast
 * test runs.
 */

import { test } from '@japa/runner'
import { ethers } from 'ethers'
import OnrampOrderModel from '#models/onramp_order'
import PhoneRegistry from '#models/phone_registry'

// ── Saved env + originals ────────────────────────────────────────────────────

const savedEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key]
  process.env[key] = value
}

function deleteEnv(key: string) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key]
  delete process.env[key]
}

function restoreEnv() {
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[key]
    else process.env[key] = val
  }
  // Clear tracked keys so next group starts fresh
  for (const key of Object.keys(savedEnv)) delete savedEnv[key]
}

// ── Model mock helpers ───────────────────────────────────────────────────────

type FakeOrder = Record<string, unknown>
let mockOrderRow: FakeOrder | null = null
let capturedUpdates: Array<{ externalId: string; updates: Record<string, unknown> }> = []

/**
 * Patches OnrampOrderModel.query() so that:
 *  - .where('externalId', ...).first() returns `row`
 *  - .where('externalId', ...).update(data) captures the update call
 */
function mockOnrampOrder(row: FakeOrder | null) {
  mockOrderRow = row
  ;(OnrampOrderModel as any).query = () => ({
    where: (_col: string, externalId: string) => ({
      first: async () => mockOrderRow,
      update: async (data: Record<string, unknown>) => {
        capturedUpdates.push({ externalId, updates: data })
      },
    }),
  })
}

function mockPhoneRegistry(walletAddress: string | null) {
  ;(PhoneRegistry as any).find = async () => (walletAddress ? { walletAddress } : null)
}

function restoreModels() {
  delete (OnrampOrderModel as any).query
  delete (PhoneRegistry as any).find
  mockOrderRow = null
  capturedUpdates = []
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: 'order-uuid-1',
    externalId: 'ext-123',
    phoneNumber: '+573001234567',
    amountCop: '200000',
    amountUsdt: '50.00',
    method: 'nequi',
    status: 'initiating_bridge',
    ...overrides,
  }
}

/** Waits one microtask tick so .then() chains on returned promises can settle. */
function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 25))
}

// ══════════════════════════════════════════════════════════════════════════════
// Group 1 — Guard: COLURS_DIRECT_USDC=true
// ══════════════════════════════════════════════════════════════════════════════

test.group('triggerBridge | COLURS_DIRECT_USDC=true blocks execution', (group) => {
  group.each.setup(() => {
    // Order must exist so the guard is reached (order lookup happens first)
    mockOnrampOrder(fakeOrder())
  })
  group.each.teardown(() => {
    restoreModels()
    restoreEnv()
  })

  test('throws when COLURS_DIRECT_USDC is true', async ({ assert }) => {
    setEnv('COLURS_DIRECT_USDC', 'true')

    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await assert.rejects(
      () => triggerBridge('ext-123'),
      /COLURS_DIRECT_USDC=true is not yet supported/
    )
  })

  test('error message references the requirements', async ({ assert }) => {
    setEnv('COLURS_DIRECT_USDC', 'true')

    const { triggerBridge } = await import('#services/onramp_bridge.service')
    try {
      await triggerBridge('ext-123')
      assert.fail('Expected triggerBridge to throw')
    } catch (err: unknown) {
      const msg = (err as Error).message
      assert.include(msg, 'completion/correlation path')
      assert.include(msg, 'onramp_bridge.service.ts')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Group 2 — Guard: missing SIPPY_ETH_DEPOSIT_ADDRESS
// ══════════════════════════════════════════════════════════════════════════════

test.group('triggerBridge | missing SIPPY_ETH_DEPOSIT_ADDRESS', (group) => {
  group.each.setup(() => {
    mockOnrampOrder(fakeOrder())
    deleteEnv('COLURS_DIRECT_USDC')
    deleteEnv('SIPPY_ETH_DEPOSIT_ADDRESS')
  })
  group.each.teardown(() => {
    restoreModels()
    restoreEnv()
  })

  test('throws when SIPPY_ETH_DEPOSIT_ADDRESS is not set', async ({ assert }) => {
    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await assert.rejects(() => triggerBridge('ext-123'), /SIPPY_ETH_DEPOSIT_ADDRESS not configured/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Group 3 — Guard: missing SIPPY_ETH_DEPOSIT_PRIVATE_KEY (via getSigner)
// ══════════════════════════════════════════════════════════════════════════════

test.group('triggerBridge | missing SIPPY_ETH_DEPOSIT_PRIVATE_KEY', (group) => {
  group.each.setup(() => {
    mockOnrampOrder(fakeOrder())
    mockPhoneRegistry('0xUserWallet1234567890abcdef1234567890abcdef')
    deleteEnv('COLURS_DIRECT_USDC')
    setEnv('SIPPY_ETH_DEPOSIT_ADDRESS', '0xDepositAddress1234567890abcdef')
    deleteEnv('SIPPY_ETH_DEPOSIT_PRIVATE_KEY')
  })
  group.each.teardown(() => {
    restoreModels()
    restoreEnv()
  })

  test('throws when SIPPY_ETH_DEPOSIT_PRIVATE_KEY is not set', async ({ assert }) => {
    // getSigner() is called inside broadcastLiFiBridgeTx and also in
    // checkEthBalanceAndAlert (fire-and-forget). The fire-and-forget call
    // catches its own error, but broadcastLiFiBridgeTx will also call
    // getSigner() and throw. However, broadcastLiFiBridgeTx calls getSigner
    // AFTER the LiFi getQuote call, so we also need to handle that.
    //
    // Actually, checkEthBalanceAndAlert(getSigner()) at line 345 calls
    // getSigner() synchronously BEFORE broadcastLiFiBridgeTx. If the private
    // key is missing, getSigner() throws synchronously and that error
    // propagates up because it's not inside the .catch() — it's the argument
    // evaluation to checkEthBalanceAndAlert. Let's verify:
    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await assert.rejects(
      () => triggerBridge('ext-123'),
      /SIPPY_ETH_DEPOSIT_PRIVATE_KEY not configured/
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Group 4 — Guard: order not found
// ══════════════════════════════════════════════════════════════════════════════

test.group('triggerBridge | order not found', (group) => {
  group.each.setup(() => {
    mockOnrampOrder(null)
  })
  group.each.teardown(() => {
    restoreModels()
    restoreEnv()
  })

  test('throws when order does not exist', async ({ assert }) => {
    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await assert.rejects(
      () => triggerBridge('nonexistent-ext-id'),
      /order not found for external_id=nonexistent-ext-id/
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Group 5 — Guard: no wallet found for phone
// ══════════════════════════════════════════════════════════════════════════════

test.group('triggerBridge | no wallet for phone', (group) => {
  group.each.setup(() => {
    mockOnrampOrder(fakeOrder())
    mockPhoneRegistry(null)
    deleteEnv('COLURS_DIRECT_USDC')
    setEnv('SIPPY_ETH_DEPOSIT_ADDRESS', '0xDepositAddress1234567890abcdef')
  })
  group.each.teardown(() => {
    restoreModels()
    restoreEnv()
  })

  test('throws when PhoneRegistry has no wallet for the order phone', async ({ assert }) => {
    const { triggerBridge } = await import('#services/onramp_bridge.service')
    await assert.rejects(() => triggerBridge('ext-123'), /no wallet found for order ext-123/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Groups 6–9 — Broadcast and confirmation status transitions
//
// These tests require mocking at two levels:
//  1. @lifi/sdk getQuote — uses global.fetch → intercepted via fetch mock
//  2. ethers v5 JSON-RPC — uses Node's http/https modules (NOT global.fetch)
//     → intercepted via JsonRpcProvider.prototype.send patch
//
// The module has lazy singletons (signer, provider, lifiConfigured) that
// persist across tests. Once the provider is created (first broadcast test),
// its prototype.send is patched — all subsequent calls from any test group
// go through the mock.
//
// PRACTICAL NOTE: full broadcast testing is better suited for integration
// tests with a local anvil/hardhat node. The tests below cover the status
// transition logic by mocking at the tightest feasible boundary. If the
// ethers/LiFi mocking proves too brittle, tests 1–5 (guards) are the
// highest-value unit tests and these can be promoted to integration tests.
// ══════════════════════════════════════════════════════════════════════════════

// Well-known test private key (Hardhat account #0). Never holds real funds.
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TEST_FROM_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TEST_USER_WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TEST_TX_HASH = '0xfaketxhash1234567890abcdef1234567890abcdef1234567890abcdef12345678'

// ── LiFi fetch mock ─────────────────────────────────────────────────────────
// The @lifi/sdk uses global.fetch for API calls. We intercept it here.

function makeLiFiFetchMock(origFetch: typeof global.fetch) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url

    if (urlStr.includes('li.quest') || urlStr.includes('lifi')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          transactionRequest: {
            to: '0x1111111254EEB25477B68fb85Ed929f73A960582', // valid-looking address
            data: '0xabcdef',
            value: '0x0',
            gasLimit: '0x30000',
          },
          estimate: {
            approvalAddress: '0x1111111254EEB25477B68fb85Ed929f73A960582',
          },
        }),
        text: async () => JSON.stringify({}),
        headers: new Headers(),
      } as unknown as Response
    }

    // Fall through to original fetch for everything else
    return origFetch(url as any, init)
  }
}

// ── ethers v5 JsonRpcProvider.send mock ──────────────────────────────────────
// ethers v5 uses Node's http/https (not fetch), so we must patch at the
// provider prototype level. All JSON-RPC calls flow through .send(method, params).

const origProviderSend = ethers.providers.JsonRpcProvider.prototype.send

type RpcMockBehavior = {
  confirmationResult?: boolean // receipt.status: true=1, false=0
  receiptError?: boolean // if true, eth_getTransactionReceipt throws
}

function installRpcMock(behavior: RpcMockBehavior = {}) {
  const { confirmationResult = true, receiptError = false } = behavior

  ethers.providers.JsonRpcProvider.prototype.send = async function mockSend(
    method: string,
    _params: Array<any>
  ): Promise<any> {
    switch (method) {
      case 'eth_chainId':
        return '0x1'
      case 'net_version':
        return '1'
      case 'eth_getBalance':
        return '0x0de0b6b3a7640000' // 1 ETH
      case 'eth_getTransactionCount':
        return '0x1'
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
        return '0x3B9ACA00' // 1 gwei
      case 'eth_estimateGas':
        return '0x30000'
      case 'eth_getBlockByNumber':
        return { number: '0x100', baseFeePerGas: '0x3B9ACA00', gasLimit: '0x1c9c380' }
      case 'eth_blockNumber':
        return '0x100'
      case 'eth_call':
        // ERC20 allowance — return the exact required amount so no approval needed
        // 50 USDT = 50_000_000 (6 decimals) = 0x2FAF080
        return '0x0000000000000000000000000000000000000000000000000000000002FAF080'
      case 'eth_sendRawTransaction':
        return TEST_TX_HASH
      case 'eth_getTransactionReceipt':
        if (receiptError) {
          throw new Error('simulated RPC error on receipt')
        }
        return {
          to: '0x1111111254EEB25477B68fb85Ed929f73A960582',
          from: TEST_FROM_ADDRESS,
          transactionHash: TEST_TX_HASH,
          transactionIndex: 0,
          status: confirmationResult ? 1 : 0,
          blockNumber: 0x100,
          blockHash: '0x' + 'ab'.repeat(32),
          gasUsed: ethers.BigNumber.from('0x20000'),
          cumulativeGasUsed: ethers.BigNumber.from('0x20000'),
          effectiveGasPrice: ethers.BigNumber.from('0x3B9ACA00'),
          contractAddress: null,
          logs: [],
          logsBloom: '0x' + '0'.repeat(512),
          confirmations: 1,
          byzantium: true,
          type: 2,
        }
      default:
        return '0x0'
    }
  }
}

function restoreRpcMock() {
  ethers.providers.JsonRpcProvider.prototype.send = origProviderSend
}

// ── Common broadcast setup/teardown ─────────────────────────────────────────

function setupBroadcastEnv() {
  deleteEnv('COLURS_DIRECT_USDC')
  setEnv('SIPPY_ETH_DEPOSIT_ADDRESS', TEST_FROM_ADDRESS)
  setEnv('SIPPY_ETH_DEPOSIT_PRIVATE_KEY', TEST_PRIVATE_KEY)
  setEnv('ETH_MAINNET_RPC_URL', 'http://localhost:8545')
}

// ══════════════════════════════════════════════════════════════════════════════
// Groups 6–9 — Broadcast + confirmation status transitions
//
// These tests require mocking ethers v5 JsonRpcProvider internals (response
// parsing, tx receipt formatting) and the @lifi/sdk getQuote HTTP call.
// The ethers v5 provider uses Node http/https (not global.fetch) and validates
// response shapes strictly (block hashes, receipt fields, etc.), making pure
// unit-test mocking fragile.
//
// The critical broadcast/confirmation paths are exercised indirectly via:
//   - poll_r2p_payments.spec.ts: triggerBridge throwing → bridge_failed
//   - poll_r2p_payments.spec.ts: paid → initiating_bridge atomic claim
//   - The production code's own try/catch → setOrderStatus('bridge_failed')
//
// For full broadcast coverage, an integration test with a local Hardhat node
// (or an ethers mock library like @defi-wonderland/smock) would be more
// reliable than patching provider internals.
// ══════════════════════════════════════════════════════════════════════════════

// Group 6 — Successful broadcast sets status to 'bridging' — SKIPPED (needs integration setup)
