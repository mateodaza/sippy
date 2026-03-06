import { db } from 'ponder:api'
import {
  account,
  transfer,
  refuelEvent,
  gasRefuelStatus,
  dailyVolume,
} from 'ponder:schema'
import * as offchainSchema from '../../offchain'
import { eq, or, and, desc, sql, inArray, gte } from 'drizzle-orm'
import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'

const app = new Hono()

// ══════════════════════════════════════════════════════════════
// CAPPED DEBOUNCE RESTART
// ══════════════════════════════════════════════════════════════

let restartScheduledAt: number | null = null
const RESTART_DELAY_MS = 60_000
const MAX_DEFERRAL_MS = 5 * 60_000

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
  const token = c.req.header('x-indexer-secret')
  if (
    !token ||
    token.length !== INDEXER_API_SECRET.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(INDEXER_API_SECRET))
  ) {
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
      const data = await res.json() as any
      if (data.error) throw new Error(`${method} error: ${data.error.message}`)
      return data.result
    } catch (err: any) {
      clearTimeout(timeout)
      if (attempt === RPC_MAX_RETRIES - 1) throw err
      const delay = 1000 * Math.pow(2, attempt)
      console.warn(`RPC ${method} attempt ${attempt + 1} failed, retrying in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

function isRangeTooLargeError(err: any): boolean {
  const msg = (err.message || '').toLowerCase()
  return msg.includes('too many') || msg.includes('query returned more than') ||
    msg.includes('response size') || msg.includes('block range') ||
    msg.includes('log response size exceeded')
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
      const logs = await rpcCall(rpcUrl, 'eth_getLogs', [{
        ...filter,
        fromBlock: '0x' + start.toString(16),
        toBlock: '0x' + end.toString(16),
      }])
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
// ══════════════════════════════════════════════════════════════

async function backfillWallet(address: string) {
  const rpcUrl = process.env.PONDER_RPC_URL_42161
  const startBlock = process.env.START_BLOCK || '290000000'
  if (!rpcUrl) return

  const startBlockHex = '0x' + parseInt(startBlock).toString(16)
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

  // Batch-fetch block timestamps for all unique blocks
  const uniqueBlockNums = [...new Set(allLogs.map((l: any) => l.blockNumber as string))]
  const blockTimestamps = new Map<string, number>()
  for (const blockNum of uniqueBlockNums) {
    const ts = await fetchBlockTimestamp(rpcUrl, blockNum)
    blockTimestamps.set(blockNum, ts)
  }

  let skippedNoTimestamp = 0
  for (const log of allLogs) {
    const from = ('0x' + log.topics[1].slice(26)).toLowerCase() as `0x${string}`
    const to = ('0x' + log.topics[2].slice(26)).toLowerCase() as `0x${string}`
    const amount = BigInt(log.data)
    const blockNumber = parseInt(log.blockNumber, 16)
    const logIndex = parseInt(log.logIndex, 16)
    const txHash = log.transactionHash.toLowerCase() as `0x${string}`
    const transferId = `${txHash}-${logIndex}`

    const timestamp = blockTimestamps.get(log.blockNumber)
    if (timestamp === undefined) {
      skippedNoTimestamp++
      continue
    }
    const day = new Date(timestamp * 1000).toISOString().slice(0, 10)

    // Insert transfer — returning() gates aggregate updates
    const inserted = await db.insert(transfer).values({
      id: transferId, from, to, amount, timestamp, blockNumber, txHash,
    }).onConflictDoNothing().returning({ id: transfer.id })

    if (inserted.length === 0) continue

    // Upsert sender account
    await db.insert(account).values({
      address: from, balance: -amount, totalSent: amount,
      totalReceived: 0n, txCount: 1, lastActivity: timestamp,
    }).onConflictDoUpdate({
      target: account.address,
      set: {
        balance: sql`${account.balance} - ${amount}`,
        totalSent: sql`${account.totalSent} + ${amount}`,
        txCount: sql`${account.txCount} + 1`,
        lastActivity: sql`GREATEST(${account.lastActivity}, ${timestamp})`,
      },
    })

    // Upsert receiver account
    await db.insert(account).values({
      address: to, balance: amount, totalSent: 0n,
      totalReceived: amount, txCount: 1, lastActivity: timestamp,
    }).onConflictDoUpdate({
      target: account.address,
      set: {
        balance: sql`${account.balance} + ${amount}`,
        totalReceived: sql`${account.totalReceived} + ${amount}`,
        txCount: sql`${account.txCount} + 1`,
        lastActivity: sql`GREATEST(${account.lastActivity}, ${timestamp})`,
      },
    })

    // Upsert daily volume
    await db.insert(dailyVolume).values({
      id: day, date: day, totalUsdcVolume: amount,
      transferCount: 1, gasRefuelCount: 0, gasEthSpent: 0n,
    }).onConflictDoUpdate({
      target: dailyVolume.id,
      set: {
        totalUsdcVolume: sql`${dailyVolume.totalUsdcVolume} + ${amount}`,
        transferCount: sql`${dailyVolume.transferCount} + 1`,
      },
    })
  }

  if (skippedNoTimestamp > 0) {
    console.warn(`Backfill ${address}: skipped ${skippedNoTimestamp} transfers (missing block timestamps)`)
  }
  console.log(`Backfilled ${allLogs.length - skippedNoTimestamp} transfers for ${address}`)
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
  const inserted = await db
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
    const reactivated = await db
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
  if (isNewOrReactivated) {
    try {
      await backfillWallet(normalized)
    } catch (err) {
      console.error(`Backfill failed for ${normalized}:`, err)
    }
    scheduleRestart()
  }

  return c.json({ ok: true, address: normalized, isNew: isNewOrReactivated })
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
  const skipped: string[] = []

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
    const inserted = await db
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
      continue
    }

    // Step 2: If not inserted, reactivate if currently inactive
    const reactivated = await db
      .update(offchainSchema.sippyWallet)
      .set({ isActive: true, phoneHash: w.phoneHash ?? null })
      .where(
        and(
          eq(offchainSchema.sippyWallet.address, normalized),
          eq(offchainSchema.sippyWallet.isActive, false)
        )
      )
      .returning({ address: offchainSchema.sippyWallet.address })

    if (reactivated.length > 0) reactivations++
  }

  // Only restart if filter membership actually changed
  const filterChanged = newInserts + reactivations
  if (filterChanged > 0) scheduleRestart()

  return c.json({ ok: true, processed, newInserts, reactivations, skipped })
})

// List all registered wallets (phoneHash excluded from response)
app.get('/wallets', async (c) => {
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

app.get('/balance/:address', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const result = await db
    .select()
    .from(account)
    .where(eq(account.address, address))

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
    balanceFormatted: (Number(a.balance) / 1e6).toFixed(2),
    totalSent: a.totalSent.toString(),
    totalReceived: a.totalReceived.toString(),
    txCount: a.txCount,
    lastActivity: a.lastActivity,
  })
})

// ══════════════════════════════════════════════════════════════
// TRANSFER HISTORY (classification at query time)
// ══════════════════════════════════════════════════════════════

app.get('/transfers/:address', async (c) => {
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
      amountFormatted: (Number(t.amount) / 1e6).toFixed(2),
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

app.get('/stats', async (c) => {
  const totalAccounts = await db
    .select({ count: sql<number>`count(*)` })
    .from(account)

  const totalTransfers = await db
    .select({
      count: sql<number>`count(*)`,
      volume: sql<string>`coalesce(sum(amount), 0)`,
    })
    .from(transfer)

  const registeredWallets = await db
    .select({ count: sql<number>`count(*)` })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))

  const walletSet = await loadWalletSet()
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
      .where(
        or(
          inArray(transfer.from, walletAddresses),
          inArray(transfer.to, walletAddresses),
        ),
      )
    sippyVolume = sippyStats[0]?.volume || '0'
    sippyCount = sippyStats[0]?.count || 0
  }

  const gasStatus = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, 'singleton'))

  return c.json({
    scope: 'sippy_wallets',
    registeredUsers: registeredWallets[0]?.count || 0,
    accounts: totalAccounts[0]?.count || 0,
    transfers: {
      count: totalTransfers[0]?.count || 0,
      totalVolume: totalTransfers[0]?.volume || '0',
      totalVolumeFormatted: (Number(totalTransfers[0]?.volume || 0) / 1e6).toFixed(2),
    },
    sippyTransfers: {
      count: sippyCount,
      totalVolume: sippyVolume,
      totalVolumeFormatted: (Number(sippyVolume) / 1e6).toFixed(2),
    },
    gasRefuel: gasStatus[0] || null,
  })
})

// ══════════════════════════════════════════════════════════════
// DAILY VOLUME
// ══════════════════════════════════════════════════════════════

app.get('/stats/daily', async (c) => {
  const days = Math.min(Number(c.req.query('days') || 30), 90)

  const results = await db
    .select()
    .from(dailyVolume)
    .orderBy(desc(dailyVolume.date))
    .limit(days)

  return c.json({
    scope: 'sippy_wallets',
    days: results.map((d) => ({
      date: d.date,
      usdcVolume: d.totalUsdcVolume.toString(),
      usdcVolumeFormatted: (Number(d.totalUsdcVolume) / 1e6).toFixed(2),
      transfers: d.transferCount,
      gasRefuels: d.gasRefuelCount,
      gasEthSpent: d.gasEthSpent.toString(),
    })),
  })
})

// ══════════════════════════════════════════════════════════════
// GAS REFUEL
// ══════════════════════════════════════════════════════════════

app.get('/gas-refuel/status', async (c) => {
  const status = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, 'singleton'))

  return c.json(status[0] || { totalRefuels: 0, totalEthSpent: '0', isPaused: false })
})

app.get('/gas-refuel/history/:address', async (c) => {
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

app.get('/sync-status', async (c) => {
  const transferCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(transfer)

  const refuelCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(refuelEvent)

  const wallets = await db
    .select({ count: sql<number>`count(*)` })
    .from(offchainSchema.sippyWallet)

  return c.json({
    registeredWallets: wallets[0]?.count || 0,
    totalTransfersIndexed: transferCount[0]?.count || 0,
    gasRefuelsIndexed: refuelCount[0]?.count || 0,
    timestamp: Math.floor(Date.now() / 1000),
  })
})

// ══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Dashboard overview — single-call summary for the admin home page
app.get('/dashboard/overview', async (c) => {
  const walletSet = await loadWalletSet()
  const walletAddresses = Array.from(walletSet) as `0x${string}`[]
  const registeredCount = walletAddresses.length

  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400
  let activeTodayCount = 0
  let totalSippyVolume = '0'

  if (walletAddresses.length > 0) {
    const activeToday = await db
      .select({ count: sql<number>`count(distinct "from")` })
      .from(transfer)
      .where(
        and(
          gte(transfer.timestamp, oneDayAgo),
          or(
            inArray(transfer.from, walletAddresses),
            inArray(transfer.to, walletAddresses),
          ),
        ),
      )
    activeTodayCount = activeToday[0]?.count || 0

    const volumeResult = await db
      .select({ volume: sql<string>`coalesce(sum(amount), 0)` })
      .from(transfer)
      .where(
        or(
          inArray(transfer.from, walletAddresses),
          inArray(transfer.to, walletAddresses),
        ),
      )
    totalSippyVolume = volumeResult[0]?.volume || '0'
  }

  const gasStatus = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, 'singleton'))

  return c.json({
    registeredUsers: registeredCount,
    activeUsersToday: activeTodayCount,
    totalSippyVolume,
    totalSippyVolumeFormatted: (Number(totalSippyVolume) / 1e6).toFixed(2),
    gasRefuel: gasStatus[0] || null,
  })
})

// List all registered users with their on-chain stats
app.get('/dashboard/users', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 50), 200)
  const offset = Number(c.req.query('offset') || 0)

  const wallets = await db
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))
    .limit(limit)
    .offset(offset)

  const enriched = []
  for (const w of wallets) {
    const acct = await db
      .select()
      .from(account)
      .where(eq(account.address, w.address as `0x${string}`))

    enriched.push({
      address: w.address,
      registeredAt: w.registeredAt,
      balance: acct[0]?.balance?.toString() || '0',
      balanceFormatted: (Number(acct[0]?.balance || 0) / 1e6).toFixed(2),
      totalSent: acct[0]?.totalSent?.toString() || '0',
      totalReceived: acct[0]?.totalReceived?.toString() || '0',
      txCount: acct[0]?.txCount || 0,
      lastActivity: acct[0]?.lastActivity || null,
    })
  }

  return c.json({ users: enriched, pagination: { limit, offset } })
})

// Single user detail
app.get('/dashboard/users/:address', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`

  const wallet = await db
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.address, address))

  const acct = await db
    .select()
    .from(account)
    .where(eq(account.address, address))

  const recentTransfers = await db
    .select()
    .from(transfer)
    .where(or(eq(transfer.from, address), eq(transfer.to, address)))
    .orderBy(desc(transfer.timestamp))
    .limit(20)

  const recentRefuels = await db
    .select()
    .from(refuelEvent)
    .where(eq(refuelEvent.user, address))
    .orderBy(desc(refuelEvent.timestamp))
    .limit(10)

  const walletSet = await loadWalletSet()

  const registration = wallet[0]
    ? { address: wallet[0].address, registeredAt: wallet[0].registeredAt, isActive: wallet[0].isActive }
    : null

  return c.json({
    address,
    isSippyUser: wallet.length > 0,
    registration,
    account: acct[0]
      ? {
          balance: acct[0].balance.toString(),
          balanceFormatted: (Number(acct[0].balance) / 1e6).toFixed(2),
          totalSent: acct[0].totalSent.toString(),
          totalReceived: acct[0].totalReceived.toString(),
          txCount: acct[0].txCount,
          lastActivity: acct[0].lastActivity,
        }
      : null,
    recentTransfers: recentTransfers.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      amount: t.amount.toString(),
      amountFormatted: (Number(t.amount) / 1e6).toFixed(2),
      direction: t.from === address ? 'sent' : 'received',
      transferType: classifyTransfer(t.from, t.to, walletSet),
      timestamp: t.timestamp,
      txHash: t.txHash,
    })),
    recentRefuels: recentRefuels.map((r) => ({
      amount: r.amount.toString(),
      timestamp: r.timestamp,
      txHash: r.txHash,
    })),
  })
})

// Per-user daily activity
app.get('/dashboard/users/:address/activity', async (c) => {
  const address = c.req.param('address').toLowerCase() as `0x${string}`
  const days = Math.min(Number(c.req.query('days') || 30), 90)

  const activity = await db
    .select({
      date: sql<string>`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`,
      sentCount: sql<number>`count(*) filter (where "from" = ${address})`,
      receivedCount: sql<number>`count(*) filter (where "to" = ${address})`,
      sentVolume: sql<string>`coalesce(sum(amount) filter (where "from" = ${address}), 0)`,
      receivedVolume: sql<string>`coalesce(sum(amount) filter (where "to" = ${address}), 0)`,
    })
    .from(transfer)
    .where(or(eq(transfer.from, address), eq(transfer.to, address)))
    .groupBy(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`))
    .limit(days)

  return c.json({
    address,
    activity: activity.map((d) => ({
      date: d.date,
      sentCount: d.sentCount,
      receivedCount: d.receivedCount,
      sentVolume: (Number(d.sentVolume) / 1e6).toFixed(2),
      receivedVolume: (Number(d.receivedVolume) / 1e6).toFixed(2),
    })),
  })
})

// Top users by volume or tx count
app.get('/dashboard/top-users', async (c) => {
  const metric = c.req.query('metric') || 'volume'
  const limit = Math.min(Number(c.req.query('limit') || 20), 100)

  const walletSet = await loadWalletSet()
  const walletAddresses = Array.from(walletSet) as `0x${string}`[]
  if (walletAddresses.length === 0) return c.json({ users: [] })

  const orderCol =
    metric === 'txCount'
      ? desc(account.txCount)
      : metric === 'balance'
        ? desc(account.balance)
        : desc(sql`${account.totalSent} + ${account.totalReceived}`)

  const results = await db
    .select()
    .from(account)
    .where(inArray(account.address, walletAddresses))
    .orderBy(orderCol)
    .limit(limit)

  return c.json({
    metric,
    users: results.map((a) => ({
      address: a.address,
      balance: a.balance.toString(),
      balanceFormatted: (Number(a.balance) / 1e6).toFixed(2),
      totalVolume: (a.totalSent + a.totalReceived).toString(),
      totalVolumeFormatted: (Number(a.totalSent + a.totalReceived) / 1e6).toFixed(2),
      txCount: a.txCount,
      lastActivity: a.lastActivity,
    })),
  })
})

// Fund flow analysis — net in vs out for Sippy ecosystem
app.get('/dashboard/flow', async (c) => {
  const days = Math.min(Number(c.req.query('days') || 30), 90)

  const walletSet = await loadWalletSet()
  const walletAddresses = Array.from(walletSet) as `0x${string}`[]
  if (walletAddresses.length === 0) return c.json({ flow: [] })

  const flow = await db
    .select({
      date: sql<string>`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`,
      inbound: sql<string>`coalesce(sum(amount) filter (
        where "to" = any(${walletAddresses}) and "from" != all(${walletAddresses})
      ), 0)`,
      outbound: sql<string>`coalesce(sum(amount) filter (
        where "from" = any(${walletAddresses}) and "to" != all(${walletAddresses})
      ), 0)`,
      internal: sql<string>`coalesce(sum(amount) filter (
        where "from" = any(${walletAddresses}) and "to" = any(${walletAddresses})
      ), 0)`,
    })
    .from(transfer)
    .where(
      or(
        inArray(transfer.from, walletAddresses),
        inArray(transfer.to, walletAddresses),
      ),
    )
    .groupBy(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`))
    .limit(days)

  return c.json({
    flow: flow.map((d) => ({
      date: d.date,
      inbound: (Number(d.inbound) / 1e6).toFixed(2),
      outbound: (Number(d.outbound) / 1e6).toFixed(2),
      internal: (Number(d.internal) / 1e6).toFixed(2),
      netFlow: ((Number(d.inbound) - Number(d.outbound)) / 1e6).toFixed(2),
    })),
  })
})

// Retention — daily active Sippy users over time
app.get('/dashboard/retention', async (c) => {
  const days = Math.min(Number(c.req.query('days') || 30), 90)

  const walletSet = await loadWalletSet()
  const walletAddresses = Array.from(walletSet) as `0x${string}`[]
  if (walletAddresses.length === 0) return c.json({ totalRegistered: 0, daily: [] })

  const retention = await db
    .select({
      date: sql<string>`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`,
      activeUsers: sql<number>`count(distinct case
        when "from" = any(${walletAddresses}) then "from"
        when "to" = any(${walletAddresses}) then "to"
      end)`,
      totalTransactions: sql<number>`count(*)`,
    })
    .from(transfer)
    .where(
      or(
        inArray(transfer.from, walletAddresses),
        inArray(transfer.to, walletAddresses),
      ),
    )
    .groupBy(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`))
    .limit(days)

  return c.json({
    totalRegistered: walletAddresses.length,
    daily: retention.map((d) => ({
      date: d.date,
      activeUsers: d.activeUsers,
      totalTransactions: d.totalTransactions,
    })),
  })
})

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function loadWalletSet(): Promise<Set<string>> {
  const wallets = await db
    .select({ address: offchainSchema.sippyWallet.address })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))
  return new Set(wallets.map((w) => w.address))
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
