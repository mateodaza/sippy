/**
 * Indexer Wallet Sync — Preload
 *
 * Runs once on backend boot to backfill all existing wallets
 * from phone_registry into the Ponder indexer's offchain registry.
 *
 * This is fire-and-forget — if the indexer is down, the backend
 * still boots normally. Wallets will be synced on next restart.
 */

import { syncAllWalletsWithIndexer } from '#services/indexer.service'

syncAllWalletsWithIndexer().catch(() => {})
