/**
 * Pre-start schema reset for Ponder.
 *
 * Ponder fingerprints its config and refuses to start if the schema was
 * created by a different config (e.g. after a contract address change).
 * Since all Ponder data is derived from on-chain events and can be
 * re-indexed, we drop the schema on every deploy so it always starts clean.
 *
 * Only drops ponder_sync and the public ponder tables — the offchain schema
 * (sippy_wallet, etc.) is left untouched.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('[reset-schema] No DATABASE_URL — skipping schema reset');
  process.exit(0);
}

const client = new pg.Client(DATABASE_URL);

try {
  await client.connect();

  // Drop Ponder's internal sync schema
  await client.query('DROP SCHEMA IF EXISTS ponder_sync CASCADE');
  // Drop Ponder's default v2 schema
  await client.query('DROP SCHEMA IF EXISTS ponder_v2 CASCADE');
  // Drop the public ponder tables (Ponder sometimes uses public schema)
  await client.query('DROP SCHEMA IF EXISTS ponder CASCADE');

  console.log('[reset-schema] Ponder schemas dropped — clean start');
} catch (err) {
  console.error('[reset-schema] Failed to reset schema:', err.message);
  // Don't block startup — let Ponder fail with its own error if needed
} finally {
  await client.end().catch(() => {});
}
