/**
 * Database Service (PostgreSQL via AdonisJS Lucid)
 *
 * Thin wrapper around Lucid's rawQuery that preserves the { rows: T[] }
 * contract so every caller across the codebase keeps working unchanged.
 */

import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { ExportEvent } from '#types/schemas'

/**
 * Execute a query against the database.
 *
 * Signature is intentionally identical to the Express/pg version so the 30+
 * call-sites that depend on it require zero changes.
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now()
  try {
    // Lucid rawQuery uses ? placeholders (knex convention), not PostgreSQL $1 syntax.
    // Convert $1, $2, ... to ? for compatibility with migrated Express queries.
    const knexText = text.replace(/\$\d+/g, '?')
    const result = await db.rawQuery(knexText, params ?? [])
    const duration = Date.now() - start
    logger.info(`Query executed in ${duration}ms`)
    // rowCount is provided by the pg driver for DML statements (UPDATE/INSERT/DELETE).
    // Fall back to rows.length for SELECT queries where rowCount may be absent.
    const rowCount: number = (result as any).rowCount ?? result.rows?.length ?? 0
    return { rows: result.rows, rowCount }
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
  originalText?: string // raw user text — sanitized into matched_phrase before storage
}

/**
 * Scrub a raw user phrase for safe storage in parse_log.matched_phrase.
 *
 * Rules (applied in order):
 *   1. Replace phone-like sequences with [PHONE]
 *   2. Replace money/numeric amounts with [AMOUNT]
 *   3. Lowercase and collapse whitespace
 *   4. Return null if result is too short or contains only placeholders
 *
 * Only called for llm-success rows — never touches regex or send traffic.
 */
export function sanitizePhrase(text: string): string | null {
  let s = text
    .replace(/\+?\d[\d\s\-().]{6,}\d/g, '[PHONE]')   // phone patterns (7+ digits)
    .replace(/\$?\d+(\.\d+)?/g, '[AMOUNT]')            // money / standalone numbers
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

  // Too short to be useful
  if (s.length < 4) return null

  // Nothing left except placeholders and punctuation
  const stripped = s.replace(/\[phone\]|\[amount\]|[\s.,!?¿¡]/g, '')
  if (stripped.length < 2) return null

  // Truncate to column limit
  return s.length > 300 ? s.slice(0, 300) : s
}

/**
 * Log a parse result. Non-blocking — failures never break the main flow.
 * Uses ON CONFLICT DO NOTHING for WhatsApp webhook retry idempotency.
 *
 * matched_phrase is only written when parse_source='llm' and status='llm-success'.
 * The raw originalText is sanitized at write time — never stored verbatim.
 */
export async function logParseResult(entry: ParseLogEntry): Promise<void> {
  const matchedPhrase =
    entry.parseSource === 'llm' && entry.status === 'llm-success' && entry.originalText
      ? sanitizePhrase(entry.originalText)
      : null

  try {
    await query(
      `INSERT INTO parse_log
        (message_id, phone_number, parse_source, intent, model,
         prompt_tokens, completion_tokens, latency_ms, status, detected_language, matched_phrase)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        matchedPhrase,
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
  event: ExportEvent['event']
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
 * Compatibility helper: resolves the phone key to use for user_preferences writes.
 * If a bare-digit row already exists for the given canonical phone, returns bare
 * digits to update that existing row instead of creating a duplicate canonical row.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function resolveUserPrefsPhone(phoneNumber: string): Promise<string> {
  if (phoneNumber.startsWith('+')) {
    const result = await query<{ phone_number: string }>(
      'SELECT phone_number FROM user_preferences WHERE phone_number = $1',
      [phoneNumber.slice(1)]
    )
    if (result.rows.length > 0) return phoneNumber.slice(1)
  }
  return phoneNumber
}

/**
 * Get user's persisted language preference. Returns null if not set.
 * Checks user_preferences table (works before wallet creation).
 */
export async function getUserLanguage(phoneNumber: string): Promise<'en' | 'es' | 'pt' | null> {
  try {
    let result = await query<{ preferred_language: string | null }>(
      'SELECT preferred_language FROM user_preferences WHERE phone_number = $1',
      [phoneNumber]
    )
    // Compatibility: fall back to bare-digit format (pre-SH-003 rows)
    if (result.rows.length === 0 && phoneNumber.startsWith('+')) {
      result = await query<{ preferred_language: string | null }>(
        'SELECT preferred_language FROM user_preferences WHERE phone_number = $1',
        [phoneNumber.slice(1)]
      )
    }
    const lang = result.rows[0]?.preferred_language
    if (lang === 'en' || lang === 'es' || lang === 'pt') return lang
    return null
  } catch (error) {
    logger.warn('getUserLanguage failed (falling back to null): %o', error)
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
    // Compatibility: if a bare-digit row exists (pre-SH-003), update it to
    // avoid creating a duplicate +... row alongside the existing row. A
    // duplicate row would cause findUserPrefByPhone to return the new empty
    // canonical row and miss the original verified-email fields.
    const writePhone = await resolveUserPrefsPhone(phoneNumber)
    await query(
      `INSERT INTO user_preferences (phone_number, preferred_language, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone_number)
       DO UPDATE SET preferred_language = EXCLUDED.preferred_language, updated_at = NOW()`,
      [writePhone, lang]
    )
  } catch (error) {
    logger.warn('Failed to persist language (non-blocking): %o', error)
  }
}

// ============================================================================
// Conversation Context
// ============================================================================

export interface ContextMessage {
  role: 'user'
  content: string
}

/**
 * Scrub a message before storing it in conversation_context.
 *
 * Lighter than sanitizePhrase — preserves natural phrasing and numbers for
 * LLM context quality, but removes phone-like sequences which are the main
 * PII risk in non-financial intents (e.g. "help me send to +57...").
 *
 * Returns null if nothing useful remains after scrubbing.
 */
function scrubForContext(text: string): string | null {
  const s = text
    .replace(/\+?\d[\d\s\-().]{6,}\d/g, '[PHONE]') // phone-like sequences only
    .trim()

  if (s.length < 3) return null

  // Only placeholder and whitespace left — not useful as context
  if (s.replace(/\[PHONE\]|\s/g, '').length === 0) return null

  return s.length > 300 ? s.slice(0, 300) : s
}

/**
 * Fetch the last 2 user messages for a phone number.
 * Returns an empty array if no context exists or on error.
 */
export async function getConversationContext(phoneNumber: string): Promise<ContextMessage[]> {
  try {
    let result = await query<{ messages: ContextMessage[] }>(
      'SELECT messages FROM conversation_context WHERE phone_number = $1',
      [phoneNumber]
    )
    // Compatibility: fall back to bare-digit format (pre-SH-003 rows)
    if (result.rows.length === 0 && phoneNumber.startsWith('+')) {
      result = await query<{ messages: ContextMessage[] }>(
        'SELECT messages FROM conversation_context WHERE phone_number = $1',
        [phoneNumber.slice(1)]
      )
    }
    return result.rows[0]?.messages ?? []
  } catch (error) {
    logger.warn('getConversationContext failed (falling back to empty): %o', error)
    return []
  }
}

/**
 * Atomically append a user message to conversation context, keeping only the
 * last 2. Uses a single SQL upsert with JSONB array operations — no
 * read-modify-write cycle, so concurrent inserts for the same phone number
 * cannot lose turns.
 *
 * Content is scrubbed for phone numbers before storage.
 * Returns early (no write) if the scrubbed content is empty.
 *
 * Only call for non-financial intents — the caller in webhook_controller
 * gates on intent, but this function is the last line of defence against
 * phone-bearing utterances that cleared the intent gate.
 *
 * Non-blocking — failures never break the message handling flow.
 */
export async function appendConversationMessage(
  phoneNumber: string,
  content: string
): Promise<void> {
  const safeContent = scrubForContext(content)
  if (!safeContent) return // nothing useful after scrubbing

  const newMessage = JSON.stringify({ role: 'user', content: safeContent })

  try {
    // Atomic append-and-trim: appends the new element to the JSONB array in the
    // same statement that upserts the row, then slices to the last 2 elements.
    // No separate SELECT — avoids the lost-update race under concurrent messages.
    // WITH ORDINALITY assigns a stable 1-based position to each element.
    // The inner query picks the 2 highest ordinals (newest 2 after append),
    // and jsonb_agg(val ORDER BY ord) rebuilds the array in ascending order
    // so the stored sequence is deterministically [older, newer].
    await query(
      `INSERT INTO conversation_context (phone_number, messages, updated_at)
       VALUES ($1, jsonb_build_array($2::jsonb), NOW())
       ON CONFLICT (phone_number)
       DO UPDATE SET
         messages = (
           SELECT jsonb_agg(val ORDER BY ord)
           FROM (
             SELECT val, ord
             FROM jsonb_array_elements(
               conversation_context.messages || jsonb_build_array($2::jsonb)
             ) WITH ORDINALITY AS t(val, ord)
             ORDER BY ord DESC
             LIMIT 2
           ) sub
         ),
         updated_at = NOW()`,
      [phoneNumber, newMessage]
    )
  } catch (error) {
    logger.warn('appendConversationMessage failed (non-blocking): %o', error)
  }
}
