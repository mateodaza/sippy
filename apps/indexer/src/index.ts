import { ponder } from 'ponder:registry'
import { account, transfer, refuelEvent, gasRefuelStatus, dailyVolume } from 'ponder:schema'

// ── USDC Transfer ──────────────────────────────────────────

// Spender is infrastructure — skip its account aggregation so stats
// attribute to the actual user, not the relay wallet.
const SPENDER_RAW = process.env.SIPPY_SPENDER_ADDRESS
if (!SPENDER_RAW) {
  console.warn(
    'SIPPY_SPENDER_ADDRESS not set — spender relay wallet will NOT be excluded from account aggregation'
  )
}
const SPENDER = (SPENDER_RAW || '').toLowerCase()

ponder.on('USDC:Transfer', async ({ event, context }) => {
  const { from, to, value } = event.args
  const timestamp = Number(event.block.timestamp)
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()

  // Insert transfer — gate aggregates on success
  const inserted = await context.db
    .insert(transfer)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      from,
      to,
      amount: value,
      timestamp,
      blockNumber: Number(event.block.number),
      txHash: event.transaction.hash,
    })
    .onConflictDoNothing()

  // If transfer already existed (backfill or replay), skip all aggregates
  if (!inserted) return

  // Update sender account (skip spender — it's a relay, not a user)
  if (fromLower !== SPENDER) {
    await context.db
      .insert(account)
      .values({
        address: from,
        balance: -value,
        totalSent: value,
        totalReceived: 0n,
        txCount: 1,
        lastActivity: timestamp,
      })
      .onConflictDoUpdate((row) => ({
        balance: row.balance - value,
        totalSent: row.totalSent + value,
        txCount: row.txCount + 1,
        lastActivity: timestamp,
      }))
  }

  // Update receiver account (skip spender — it's a relay, not a user)
  if (toLower !== SPENDER) {
    await context.db
      .insert(account)
      .values({
        address: to,
        balance: value,
        totalSent: 0n,
        totalReceived: value,
        txCount: 1,
        lastActivity: timestamp,
      })
      .onConflictDoUpdate((row) => ({
        balance: row.balance + value,
        totalReceived: row.totalReceived + value,
        txCount: row.txCount + 1,
        lastActivity: timestamp,
      }))
  }

  // Update daily volume
  await context.db
    .insert(dailyVolume)
    .values({
      id: day,
      date: day,
      totalUsdcVolume: value,
      transferCount: 1,
      gasRefuelCount: 0,
      gasEthSpent: 0n,
    })
    .onConflictDoUpdate((row) => ({
      totalUsdcVolume: row.totalUsdcVolume + value,
      transferCount: row.transferCount + 1,
    }))
})

// ── GasRefuel: Refueled ────────────────────────────────────

ponder.on('GasRefuel:Refueled', async ({ event, context }) => {
  const { user, amount, timestamp: eventTimestamp } = event.args
  const timestamp = Number(eventTimestamp)
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const inserted = await context.db
    .insert(refuelEvent)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      user,
      amount,
      timestamp,
      blockNumber: Number(event.block.number),
      txHash: event.transaction.hash,
    })
    .onConflictDoNothing()

  if (!inserted) return

  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: 'singleton',
      totalRefuels: 1,
      totalEthSpent: amount,
      isPaused: false,
      lastRefuelAt: timestamp,
    })
    .onConflictDoUpdate((row) => ({
      totalRefuels: row.totalRefuels + 1,
      totalEthSpent: row.totalEthSpent + amount,
      lastRefuelAt: timestamp,
    }))

  await context.db
    .insert(dailyVolume)
    .values({
      id: day,
      date: day,
      totalUsdcVolume: 0n,
      transferCount: 0,
      gasRefuelCount: 1,
      gasEthSpent: amount,
    })
    .onConflictDoUpdate((row) => ({
      gasRefuelCount: row.gasRefuelCount + 1,
      gasEthSpent: row.gasEthSpent + amount,
    }))
})

// ── GasRefuel: Paused / Unpaused ───────────────────────────

ponder.on('GasRefuel:Paused', async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: 'singleton',
      totalRefuels: 0,
      totalEthSpent: 0n,
      isPaused: true,
      lastRefuelAt: 0,
    })
    .onConflictDoUpdate(() => ({
      isPaused: true,
    }))
})

ponder.on('GasRefuel:Unpaused', async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: 'singleton',
      totalRefuels: 0,
      totalEthSpent: 0n,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoUpdate(() => ({
      isPaused: false,
    }))
})
