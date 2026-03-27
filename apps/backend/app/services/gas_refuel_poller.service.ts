/**
 * GasRefuel Log Poller
 *
 * Durable replacement for Ponder's GasRefuel event indexing.
 * Polls eth_getLogs with a persisted cursor and 2-block confirmation buffer.
 * On restart, re-reads from last_processed_block (idempotent inserts handle overlap).
 *
 * Events handled: Refueled, Paused, Unpaused
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { ethers } from 'ethers'
import { processRefuelEvent, setRefuelPaused } from '#services/onchain_writer.service'

const REFUEL_CONTRACT = env.get('REFUEL_CONTRACT_ADDRESS', '')
const RPC_URL = env.get('ARBITRUM_RPC_URL', '')
const CONFIRMATION_BUFFER = 2
const POLL_INTERVAL_MS = 60_000
const MAX_BLOCK_RANGE = 50_000
const CUTOVER_BLOCK = (() => {
  const raw = env.get('ALCHEMY_CUTOVER_BLOCK') ?? process.env.START_BLOCK ?? 437_000_000
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid cutover block: "${raw}" — must be a non-negative integer`)
  }
  return Math.floor(n)
})()

// Event topic signatures
const REFUELED_TOPIC = ethers.utils.id('Refueled(address,uint256,uint256)')
const PAUSED_TOPIC = ethers.utils.id('Paused(address)')
const UNPAUSED_TOPIC = ethers.utils.id('Unpaused(address)')

const iface = new ethers.utils.Interface([
  'event Refueled(address indexed user, uint256 amount, uint256 timestamp)',
  'event Paused(address account)',
  'event Unpaused(address account)',
])

let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * Read the persisted cursor. Returns null if no cursor exists.
 */
async function getCursor(): Promise<number | null> {
  const row = await db.rawQuery(
    `SELECT last_processed_block FROM onchain.poller_cursor WHERE id = 'gas_refuel'`
  )
  return row.rows.length > 0 ? Number(row.rows[0].last_processed_block) : null
}

/**
 * Update the persisted cursor.
 */
async function setCursor(block: number): Promise<void> {
  await db.rawQuery(
    `INSERT INTO onchain.poller_cursor (id, last_processed_block, updated_at)
     VALUES ('gas_refuel', ?, NOW())
     ON CONFLICT (id) DO UPDATE SET
       last_processed_block = ?,
       updated_at = NOW()`,
    [block, block]
  )
}

/**
 * Fetch and process logs from fromBlock to toBlock.
 */
async function pollRange(
  provider: ethers.providers.JsonRpcProvider,
  fromBlock: number,
  toBlock: number
): Promise<number> {
  let processed = 0

  const logs = await provider.getLogs({
    address: REFUEL_CONTRACT,
    fromBlock,
    toBlock,
    topics: [[REFUELED_TOPIC, PAUSED_TOPIC, UNPAUSED_TOPIC]],
  })

  for (const log of logs) {
    const topic = log.topics[0]

    if (topic === REFUELED_TOPIC) {
      const parsed = iface.parseLog(log)
      const id = `${log.transactionHash.toLowerCase()}-${log.logIndex}`
      const inserted = await processRefuelEvent({
        id,
        user: parsed.args.user.toLowerCase(),
        amount: parsed.args.amount.toString(),
        timestamp: parsed.args.timestamp.toNumber(),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash.toLowerCase(),
      })
      if (inserted) processed++
    } else if (topic === PAUSED_TOPIC) {
      await setRefuelPaused(true)
      logger.info('GasRefuel: contract paused')
    } else if (topic === UNPAUSED_TOPIC) {
      await setRefuelPaused(false)
      logger.info('GasRefuel: contract unpaused')
    }
  }

  return processed
}

/**
 * Run a single poll cycle: read from cursor to (head - confirmation buffer).
 */
async function pollCycle(): Promise<void> {
  if (!REFUEL_CONTRACT || !RPC_URL) return

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL, {
    chainId: 42161,
    name: 'arbitrum',
  })

  try {
    const headBlock = await provider.getBlockNumber()
    const safeHead = headBlock - CONFIRMATION_BUFFER

    let cursor = await getCursor()
    if (cursor === null) {
      // First run — start from cutover block
      cursor = CUTOVER_BLOCK
      logger.info(`GasRefuel poller: no cursor, starting from cutover block ${cursor}`)
    }

    if (cursor >= safeHead) return // Nothing new

    // Process in chunks to avoid RPC limits
    let fromBlock = cursor
    let totalProcessed = 0

    while (fromBlock < safeHead) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, safeHead)
      const processed = await pollRange(provider, fromBlock, toBlock)
      totalProcessed += processed
      fromBlock = toBlock + 1
    }

    await setCursor(safeHead)

    if (totalProcessed > 0) {
      logger.info(`GasRefuel poller: processed ${totalProcessed} events up to block ${safeHead}`)
    }
  } catch (error) {
    logger.error('GasRefuel poller error: %o', error)
  }
}

/**
 * Start the poller. Call once on backend boot.
 */
export function startGasRefuelPoller(): void {
  if (!REFUEL_CONTRACT || !RPC_URL) {
    logger.info('GasRefuel poller: skipped (REFUEL_CONTRACT_ADDRESS or ARBITRUM_RPC_URL not set)')
    return
  }

  logger.info(
    'GasRefuel poller: starting (interval=%ds, buffer=%d blocks)',
    POLL_INTERVAL_MS / 1000,
    CONFIRMATION_BUFFER
  )

  // Initial poll on boot
  pollCycle().catch((err) => logger.error('GasRefuel poller initial cycle failed: %o', err))

  // Periodic poll
  pollTimer = setInterval(() => {
    pollCycle().catch((err) => logger.error('GasRefuel poller cycle failed: %o', err))
  }, POLL_INTERVAL_MS)

  pollTimer.unref()
}

/**
 * Stop the poller (for graceful shutdown).
 */
export function stopGasRefuelPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    logger.info('GasRefuel poller: stopped')
  }
}
