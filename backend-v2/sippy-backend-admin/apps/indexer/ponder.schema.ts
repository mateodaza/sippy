import { index, onchainTable } from 'ponder'

// USDC balance + cumulative stats per wallet
export const account = onchainTable('account', (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
  totalSent: t.bigint().notNull(),
  totalReceived: t.bigint().notNull(),
  txCount: t.integer().notNull(),
  lastActivity: t.integer().notNull(),
}))

// Every USDC transfer — raw data, no classification
export const transfer = onchainTable(
  'transfer',
  (t) => ({
    id: t.text().primaryKey(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    blockNumber: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    fromIdx: index().on(table.from),
    toIdx: index().on(table.to),
    timestampIdx: index().on(table.timestamp),
  }),
)

// GasRefuel events
export const refuelEvent = onchainTable(
  'refuel_event',
  (t) => ({
    id: t.text().primaryKey(),
    user: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    blockNumber: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    userIdx: index().on(table.user),
    timestampIdx: index().on(table.timestamp),
  }),
)

// GasRefuel contract status (singleton row)
export const gasRefuelStatus = onchainTable('gas_refuel_status', (t) => ({
  id: t.text().primaryKey(),
  totalRefuels: t.integer().notNull(),
  totalEthSpent: t.bigint().notNull(),
  isPaused: t.boolean().notNull(),
  lastRefuelAt: t.integer().notNull(),
}))

// Daily aggregates — global only (Sippy-specific metrics computed at query time)
export const dailyVolume = onchainTable('daily_volume', (t) => ({
  id: t.text().primaryKey(),
  date: t.text().notNull(),
  totalUsdcVolume: t.bigint().notNull(),
  transferCount: t.integer().notNull(),
  gasRefuelCount: t.integer().notNull(),
  gasEthSpent: t.bigint().notNull(),
}))
