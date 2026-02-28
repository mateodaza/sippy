/**
 * Database Service (PostgreSQL via AdonisJS Lucid)
 *
 * Thin wrapper around Lucid's rawQuery that preserves the { rows: T[] }
 * contract so every caller across the codebase keeps working unchanged.
 */

import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

/**
 * Execute a query against the database.
 *
 * Signature is intentionally identical to the Express/pg version so the 30+
 * call-sites that depend on it require zero changes.
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  const start = Date.now()
  try {
    const result = await db.rawQuery(text, params ?? [])
    const duration = Date.now() - start
    logger.info(`Query executed in ${duration}ms`)
    return { rows: result.rows }
  } catch (error) {
    logger.error('Query error: %o', error)
    throw error
  }
}

// ============================================================================
// Parse Log (Step 6: Observability)
// ============================================================================

export interface ParseLogEntry {
  messageId: string
  phoneNumber?: string
  parseSource: 'regex' | 'llm'
  intent: string
  model?: string
  promptTokens?: number
  completionTokens?: number
  latencyMs: number
  status: string
  detectedLanguage?: string
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
    )
  } catch (error) {
    logger.warn('Parse log insert failed (non-blocking): %o', error)
  }
}

// ============================================================================
// Export Audit Log (Wallet Recovery)
// ============================================================================

export interface ExportAuditEntry {
  attemptId: string
  event: string
  phoneHash: string
  walletAddress: string
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
    )
  } catch (error) {
    logger.warn('Export audit log insert failed (non-blocking): %o', error)
  }
}

// ============================================================================
// Web Send Audit Log (Wallet Fallback)
// ============================================================================

export interface WebSendLogEntry {
  phoneHash: string
  walletAddress: string
  toAddress: string
  amount: string
  txHash: string
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
    )
  } catch (error) {
    logger.warn('Web send log insert failed (non-blocking): %o', error)
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
    )
    const lang = result.rows[0]?.preferred_language
    if (lang === 'en' || lang === 'es' || lang === 'pt') return lang
    return null
  } catch {
    return null
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
    )
  } catch (error) {
    logger.warn('Failed to persist language (non-blocking): %o', error)
  }
}
