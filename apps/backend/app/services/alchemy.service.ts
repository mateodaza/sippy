/**
 * Alchemy Wallet Management Service
 *
 * Manages the Alchemy Address Activity webhook's address list.
 * Replaces indexer.service.ts for wallet registration.
 *
 * - registerWalletWithAlchemy(): add one address (called on signup)
 * - syncAllWalletsWithAlchemy(): bulk add all active addresses (called on boot)
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query } from '#services/db'

const ALCHEMY_WEBHOOK_ID = env.get('ALCHEMY_WEBHOOK_ID', '')
const ALCHEMY_AUTH_TOKEN = env.get('ALCHEMY_AUTH_TOKEN', '')
const ALCHEMY_SIGNING_KEY = env.get('ALCHEMY_SIGNING_KEY', '')
const ALCHEMY_WEBHOOK_URL = 'https://dashboard.alchemy.com/api/update-webhook-addresses'
const CHUNK_SIZE = 1_000

function isAvailable(): boolean {
  return !!(ALCHEMY_WEBHOOK_ID && ALCHEMY_AUTH_TOKEN && ALCHEMY_SIGNING_KEY)
}

async function patchAddresses(
  addressesToAdd: string[],
  addressesToRemove: string[] = []
): Promise<boolean> {
  const res = await fetch(ALCHEMY_WEBHOOK_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Alchemy-Token': ALCHEMY_AUTH_TOKEN,
    },
    body: JSON.stringify({
      webhook_id: ALCHEMY_WEBHOOK_ID,
      addresses_to_add: addressesToAdd,
      addresses_to_remove: addressesToRemove,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    logger.warn(`Alchemy webhook PATCH failed (${res.status}): ${body}`)
    return false
  }
  return true
}

/**
 * Register a single wallet with Alchemy's webhook (fire-and-forget).
 */
export async function registerWalletWithAlchemy(walletAddress: string): Promise<void> {
  if (!isAvailable()) return

  try {
    const ok = await patchAddresses([walletAddress.toLowerCase()])
    if (ok) {
      logger.info(`Alchemy: registered wallet ${walletAddress}`)
    }
  } catch (error) {
    logger.warn('Alchemy register call failed: %o', error)
  }
}

/**
 * Bulk sync all wallets from phone_registry to the Alchemy webhook.
 * Chunked in batches of 1,000 to avoid large payloads.
 */
export async function syncAllWalletsWithAlchemy(): Promise<void> {
  if (!isAvailable()) {
    logger.info('Alchemy sync skipped -- credentials not configured')
    return
  }

  try {
    const result = await query<{ wallet_address: string }>(
      'SELECT wallet_address FROM phone_registry WHERE wallet_address IS NOT NULL'
    )

    const addresses = result.rows.map((r) => r.wallet_address?.toLowerCase()).filter(Boolean)

    if (addresses.length === 0) {
      logger.info('Alchemy sync: no wallets to sync')
      return
    }

    let synced = 0
    let failed = 0

    for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
      const chunk = addresses.slice(i, i + CHUNK_SIZE)
      let ok = await patchAddresses(chunk)

      // Retry once on failure
      if (!ok) {
        await new Promise((r) => setTimeout(r, 2000))
        ok = await patchAddresses(chunk)
      }

      if (ok) {
        synced += chunk.length
      } else {
        failed += chunk.length
        logger.error(`Alchemy sync: chunk ${i / CHUNK_SIZE + 1} failed after retry`)
      }
    }

    logger.info(`Alchemy sync: ${synced} synced, ${failed} failed (${addresses.length} total)`)
  } catch (error) {
    logger.warn('Alchemy sync failed: %o', error)
  }
}
