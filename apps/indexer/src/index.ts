import { ponder } from 'ponder:registry'
import {
  account,
  transfer,
  refuelEvent,
  gasRefuelStatus,
  dailyVolume,
} from 'ponder:schema'

// ── USDC Transfer ──────────────────────────────────────────

ponder.on('USDC:Transfer', async ({ event, context }) => {
  const { from, to, value } = event.args
  const timestamp = Number(event.block.timestamp)
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10)

  // Insert transfer — gate aggregates on success
  const inserted = await context.db.insert(transfer).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    to,
    amount: value,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  }).onConflictDoNothing()

  // If transfer already existed (backfill or replay), skip all aggregates
  if (!inserted) return

  // Update sender account
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

  // Update receiver account
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

  await context.db.insert(refuelEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    amount,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  })

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

// ── GasRefuel: FundsDeposited / FundsWithdrawn ─────────────

ponder.on('GasRefuel:FundsDeposited', async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: 'singleton',
      totalRefuels: 0,
      totalEthSpent: 0n,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoNothing()
})

ponder.on('GasRefuel:FundsWithdrawn', async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: 'singleton',
      totalRefuels: 0,
      totalEthSpent: 0n,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoNothing()
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
