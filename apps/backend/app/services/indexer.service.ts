/**
 * Indexer Service
 *
 * HTTP client for the Ponder on-chain indexer.
 * Registers Sippy wallets so the indexer can classify transfers.
 *
 * Two entry points:
 *  - registerWallet(): called on each new user signup (1 call per user, ever)
 *  - syncAllWallets(): called once on backend boot to backfill existing users
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query } from '#services/db'
import crypto from 'node:crypto'

const INDEXER_URL = env.get('INDEXER_URL', '')
const INDEXER_API_SECRET = env.get('INDEXER_API_SECRET', '')
const EXPORT_AUDIT_SECRET = env.get('EXPORT_AUDIT_SECRET', '')

function isAvailable(): boolean {
  if (INDEXER_URL && !INDEXER_API_SECRET) {
    logger.error(
      'INDEXER_URL is set but INDEXER_API_SECRET is empty — indexer calls will fail auth'
    )
    return false
  }
  return !!INDEXER_URL
}

function hashPhone(phoneNumber: string): string | null {
  if (!EXPORT_AUDIT_SECRET) return null
  return crypto.createHmac('sha256', EXPORT_AUDIT_SECRET).update(phoneNumber).digest('hex')
}

/**
 * Register a single wallet with the indexer (fire-and-forget).
 * Called after a new user signs up via either embedded or legacy flow.
 */
export async function registerWalletWithIndexer(
  walletAddress: string,
  phoneNumber?: string
): Promise<void> {
  if (!isAvailable()) return

  try {
    const phoneHash = phoneNumber ? hashPhone(phoneNumber) : null

    const res = await fetch(`${INDEXER_URL}/wallets/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-indexer-secret': INDEXER_API_SECRET },
      body: JSON.stringify({ address: walletAddress, phoneHash }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.warn(`Indexer register failed (${res.status}): ${body}`)
    } else {
      logger.info(`Indexer: registered wallet ${walletAddress}`)
    }
  } catch (error) {
    // Non-fatal — indexer being down should never break user signup
    logger.warn('Indexer register call failed: %o', error)
  }
}

/**
 * Single sync attempt — returns true on success.
 */
async function doSyncAttempt(): Promise<boolean> {
  const result = await query<{ wallet_address: string; phone_number: string; created_at: string }>(
    'SELECT wallet_address, phone_number, created_at FROM phone_registry ORDER BY created_at'
  )

  if (result.rows.length === 0) {
    logger.info('Indexer sync: no wallets to sync')
    return true
  }

  const wallets = result.rows.map((row) => ({
    address: row.wallet_address,
    phoneHash: hashPhone(row.phone_number),
    registeredAt: Math.floor(Number(row.created_at) / 1000),
  }))

  const res = await fetch(`${INDEXER_URL}/wallets/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-indexer-secret': INDEXER_API_SECRET },
    body: JSON.stringify({ wallets }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as {
    processed?: number
    newInserts?: number
    reactivations?: number
    skipped?: string[]
  }
  logger.info(
    `Indexer sync: ${data.processed ?? 0} processed, ${data.newInserts ?? 0} new, ${data.reactivations ?? 0} reactivated`
  )
  return true
}

/**
 * Bulk sync all existing wallets from phone_registry to the indexer.
 * Called once on backend boot via preload.
 * Retries 5x with exponential backoff, then periodic retry every 5min.
 */
export async function syncAllWalletsWithIndexer(): Promise<void> {
  if (!isAvailable()) {
    logger.info('Indexer sync skipped — INDEXER_URL not set')
    return
  }

  const MAX_RETRIES = 5
  const BASE_DELAY_MS = 10_000
  const PERIODIC_INTERVAL_MS = 5 * 60_000

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (await doSyncAttempt()) return
    } catch (error) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      logger.warn(
        `Indexer sync attempt ${attempt + 1}/${MAX_RETRIES} failed, retry in ${delay / 1000}s: %o`,
        error
      )
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  logger.error('Indexer sync failed after all retries — starting periodic retry every 5min')
  const interval = setInterval(async () => {
    try {
      if (await doSyncAttempt()) {
        clearInterval(interval)
        logger.info('Indexer sync succeeded on periodic retry')
      }
    } catch (error) {
      logger.warn('Indexer periodic sync retry failed: %o', error)
    }
  }, PERIODIC_INTERVAL_MS)
}
