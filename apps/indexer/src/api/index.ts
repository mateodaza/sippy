import { db } from 'ponder:api'
import { account, transfer, refuelEvent, gasRefuelStatus, dailyVolume } from 'ponder:schema'
import * as offchainSchema from '../../offchain'
import { eq, or, and, desc, sql, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'

// Writable DB connection for offchain tables (ponder:api db is read-only)
const writePool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const writeDb = drizzle(writePool)

const app = new Hono()

// ══════════════════════════════════════════════════════════════
// CAPPED DEBOUNCE RESTART
// ══════════════════════════════════════════════════════════════

let restartScheduledAt: number | null = null
const RESTART_DELAY_MS = 30 * 60_000 // 30 min — batch new wallets before restarting
const MAX_DEFERRAL_MS = 60 * 60_000 // 1 hour — hard cap on deferral

function scheduleRestart() {
  const now = Date.now()
  if (restartScheduledAt !== null) {
    if (now - restartScheduledAt > MAX_DEFERRAL_MS) {
      console.log('Max deferral reached, scheduling immediate restart')
      setTimeout(() => process.exit(0), 100)
    }
    return
  }
  restartScheduledAt = now
  setTimeout(() => {
    console.log('Restarting to reload wallet filter...')
    process.exit(0)
  }, RESTART_DELAY_MS)
}

// ══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE (shared secret for write endpoints)
// ══════════════════════════════════════════════════════════════

const INDEXER_API_SECRET = process.env.INDEXER_API_SECRET || ''

async function requireSecret(c: any, next: () => Promise<void>) {
  if (!INDEXER_API_SECRET) {
    return c.json({ error: 'Indexer API secret not configured' }, 503)
  }
  const token = c.req.header('x-indexer-secret') || ''
  const a = Buffer.from(token.padEnd(64, '\0'))
  const b = Buffer.from(INDEXER_API_SECRET.padEnd(64, '\0'))
  if (!token || a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}

// ══════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const HEX_HASH_RE = /^[0-9a-fA-F]{64}$/

function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && ETH_ADDRESS_RE.test(value)
}

function isValidPhoneHash(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return typeof value === 'string' && HEX_HASH_RE.test(value)
}

// ══════════════════════════════════════════════════════════════
// RPC HELPERS (for backfill)
// ══════════════════════════════════════════════════════════════

const RPC_TIMEOUT_MS = 30_000
const RPC_MAX_RETRIES = 3
const INITIAL_CHUNK_SIZE = 50_000
const MIN_CHUNK_SIZE = 1_000

const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  for (let attempt = 0; attempt < RPC_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = (await res.json()) as any
      if (data.error) throw new Error(`${method} error: ${data.error.message}`)
      return data.result
    } catch (err: any) {
      clearTimeout(timeout)
      if (attempt === RPC_MAX_RETRIES - 1) throw err
      const delay = 1000 * Math.pow(2, attempt)
      console.warn(`RPC ${method} attempt ${attempt + 1} failed, retrying in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

function isRangeTooLargeError(err: any): boolean {
  const msg = (err.message || '').toLowerCase()
  return (
    msg.includes('too many') ||
    msg.includes('query returned more than') ||
    msg.includes('response size') ||
    msg.includes('block range') ||
    msg.includes('log response size exceeded')
  )
}

async function fetchLatestBlock(rpcUrl: string): Promise<number> {
  const result = await rpcCall(rpcUrl, 'eth_blockNumber', [])
  return parseInt(result, 16)
}

async function fetchBlockTimestamp(rpcUrl: string, blockNumHex: string): Promise<number> {
  const block = await rpcCall(rpcUrl, 'eth_getBlockByNumber', [blockNumHex, false])
  return parseInt(block.timestamp, 16)
}

async function fetchLogsChunked(rpcUrl: string, filter: any): Promise<any[]> {
  const latestBlock = await fetchLatestBlock(rpcUrl)
  const fromBlock = parseInt(filter.fromBlock, 16)
  const allLogs: any[] = []
  let chunkSize = INITIAL_CHUNK_SIZE

  let start = fromBlock
  while (start <= latestBlock) {
    const end = Math.min(start + chunkSize - 1, latestBlock)
    try {
      const logs = await rpcCall(rpcUrl, 'eth_getLogs', [
        {
          ...filter,
          fromBlock: '0x' + start.toString(16),
          toBlock: '0x' + end.toString(16),
        },
      ])
      allLogs.push(...logs)
      start = end + 1
      chunkSize = Math.min(chunkSize * 2, INITIAL_CHUNK_SIZE)
    } catch (err: any) {
      if (isRangeTooLargeError(err) && chunkSize > MIN_CHUNK_SIZE) {
        chunkSize = Math.floor(chunkSize / 2)
        console.warn(`eth_getLogs range too large, halving to ${chunkSize} blocks`)
        continue
      }
      throw err
    }
  }
  return allLogs
}

function deduplicateLogs(logs: any[]): any[] {
  const seen = new Set<string>()
  return logs.filter((log) => {
    const key = `${log.transactionHash}-${log.logIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ══════════════════════════════════════════════════════════════
// BACKFILL (idempotent, batch block timestamps)
// Uses writePool (raw SQL) because ponder:api db is read-only
// for onchain tables. Schema-qualified to match DATABASE_SCHEMA.
// ══════════════════════════════════════════════════════════════

const PONDER_SCHEMA = process.env.INDEXER_DB_SCHEMA || process.env.DATABASE_SCHEMA || 'ponder'
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(PONDER_SCHEMA)) {
  throw new Error(`Invalid PONDER_SCHEMA: ${PONDER_SCHEMA}`)
}

const MIN_BLOCK = 400_000_000
const SPENDER_ADDRESS = (process.env.SIPPY_SPENDER_ADDRESS || '').toLowerCase()

async function backfillWallet(address: string) {
  const rpcUrl = process.env.PONDER_RPC_URL_42161
  const startBlock = Math.max(parseInt(process.env.START_BLOCK || '437000000'), MIN_BLOCK)
  if (!rpcUrl) {
    console.warn(`Skipping backfill for ${address}: PONDER_RPC_URL_42161 is not set`)
    return
  }

  const startBlockHex = '0x' + startBlock.toString(16)
  const paddedAddr = '0x' + address.slice(2).padStart(64, '0')

  const sent = await fetchLogsChunked(rpcUrl, {
    address: USDC_ADDRESS,
    topics: [TRANSFER_TOPIC, paddedAddr, null],
    fromBlock: startBlockHex,
  })
  const received = await fetchLogsChunked(rpcUrl, {
    address: USDC_ADDRESS,
    topics: [TRANSFER_TOPIC, null, paddedAddr],
    fromBlock: startBlockHex,
  })

  const allLogs = deduplicateLogs([...sent, ...received])
  if (allLogs.length === 0) return

  // Batch-fetch block timestamps for all unique blocks (parallel, concurrency 10)
  const uniqueBlockNums = [...new Set(allLogs.map((l: any) => l.blockNumber as string))]
  const blockTimestamps = new Map<string, number>()
  const CONCURRENCY = 10
  for (let i = 0; i < uniqueBlockNums.length; i += CONCURRENCY) {
    const batch = uniqueBlockNums.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((bn) => fetchBlockTimestamp(rpcUrl, bn)))
    batch.forEach((bn, idx) => {
      const r = results[idx]
      if (r.status === 'fulfilled') blockTimestamps.set(bn, r.value)
      else console.warn(`Failed to fetch timestamp for block ${bn}: ${r.reason?.message}`)
    })
  }

  const S = PONDER_SCHEMA // shorthand for SQL interpolation
  let skippedNoTimestamp = 0
  let backfilled = 0

  for (const log of allLogs) {
    const from = ('0x' + log.topics[1].slice(26)).toLowerCase()
    const to = ('0x' + log.topics[2].slice(26)).toLowerCase()
    const amount = BigInt(log.data).toString()
    const blockNumber = parseInt(log.blockNumber, 16)
    const logIndex = parseInt(log.logIndex, 16)
    const txHash = log.transactionHash.toLowerCase()
    const transferId = `${txHash}-${logIndex}`

    const timestamp = blockTimestamps.get(log.blockNumber)
    if (timestamp === undefined) {
      skippedNoTimestamp++
      continue
    }
    const day = new Date(timestamp * 1000).toISOString().slice(0, 10)

    const client = await writePool.connect()
    try {
      await client.query('BEGIN')

      // Insert transfer — ON CONFLICT DO NOTHING for idempotency
      const insertResult = await client.query(
        `INSERT INTO "${S}".transfer (id, "from", "to", amount, timestamp, block_number, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [transferId, from, to, amount, timestamp, blockNumber, txHash]
      )

      if (insertResult.rowCount === 0) {
        await client.query('ROLLBACK')
        continue
      }
      backfilled++

      // Upsert sender account (skip spender — matches live handler behavior)
      if (from !== SPENDER_ADDRESS) {
        await client.query(
          `INSERT INTO "${S}".account (address, balance, total_sent, total_received, tx_count, last_activity)
           VALUES ($1, -$2::bigint, $2, 0, 1, $3)
           ON CONFLICT (address) DO UPDATE SET
             balance = "${S}".account.balance - $2::bigint,
             total_sent = "${S}".account.total_sent + $2::bigint,
             tx_count = "${S}".account.tx_count + 1,
             last_activity = GREATEST("${S}".account.last_activity, $3)`,
          [from, amount, timestamp]
        )
      }

      // Upsert receiver account (skip spender — matches live handler behavior)
      if (to !== SPENDER_ADDRESS) {
        await client.query(
          `INSERT INTO "${S}".account (address, balance, total_sent, total_received, tx_count, last_activity)
           VALUES ($1, $2::bigint, 0, $2, 1, $3)
           ON CONFLICT (address) DO UPDATE SET
             balance = "${S}".account.balance + $2::bigint,
             total_received = "${S}".account.total_received + $2::bigint,
             tx_count = "${S}".account.tx_count + 1,
             last_activity = GREATEST("${S}".account.last_activity, $3)`,
          [to, amount, timestamp]
        )
      }

      // Upsert daily volume
      await client.query(
        `INSERT INTO "${S}".daily_volume (id, date, total_usdc_volume, transfer_count, gas_refuel_count, gas_eth_spent)
         VALUES ($1, $2, $3, 1, 0, 0)
         ON CONFLICT (id) DO UPDATE SET
           total_usdc_volume = "${S}".daily_volume.total_usdc_volume + $3::bigint,
           transfer_count = "${S}".daily_volume.transfer_count + 1`,
        [day, day, amount]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  if (skippedNoTimestamp > 0) {
    console.warn(
      `Backfill ${address}: skipped ${skippedNoTimestamp} transfers (missing block timestamps)`
    )
  }
  console.log(`Backfilled ${backfilled} transfers for ${address}`)
}

// ══════════════════════════════════════════════════════════════
// WALLET REGISTRATION (called by AdonisJS backend)
// ══════════════════════════════════════════════════════════════

// Register a single wallet (called on each new user signup)
app.post('/wallets/register', requireSecret, async (c) => {
  const { address, phoneHash } = await c.req.json()

  if (!isValidAddress(address)) {
    return c.json({ error: 'Invalid address: must be 0x + 40 hex chars' }, 400)
  }
  if (!isValidPhoneHash(phoneHash)) {
    return c.json({ error: 'Invalid phoneHash: must be 64 hex chars or omitted' }, 400)
  }

  const normalized = address.toLowerCase()

  // Step 1: Try insert — only returns a row if wallet is genuinely new
  const inserted = await writeDb
    .insert(offchainSchema.sippyWallet)
    .values({
      address: normalized,
      phoneHash: phoneHash || null,
      registeredAt: Math.floor(Date.now() / 1000),
      isActive: true,
    })
    .onConflictDoNothing()
    .returning({ address: offchainSchema.sippyWallet.address })

  let isNewOrReactivated = inserted.length > 0

  // Step 2: If not inserted, check if wallet needs reactivation
  if (!isNewOrReactivated) {
    const reactivated = await writeDb
      .update(offchainSchema.sippyWallet)
      .set({ isActive: true, phoneHash: phoneHash ?? null })
      .where(
        and(
          eq(offchainSchema.sippyWallet.address, normalized),
          eq(offchainSchema.sippyWallet.isActive, false)
        )
      )
      .returning({ address: offchainSchema.sippyWallet.address })
    isNewOrReactivated = reactivated.length > 0
  }

  // Only backfill + restart if filter membership actually changed
  let backfillOk = false
  if (isNewOrReactivated) {
    try {
      await backfillWallet(normalized)
      backfillOk = true
    } catch (err) {
      console.error(`Backfill failed for ${normalized}: ${(err as Error).message}`)
    }
    // Restart is batched (30 min window) — backfill provides immediate data,
    // restart updates the live event filter for future transfers.
    invalidateWalletSetCache()
    scheduleRestart()
  }

  return c.json({ ok: true, address: normalized, isNew: isNewOrReactivated, backfillOk })
})

// Bulk sync all wallets from backend (call on demand)
app.post('/wallets/sync', requireSecret, async (c) => {
  const { wallets } = await c.req.json()
  if (!Array.isArray(wallets)) {
    return c.json({ error: 'wallets must be an array' }, 400)
  }

  let newInserts = 0
  let reactivations = 0
  let processed = 0
  let backfilled = 0
  let backfillErrors = 0
  const skipped: string[] = []
  const walletsToBackfill: string[] = []

  for (const w of wallets) {
    if (!isValidAddress(w.address)) {
      skipped.push(w.address ?? '(missing)')
      continue
    }
    if (!isValidPhoneHash(w.phoneHash)) {
      skipped.push(w.address)
      continue
    }
    const normalized = w.address.toLowerCase()

    // Step 1: Try insert (new wallet)
    const inserted = await writeDb
      .insert(offchainSchema.sippyWallet)
      .values({
        address: normalized,
        phoneHash: w.phoneHash || null,
        registeredAt: w.registeredAt || Math.floor(Date.now() / 1000),
        isActive: true,
      })
      .onConflictDoNothing()
      .returning({ address: offchainSchema.sippyWallet.address })

    processed++
    if (inserted.length > 0) {
      newInserts++
      walletsToBackfill.push(normalized)
      continue
    }

    // Step 2: If not inserted, reactivate if currently inactive
    const reactivated = await writeDb
      .update(offchainSchema.sippyWallet)
      .set({ isActive: true, phoneHash: w.phoneHash ?? null })
      .where(
        and(
          eq(offchainSchema.sippyWallet.address, normalized),
          eq(offchainSchema.sippyWallet.isActive, false)
        )
      )
      .returning({ address: offchainSchema.sippyWallet.address })

    if (reactivated.length > 0) {
      reactivations++
      walletsToBackfill.push(normalized)
    }
  }

  // Backfill historical transfers for new/reactivated wallets
  for (const addr of walletsToBackfill) {
    try {
      await backfillWallet(addr)
      backfilled++
    } catch (err) {
      backfillErrors++
      console.error(`Sync backfill failed for ${addr}: ${(err as Error).message}`)
    }
  }

  // Only restart if filter membership actually changed
  const filterChanged = newInserts + reactivations
  if (filterChanged > 0) {
    invalidateWalletSetCache()
    scheduleRestart()
  }

  return c.json({
    ok: true,
    processed,
    newInserts,
    reactivations,
    backfilled,
    backfillErrors,
    skipped,
  })
})

// List all registered wallets (phoneHash excluded from response)
app.get('/wallets', requireSecret, async (c) => {
  const results = await db
    .select({
      address: offchainSchema.sippyWallet.address,
      registeredAt: offchainSchema.sippyWallet.registeredAt,
      isActive: offchainSchema.sippyWallet.isActive,
    })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))

  return c.json({ wallets: results, total: results.length })
})

// ══════════════════════════════════════════════════════════════
// BALANCE + ACCOUNT STATS
// ══════════════════════════════════════════════════════════════

app.get('/balance/:address', requireSecret, async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const result = await db.select().from(account).where(eq(account.address, address))

  if (result.length === 0) {
    return c.json({ address, balance: '0', totalSent: '0', totalReceived: '0', txCount: 0 })
  }

  const wallet = await db
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.address, address))

  const a = result[0]
  return c.json({
    address: a.address,
    isSippyUser: wallet.length > 0,
    balance: a.balance.toString(),
    balanceFormatted: formatUsdc(a.balance),
    totalSent: a.totalSent.toString(),
    totalReceived: a.totalReceived.toString(),
    txCount: a.txCount,
    lastActivity: a.lastActivity,
  })
})

// ══════════════════════════════════════════════════════════════
// TRANSFER HISTORY (classification at query time)
// ══════════════════════════════════════════════════════════════

app.get('/transfers/:address', requireSecret, async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const limit = Math.min(Number(c.req.query('limit') || 50), 200)
  const offset = Number(c.req.query('offset') || 0)

  const results = await db
    .select()
    .from(transfer)
    .where(or(eq(transfer.from, address), eq(transfer.to, address)))
    .orderBy(desc(transfer.timestamp))
    .limit(limit)
    .offset(offset)

  const walletSet = await loadWalletSet()

  return c.json({
    address,
    transfers: results.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      amount: t.amount.toString(),
      amountFormatted: formatUsdc(t.amount),
      direction: t.from === address ? 'sent' : 'received',
      transferType: classifyTransfer(t.from, t.to, walletSet),
      timestamp: t.timestamp,
      txHash: t.txHash,
    })),
    pagination: { limit, offset },
  })
})

// ══════════════════════════════════════════════════════════════
// GLOBAL STATS
// ══════════════════════════════════════════════════════════════

app.get('/stats', requireSecret, async (c) => {
  const [totalAccounts, totalTransfers, registeredWallets, walletSet, gasStatus] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(account),
      db
        .select({
          count: sql<number>`count(*)`,
          volume: sql<string>`coalesce(sum(amount), 0)`,
        })
        .from(transfer),
      db
        .select({ count: sql<number>`count(*)` })
        .from(offchainSchema.sippyWallet)
        .where(eq(offchainSchema.sippyWallet.isActive, true)),
      loadWalletSet(),
      db.select().from(gasRefuelStatus).where(eq(gasRefuelStatus.id, 'singleton')),
    ])

  const walletAddresses = Array.from(walletSet) as `0x${string}`[]

  let sippyVolume = '0'
  let sippyCount = 0
  if (walletAddresses.length > 0) {
    const sippyStats = await db
      .select({
        count: sql<number>`count(*)`,
        volume: sql<string>`coalesce(sum(amount), 0)`,
      })
      .from(transfer)
      .where(or(inArray(transfer.from, walletAddresses), inArray(transfer.to, walletAddresses)))
    sippyVolume = sippyStats[0]?.volume || '0'
    sippyCount = sippyStats[0]?.count || 0
  }

  return c.json({
    registeredUsers: registeredWallets[0]?.count || 0,
    accounts: totalAccounts[0]?.count || 0,
    allTransfers: {
      count: totalTransfers[0]?.count || 0,
      totalVolume: totalTransfers[0]?.volume || '0',
      totalVolumeFormatted: formatUsdc(totalTransfers[0]?.volume || '0'),
    },
    sippyTransfers: {
      count: sippyCount,
      totalVolume: sippyVolume,
      totalVolumeFormatted: formatUsdc(sippyVolume),
    },
    gasRefuel: gasStatus[0] || null,
  })
})

// ══════════════════════════════════════════════════════════════
// DAILY VOLUME
// ══════════════════════════════════════════════════════════════

app.get('/stats/daily', requireSecret, async (c) => {
  const days = Math.min(Number(c.req.query('days') || 30), 90)

  const results = await db.select().from(dailyVolume).orderBy(desc(dailyVolume.date)).limit(days)

  return c.json({
    scope: 'sippy_wallets',
    days: results.map((d) => ({
      date: d.date,
      usdcVolume: d.totalUsdcVolume.toString(),
      usdcVolumeFormatted: formatUsdc(d.totalUsdcVolume),
      transfers: d.transferCount,
      gasRefuels: d.gasRefuelCount,
      gasEthSpent: d.gasEthSpent.toString(),
    })),
  })
})

// ══════════════════════════════════════════════════════════════
// GAS REFUEL
// ══════════════════════════════════════════════════════════════

app.get('/gas-refuel/status', requireSecret, async (c) => {
  const status = await db.select().from(gasRefuelStatus).where(eq(gasRefuelStatus.id, 'singleton'))

  return c.json(status[0] || { totalRefuels: 0, totalEthSpent: '0', isPaused: false })
})

app.get('/gas-refuel/history/:address', requireSecret, async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const limit = Math.min(Number(c.req.query('limit') || 50), 200)

  const results = await db
    .select()
    .from(refuelEvent)
    .where(eq(refuelEvent.user, address))
    .orderBy(desc(refuelEvent.timestamp))
    .limit(limit)

  return c.json({
    address,
    refuels: results.map((r) => ({
      amount: r.amount.toString(),
      timestamp: r.timestamp,
      txHash: r.txHash,
    })),
    totalRefuels: results.length,
  })
})

// ══════════════════════════════════════════════════════════════
// SYNC STATUS
// ══════════════════════════════════════════════════════════════

app.get('/sync-status', requireSecret, async (c) => {
  const transferCount = await db.select({ count: sql<number>`count(*)` }).from(transfer)

  const refuelCount = await db.select({ count: sql<number>`count(*)` }).from(refuelEvent)

  const wallets = await db.select({ count: sql<number>`count(*)` }).from(offchainSchema.sippyWallet)

  return c.json({
    registeredWallets: wallets[0]?.count || 0,
    totalTransfersIndexed: transferCount[0]?.count || 0,
    gasRefuelsIndexed: refuelCount[0]?.count || 0,
    timestamp: Math.floor(Date.now() / 1000),
  })
})

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

let walletSetCache: { set: Set<string>; expiresAt: number } | null = null
const WALLET_SET_TTL_MS = 30_000

function invalidateWalletSetCache() {
  walletSetCache = null
}

async function loadWalletSet(): Promise<Set<string>> {
  if (walletSetCache && Date.now() < walletSetCache.expiresAt) {
    return walletSetCache.set
  }
  const wallets = await db
    .select({ address: offchainSchema.sippyWallet.address })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))
  const set = new Set(wallets.map((w) => w.address))
  walletSetCache = { set, expiresAt: Date.now() + WALLET_SET_TTL_MS }
  return set
}

function formatUsdc(raw: string | bigint): string {
  const n = BigInt(raw)
  const abs = n < 0n ? -n : n
  const whole = abs / 1_000_000n
  const frac = abs % 1_000_000n
  const sign = n < 0n ? '-' : ''
  return `${sign}${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`
}

function classifyTransfer(from: string, to: string, walletSet: Set<string>): string {
  const fromIsSippy = walletSet.has(from.toLowerCase())
  const toIsSippy = walletSet.has(to.toLowerCase())
  if (fromIsSippy && toIsSippy) return 'internal'
  if (!fromIsSippy && toIsSippy) return 'inbound'
  if (fromIsSippy && !toIsSippy) return 'outbound'
  return 'external'
}

export default app
