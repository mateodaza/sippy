import { createConfig } from 'ponder'
import { ERC20Abi } from './abis/ERC20'
import { GasRefuelAbi } from './abis/GasRefuel'
import pg from 'pg'

// Start block: ~1 week before first Sippy wallet activity — adjust as needed
const MIN_BLOCK = 400_000_000
const START_BLOCK = Math.max(Number(process.env.START_BLOCK || 437_000_000), MIN_BLOCK)

// ── Load registered wallets for USDC filter ─────────────────

const ADDRESS_RE = /^0x[0-9a-f]{40}$/i

let REGISTERED_WALLETS: `0x${string}`[] = []
{
  let client: pg.Client | null = null
  try {
    client = new pg.Client(process.env.DATABASE_URL)
    await client.connect()
    const result = await client.query(
      `SELECT address FROM offchain.sippy_wallet WHERE is_active = true`
    )
    REGISTERED_WALLETS = [...new Set(
      result.rows
        .map((r: any) => r.address?.toLowerCase())
        .filter((a: string) => a && ADDRESS_RE.test(a))
    )] as `0x${string}`[]
    console.log(`Loaded ${REGISTERED_WALLETS.length} wallets for USDC filter`)
  } catch (e) {
    REGISTERED_WALLETS = [...new Set(
      (process.env.REGISTERED_WALLETS || '')
        .split(',').map(a => a.trim().toLowerCase())
        .filter(a => a && ADDRESS_RE.test(a))
    )] as `0x${string}`[]
    console.warn(`DB read failed, using env (${REGISTERED_WALLETS.length} wallets)`)
  } finally {
    await client?.end().catch((err) => console.warn('Failed to close pg client:', err.message))
  }
}

// Include the spender wallet so both legs of spend+transfer sends are captured
const SPENDER = process.env.SIPPY_SPENDER_ADDRESS?.toLowerCase().trim()
if (SPENDER && !ADDRESS_RE.test(SPENDER)) {
  console.error(`SIPPY_SPENDER_ADDRESS is malformed: "${SPENDER}" — must be 0x + 40 hex chars. Spender will NOT be filtered.`)
} else if (SPENDER && !REGISTERED_WALLETS.includes(SPENDER as `0x${string}`)) {
  REGISTERED_WALLETS.push(SPENDER as `0x${string}`)
  console.log(`Added spender ${SPENDER} to USDC filter`)
}

// Fail-closed: AND both from+to on burn address = self-transfer = structurally impossible
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`
const usdcFilter = REGISTERED_WALLETS.length > 0
  ? [
      { event: 'Transfer' as const, args: { from: REGISTERED_WALLETS } },
      { event: 'Transfer' as const, args: { to: REGISTERED_WALLETS } },
    ]
  : [
      { event: 'Transfer' as const, args: { from: BURN_ADDRESS, to: BURN_ADDRESS } },
    ]

if (REGISTERED_WALLETS.length === 0) {
  console.error('NO REGISTERED WALLETS — USDC filter locked to no-match until wallets sync and indexer restarts')
}

// ── Config ──────────────────────────────────────────────────

export default createConfig({
  database: { kind: 'postgres' as const },
  chains: {
    arbitrum: {
      id: 42161,
      rpc: process.env.PONDER_RPC_URL_42161,
      pollingInterval: 120_000,
    },
  },
  contracts: {
    USDC: {
      abi: ERC20Abi,
      chain: 'arbitrum',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      startBlock: START_BLOCK,
      filter: usdcFilter,
    },
    GasRefuel: {
      abi: GasRefuelAbi,
      chain: 'arbitrum',
      address: '0xE4e5474E97E89d990082505fC5708A6a11849936',
      startBlock: START_BLOCK,
    },
  },
})
