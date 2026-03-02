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
const EXPORT_AUDIT_SECRET = env.get('EXPORT_AUDIT_SECRET', '')

function isAvailable(): boolean {
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
      headers: { 'Content-Type': 'application/json' },
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
 * Bulk sync all existing wallets from phone_registry to the indexer.
 * Called once on backend boot via preload.
 */
export async function syncAllWalletsWithIndexer(): Promise<void> {
  if (!isAvailable()) {
    logger.info('Indexer sync skipped — INDEXER_URL not set')
    return
  }

  try {
    const result = await query<{ wallet_address: string; phone_number: string; created_at: string }>(
      'SELECT wallet_address, phone_number, created_at FROM phone_registry ORDER BY created_at'
    )

    if (result.rows.length === 0) {
      logger.info('Indexer sync: no wallets to sync')
      return
    }

    const wallets = result.rows.map((row) => ({
      address: row.wallet_address,
      phoneHash: hashPhone(row.phone_number),
      registeredAt: Math.floor(Number(row.created_at) / 1000), // ms → seconds
    }))

    const res = await fetch(`${INDEXER_URL}/wallets/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallets }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.warn(`Indexer sync failed (${res.status}): ${body}`)
    } else {
      const data = (await res.json()) as { synced?: number; skipped?: string[] }
      logger.info(`Indexer sync: ${data.synced ?? 0} wallets synced`)
      if (data.skipped && data.skipped.length > 0) {
        logger.warn(`Indexer sync: ${data.skipped.length} wallets skipped`)
      }
    }
  } catch (error) {
    // Non-fatal — indexer being down should never prevent backend boot
    logger.warn('Indexer sync call failed: %o', error)
  }
}
