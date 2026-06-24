/**
 * Season Transactions Controller — the live recent-transactions feed (Phase B).
 *
 * GET /api/season/transactions (public, paginated, IP-throttled like the quest
 * leaderboard). The single most credible proof element: real, verifiable
 * on-chain transfers anyone can click through to Arbiscan.
 *
 * PRIVACY: this serves on-chain data only — masked addresses (already public)
 * and tx hashes. PHONES ARE NEVER INVOLVED: the payload never joins or exposes
 * the user/phone table, so no phone field can leak. There is still no
 * verified-floor (personhood) gating — the feed mirrors the public chain, not
 * the user table.
 *
 * RELAY COLLAPSE: the feed reads the same relay-aware `logical_transfer` source
 * as the dashboard (#season/definitions logicalTransfersFeedCte), NOT raw
 * onchain.transfer. SpendPermission relays one logical send as two on-chain legs
 * (user→spender then spender→recipient, same tx); the source COLLAPSES that pair
 * back into a single user→recipient row, and passes direct transfers (inflows,
 * P2P) through. The feed then drops operator legs, self-transfers, and sub-$1
 * dust, so each real transfer appears exactly once with the spender plumbing
 * hidden. Uses only public on-chain addresses, never the phone table.
 *
 * Pagination: cursor on (ts DESC, id DESC) — a strict total order over the
 * logical-transfer rows (id is the user-leg / direct-row PK), so a page boundary
 * never skips or repeats a row even when many share a timestamp. The opaque
 * cursor encodes the last row's (ts, id).
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'
import { getSpenderAddress, logicalTransfersFeedCte } from '#season/definitions'

const USDC_DECIMALS = 6
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const ARBISCAN_TX = 'https://arbiscan.io/tx/'

// Hide sub-$1 dust from the feed (1 USDC = 1e6 raw units). Keeps the feed reading
// as real activity rather than spam/test transfers.
const MIN_FEED_RAW_UNITS = '1000000'

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
    // Spender = $1 in the shared logical-transfer CTE (relay legs collapsed there).
    // The feed then drops operator legs, self-transfers, and sub-$1 dust.
    const spender = getSpenderAddress()
    const feedFilter = `lt.amount >= $2::numeric
        AND lt.sender <> lt.recipient
        AND lt.sender    NOT IN (SELECT addr FROM operator_addrs)
        AND lt.recipient NOT IN (SELECT addr FROM operator_addrs)`

    try {
      // Fetch limit+1 to learn whether another page exists without a COUNT. Each
      // logical transfer (relay pair collapsed) appears once; ordered (ts, id) DESC.
      const pageRes = cursor
        ? await query<TransferRow>(
            `WITH ${logicalTransfersFeedCte()}
             SELECT id, sender AS "from", recipient AS "to", amount, ts AS timestamp, tx_hash
               FROM logical_transfer lt
              WHERE ${feedFilter}
                AND (lt.ts < $3 OR (lt.ts = $3 AND lt.id < $4))
              ORDER BY lt.ts DESC, lt.id DESC
              LIMIT $5`,
            [spender, MIN_FEED_RAW_UNITS, cursor.timestamp, cursor.id, limit + 1]
          )
        : await query<TransferRow>(
            `WITH ${logicalTransfersFeedCte()}
             SELECT id, sender AS "from", recipient AS "to", amount, ts AS timestamp, tx_hash
               FROM logical_transfer lt
              WHERE ${feedFilter}
              ORDER BY lt.ts DESC, lt.id DESC
              LIMIT $3`,
            [spender, MIN_FEED_RAW_UNITS, limit + 1]
          )

      const hasMore = pageRes.rows.length > limit
      const page = hasMore ? pageRes.rows.slice(0, limit) : pageRes.rows
      const last = page[page.length - 1]
      const nextCursor = hasMore && last ? encodeCursor(Number(last.timestamp), last.id) : null

      // Count ticker — real logical transfers (same filter) in the last day / last
      // 7 days, so the ticker matches what the feed actually shows.
      const countsRes = await query<{ today: number; week: number }>(
        `WITH ${logicalTransfersFeedCte()}
         SELECT
           COUNT(*) FILTER (WHERE lt.ts >= $3)::int AS today,
           COUNT(*) FILTER (WHERE lt.ts >= $4)::int AS week
         FROM logical_transfer lt
        WHERE ${feedFilter}`,
        [spender, MIN_FEED_RAW_UNITS, now - 86_400, now - 7 * 86_400]
      )

      const transactions = page.map((r) => ({
        // Stable unique row identity = the logical transfer's PK: the user-leg id
        // for a collapsed relay send, or the row id for a direct transfer (both
        // "{txHash}-{logIndex}"). The UI keys and cursor use this, not txHash (one
        // tx can carry several logs / logical transfers).
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
