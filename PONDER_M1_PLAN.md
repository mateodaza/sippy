# Ponder On-Chain Indexer — M1 Plan

**Parent:** [M1_PLAN.md](./M1_PLAN.md) → Phase 7.6
**Location:** `packages/indexer/`
**Purpose:** Real-time on-chain monitoring of all Sippy wallets — balances, transfers, gas sponsorship

---

## Why

Right now we have zero visibility into on-chain state. Balances come from Blockscout API calls (slow, rate-limited, stale). Transfer history is reconstructed from external APIs. GasRefuel balance is checked ad-hoc.

A Ponder indexer watches the chain in real-time, indexes every USDC transfer and GasRefuel event involving Sippy wallets, and stores it all in our own PostgreSQL — giving us a single source of truth for balances, transfer history, gas sponsorship, and volume metrics. This replaces Blockscout dependency for internal data and powers monitoring for beta.

---

## Architecture

```
Arbitrum One (RPC)
       │
       ▼
┌──────────────────────────────────────┐
│  Ponder Indexer                       │
│  packages/indexer/                    │
│                                      │
│  Watches:                            │
│  ├─ USDC Transfer events             │
│  ├─ GasRefuel events                 │
│  └─ (Refueled, Deposited, Withdrawn) │
│                                      │
│  Stores:                             │
│  ├─ account (balances + stats)       │
│  ├─ transfer (full history)          │
│  ├─ refuel_event (gas sponsorship)   │
│  └─ daily_volume (aggregates)        │
│                                      │
│  Exposes:                            │
│  ├─ GET /balance/:address            │
│  ├─ GET /transfers/:address          │
│  ├─ GET /stats                       │
│  ├─ GET /stats/daily                 │
│  └─ GET /gas-refuel/status           │
└──────────────┬───────────────────────┘
               │
               ▼
         PostgreSQL (Railway — same instance, `ponder` schema)
```

---

## Contracts to Index

| Contract | Address | Chain | Events |
|----------|---------|-------|--------|
| **USDC** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Arbitrum One | `Transfer(from, to, value)` |
| **GasRefuel** | `0xC8367a549e05D9184B8e320856cb9A10FDc1DE46` | Arbitrum One | `Refueled(user, amount, timestamp)`, `FundsDeposited(sender, amount)`, `FundsWithdrawn(owner, amount)`, `Paused`, `Unpaused` |

### USDC Filtering Strategy

We only care about transfers **to or from** Sippy wallets. Two approaches:

- **Option A (simple, start here):** Index ALL USDC transfers on Arbitrum, filter at query time. Higher sync volume but zero maintenance when new wallets are added.
- **Option B (optimized, M2):** Periodically sync wallet list from `phone_registry` and filter events. Lower volume but adds complexity.

**Start with Option A for M1** — Arbitrum USDC volume is manageable, and Ponder handles it well with proper `startBlock` (use a recent block, not genesis).

---

## Schema — `packages/indexer/ponder.schema.ts`

```typescript
import { index, onchainTable } from "ponder";

// USDC balance + cumulative stats per wallet
export const account = onchainTable("account", (t) => ({
  address:       t.hex().primaryKey(),
  balance:       t.bigint().notNull(),       // current USDC balance (raw, 6 decimals)
  totalSent:     t.bigint().notNull(),       // cumulative USDC sent
  totalReceived: t.bigint().notNull(),       // cumulative USDC received
  txCount:       t.integer().notNull(),      // total transfer count
  lastActivity:  t.integer().notNull(),      // block timestamp of last transfer
}));

// Every USDC transfer
export const transfer = onchainTable(
  "transfer",
  (t) => ({
    id:          t.text().primaryKey(),      // txHash-logIndex
    from:        t.hex().notNull(),
    to:          t.hex().notNull(),
    amount:      t.bigint().notNull(),       // raw USDC (6 decimals)
    timestamp:   t.integer().notNull(),
    blockNumber: t.integer().notNull(),
    txHash:      t.hex().notNull(),
  }),
  (table) => ({
    fromIdx:      index().on(table.from),
    toIdx:        index().on(table.to),
    timestampIdx: index().on(table.timestamp),
  })
);

// GasRefuel events
export const refuelEvent = onchainTable(
  "refuel_event",
  (t) => ({
    id:          t.text().primaryKey(),      // txHash-logIndex
    user:        t.hex().notNull(),
    amount:      t.bigint().notNull(),       // ETH in wei
    timestamp:   t.integer().notNull(),
    blockNumber: t.integer().notNull(),
    txHash:      t.hex().notNull(),
  }),
  (table) => ({
    userIdx:      index().on(table.user),
    timestampIdx: index().on(table.timestamp),
  })
);

// GasRefuel contract status (singleton row)
export const gasRefuelStatus = onchainTable("gas_refuel_status", (t) => ({
  id:            t.text().primaryKey(),      // "singleton"
  totalRefuels:  t.integer().notNull(),
  totalEthSpent: t.bigint().notNull(),       // cumulative ETH spent on gas
  uniqueUsers:   t.integer().notNull(),
  isPaused:      t.boolean().notNull(),
  lastRefuelAt:  t.integer().notNull(),
}));

// Daily aggregates for reporting
export const dailyVolume = onchainTable("daily_volume", (t) => ({
  id:               t.text().primaryKey(),   // YYYY-MM-DD
  date:             t.text().notNull(),
  totalUsdcVolume:  t.bigint().notNull(),
  transferCount:    t.integer().notNull(),
  uniqueSenders:    t.integer().notNull(),
  uniqueReceivers:  t.integer().notNull(),
  gasRefuelCount:   t.integer().notNull(),
  gasEthSpent:      t.bigint().notNull(),
}));
```

---

## Config — `packages/indexer/ponder.config.ts`

```typescript
import { createConfig } from "ponder";
import { http } from "viem";
import { ERC20Abi } from "./abis/ERC20";
import { GasRefuelAbi } from "./abis/GasRefuel";

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
  },
  networks: {
    arbitrum: {
      chainId: 42161,
      transport: http(process.env.PONDER_RPC_URL_42161),
    },
  },
  contracts: {
    USDC: {
      abi: ERC20Abi,
      network: "arbitrum",
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      startBlock: 290000000, // ~1 week before first Sippy wallet — ADJUST THIS
    },
    GasRefuel: {
      abi: GasRefuelAbi,
      network: "arbitrum",
      address: "0xC8367a549e05D9184B8e320856cb9A10FDc1DE46",
      startBlock: 290000000, // same — ADJUST THIS
    },
  },
});
```

---

## Indexing Handlers — `packages/indexer/src/index.ts`

```typescript
import { ponder } from "ponder:registry";
import {
  account,
  transfer,
  refuelEvent,
  gasRefuelStatus,
  dailyVolume,
} from "ponder:schema";

// ── USDC Transfer ──────────────────────────────────────────

ponder.on("USDC:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  const timestamp = Number(event.block.timestamp);
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10);

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
    }));

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
    }));

  // Insert transfer record
  await context.db.insert(transfer).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    to,
    amount: value,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update daily volume
  await context.db
    .insert(dailyVolume)
    .values({
      id: day,
      date: day,
      totalUsdcVolume: value,
      transferCount: 1,
      uniqueSenders: 1,
      uniqueReceivers: 1,
      gasRefuelCount: 0,
      gasEthSpent: 0n,
    })
    .onConflictDoUpdate((row) => ({
      totalUsdcVolume: row.totalUsdcVolume + value,
      transferCount: row.transferCount + 1,
      // Note: uniqueSenders/Receivers are approximate (increment-only)
      // For exact counts, query at read time
    }));
});

// ── GasRefuel: Refueled ────────────────────────────────────

ponder.on("GasRefuel:Refueled", async ({ event, context }) => {
  const { user, amount, timestamp: eventTimestamp } = event.args;
  const timestamp = Number(eventTimestamp);
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // Insert refuel event
  await context.db.insert(refuelEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    amount,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update GasRefuel status singleton
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 1,
      totalEthSpent: amount,
      uniqueUsers: 1,
      isPaused: false,
      lastRefuelAt: timestamp,
    })
    .onConflictDoUpdate((row) => ({
      totalRefuels: row.totalRefuels + 1,
      totalEthSpent: row.totalEthSpent + amount,
      lastRefuelAt: timestamp,
    }));

  // Update daily gas stats
  await context.db
    .insert(dailyVolume)
    .values({
      id: day,
      date: day,
      totalUsdcVolume: 0n,
      transferCount: 0,
      uniqueSenders: 0,
      uniqueReceivers: 0,
      gasRefuelCount: 1,
      gasEthSpent: amount,
    })
    .onConflictDoUpdate((row) => ({
      gasRefuelCount: row.gasRefuelCount + 1,
      gasEthSpent: row.gasEthSpent + amount,
    }));
});

// ── GasRefuel: FundsDeposited / FundsWithdrawn ─────────────

ponder.on("GasRefuel:FundsDeposited", async ({ event, context }) => {
  // Just ensure the singleton exists — deposits don't change operational stats
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 0,
      totalEthSpent: 0n,
      uniqueUsers: 0,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoNothing();
});

ponder.on("GasRefuel:FundsWithdrawn", async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 0,
      totalEthSpent: 0n,
      uniqueUsers: 0,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoNothing();
});

// ── GasRefuel: Paused / Unpaused ───────────────────────────

ponder.on("GasRefuel:Paused", async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 0,
      totalEthSpent: 0n,
      uniqueUsers: 0,
      isPaused: true,
      lastRefuelAt: 0,
    })
    .onConflictDoUpdate(() => ({
      isPaused: true,
    }));
});

ponder.on("GasRefuel:Unpaused", async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 0,
      totalEthSpent: 0n,
      uniqueUsers: 0,
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoUpdate(() => ({
      isPaused: false,
    }));
});
```

---

## Custom API Endpoints — `packages/indexer/src/api/index.ts`

```typescript
import { db } from "ponder:api";
import {
  account,
  transfer,
  refuelEvent,
  gasRefuelStatus,
  dailyVolume,
} from "ponder:schema";
import { eq, or, desc, sql } from "ponder";
import { Hono } from "hono";

const app = new Hono();

// ── Balance + account stats ────────────────────────────────

app.get("/balance/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const result = await db
    .select()
    .from(account)
    .where(eq(account.address, address));

  if (result.length === 0) {
    return c.json({ address, balance: "0", totalSent: "0", totalReceived: "0", txCount: 0 });
  }

  const a = result[0];
  return c.json({
    address: a.address,
    balance: a.balance.toString(),
    balanceFormatted: (Number(a.balance) / 1e6).toFixed(2),
    totalSent: a.totalSent.toString(),
    totalReceived: a.totalReceived.toString(),
    txCount: a.txCount,
    lastActivity: a.lastActivity,
  });
});

// ── Transfer history for an address ────────────────────────

app.get("/transfers/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);

  const results = await db
    .select()
    .from(transfer)
    .where(or(eq(transfer.from, address), eq(transfer.to, address)))
    .orderBy(desc(transfer.timestamp))
    .limit(limit)
    .offset(offset);

  return c.json({
    address,
    transfers: results.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      amount: t.amount.toString(),
      amountFormatted: (Number(t.amount) / 1e6).toFixed(2),
      direction: t.from === address ? "sent" : "received",
      timestamp: t.timestamp,
      txHash: t.txHash,
    })),
    pagination: { limit, offset },
  });
});

// ── Global stats ───────────────────────────────────────────

app.get("/stats", async (c) => {
  const totalAccounts = await db
    .select({ count: sql<number>`count(*)` })
    .from(account);

  const totalTransfers = await db
    .select({
      count: sql<number>`count(*)`,
      volume: sql<string>`coalesce(sum(amount), 0)`,
    })
    .from(transfer);

  const gasStatus = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, "singleton"));

  return c.json({
    accounts: totalAccounts[0]?.count || 0,
    transfers: {
      count: totalTransfers[0]?.count || 0,
      totalVolume: totalTransfers[0]?.volume || "0",
      totalVolumeFormatted: (Number(totalTransfers[0]?.volume || 0) / 1e6).toFixed(2),
    },
    gasRefuel: gasStatus[0] || null,
  });
});

// ── Daily volume time series ───────────────────────────────

app.get("/stats/daily", async (c) => {
  const days = Math.min(Number(c.req.query("days") || 30), 90);

  const results = await db
    .select()
    .from(dailyVolume)
    .orderBy(desc(dailyVolume.date))
    .limit(days);

  return c.json({
    days: results.map((d) => ({
      date: d.date,
      usdcVolume: d.totalUsdcVolume.toString(),
      usdcVolumeFormatted: (Number(d.totalUsdcVolume) / 1e6).toFixed(2),
      transfers: d.transferCount,
      gasRefuels: d.gasRefuelCount,
      gasEthSpent: d.gasEthSpent.toString(),
    })),
  });
});

// ── GasRefuel status + history ─────────────────────────────

app.get("/gas-refuel/status", async (c) => {
  const status = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, "singleton"));

  return c.json(status[0] || { totalRefuels: 0, totalEthSpent: "0", isPaused: false });
});

app.get("/gas-refuel/history/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);

  const results = await db
    .select()
    .from(refuelEvent)
    .where(eq(refuelEvent.user, address))
    .orderBy(desc(refuelEvent.timestamp))
    .limit(limit);

  return c.json({
    address,
    refuels: results.map((r) => ({
      amount: r.amount.toString(),
      timestamp: r.timestamp,
      txHash: r.txHash,
    })),
    totalRefuels: results.length,
  });
});

export default app;
```

---

## ABIs

### `packages/indexer/abis/ERC20.ts`

```typescript
export const ERC20Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;
```

### `packages/indexer/abis/GasRefuel.ts`

Copy from `contracts/gas-refuel/GasRefuel.abi.json` — export as typed const.

---

## File Structure

```
packages/indexer/
├── ponder.config.ts          # Chain + contract config
├── ponder.schema.ts          # onchain tables
├── src/
│   ├── index.ts              # Indexing handlers (USDC + GasRefuel)
│   └── api/
│       └── index.ts          # Custom Hono API endpoints
├── abis/
│   ├── ERC20.ts              # USDC Transfer + Approval events
│   └── GasRefuel.ts          # GasRefuel full ABI
├── package.json
├── tsconfig.json
└── .env.example              # PONDER_RPC_URL_42161, DATABASE_URL
```

---

## Tasks

- [ ] **7.6.1 Ponder project setup** — scaffold `packages/indexer/` with `pnpm create ponder`, configure ponder.config.ts with Arbitrum + both contracts, add to pnpm workspace
- [ ] **7.6.2 Schema definition** — account, transfer, refuelEvent, gasRefuelStatus, dailyVolume tables in ponder.schema.ts
- [ ] **7.6.3 Indexing handlers** — USDC Transfer (balance tracking + history), GasRefuel events (Refueled, Deposited, Withdrawn, Paused, Unpaused), daily volume aggregation
- [ ] **7.6.4 Custom API endpoints** — balance, transfers, stats, daily stats, gas-refuel status/history via Hono
- [ ] **7.6.5 Deploy on Railway** — separate service, same Postgres, env vars, health check
- [ ] **7.6.6 Backend integration** (optional M1) — health endpoint includes indexer status, balance commands can optionally query indexer instead of Blockscout

---

## Deployment

- Add as separate Railway service (same project, separate process)
- Env vars: `PONDER_RPC_URL_42161` (Arbitrum RPC), `DATABASE_URL` (same Postgres)
- Ponder creates its own schema in Postgres — no conflict with backend tables
- Start command: `pnpm --filter indexer start`
- Health check: Ponder exposes `/ready` by default

---

## What This Gives Us

- **Real-time balances** for every Sippy wallet — no more Blockscout API dependency
- **Full transfer history** indexed and queryable — faster than Blockscout, no rate limits
- **Gas sponsorship tracking** — how much ETH we've spent on GasRefuel, per user
- **Volume metrics** — daily/weekly USDC volume, unique users, tx count → ready for grant reporting & KPIs
- **Beta monitoring** — watch all 50 beta tester accounts in real-time
- **Foundation for admin dashboard** — all data is in Postgres, ready for a UI in M2

---

## Estimate: 8-10h
