# Migration: Ponder Indexer to Alchemy Address Activity Webhooks

Date: 2026-03-25
Status: Approved, not started
Scope: Replace `apps/indexer/` (Ponder) with Alchemy webhooks + backend-owned tables for the admin dashboard.

## Why

Ponder bakes wallet filters at startup. Every new wallet registration triggers a full re-index from block 437M (~8 min downtime). The admin dashboard is the only consumer of indexed data. Alchemy Address Activity Webhooks push events for registered wallets instantly, cost $0 at current scale, and support dynamic wallet updates via API.

## Design Principles

1. **Raw events are source of truth.** `transfer` and `refuel_event` are immutable logs. `account` and `daily_volume` are derived aggregates that can be recomputed from raw events if needed.
2. **Cutover block.** A single block number recorded at migration start defines the boundary: historical seed covers everything up to `cutover_block`, webhook/poller events are processed only after that point during validation.
3. **Idempotency first.** Every write path gates aggregate updates on successful raw-event insert. Duplicate deliveries, retries, and dual-write overlap cannot corrupt data.
4. **Incremental migration.** Both systems run in parallel during validation. The admin dashboard reads from Ponder until cutover, then switches to backend tables. `apps/indexer/` is deleted only after validation.

## Architecture

```
Before:
  Arbitrum --> Ponder (RPC polling) --> indexer Postgres --> admin dashboard (SQL)

After:
  Arbitrum --> Alchemy (monitors addresses) --> webhook POST --> backend --> backend Postgres --> admin dashboard (SQL)
  Arbitrum --> GasRefuel poller (eth_getLogs) --> backend Postgres --> admin dashboard (SQL)
```

## New Tables

All tables live in the `onchain` schema in the backend's existing Postgres database.

### `onchain.transfer` (raw event, source of truth)

| Column       | Type                      | Notes                            |
| ------------ | ------------------------- | -------------------------------- |
| id           | TEXT PK                   | `{txHash}-{logIndex}`, lowercase |
| from         | TEXT NOT NULL             | lowercase 0x address             |
| to           | TEXT NOT NULL             | lowercase 0x address             |
| amount       | NUMERIC(78,0) NOT NULL    | raw USDC units (6 decimals)      |
| timestamp    | INTEGER NOT NULL          | unix seconds from block          |
| block_number | INTEGER NOT NULL          |                                  |
| tx_hash      | TEXT NOT NULL             |                                  |
| received_at  | TIMESTAMPTZ DEFAULT NOW() | when webhook delivered it        |

Indexes: `from`, `to`, `timestamp`, `block_number`

### `onchain.account` (derived aggregate)

| Column         | Type                             | Notes        |
| -------------- | -------------------------------- | ------------ |
| address        | TEXT PK                          | lowercase 0x |
| balance        | NUMERIC(78,0) NOT NULL DEFAULT 0 |              |
| total_sent     | NUMERIC(78,0) NOT NULL DEFAULT 0 |              |
| total_received | NUMERIC(78,0) NOT NULL DEFAULT 0 |              |
| tx_count       | INTEGER NOT NULL DEFAULT 0       |              |
| last_activity  | INTEGER NOT NULL DEFAULT 0       | unix seconds |

### `onchain.daily_volume` (derived aggregate)

| Column            | Type                             | Notes                    |
| ----------------- | -------------------------------- | ------------------------ |
| id                | TEXT PK                          | date string "YYYY-MM-DD" |
| date              | TEXT NOT NULL                    |                          |
| total_usdc_volume | NUMERIC(78,0) NOT NULL DEFAULT 0 |                          |
| transfer_count    | INTEGER NOT NULL DEFAULT 0       |                          |
| gas_refuel_count  | INTEGER NOT NULL DEFAULT 0       |                          |
| gas_eth_spent     | NUMERIC(78,0) NOT NULL DEFAULT 0 |                          |

### `onchain.refuel_event` (raw event, source of truth)

| Column       | Type                   | Notes                 |
| ------------ | ---------------------- | --------------------- |
| id           | TEXT PK                | `{txHash}-{logIndex}` |
| user         | TEXT NOT NULL          | lowercase 0x          |
| amount       | NUMERIC(78,0) NOT NULL |                       |
| timestamp    | INTEGER NOT NULL       |                       |
| block_number | INTEGER NOT NULL       |                       |
| tx_hash      | TEXT NOT NULL          |                       |

Indexes: `user`, `timestamp`

### `onchain.gas_refuel_status` (derived singleton)

| Column          | Type                             | Notes              |
| --------------- | -------------------------------- | ------------------ |
| id              | TEXT PK                          | always 'singleton' |
| total_refuels   | INTEGER NOT NULL DEFAULT 0       |                    |
| total_eth_spent | NUMERIC(78,0) NOT NULL DEFAULT 0 |                    |
| is_paused       | BOOLEAN NOT NULL DEFAULT false   |                    |
| last_refuel_at  | INTEGER NOT NULL DEFAULT 0       |                    |

Seeded with a single row on migration.

### `onchain.webhook_delivery_log` (ops/debugging)

| Column         | Type                      | Notes                                                |
| -------------- | ------------------------- | ---------------------------------------------------- |
| id             | SERIAL PK                 |                                                      |
| event_id       | TEXT UNIQUE NOT NULL      | Alchemy's `whevt_...` id                             |
| webhook_id     | TEXT NOT NULL             |                                                      |
| received_at    | TIMESTAMPTZ DEFAULT NOW() |                                                      |
| block_num      | TEXT                      |                                                      |
| activity_count | INTEGER                   |                                                      |
| status         | TEXT DEFAULT 'ok'         | 'ok', 'parse_error', 'duplicate', 'signature_failed' |

Index: `received_at`

### `onchain.poller_cursor` (GasRefuel poller state)

| Column               | Type                      | Notes        |
| -------------------- | ------------------------- | ------------ |
| id                   | TEXT PK                   | 'gas_refuel' |
| last_processed_block | INTEGER NOT NULL          |              |
| updated_at           | TIMESTAMPTZ DEFAULT NOW() |              |

## Idempotency and Replay Model

Every write path follows the same contract:

1. Attempt `INSERT INTO onchain.transfer ... ON CONFLICT (id) DO NOTHING RETURNING id`
2. If no row returned (duplicate), skip all downstream writes
3. If row inserted, update `onchain.account` (sender + receiver) and `onchain.daily_volume` within the same transaction
4. Same pattern for `onchain.refuel_event` and `onchain.gas_refuel_status`

This makes all paths safe against:

- Alchemy webhook retries (at-least-once delivery)
- Dual-write during parallel run (Ponder + webhook writing simultaneously)
- GasRefuel poller re-reading overlapping block ranges on restart
- Manual re-seed or aggregate recomputation

Spender address exclusion: `SIPPY_SPENDER_ADDRESS` is checked before account upserts, not before transfer inserts. Transfer records are always stored (for history), but the spender's account row is never created or updated. This matches the existing Ponder handler behavior.

## Reorg and Removal Handling

Alchemy's Address Activity payload includes `log.removed` on token activity events. When a chain reorg invalidates a previously delivered event, Alchemy re-delivers the same webhook with `removed: true` on the affected activities.

### Strategy

- **During validation/cutover:** Ignore this. The cutover block is deep enough to be finalized. Webhook events near the head during the parallel run are verified against Ponder's data anyway.
- **For live processing after cutover:** When `log.removed === true`:
  1. Delete the raw event from `onchain.transfer` (or `onchain.refuel_event`) by its `id`
  2. If the delete succeeds (row existed), run `recomputeAggregates()` for the affected accounts and daily volume date
  3. If the delete returns 0 rows (event was never stored or already removed), no-op

This is safe because raw events are source of truth and aggregates are derived. A reorg that removes a transfer triggers: delete raw event, recompute aggregates from remaining raw events. No manual intervention needed.

### Practical impact

Arbitrum has soft finality within seconds and hard finality via L1 batching. Reorgs deeper than 1-2 blocks are extremely rare. The GasRefuel poller's 2-block confirmation buffer avoids most reorg exposure. The webhook handler sees them occasionally but the compensating delete + recompute path handles it cleanly.

## Webhook Endpoint

### Route

`POST /webhook/alchemy/address-activity` (unauthenticated by session, verified by HMAC)

### Signature Verification

```
HMAC-SHA256(raw_request_body, ALCHEMY_SIGNING_KEY) == X-Alchemy-Signature header
```

Both sides padded to fixed length before `timingSafeEqual` to avoid length leaks.

### Processing

1. Verify signature, reject with 401 if invalid
2. Check `event_id` uniqueness in `webhook_delivery_log`, skip if duplicate
3. Filter activities: only `category === 'token'` and `rawContract.address` matches USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)
4. Batch-fetch block timestamps for all unique `blockNum` values (parallel RPC, concurrency 10)
5. For each activity, call `processTransfer()` (idempotent)
6. Log delivery to `webhook_delivery_log`
7. Return `200 { ok: true }`

### Parsing

- Transfer ID: `{log.transactionHash.toLowerCase()}-{parseInt(log.logIndex, 16)}`
- Amount: `BigInt(activity.rawContract.rawValue)` (NOT `activity.value` which is a lossy float)
- Addresses: `activity.fromAddress.toLowerCase()`, `activity.toAddress.toLowerCase()`

## GasRefuel Poller

A durable log poller in the backend, not ethers event listeners.

### Design

- Persisted cursor in `onchain.poller_cursor` (`id = 'gas_refuel'`)
- On boot: read cursor, poll from `last_processed_block` to `head - 2` (confirmation buffer)
- On interval (every 60s): same poll loop
- Uses `eth_getLogs` with the GasRefuel contract address and event topics
- Processes `Refueled`, `Paused`, `Unpaused` events via `processRefuelEvent()` / `setRefuelPaused()`
- Updates cursor after successful processing

### Confirmation Buffer

Poll target: `head_block - 2` (not head). On restart, re-read from `last_processed_block` (not `last_processed_block + 1`). The idempotent insert handles the overlap. This makes reorgs and partial failures safe without explicit reorg detection.

### Backfill on First Run

If no cursor exists, seed it with `cutover_block` (or `START_BLOCK` if doing full historical seed). The historical seed migration handles everything before that.

## Alchemy Wallet Management

### `alchemy.service.ts`

```
registerWalletWithAlchemy(address)
  -> PATCH https://dashboard.alchemy.com/api/update-webhook-addresses
     { webhook_id, addresses_to_add: [address], addresses_to_remove: [] }

syncAllWalletsWithAlchemy()
  -> Same endpoint, chunked in batches of 1,000 addresses
  -> Alchemy's update endpoint is idempotent, so re-adding existing addresses is safe
  -> Chunking avoids depending on a single large request succeeding

isAvailable()
  -> true if ALCHEMY_WEBHOOK_ID && ALCHEMY_AUTH_TOKEN && ALCHEMY_SIGNING_KEY
```

Replaces `indexer.service.ts`. No restart needed. Alchemy limit: 100K addresses per webhook, 5 webhooks on free tier.

### Chunking

`syncAllWalletsWithAlchemy()` sends addresses in batches of 1,000 per PATCH request. Each batch is retried once on failure. A partial sync (some batches succeed, some fail) is safe because:

- Alchemy's address list is additive (failed batches just mean those addresses aren't watched yet)
- The next boot sync will retry all addresses
- Individual wallet registrations via `registerWalletWithAlchemy()` are single-address calls, unaffected

## Admin Controller Changes

### `analytics_controller.ts`

All `db.connection('indexer')` calls become `db.from('onchain.*')`. The `offchain.sippy_wallet` joins become `phone_registry` joins.

| Current                            | New                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `idx.from('daily_volume')`         | `db.from('onchain.daily_volume')`                                       |
| `idx.from('transfer')`             | `db.from('onchain.transfer')`                                           |
| `idx.from('account')`              | `db.from('onchain.account')`                                            |
| `GasRefuelStatus.first()`          | `db.from('onchain.gas_refuel_status').where('id', 'singleton').first()` |
| `offchain.sippy_wallet` subqueries | `phone_registry WHERE wallet_address IS NOT NULL`                       |

### `users_controller.ts`

`const idx = db.connection('indexer')` deleted. `idx.from('account')` becomes `db.from('onchain.account')`.

### `inertia_middleware.ts`

Replace Ponder heartbeat with webhook staleness check:

```sql
SELECT EXTRACT(EPOCH FROM MAX(received_at))::bigint as heartbeat
FROM onchain.webhook_delivery_log
WHERE status = 'ok'
```

## Alerting

All checked by a scheduled task every 5 minutes.

| Alert                  | Condition                                                    | Severity |
| ---------------------- | ------------------------------------------------------------ | -------- |
| Webhook silent         | No delivery in `webhook_delivery_log` for >5 min             | Error    |
| Address count          | `phone_registry` wallet count >80K                           | Warning  |
| Address count          | wallet count >95K                                            | Error    |
| Delivery failures      | >0 non-ok entries in `webhook_delivery_log` in last hour     | Error    |
| GasRefuel poller stale | `poller_cursor.updated_at` >5 min ago                        | Warning  |
| Data lag               | `received_at - to_timestamp(timestamp)` consistently >10 min | Warning  |

## Migration Sequence

### Phase 0 -- Setup (no code)

- [ ] Create Alchemy Address Activity webhook for ARB_MAINNET
- [ ] Point webhook at `https://backend.sippy.lat/webhook/alchemy/address-activity`
- [ ] Add to Railway: `ALCHEMY_WEBHOOK_ID`, `ALCHEMY_AUTH_TOKEN`, `ALCHEMY_SIGNING_KEY`
- [ ] Record `cutover_block` (current Arbitrum head block at migration start)

### Phase 1 -- Build

- [ ] Migration `0012_onchain_tables.ts`: create `onchain` schema + all 7 tables
- [ ] `onchain_writer.service.ts`: `processTransfer()`, `processRefuelEvent()`, `setRefuelPaused()`, `recomputeAggregates()`
- [ ] `webhook_alchemy_controller.ts`: signature verification, USDC filtering, batch timestamp fetch, idempotent writes
- [ ] `alchemy.service.ts`: `registerWalletWithAlchemy()`, `syncAllWalletsWithAlchemy()`
- [ ] GasRefuel poller: boot + interval log polling with persisted cursor, confirmation buffer
- [ ] Route: `POST /webhook/alchemy/address-activity`
- [ ] Dual-write: `indexer_sync.ts` calls both `syncAllWalletsWithIndexer()` and `syncAllWalletsWithAlchemy()`
- [ ] Dual-write: wallet registration calls both services
- [ ] Deploy (both systems now writing in parallel)

### Phase 1.5 -- Historical Seed

- [ ] Run one-time migration script that copies from Ponder tables to `onchain.*` tables:
  - `INSERT INTO onchain.transfer SELECT ... FROM ponder_v2.transfer WHERE block_number <= cutover_block`
  - `INSERT INTO onchain.refuel_event SELECT ... FROM ponder_v2.refuel_event WHERE block_number <= cutover_block`
  - `INSERT INTO onchain.gas_refuel_status SELECT ... FROM ponder_v2.gas_refuel_status`
  - Copy `account` and `daily_volume` for speed (document they are recomputable from raw events)
- [ ] All inserts use `ON CONFLICT DO NOTHING` (safe to re-run)
- [ ] Seed `onchain.poller_cursor` with `cutover_block`
- [ ] Verify row counts match between Ponder and `onchain.*` tables

### Phase 2 -- Validate (48-72h parallel run)

- [ ] Compare `SELECT COUNT(*), SUM(amount) FROM onchain.transfer` vs Ponder's `transfer` (for blocks after cutover_block)
- [ ] Compare `onchain.account` aggregates for top 20 wallets
- [ ] Compare `onchain.refuel_event` counts
- [ ] Webhook deliveries arriving and logging correctly
- [ ] GasRefuel poller cursor advancing

### Phase 3 -- Admin Cutover

- [ ] Update `analytics_controller.ts`: all queries read from `onchain.*`
- [ ] Update `users_controller.ts`: account enrichment from `onchain.account`
- [ ] Update `inertia_middleware.ts`: heartbeat from `webhook_delivery_log`
- [ ] Delete `models/indexer/*.ts` (6 files)
- [ ] Remove `indexer` connection from `config/database.ts`
- [ ] Remove `INDEXER_DB_*` env vars from Railway (backend service only)
- [ ] Deploy and smoke-test all admin pages

### Phase 4 -- Indexer Shutdown

- [ ] Remove dual-write: only `alchemy.service.ts` in wallet registration
- [ ] Remove `indexer.service.ts`
- [ ] Delete `apps/indexer/` directory
- [ ] Stop and delete Railway indexer service
- [ ] Remove `INDEXER_URL`, `INDEXER_API_SECRET` from Railway
- [ ] Remove indexer from `pnpm-workspace.yaml` if present
- [ ] Delete GitHub Actions `restart-indexer.yml`

### Phase 5 -- Alerting

- [ ] Scheduled task (`onchain_health.ts`) with 5-min interval checks
- [ ] Wire alerts to PostHog events or Slack webhook
- [ ] `GET /admin/webhook-status` endpoint for manual ops checks

## Recovery Paths

| Scenario                      | Recovery                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate data is wrong       | Run `recomputeAggregates()` which rebuilds `account` and `daily_volume` from raw `transfer` and `refuel_event` tables                                |
| Historical seed missed events | Re-run seed script (idempotent), then `recomputeAggregates()`                                                                                        |
| Webhook stops delivering      | GasRefuel poller is independent. For USDC: check Alchemy dashboard, re-enable webhook. Missed events can be backfilled via `backfillWalletFromRpc()` |
| Alchemy goes down             | Fallback: `backfillWalletFromRpc()` using direct RPC, same logic as current indexer backfill                                                         |
| Need to revert to Ponder      | `apps/indexer/` is only deleted in Phase 4. Before that, revert admin controllers to read from `db.connection('indexer')`                            |

## Files

### Create

- `apps/backend/database/migrations/0012_onchain_tables.ts`
- `apps/backend/app/services/alchemy.service.ts`
- `apps/backend/app/services/onchain_writer.service.ts`
- `apps/backend/app/controllers/webhook_alchemy_controller.ts`
- `apps/backend/app/tasks/onchain_health.ts` (Phase 5)
- `apps/backend/scripts/seed_onchain_from_ponder.ts` (Phase 1.5, one-time)

### Modify

- `apps/backend/app/controllers/admin/analytics_controller.ts` (Phase 3)
- `apps/backend/app/controllers/admin/users_controller.ts` (Phase 3)
- `apps/backend/app/middleware/inertia_middleware.ts` (Phase 3)
- `apps/backend/app/services/refuel.service.ts` (add GasRefuel poller)
- `apps/backend/start/routes.ts` (add webhook route)
- `apps/backend/start/indexer_sync.ts` (dual-write Phase 1, sole Alchemy Phase 4)
- `apps/backend/start/env.ts` (add `ALCHEMY_*` vars)
- `apps/backend/config/database.ts` (remove `indexer` connection Phase 3)

### Delete (Phase 3-4)

- `apps/backend/app/services/indexer.service.ts`
- `apps/backend/app/models/indexer/*.ts` (6 files)
- `apps/indexer/` (entire directory, Phase 4)
- `.github/workflows/restart-indexer.yml` (Phase 4)
