/**
 * Wallet Sync + Onchain Poller — Preload
 *
 * Runs once on backend boot:
 * 1. Sync wallets to Alchemy webhook
 * 2. Start GasRefuel log poller
 *
 * All fire-and-forget — failures don't block boot.
 */

import { syncAllWalletsWithAlchemy } from '#services/alchemy.service'
import { startGasRefuelPoller } from '#services/gas_refuel_poller.service'

syncAllWalletsWithAlchemy().catch(() => {})
startGasRefuelPoller()
