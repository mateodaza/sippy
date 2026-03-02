import { createConfig } from 'ponder'
import { ERC20Abi } from './abis/ERC20'
import { GasRefuelAbi } from './abis/GasRefuel'

// Start block: ~1 week before first Sippy wallet activity — adjust as needed
const START_BLOCK = Number(process.env.START_BLOCK || 290_000_000)

export default createConfig({
  database: { kind: 'postgres' as const },
  chains: {
    arbitrum: {
      id: 42161,
      rpc: process.env.PONDER_RPC_URL_42161,
    },
  },
  contracts: {
    USDC: {
      abi: ERC20Abi,
      chain: 'arbitrum',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      startBlock: START_BLOCK,
    },
    GasRefuel: {
      abi: GasRefuelAbi,
      chain: 'arbitrum',
      address: '0xC8367a549e05D9184B8e320856cb9A10FDc1DE46',
      startBlock: START_BLOCK,
    },
  },
})
