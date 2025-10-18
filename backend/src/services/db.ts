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
    
    console.log('✅ Database schema initialized');
    
    // Log current record count
    const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM phone_registry');
    const count = result.rows[0].count;
    console.log(`📊 Phone registry: ${count} wallets\n`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Close the database connection pool
 */
export async function closeDb(): Promise<void> {
  await pool.end();
  console.log('🔌 Database connection closed');
}

