/**
 * Season Transactions Controller — the live recent-transactions feed (Phase B).
 *
 * GET /api/season/transactions (public, paginated, IP-throttled like the quest
 * leaderboard). The single most credible proof element: real, verifiable
 * on-chain transfers anyone can click through to Arbiscan.
 *
 * PRIVACY: this serves on-chain data only — masked addresses (already public)
 * and tx hashes. PHONES ARE NEVER INVOLVED: the payload never joins or exposes
 * the user/phone table, so no phone field can leak. That is why the feed needs
 * no verified-floor gating — it mirrors the public chain, not the user table.
 *
 * Pagination: cursor on (timestamp DESC, id DESC) — a strict total order over
 * onchain.transfer (id is the PK), so a page boundary never skips or repeats a
 * row even when many transfers share a timestamp. The opaque cursor encodes the
 * last row's (timestamp, id).
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'

const USDC_DECIMALS = 6
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const ARBISCAN_TX = 'https://arbiscan.io/tx/'

interface TransferRow {
  id: string
  from: string
  to: string
  amount: string
  timestamp: number | string
  tx_hash: string
}

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT)
}

// Mask an on-chain address for display: 0x1234…abcd. Public data, presentation only.
function maskAddress(addr: string): string {
  if (!addr) return ''
  return addr.length <= 10 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// Opaque cursor = base64url("<timestamp>|<id>"). id is the onchain.transfer PK
// ("{txHash}-{logIndex}") and never contains "|", so the split is unambiguous.
function encodeCursor(timestamp: number, id: string): string {
  return Buffer.from(`${timestamp}|${id}`, 'utf8').toString('base64url')
}

function decodeCursor(raw: string): { timestamp: number; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const sep = decoded.indexOf('|')
    if (sep < 0) return null
    const timestamp = Number(decoded.slice(0, sep))
    const id = decoded.slice(sep + 1)
    if (!Number.isFinite(timestamp) || !id) return null
    return { timestamp, id }
  } catch {
    return null
  }
}

function toUsd(rawAmount: string): number {
  try {
    return Number(BigInt(rawAmount)) / 10 ** USDC_DECIMALS
  } catch {
    return Number(rawAmount) / 10 ** USDC_DECIMALS || 0
  }
}

export default class SeasonTransactionsController {
  /**
   * GET /api/season/transactions?limit=25&cursor=<opaque>
   *
   * Returns { transactions[], nextCursor, counts: { today, thisWeek } }. Empty
   * is a valid 200 (transactions: [], nextCursor: null) so the feed can render a
   * "no transactions yet" state without a separate error branch.
   */
  async index({ request, response }: HttpContext) {
    const limit = parseLimit(request.input('limit'))
    const cursorRaw = request.input('cursor')
    const cursor =
      typeof cursorRaw === 'string' && cursorRaw.length > 0 ? decodeCursor(cursorRaw) : null
    const now = Math.floor(Date.now() / 1000)

    try {
      // Fetch limit+1 to learn whether another page exists without a COUNT.
      const pageRes = cursor
        ? await query<TransferRow>(
            `SELECT id, "from", "to", amount, timestamp, tx_hash
               FROM onchain.transfer
              WHERE (timestamp < $1 OR (timestamp = $1 AND id < $2))
              ORDER BY timestamp DESC, id DESC
              LIMIT $3`,
            [cursor.timestamp, cursor.id, limit + 1]
          )
        : await query<TransferRow>(
            `SELECT id, "from", "to", amount, timestamp, tx_hash
               FROM onchain.transfer
              ORDER BY timestamp DESC, id DESC
              LIMIT $1`,
            [limit + 1]
          )

      const hasMore = pageRes.rows.length > limit
      const page = hasMore ? pageRes.rows.slice(0, limit) : pageRes.rows
      const last = page[page.length - 1]
      const nextCursor = hasMore && last ? encodeCursor(Number(last.timestamp), last.id) : null

      // Count ticker — all indexed transfers in the last day / last 7 days.
      const countsRes = await query<{ today: number; week: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE timestamp >= $1)::int AS today,
           COUNT(*) FILTER (WHERE timestamp >= $2)::int AS week
         FROM onchain.transfer`,
        [now - 86_400, now - 7 * 86_400]
      )

      const transactions = page.map((r) => ({
        // Stable unique row identity = onchain.transfer PK ("{txHash}-{logIndex}").
        // A single tx can emit multiple ERC-20 Transfer logs sharing the same
        // hash/from/to/timestamp, so the UI keys and cursor must use this, not txHash.
        transferId: r.id,
        usd: toUsd(String(r.amount)),
        timestamp: Number(r.timestamp),
        from: maskAddress(r.from),
        to: maskAddress(r.to),
        txHash: r.tx_hash,
        arbiscanUrl: `${ARBISCAN_TX}${r.tx_hash}`,
      }))

      return response.json({
        transactions,
        nextCursor,
        counts: {
          today: Number(countsRes.rows[0]?.today ?? 0),
          thisWeek: Number(countsRes.rows[0]?.week ?? 0),
        },
      })
    } catch (error) {
      logger.error({ err: error }, 'Season transactions query failed')
      return response.status(503).json({ error: 'Transactions temporarily unavailable' })
    }
  }
}
