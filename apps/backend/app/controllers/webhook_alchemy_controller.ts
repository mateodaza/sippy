/**
 * Alchemy Address Activity Webhook Controller
 *
 * Receives USDC transfer events pushed by Alchemy for registered wallets.
 * Verifies HMAC signature, filters to USDC only, fetches block timestamps,
 * and writes idempotently via onchain_writer.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { timingSafeEqual, createHmac } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import {
  processTransfer,
  deleteTransfer,
  recomputeAggregates,
} from '#services/onchain_writer.service'
import { getRpcUrl } from '#config/network'
import { ethers } from 'ethers'

const ALCHEMY_SIGNING_KEY = env.get('ALCHEMY_SIGNING_KEY', '')
const USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'

// Block timestamp cache (cleared per request batch)
const timestampCache = new Map<string, number>()

export default class WebhookAlchemyController {
  async handle({ request, response }: HttpContext) {
    if (!ALCHEMY_SIGNING_KEY) {
      return response.status(503).json({ error: 'Webhook signing key not configured' })
    }

    // Parse body first so we can log the event ID even on signature failure
    const rawBody = request.raw() || ''
    const body = request.body()
    const eventId = body?.id || `unknown-${Date.now()}`
    const webhookId = body?.webhookId || ''

    // Step 1: Verify HMAC signature
    const signature = request.header('x-alchemy-signature') || ''
    if (!this.verifySignature(rawBody, signature)) {
      logger.warn('Alchemy webhook: invalid signature for event %s', eventId)
      await this.logDelivery(eventId, webhookId, null, 0, 'signature_failed')
      return response.status(401).json({ error: 'Invalid signature' })
    }
    const activities = body?.event?.activity || []

    // Step 2: Deduplicate by event ID (allow retries of deferred deliveries)
    if (eventId) {
      const existing = await db.rawQuery(
        `SELECT status FROM onchain.webhook_delivery_log WHERE event_id = ?`,
        [eventId]
      )
      if (existing.rows.length > 0 && existing.rows[0].status === 'ok') {
        return response.json({ ok: true, skipped: 'duplicate' })
      }
      // Delete stale entry so we can re-log this delivery
      if (existing.rows.length > 0) {
        await db.rawQuery('DELETE FROM onchain.webhook_delivery_log WHERE event_id = ?', [eventId])
      }
    }

    // Step 3: Filter to USDC token transfers only
    const usdcActivities = activities.filter(
      (a: any) => a.category === 'token' && a.rawContract?.address?.toLowerCase() === USDC_ADDRESS
    )

    if (usdcActivities.length === 0) {
      await this.logDelivery(eventId, webhookId, null, 0, 'ok')
      return response.json({ ok: true, processed: 0 })
    }

    // Step 4: Batch-fetch block timestamps
    const uniqueBlocks: string[] = [
      ...new Set(
        usdcActivities.map((a: any) => String(a.log?.blockNumber ?? '')).filter(Boolean) as string[]
      ),
    ]
    await this.fetchBlockTimestamps(uniqueBlocks)

    // Step 5: Process each activity
    let processed = 0
    let removals = 0
    let deferred = 0

    for (const activity of usdcActivities) {
      const log = activity.log
      if (!log) continue

      const txHash = (log.transactionHash || '').toLowerCase()
      const logIndex = Number.parseInt(log.logIndex, 16)
      const id = `${txHash}-${logIndex}`

      // Handle reorgs
      if (log.removed) {
        const deleted = await deleteTransfer(id)
        if (deleted) removals++
        continue
      }

      const blockNum = log.blockNumber
      const timestamp = timestampCache.get(blockNum)

      // Skip events where we couldn't resolve the block timestamp.
      // Alchemy will retry delivery, so we'll get another chance.
      if (timestamp === undefined || timestamp === 0) {
        logger.warn(`Skipping transfer ${id}: block timestamp unavailable for ${blockNum}`)
        deferred++
        continue
      }

      const amount = BigInt(activity.rawContract?.rawValue || '0').toString()
      const from = (activity.fromAddress || '').toLowerCase()
      const to = (activity.toAddress || '').toLowerCase()
      const blockNumber = Number.parseInt(blockNum, 16)

      const inserted = await processTransfer({
        id,
        from,
        to,
        amount,
        timestamp,
        blockNumber,
        txHash,
      })

      if (inserted) processed++
    }

    // Recompute aggregates if any reorg removals happened
    if (removals > 0) {
      await recomputeAggregates()
    }

    // Step 6: If any activities were deferred, fail the whole delivery so Alchemy retries.
    // Already-processed activities will be safely skipped via idempotent inserts on replay.
    if (deferred > 0) {
      const firstBlock = usdcActivities[0]?.log?.blockNumber || null
      await this.logDelivery(eventId, webhookId, firstBlock, usdcActivities.length, 'deferred')
      return response
        .status(500)
        .json({ ok: false, processed, deferred, removals, reason: 'timestamp_fetch_failed' })
    }

    // Step 7: Log successful delivery
    const firstBlock = usdcActivities[0]?.log?.blockNumber || null
    await this.logDelivery(eventId, webhookId, firstBlock, usdcActivities.length, 'ok')

    return response.json({ ok: true, processed, removals })
  }

  private verifySignature(rawBody: string, signature: string): boolean {
    if (!signature) return false
    const hmac = createHmac('sha256', ALCHEMY_SIGNING_KEY)
    hmac.update(rawBody)
    const expected = hmac.digest('hex')
    const a = Buffer.from(signature.padEnd(64, '\0'))
    const b = Buffer.from(expected.padEnd(64, '\0'))
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async fetchBlockTimestamps(blockNums: string[]): Promise<void> {
    const provider = new ethers.providers.JsonRpcProvider(getRpcUrl())
    const CONCURRENCY = 10
    const toFetch = blockNums.filter((b) => !timestampCache.has(b))

    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async (blockHex) => {
          const block = await provider.getBlock(Number.parseInt(blockHex, 16))
          return { blockHex, timestamp: block?.timestamp || 0 }
        })
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          timestampCache.set(result.value.blockHex, result.value.timestamp)
        }
      }
    }
  }

  private async logDelivery(
    eventId: string,
    webhookId: string,
    blockNum: string | null,
    activityCount: number,
    status: string
  ): Promise<void> {
    if (!eventId) return
    try {
      await db.rawQuery(
        `INSERT INTO onchain.webhook_delivery_log (event_id, webhook_id, block_num, activity_count, status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, webhookId, blockNum, activityCount, status]
      )
    } catch (err) {
      logger.warn('Failed to log webhook delivery: %o', err)
    }
  }
}
