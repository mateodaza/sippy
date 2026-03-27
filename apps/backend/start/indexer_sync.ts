/**
 * Wallet Sync + Onchain Poller — Preload
 *
 * Runs once on backend boot:
 * 1. Sync wallets to Ponder indexer (legacy, kept during migration)
 * 2. Sync wallets to Alchemy webhook (new)
 * 3. Start GasRefuel log poller (new)
 *
 * All fire-and-forget — failures don't block boot.
 */

import { syncAllWalletsWithIndexer } from '#services/indexer.service'
import { syncAllWalletsWithAlchemy } from '#services/alchemy.service'
import { startGasRefuelPoller } from '#services/gas_refuel_poller.service'

// Dual-write during parallel run
syncAllWalletsWithIndexer().catch(() => {})
syncAllWalletsWithAlchemy().catch(() => {})

// Start durable GasRefuel poller
startGasRefuelPoller()
