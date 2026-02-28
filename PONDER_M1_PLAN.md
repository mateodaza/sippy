# Ponder On-Chain Indexer — M1 Plan

**Parent:** [M1_PLAN.md](./M1_PLAN.md) → Phase 7.6
**Location:** `apps/indexer/` (inside `backend-v2/sippy-backend-admin/`)
**Purpose:** Real-time on-chain monitoring of all Sippy wallets — balances, transfers, gas sponsorship, **registered user tracking**, and **admin dashboard analytics**
**Inspired by:** [Galeon indexer](../galeon/apps/indexer/) — 14-table schema, Hono API, upsert patterns

---

## Why

Right now we have zero visibility into on-chain state. Balances come from Blockscout API calls (slow, rate-limited, stale). Transfer history is reconstructed from external APIs. GasRefuel balance is checked ad-hoc. We can't distinguish Sippy user activity from random USDC noise.

A Ponder indexer watches the chain in real-time, indexes every USDC transfer and GasRefuel event involving Sippy wallets, and stores it all in our own PostgreSQL — giving us a single source of truth for balances, transfer history, gas sponsorship, and volume metrics. **Registered users are stored in an offchain wallet registry so we can classify their movements (inbound/outbound/internal) at query time**, powering an admin dashboard for analytics on daily usage, volume, and amounts transferred.

---

## Architecture

```
Arbitrum One (RPC)
       │
       ▼
┌─────────────────────────────────────────────┐
│  Ponder Indexer                              │
│  apps/indexer/                               │
│                                             │
│  Watches:                                   │
│  ├─ USDC Transfer events                    │
│  ├─ GasRefuel events                        │
│  └─ (Refueled, Deposited, Withdrawn)        │
│                                             │
│  On-chain tables (ponder.schema.ts):        │
│  ├─ account (balances + stats)              │
│  ├─ transfer (full history, raw)            │
│  ├─ refuel_event (gas sponsorship)          │
│  ├─ gas_refuel_status (singleton)           │
│  └─ daily_volume (global aggregates)        │
│                                             │
│  Off-chain tables (offchain.ts — Drizzle):  │
│  └─ sippy_wallet (registered users)         │
│                                             │
│  Classification:                            │
│  └─ At QUERY time via JOIN, not index time  │
│     (avoids boot race, auto-reclassifies    │
│      when new users register)               │
│                                             │
│  Exposes (Hono API):                        │
│  ├─ GET  /balance/:address                  │
│  ├─ GET  /transfers/:address                │
│  ├─ GET  /stats                             │
│  ├─ GET  /stats/daily                       │
│  ├─ GET  /gas-refuel/status                 │
│  ├─ GET  /sync-status                       │
│  ├─ POST /wallets/register                  │
│  ├─ POST /wallets/sync                      │
│  ├─ GET  /dashboard/overview                │
│  ├─ GET  /dashboard/users                   │
│  ├─ GET  /dashboard/users/:address          │
│  ├─ GET  /dashboard/users/:address/activity │
│  ├─ GET  /dashboard/top-users               │
│  ├─ GET  /dashboard/flow                    │
│  └─ GET  /dashboard/retention               │
└──────────────┬──────────────────────────────┘
               │
               ▼
         PostgreSQL (Railway — same instance, `ponder` schema)
               ▲
               │
    AdonisJS Backend (calls POST /wallets/register
                       on each new user signup)
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

## Registered User Tracking — The Key Addition

**Problem:** The indexer sees ALL USDC transfers on Arbitrum. We need to know which addresses belong to Sippy users so we can:
1. Flag their activity separately from global noise
2. Classify transfers as **inbound** (external → Sippy), **outbound** (Sippy → external), or **internal** (Sippy → Sippy)
3. Power per-user analytics in the admin dashboard
4. Track retention and daily active users

### Why classify at query time, not index time

An earlier draft stored a `transferType` field on each transfer row, computed during indexing via an in-memory wallet cache. This has a fatal boot-race:

1. Ponder starts syncing from `startBlock`
2. Historical Transfer events are indexed **before** the backend calls `/wallets/sync`
3. All pre-existing user transfers get permanently stamped as `"external"`
4. Ponder on-chain tables are managed by the indexer — you can't UPDATE them after the fact without re-indexing

**Solution: classify at query time via SQL JOIN.**

- The `transfer` table stores raw data: `from`, `to`, `amount`, `timestamp`, `txHash`
- The `sippy_wallet` offchain table stores registered addresses
- Every dashboard/API endpoint JOINs the two to determine transfer type
- **When a new user registers, all their historical transfers are immediately and retroactively classified correctly** — no re-indexing needed

This is the same pattern Galeon uses: on-chain tables store raw event data, application logic lives in the API layer.

### Offchain table approach (verified against Ponder docs)

Ponder does **not** have an `offchainTable` export. Offchain tables use Drizzle's `pgSchema` + `pgTable` in a separate file, with a separate Drizzle db instance. They can only be read/written from API routes, not from indexing handlers.

```
Verified sources:
- https://ponder.sh/docs/guides/offchain-data
- https://github.com/ponder-sh/ponder/tree/main/examples/with-offchain
- Galeon indexer uses purely onchainTable (no offchain)
```

---

## Schema

### On-chain tables — `apps/indexer/ponder.schema.ts`

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

// Every USDC transfer — raw data, no classification
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
  isPaused:      t.boolean().notNull(),
  lastRefuelAt:  t.integer().notNull(),
}));

// Daily aggregates — global only (Sippy-specific metrics computed at query time)
export const dailyVolume = onchainTable("daily_volume", (t) => ({
  id:               t.text().primaryKey(),   // YYYY-MM-DD
  date:             t.text().notNull(),
  totalUsdcVolume:  t.bigint().notNull(),
  transferCount:    t.integer().notNull(),
  gasRefuelCount:   t.integer().notNull(),
  gasEthSpent:      t.bigint().notNull(),
}));
```

**What changed vs. previous draft:**
- Removed `transferType` from `transfer` — classification is query-time
- Removed `uniqueSenders`, `uniqueReceivers` from `dailyVolume` — not implementable with increment-only upserts, computed at query time via `COUNT(DISTINCT ...)`
- Removed `uniqueUsers` from `gasRefuelStatus` — same reason
- Removed Sippy-specific daily volume fields (`sippyInboundVolume`, etc.) — computed at query time via JOIN with `sippy_wallet`
- No `offchainTable` import — that doesn't exist in Ponder

### Off-chain tables — `apps/indexer/offchain.ts`

```typescript
import { pgSchema, text, boolean, integer } from "drizzle-orm/pg-core";

// Drizzle schema in a separate Postgres schema to avoid conflicts
export const offchain = pgSchema("offchain");

// Registered Sippy wallets — synced from phone_registry via backend
export const sippyWallet = offchain.table("sippy_wallet", {
  address:      text("address").primaryKey(),   // wallet address (lowercased 0x...)
  phoneHash:    text("phone_hash"),             // hashed phone number (privacy)
  registeredAt: integer("registered_at").notNull(),
  isActive:     boolean("is_active").notNull().default(true),
});
```

**Why Drizzle `pgSchema`?** This is the actual Ponder API for offchain data (verified against docs and `ponder-sh/ponder/examples/with-offchain`). Key constraints:
- Defined in a separate file, not in `ponder.schema.ts`
- Uses a separate Postgres schema (`offchain`) to avoid conflicts with Ponder's managed schema
- Can only be read/written from API routes via a separate Drizzle db instance
- Cannot be accessed from indexing handlers

### Schema summary: 5 on-chain + 1 off-chain = 6 tables

| Table | Type | Rows | Purpose |
|-------|------|------|---------|
| `account` | on-chain | 1 per address | Balances + cumulative stats |
| `transfer` | on-chain | 1 per USDC Transfer event | Full history (raw, no classification) |
| `refuel_event` | on-chain | 1 per Refueled event | Gas sponsorship log |
| `gas_refuel_status` | on-chain | 1 (singleton) | GasRefuel contract state |
| `daily_volume` | on-chain | 1 per day | Global daily aggregates |
| `sippy_wallet` | **off-chain** (Drizzle) | 1 per registered user | Wallet registry |

**Dropped from previous draft:** `user_daily_activity` — was declared but never populated. Per-user daily stats are computed at query time via aggregation on the `transfer` table (50 beta users, fast enough with indexes).

---

## Config — `apps/indexer/ponder.config.ts`

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

## Indexing Handlers — `apps/indexer/src/index.ts`

Handlers are simple: store raw event data. No classification, no wallet lookups, no offchain writes.

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

  // Insert transfer record (raw — no classification)
  await context.db.insert(transfer).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    to,
    amount: value,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  });

  // Update daily volume (global only)
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
    }));
});

// ── GasRefuel: Refueled ────────────────────────────────────

ponder.on("GasRefuel:Refueled", async ({ event, context }) => {
  const { user, amount, timestamp: eventTimestamp } = event.args;
  const timestamp = Number(eventTimestamp);
  const day = new Date(timestamp * 1000).toISOString().slice(0, 10);

  await context.db.insert(refuelEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    amount,
    timestamp,
    blockNumber: Number(event.block.number),
    txHash: event.transaction.hash,
  });

  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 1,
      totalEthSpent: amount,
      isPaused: false,
      lastRefuelAt: timestamp,
    })
    .onConflictDoUpdate((row) => ({
      totalRefuels: row.totalRefuels + 1,
      totalEthSpent: row.totalEthSpent + amount,
      lastRefuelAt: timestamp,
    }));

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
    }));
});

// ── GasRefuel: FundsDeposited / FundsWithdrawn ─────────────

ponder.on("GasRefuel:FundsDeposited", async ({ event, context }) => {
  await context.db
    .insert(gasRefuelStatus)
    .values({
      id: "singleton",
      totalRefuels: 0,
      totalEthSpent: 0n,
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
      isPaused: false,
      lastRefuelAt: 0,
    })
    .onConflictDoUpdate(() => ({
      isPaused: false,
    }));
});
```

---

## Custom API Endpoints — `apps/indexer/src/api/index.ts`

All Sippy-specific classification happens here at query time via SQL JOINs with `sippy_wallet`.

```typescript
import { db } from "ponder:api";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  account,
  transfer,
  refuelEvent,
  gasRefuelStatus,
  dailyVolume,
} from "ponder:schema";
import * as offchainSchema from "../../offchain";
import { eq, or, and, desc, sql, inArray, gte } from "drizzle-orm";
import { Hono } from "hono";

// Separate Drizzle instance for offchain tables (required by Ponder)
const offchainDb = drizzle(process.env.DATABASE_URL!, {
  schema: offchainSchema,
});

const app = new Hono();

// ══════════════════════════════════════════════════════════════
// WALLET REGISTRATION (called by AdonisJS backend)
// ══════════════════════════════════════════════════════════════

// Register a single wallet (called on each new user signup)
app.post("/wallets/register", async (c) => {
  const { address, phoneHash } = await c.req.json();
  const normalized = address.toLowerCase();

  await offchainDb
    .insert(offchainSchema.sippyWallet)
    .values({
      address: normalized,
      phoneHash: phoneHash || null,
      registeredAt: Math.floor(Date.now() / 1000),
      isActive: true,
    })
    .onConflictDoUpdate({
      target: offchainSchema.sippyWallet.address,
      set: { isActive: true },
    });

  return c.json({ ok: true, address: normalized });
});

// Bulk sync all wallets from backend (call on demand)
app.post("/wallets/sync", async (c) => {
  const { wallets } = await c.req.json();
  // wallets: Array<{ address: string, phoneHash?: string, registeredAt?: number }>

  let synced = 0;
  for (const w of wallets) {
    const normalized = w.address.toLowerCase();
    await offchainDb
      .insert(offchainSchema.sippyWallet)
      .values({
        address: normalized,
        phoneHash: w.phoneHash || null,
        registeredAt: w.registeredAt || Math.floor(Date.now() / 1000),
        isActive: true,
      })
      .onConflictDoNothing();
    synced++;
  }

  return c.json({ ok: true, synced });
});

// List all registered wallets
app.get("/wallets", async (c) => {
  const results = await offchainDb
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true));

  return c.json({ wallets: results, total: results.length });
});

// ══════════════════════════════════════════════════════════════
// BALANCE + ACCOUNT STATS
// ══════════════════════════════════════════════════════════════

app.get("/balance/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const result = await db
    .select()
    .from(account)
    .where(eq(account.address, address));

  if (result.length === 0) {
    return c.json({ address, balance: "0", totalSent: "0", totalReceived: "0", txCount: 0 });
  }

  // Check if registered Sippy user
  const wallet = await offchainDb
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.address, address));

  const a = result[0];
  return c.json({
    address: a.address,
    isSippyUser: wallet.length > 0,
    balance: a.balance.toString(),
    balanceFormatted: (Number(a.balance) / 1e6).toFixed(2),
    totalSent: a.totalSent.toString(),
    totalReceived: a.totalReceived.toString(),
    txCount: a.txCount,
    lastActivity: a.lastActivity,
  });
});

// ══════════════════════════════════════════════════════════════
// TRANSFER HISTORY (classification at query time)
// ══════════════════════════════════════════════════════════════

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

  // Load wallet registry for classification
  const walletSet = await loadWalletSet();

  return c.json({
    address,
    transfers: results.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      amount: t.amount.toString(),
      amountFormatted: (Number(t.amount) / 1e6).toFixed(2),
      direction: t.from === address ? "sent" : "received",
      transferType: classifyTransfer(t.from, t.to, walletSet),
      timestamp: t.timestamp,
      txHash: t.txHash,
    })),
    pagination: { limit, offset },
  });
});

// ══════════════════════════════════════════════════════════════
// GLOBAL STATS
// ══════════════════════════════════════════════════════════════

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

  const registeredWallets = await offchainDb
    .select({ count: sql<number>`count(*)` })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true));

  // Sippy-specific volume: transfers where from OR to is a registered wallet
  const walletSet = await loadWalletSet();
  const walletAddresses = Array.from(walletSet);

  let sippyVolume = "0";
  let sippyCount = 0;
  if (walletAddresses.length > 0) {
    const sippyStats = await db
      .select({
        count: sql<number>`count(*)`,
        volume: sql<string>`coalesce(sum(amount), 0)`,
      })
      .from(transfer)
      .where(
        or(
          inArray(transfer.from, walletAddresses as `0x${string}`[]),
          inArray(transfer.to, walletAddresses as `0x${string}`[])
        )
      );
    sippyVolume = sippyStats[0]?.volume || "0";
    sippyCount = sippyStats[0]?.count || 0;
  }

  const gasStatus = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, "singleton"));

  return c.json({
    registeredUsers: registeredWallets[0]?.count || 0,
    accounts: totalAccounts[0]?.count || 0,
    transfers: {
      count: totalTransfers[0]?.count || 0,
      totalVolume: totalTransfers[0]?.volume || "0",
      totalVolumeFormatted: (Number(totalTransfers[0]?.volume || 0) / 1e6).toFixed(2),
    },
    sippyTransfers: {
      count: sippyCount,
      totalVolume: sippyVolume,
      totalVolumeFormatted: (Number(sippyVolume) / 1e6).toFixed(2),
    },
    gasRefuel: gasStatus[0] || null,
  });
});

// ══════════════════════════════════════════════════════════════
// DAILY VOLUME
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ENDPOINTS
// ══════════════════════════════════════════════════════════════

// Dashboard overview — single-call summary for the admin home page
app.get("/dashboard/overview", async (c) => {
  const walletSet = await loadWalletSet();
  const walletAddresses = Array.from(walletSet) as `0x${string}`[];

  const registeredCount = walletAddresses.length;

  // Active today: registered wallets that sent or received in last 24h
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
  let activeTodayCount = 0;
  let totalSippyVolume = "0";

  if (walletAddresses.length > 0) {
    const activeToday = await db
      .select({ count: sql<number>`count(distinct "from")` })
      .from(transfer)
      .where(
        and(
          gte(transfer.timestamp, oneDayAgo),
          or(
            inArray(transfer.from, walletAddresses),
            inArray(transfer.to, walletAddresses)
          )
        )
      );
    activeTodayCount = activeToday[0]?.count || 0;

    const volumeResult = await db
      .select({ volume: sql<string>`coalesce(sum(amount), 0)` })
      .from(transfer)
      .where(
        or(
          inArray(transfer.from, walletAddresses),
          inArray(transfer.to, walletAddresses)
        )
      );
    totalSippyVolume = volumeResult[0]?.volume || "0";
  }

  const gasStatus = await db
    .select()
    .from(gasRefuelStatus)
    .where(eq(gasRefuelStatus.id, "singleton"));

  return c.json({
    registeredUsers: registeredCount,
    activeUsersToday: activeTodayCount,
    totalSippyVolume,
    totalSippyVolumeFormatted: (Number(totalSippyVolume) / 1e6).toFixed(2),
    gasRefuel: gasStatus[0] || null,
  });
});

// List all registered users with their on-chain stats
app.get("/dashboard/users", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Number(c.req.query("offset") || 0);

  const wallets = await offchainDb
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true))
    .limit(limit)
    .offset(offset);

  // Enrich with on-chain stats
  const enriched = [];
  for (const w of wallets) {
    const acct = await db
      .select()
      .from(account)
      .where(eq(account.address, w.address as `0x${string}`));

    enriched.push({
      address: w.address,
      registeredAt: w.registeredAt,
      balance: acct[0]?.balance?.toString() || "0",
      balanceFormatted: (Number(acct[0]?.balance || 0) / 1e6).toFixed(2),
      totalSent: acct[0]?.totalSent?.toString() || "0",
      totalReceived: acct[0]?.totalReceived?.toString() || "0",
      txCount: acct[0]?.txCount || 0,
      lastActivity: acct[0]?.lastActivity || null,
    });
  }

  return c.json({ users: enriched, pagination: { limit, offset } });
});

// Single user detail
app.get("/dashboard/users/:address", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;

  const wallet = await offchainDb
    .select()
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.address, address));

  const acct = await db
    .select()
    .from(account)
    .where(eq(account.address, address));

  const recentTransfers = await db
    .select()
    .from(transfer)
    .where(or(eq(transfer.from, address), eq(transfer.to, address)))
    .orderBy(desc(transfer.timestamp))
    .limit(20);

  const recentRefuels = await db
    .select()
    .from(refuelEvent)
    .where(eq(refuelEvent.user, address))
    .orderBy(desc(refuelEvent.timestamp))
    .limit(10);

  const walletSet = await loadWalletSet();

  return c.json({
    address,
    isSippyUser: wallet.length > 0,
    registration: wallet[0] || null,
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
      direction: t.from === address ? "sent" : "received",
      transferType: classifyTransfer(t.from, t.to, walletSet),
      timestamp: t.timestamp,
      txHash: t.txHash,
    })),
    recentRefuels: recentRefuels.map((r) => ({
      amount: r.amount.toString(),
      timestamp: r.timestamp,
      txHash: r.txHash,
    })),
  });
});

// Per-user daily activity (computed at query time, not materialized)
app.get("/dashboard/users/:address/activity", async (c) => {
  const address = c.req.param("address").toLowerCase() as `0x${string}`;
  const days = Math.min(Number(c.req.query("days") || 30), 90);

  // Aggregate transfers per day for this user
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
    .limit(days);

  return c.json({
    address,
    activity: activity.map((d) => ({
      date: d.date,
      sentCount: d.sentCount,
      receivedCount: d.receivedCount,
      sentVolume: (Number(d.sentVolume) / 1e6).toFixed(2),
      receivedVolume: (Number(d.receivedVolume) / 1e6).toFixed(2),
    })),
  });
});

// Top users by volume or tx count
app.get("/dashboard/top-users", async (c) => {
  const metric = c.req.query("metric") || "volume"; // "volume" | "txCount" | "balance"
  const limit = Math.min(Number(c.req.query("limit") || 20), 100);

  const walletSet = await loadWalletSet();
  const walletAddresses = Array.from(walletSet) as `0x${string}`[];
  if (walletAddresses.length === 0) return c.json({ users: [] });

  const orderCol =
    metric === "txCount"
      ? desc(account.txCount)
      : metric === "balance"
        ? desc(account.balance)
        : desc(sql`${account.totalSent} + ${account.totalReceived}`);

  const results = await db
    .select()
    .from(account)
    .where(inArray(account.address, walletAddresses))
    .orderBy(orderCol)
    .limit(limit);

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
  });
});

// Fund flow analysis — net in vs out for Sippy ecosystem
app.get("/dashboard/flow", async (c) => {
  const days = Math.min(Number(c.req.query("days") || 30), 90);

  const walletSet = await loadWalletSet();
  const walletAddresses = Array.from(walletSet) as `0x${string}`[];
  if (walletAddresses.length === 0) return c.json({ flow: [] });

  // Compute inbound/outbound/internal per day using SQL
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
        inArray(transfer.to, walletAddresses)
      )
    )
    .groupBy(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`))
    .limit(days);

  return c.json({
    flow: flow.map((d) => ({
      date: d.date,
      inbound: (Number(d.inbound) / 1e6).toFixed(2),
      outbound: (Number(d.outbound) / 1e6).toFixed(2),
      internal: (Number(d.internal) / 1e6).toFixed(2),
      netFlow: ((Number(d.inbound) - Number(d.outbound)) / 1e6).toFixed(2),
    })),
  });
});

// Retention — daily active Sippy users over time
app.get("/dashboard/retention", async (c) => {
  const days = Math.min(Number(c.req.query("days") || 30), 90);

  const walletSet = await loadWalletSet();
  const walletAddresses = Array.from(walletSet) as `0x${string}`[];
  if (walletAddresses.length === 0) return c.json({ totalRegistered: 0, daily: [] });

  // Count distinct active Sippy wallets per day
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
        inArray(transfer.to, walletAddresses)
      )
    )
    .groupBy(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`)
    .orderBy(desc(sql`to_char(to_timestamp(${transfer.timestamp}), 'YYYY-MM-DD')`))
    .limit(days);

  return c.json({
    totalRegistered: walletAddresses.length,
    daily: retention.map((d) => ({
      date: d.date,
      activeUsers: d.activeUsers,
      totalTransactions: d.totalTransactions,
    })),
  });
});

// ══════════════════════════════════════════════════════════════
// GAS REFUEL
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
// SYNC STATUS (inspired by Galeon)
// ══════════════════════════════════════════════════════════════

app.get("/sync-status", async (c) => {
  const transferCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(transfer);

  const refuelCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(refuelEvent);

  const wallets = await offchainDb
    .select({ count: sql<number>`count(*)` })
    .from(offchainSchema.sippyWallet);

  return c.json({
    registeredWallets: wallets[0]?.count || 0,
    totalTransfersIndexed: transferCount[0]?.count || 0,
    gasRefuelsIndexed: refuelCount[0]?.count || 0,
    timestamp: Math.floor(Date.now() / 1000),
  });
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

// Load wallet addresses from offchain DB. For 50 beta users, this is a
// tiny query. At scale (M2+), add in-memory caching with TTL.
async function loadWalletSet(): Promise<Set<string>> {
  const wallets = await offchainDb
    .select({ address: offchainSchema.sippyWallet.address })
    .from(offchainSchema.sippyWallet)
    .where(eq(offchainSchema.sippyWallet.isActive, true));
  return new Set(wallets.map((w) => w.address));
}

// Classify transfer based on wallet registry
function classifyTransfer(from: string, to: string, walletSet: Set<string>): string {
  const fromIsSippy = walletSet.has(from.toLowerCase());
  const toIsSippy = walletSet.has(to.toLowerCase());
  if (fromIsSippy && toIsSippy) return "internal";
  if (!fromIsSippy && toIsSippy) return "inbound";
  if (fromIsSippy && !toIsSippy) return "outbound";
  return "external";
}

export default app;
```

---

## ABIs

### `apps/indexer/abis/ERC20.ts`

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

### `apps/indexer/abis/GasRefuel.ts`

Copy from `contracts/gas-refuel/GasRefuel.abi.json` — export as typed const.

---

## File Structure

```
backend-v2/sippy-backend-admin/
├── apps/
│   ├── backend/              # AdonisJS backend (existing)
│   ├── frontend/             # (existing)
│   └── indexer/              # Ponder indexer (NEW)
│       ├── ponder.config.ts
│       ├── ponder.schema.ts  # on-chain tables only
│       ├── offchain.ts       # off-chain tables (Drizzle pgSchema)
│       ├── src/
│       │   ├── index.ts      # Indexing handlers (raw data, no classification)
│       │   └── api/
│       │       └── index.ts  # Hono API: wallets, dashboard, stats
│       ├── abis/
│       │   ├── ERC20.ts
│       │   └── GasRefuel.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
├── package.json              # npm workspaces: ["apps/*"]
└── turbo.json
```

---

## Tasks

- [ ] **7.6.1 Ponder project setup** — scaffold `apps/indexer/` with `npx create-ponder`, configure ponder.config.ts with Arbitrum + both contracts, verify it's picked up by npm workspaces (`apps/*` glob)
- [ ] **7.6.2 On-chain schema** — 5 tables in ponder.schema.ts: account, transfer, refuelEvent, gasRefuelStatus, dailyVolume
- [ ] **7.6.3 Off-chain schema** — `offchain.ts` using Drizzle `pgSchema("offchain")` + `pgTable` for sippy_wallet. Ensure `CREATE SCHEMA IF NOT EXISTS offchain` runs on startup
- [ ] **7.6.4 Indexing handlers** — USDC Transfer (balance + history + daily volume), GasRefuel events. Raw data only, no classification
- [ ] **7.6.5 Wallet registration API** — `POST /wallets/register`, `POST /wallets/sync`, `GET /wallets` using separate Drizzle instance for offchain writes
- [ ] **7.6.6 Core API endpoints** — balance (with isSippyUser), transfers (with query-time classification), stats, daily stats, gas-refuel status/history, sync-status
- [ ] **7.6.7 Admin dashboard API** — overview, users list, user detail, user activity (computed via SQL aggregation), top-users, flow (inbound/outbound/internal per day), retention (DAU over time)
- [ ] **7.6.8 Backend integration** — AdonisJS calls `POST /wallets/register` on user signup, calls `/wallets/sync` on boot to backfill existing users
- [ ] **7.6.9 Deploy on Railway** — separate service, same Postgres, env vars, health check

---

## Deployment

- Add as separate Railway service (same project, separate process)
- Env vars: `PONDER_RPC_URL_42161` (Arbitrum RPC), `DATABASE_URL` (same Postgres)
- Ponder creates its own schema in Postgres — no conflict with backend tables
- Offchain tables live in `offchain` Postgres schema — also no conflict
- Start command: `npm -w apps/indexer start`
- Health check: Ponder exposes `/ready` by default

### Boot Sequence (race-free)

1. Ponder starts, begins syncing from `startBlock`
2. Transfers are indexed as **raw data** (from, to, amount) — no classification needed
3. AdonisJS backend calls `POST /wallets/sync` whenever convenient
4. Dashboard queries JOIN `transfer` with `sippy_wallet` at query time
5. **No race condition**: wallet registration order doesn't matter. A user registered today has all historical transfers retroactively classified correctly.

---

## What This Gives Us

- **Real-time balances** for every Sippy wallet — no more Blockscout API dependency
- **Full transfer history** indexed and queryable — faster than Blockscout, no rate limits
- **Registered user tracking** — every user flagged, movements (in/out/internal) classified at query time
- **Retroactive classification** — new user registrations immediately classify all their past transfers
- **Admin dashboard data** — overview, per-user drill-downs, top users, daily flow, retention charts
- **Gas sponsorship tracking** — how much ETH we've spent on GasRefuel, per user
- **Volume metrics** — daily/weekly USDC volume → ready for grant reporting & KPIs
- **Net flow analysis** — are users depositing more than they withdraw? Track ecosystem health
- **Retention metrics** — daily active users over time, computed from on-chain data
- **Beta monitoring** — watch all 50 beta tester accounts in real-time
- **Foundation for admin UI** — all data is in Postgres with clean REST API, ready for a React/Next.js dashboard

---

## Admin Dashboard Endpoint Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/wallets/register` | POST | Register a single new Sippy wallet |
| `/wallets/sync` | POST | Bulk sync all wallets from phone_registry |
| `/wallets` | GET | List all registered wallets |
| `/dashboard/overview` | GET | Home page: registered users, active today, total volume, gas stats |
| `/dashboard/users` | GET | All registered users with on-chain stats (paginated) |
| `/dashboard/users/:address` | GET | Single user: balance, recent transfers + classification, refuels |
| `/dashboard/users/:address/activity` | GET | Per-user daily sent/received (computed via SQL aggregation) |
| `/dashboard/top-users` | GET | Leaderboard by volume, txCount, or balance |
| `/dashboard/flow` | GET | Daily inbound/outbound/internal/netFlow |
| `/dashboard/retention` | GET | Daily active users over time |
| `/sync-status` | GET | Indexer health: counts, timestamp |

---

## Issues Fixed From Previous Draft

| Issue | Previous Draft | This Draft |
|-------|---------------|------------|
| **Boot race condition** | In-memory `sippyWallets` set populated after sync start → historical transfers classified as "external" forever | Classification at query time via JOIN — no race, retroactive |
| **`user_daily_activity` never populated** | Declared as offchain table but no handler or API populates it | Dropped. Per-user daily stats computed on-the-fly via SQL `GROUP BY` on `transfer` table (50 users, fast) |
| **Unique metrics not trackable** | `uniqueSenders`, `uniqueReceivers`, `uniqueUsers` in schema but increment-only upserts can't track distinct values | Removed from schema. Computed at query time via `COUNT(DISTINCT ...)` |
| **`offchainTable` doesn't exist** | Used `offchainTable` import in `ponder.schema.ts` | Uses Drizzle `pgSchema` + `pgTable` in separate `offchain.ts` file with separate db instance (matches Ponder docs) |
| **Wrong workspace path** | `packages/indexer/` with pnpm | `apps/indexer/` with npm workspaces (matches actual `sippy-backend-admin/package.json`) |
| **Wrong package manager** | `pnpm --filter indexer start` | `npm -w apps/indexer start` |

---

## Key Design Decisions (Galeon-Inspired)

| Decision | Rationale | Galeon Parallel |
|----------|-----------|-----------------|
| **Query-time classification** | Avoids boot race, auto-reclassifies on new registrations | Galeon stores raw events, API layer applies logic |
| **Off-chain Drizzle schema for wallet registry** | Wallet data comes from backend, not on-chain events | Verified against Ponder offchain data docs |
| **No pre-computed Sippy daily volume** | 50 beta users → SQL aggregation is fast enough for M1 | Galeon computes per-pool stats at query time too |
| **Upserts for on-chain tables** | Idempotent handlers survive re-indexing | Galeon uses `onConflictDoUpdate` everywhere |
| **Hono for API layer** | Lightweight, type-safe, built into Ponder | Same as Galeon |
| **Sync status endpoint** | Monitor indexer health and lag | Galeon's `/sync-status` pattern |

---

## Estimate: 12-16h
