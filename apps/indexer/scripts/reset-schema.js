/**
 * Conditional schema reset for Ponder.
 *
 * Ponder fingerprints its config and refuses to start if the schema was
 * created by a different config (e.g. after a contract address change).
 *
 * This script hashes the key config inputs (contracts, ABIs, start block,
 * schema) and only drops Ponder schemas when the hash changes. Normal
 * restarts (new wallets, hourly cron) skip the reset and Ponder resumes
 * from its checkpoint in seconds.
 *
 * Set FORCE_RESET=1 to force a clean re-index regardless of hash.
 *
 * Only drops ponder_sync and the ponder data schemas — the offchain schema
 * (sippy_wallet, etc.) is left untouched.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INDEXER_ROOT = join(__dirname, '..')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.log('[reset-schema] No DATABASE_URL — skipping')
  process.exit(0)
}

// ── Build config fingerprint ────────────────────────────────
// Hash the files that affect Ponder's config fingerprint.
// If any of these change, the schema must be reset.

const filesToHash = ['ponder.config.ts', 'ponder.schema.ts', 'abis/ERC20.ts', 'abis/GasRefuel.ts']

const hash = createHash('sha256')
for (const file of filesToHash) {
  try {
    hash.update(readFileSync(join(INDEXER_ROOT, file)))
  } catch {
    // File missing — hash will differ from stored, triggering reset
    hash.update(`missing:${file}`)
  }
}
// Include START_BLOCK since it affects the indexed range
hash.update(process.env.START_BLOCK || '437000000')
const currentHash = hash.digest('hex').slice(0, 16)

// ── Compare with stored hash ────────────────────────────────

const client = new pg.Client(DATABASE_URL)

try {
  await client.connect()

  // Ensure our metadata table exists (outside Ponder's schemas)
  await client.query(`
    CREATE TABLE IF NOT EXISTS offchain.indexer_config_hash (
      id integer PRIMARY KEY DEFAULT 1,
      hash text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const forceReset = process.env.FORCE_RESET === '1'
  const stored = await client.query('SELECT hash FROM offchain.indexer_config_hash WHERE id = 1')
  const storedHash = stored.rows[0]?.hash

  if (!forceReset && storedHash === currentHash) {
    console.log(
      `[reset-schema] Config unchanged (${currentHash}) — skipping reset, resuming from checkpoint`
    )
    process.exit(0)
  }

  const reason = forceReset
    ? 'FORCE_RESET=1'
    : `hash changed: ${storedHash || '(none)'} → ${currentHash}`
  console.log(`[reset-schema] ${reason} — dropping Ponder schemas`)

  // Drop Ponder's internal sync schema
  await client.query('DROP SCHEMA IF EXISTS ponder_sync CASCADE')
  // Drop Ponder's default v2 schema
  await client.query('DROP SCHEMA IF EXISTS ponder_v2 CASCADE')
  // Drop the public ponder tables (Ponder sometimes uses public schema)
  await client.query('DROP SCHEMA IF EXISTS ponder CASCADE')

  // Store new hash
  await client.query(
    `
    INSERT INTO offchain.indexer_config_hash (id, hash, updated_at)
    VALUES (1, $1, now())
    ON CONFLICT (id) DO UPDATE SET hash = $1, updated_at = now()
  `,
    [currentHash]
  )

  console.log('[reset-schema] Ponder schemas dropped — clean start')
} catch (err) {
  console.error('[reset-schema] Failed:', err.message)
  // Don't block startup — let Ponder fail with its own error if needed
} finally {
  await client.end().catch(() => {})
}
