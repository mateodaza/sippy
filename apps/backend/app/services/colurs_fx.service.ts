/**
 * Colurs FX Service
 *
 * Handles the USD → COP foreign exchange flow for offramp.
 *
 * Flow:
 *   1. createQuote()      — get a rate + COP amount (valid ~3 minutes)
 *   2. getQuote()         — re-fetch quote by ID to verify it's still valid before initiating
 *   3. initiateExchange() — lock the rate; user sends USDT to Colurs wallet
 *   4. executeExchange()  — required: processes the movement internally
 *   5. [automatic]        — Colurs disperses COP to the registered bank account
 *   6. pollColursMovements() polls GET /v2/exchange/movements/{uuid}/ until completed/failed
 *
 * Minimum offramp: $50 USD (enforced by Colurs — reject below that in the controller).
 *
 * Note on off_market:
 *   Not set here → defaults to false (operates Mon–Fri market hours only).
 *   Set off_market=true (requires Colurs enablement) for 24/7 operation.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { colursHeaders } from '#services/colurs_auth.service'

function logColursError(path: string, status: number, body: string): void {
  let errorKeys: string | undefined
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    errorKeys = Object.keys(parsed).join(', ')
  } catch {
    /* non-JSON body — omit */
  }
  logger.warn({ path, status, errorKeys }, 'colurs_fx: request failed')
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColursQuote {
  id: string
  /** Colurs returns fx_rate in the quote response. rate is kept as fallback. */
  fx_rate?: number
  rate?: number
  source_amount: number
  destination_amount: number
  currency_pair: string
  status: 'valid' | 'expired' | string
  is_valid?: boolean
  expires_at?: string
  valid_until?: string
}

/** Extract the exchange rate from a quote, handling both field name variants. */
export function getQuoteRate(quote: ColursQuote): number {
  return quote.fx_rate ?? quote.rate ?? 0
}

export interface ColursMovement {
  sale_crypto_id: string
  quote_id: string
  status: string
}

export interface ColursBalance {
  balance: number
  balance_usd: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseUrl(): string {
  return env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
}

async function colursGet<T>(path: string): Promise<T> {
  const headers = await colursHeaders()
  const res = await fetch(`${baseUrl()}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    logColursError(path, res.status, text)
    throw new Error(`Colurs GET ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

async function colursPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers = await colursHeaders()
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    logColursError(path, res.status, text)
    throw new Error(`Colurs POST ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ── FX Quote ─────────────────────────────────────────────────────────────────

/**
 * Request a USD → COP FX quote.
 * Quote is valid for ~3 minutes. Call initiateExchange() before it expires.
 *
 * @param sourceAmountUsd - Amount in USD to convert (minimum $50)
 */
export async function createQuote(sourceAmountUsd: number): Promise<ColursQuote> {
  logger.info(`colurs_fx: requesting quote for $${sourceAmountUsd} USD → COP`)
  return colursPost<ColursQuote>('/v2/exchange/quotes/', {
    currency_pair: 'usd/cop',
    source_amount: sourceAmountUsd,
    type: 'source_amount', // spec values: 'source_amount' | 'destination_amount'
  })
}

/**
 * Fetch an existing quote by ID.
 * Use this to verify the quote is still valid before initiating.
 */
export async function getQuote(quoteId: string): Promise<ColursQuote> {
  return colursGet<ColursQuote>(`/v2/exchange/quotes/${quoteId}/`)
}

// ── Exchange Initiation ───────────────────────────────────────────────────────

/**
 * Initiate the FX movement.
 * Locks the rate from the quote and triggers automatic COP bank payout
 * to the registered bank account when Colurs completes processing.
 *
 * @param quoteId         - Valid quote UUID (must not be expired)
 * @param bankAccountId   - Colurs third-party bank account ID (from registration)
 * @param externalId      - Sippy correlation ID (stored in offramp_orders.external_id)
 */
export async function initiateExchange(
  quoteId: string,
  bankAccountId: number,
  externalId: string
): Promise<ColursMovement> {
  logger.info(
    `colurs_fx: initiating exchange quote=${quoteId} bank=${bankAccountId} ext=${externalId}`
  )

  return colursPost<ColursMovement>('/v2/exchange/initiate/', {
    quote_id: quoteId,
    bank_account_id: bankAccountId,
    external_id: externalId,
  })
}

// ── Execute ───────────────────────────────────────────────────────────────────

/**
 * Execute the FX movement. Required after initiateExchange() — do not skip.
 * Confirmed by Colurs: uses sales_crypto_id (with 's') from the initiate response.
 */
export async function executeExchange(saleCryptoId: string): Promise<unknown> {
  logger.info(`colurs_fx: executing movement for sale_crypto_id=${saleCryptoId}`)
  return colursPost<unknown>('/v2/exchange/execute/', {
    sales_crypto_id: saleCryptoId,
  })
}

// ── Movement status ───────────────────────────────────────────────────────────

export interface ColursMovementStatus {
  sale_crypto_id: string
  quote_id: string
  status: 'initiated' | 'processing' | 'completed' | 'failed' | 'rejected' | string
}

/**
 * Fetch current status of an exchange movement.
 * Used by the polling job — status progression: initiated → processing → completed / failed / rejected
 */
export async function getMovement(saleCryptoId: string): Promise<ColursMovementStatus> {
  return colursGet<ColursMovementStatus>(`/v2/exchange/movements/${saleCryptoId}/`)
}

// ── Balance ───────────────────────────────────────────────────────────────────

/**
 * Fetch Sippy's USD balance in Colurs.
 * Used for pre-flight checks (ensure prefunded balance covers the offramp)
 * and treasury monitoring (alert ops when balance drops below threshold).
 *
 * Returns the USD amount as a number (parsed from the balance string).
 * Returns 0 if no USD entry is present.
 */
export async function getUsdBalance(): Promise<number> {
  const data = await colursGet<ColursBalance>('/balance/?currency=USD')
  return data.balance ?? 0
}
