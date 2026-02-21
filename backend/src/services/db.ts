/**
 * Database Service (PostgreSQL)
 *
 * Handles database connection and schema initialization for Railway PostgreSQL
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err);
});

/**
 * Execute a query against the database
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`🔍 Query executed in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Query error:', error);
    throw error;
  }
}

/**
 * Initialize database schema
 */
export async function initDb(): Promise<void> {
  console.log('\n🗄️  Initializing database schema...');

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS phone_registry (
        phone_number TEXT PRIMARY KEY,
        cdp_wallet_name TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_activity BIGINT NOT NULL,
        daily_spent NUMERIC(18,6) NOT NULL DEFAULT 0,
        last_reset_date TEXT NOT NULL
      )
    `);

    // Add columns for embedded wallet spend permissions (safe to run multiple times)
    await query(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS spend_permission_hash VARCHAR(66)
    `);
    await query(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS daily_limit DECIMAL(18, 6)
    `);
    await query(`
      ALTER TABLE phone_registry
      ADD COLUMN IF NOT EXISTS permission_created_at BIGINT
    `);

    // Step 6: Parse log for observability
    await query(`
      CREATE TABLE IF NOT EXISTS parse_log (
        id SERIAL PRIMARY KEY,
        message_id TEXT NOT NULL,
        phone_number TEXT,
        parse_source TEXT NOT NULL,
        intent TEXT NOT NULL,
        model TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        detected_language VARCHAR(2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parse_log_message_id_unique
      ON parse_log (message_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_parse_log_created_at
      ON parse_log (created_at)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_parse_log_source_created
      ON parse_log (parse_source, created_at)
    `);

    // Export audit log (wallet recovery feature)
    await query(`
      CREATE TABLE IF NOT EXISTS export_audit_log (
        id SERIAL PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        event TEXT NOT NULL,
        phone_hash TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_export_audit_dedup
      ON export_audit_log (attempt_id, event)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_export_audit_created
      ON export_audit_log (created_at)
    `);

    // Web send audit log (wallet fallback feature)
    await query(`
      CREATE TABLE IF NOT EXISTS web_send_log (
        id SERIAL PRIMARY KEY,
        phone_hash TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        tx_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_web_send_created
      ON web_send_log (created_at)
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_web_send_tx_hash
      ON web_send_log (tx_hash) WHERE tx_hash IS NOT NULL
    `);

    // User preferences (separate from phone_registry so language can persist
    // before wallet creation)
    await query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        phone_number TEXT PRIMARY KEY,
        preferred_language VARCHAR(2),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Database schema initialized');

    // Log current record count
    const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM phone_registry');
    const count = result.rows[0].count;
    console.log(`📊 Phone registry: ${count} wallets\n`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

// ============================================================================
// Parse Log (Step 6: Observability)
// ============================================================================

export interface ParseLogEntry {
  messageId: string;
  phoneNumber?: string;
  parseSource: 'regex' | 'llm';
  intent: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  status: string;
  detectedLanguage?: string;
}

/**
 * Log a parse result. Non-blocking — failures never break the main flow.
 * Uses ON CONFLICT DO NOTHING for WhatsApp webhook retry idempotency.
 */
export async function logParseResult(entry: ParseLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO parse_log
        (message_id, phone_number, parse_source, intent, model,
         prompt_tokens, completion_tokens, latency_ms, status, detected_language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (message_id) DO NOTHING`,
      [
        entry.messageId,
        entry.phoneNumber ?? null,
        entry.parseSource,
        entry.intent,
        entry.model ?? null,
        entry.promptTokens ?? null,
        entry.completionTokens ?? null,
        entry.latencyMs,
        entry.status,
        entry.detectedLanguage ?? null,
      ]
    );
  } catch (error) {
    console.warn('Parse log insert failed (non-blocking):', error);
  }
}

// ============================================================================
// Export Audit Log (Wallet Recovery)
// ============================================================================

export interface ExportAuditEntry {
  attemptId: string;
  event: string;
  phoneHash: string;
  walletAddress: string;
}

/**
 * Log an export audit event. Non-blocking — failures never break the main flow.
 * Uses ON CONFLICT DO NOTHING for idempotency (same attempt+event is a no-op).
 */
export async function logExportEvent(entry: ExportAuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO export_audit_log (attempt_id, event, phone_hash, wallet_address)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, event) DO NOTHING`,
      [entry.attemptId, entry.event, entry.phoneHash, entry.walletAddress]
    );
  } catch (error) {
    console.warn('Export audit log insert failed (non-blocking):', error);
  }
}

// ============================================================================
// Web Send Audit Log (Wallet Fallback)
// ============================================================================

export interface WebSendLogEntry {
  phoneHash: string;
  walletAddress: string;
  toAddress: string;
  amount: string;
  txHash: string;
}

/**
 * Log a web send event. Non-blocking — failures never break the main flow.
 * Uses ON CONFLICT (tx_hash) DO NOTHING to deduplicate retries.
 */
export async function logWebSend(entry: WebSendLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO web_send_log (phone_hash, wallet_address, to_address, amount, tx_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [entry.phoneHash, entry.walletAddress, entry.toAddress, entry.amount, entry.txHash]
    );
  } catch (error) {
    console.warn('Web send log insert failed (non-blocking):', error);
  }
}

// ============================================================================
// Language Preference (Step 4)
// ============================================================================

/**
 * Get user's persisted language preference. Returns null if not set.
 * Checks user_preferences table (works before wallet creation).
 */
export async function getUserLanguage(
  phoneNumber: string
): Promise<'en' | 'es' | 'pt' | null> {
  try {
    const result = await query<{ preferred_language: string | null }>(
      'SELECT preferred_language FROM user_preferences WHERE phone_number = $1',
      [phoneNumber]
    );
    const lang = result.rows[0]?.preferred_language;
    if (lang === 'en' || lang === 'es' || lang === 'pt') return lang;
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist user's language preference via upsert.
 * Works even if user has no wallet yet.
 */
export async function setUserLanguage(
  phoneNumber: string,
  lang: 'en' | 'es' | 'pt'
): Promise<void> {
  try {
    await query(
      `INSERT INTO user_preferences (phone_number, preferred_language, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone_number)
       DO UPDATE SET preferred_language = $2, updated_at = NOW()`,
      [phoneNumber, lang]
    );
  } catch (error) {
    console.warn('Failed to persist language (non-blocking):', error);
  }
}

/**
 * Close the database connection pool
 */
export async function closeDb(): Promise<void> {
  await pool.end();
  console.log('🔌 Database connection closed');
}

