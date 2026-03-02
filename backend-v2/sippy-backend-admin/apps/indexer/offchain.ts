import { pgSchema, text, boolean, integer } from 'drizzle-orm/pg-core'

// Drizzle schema in a separate Postgres schema to avoid conflicts with Ponder's managed tables
export const offchain = pgSchema('offchain')

// Registered Sippy wallets — synced from phone_registry via backend
export const sippyWallet = offchain.table('sippy_wallet', {
  address: text('address').primaryKey(),
  phoneHash: text('phone_hash'),
  registeredAt: integer('registered_at').notNull(),
  isActive: boolean('is_active').notNull().default(true),
})
