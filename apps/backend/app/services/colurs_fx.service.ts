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

import logger from '@adonisjs/core/services/logger'
import { colursGet, colursPost } from '#services/colurs_http.service'

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

// ── Onramp dispersion (COP → USDT) ──────────────────────────────────────────
//
// Different shape from offramp:
//   - currency_pair: 'cop/usd' (reversed)
//   - source_amount sent as STRING with cents ("200000.00")
//   - NO `type` field
//   - Skip Initiate entirely — Quote → Execute directly
//   - Execute body uses `quote_uuid`, NOT `sales_crypto_id`
//   - Quote TTL is 1 minute (vs ~3 min for usd/cop)
//   - Minimum 200,000 COP (Colurs enforces; we still attempt below to capture
//     the rejection body for debugging)

export interface ColursOnrampQuoteResponse extends ColursQuote {
  /**
   * Quote UUID — Postman docs reference jsonData.uuid but the actual response
   * has no `uuid` field. The canonical Colurs identifier is `cobre_quote_id`
   * (prefixed `fxq_…`, same pattern as money_movements `mm_…`). Pass that to
   * /v2/exchange/execute/ as `quote_uuid` — NOT the internal `id` UUID.
   */
  uuid?: string
  /** Canonical Colurs quote identifier — `fxq_…`. THIS is what /execute/ wants. */
  cobre_quote_id?: string
}

/** Format a COP amount as the string Colurs expects: integer COP with two-decimal cents. */
function formatCopAmount(amountCop: number): string {
  return amountCop.toFixed(2)
}

/**
 * Request a COP → USD/USDT FX quote.
 * Quote is valid for ~1 minute. Call executeOnrampExchange() immediately.
 *
 * @param amountCop - Amount in COP (integer pesos). Minimum 200,000 enforced by Colurs.
 */
export async function createOnrampQuote(amountCop: number): Promise<ColursOnrampQuoteResponse> {
  const sourceAmount = formatCopAmount(amountCop)
  logger.info(
    `colurs_fx: onramp quote request currency_pair=cop/usd source_amount="${sourceAmount}"`
  )
  return colursPost<ColursOnrampQuoteResponse>('/v2/exchange/quotes/', {
    currency_pair: 'cop/usd',
    source_amount: sourceAmount,
  })
}

export interface ColursOnrampExecuteResponse {
  /** SalesCrypto pk — used by getMovement() to poll status */
  sale_crypto_id?: string | number
  /** Movement id used for /reload/r2p/preview/ lookups */
  id?: string | number
  /** Movement UUID used for /v2/exchange/movements/ lookups */
  uuid?: string
  status?: string
  transaction_hash?: string | null
  [key: string]: unknown
}

/**
 * Execute the COP→USDT exchange using a previously-created quote.
 *
 * Confirmed working body (Colurs support 2026-04-30):
 *   POST /v2/exchange/execute/
 *   { "quote_id": "fxq_…" }   — the cobre_quote_id from the quote response
 *
 * The v1 Postman docs labelled the field `quote_uuid` and the value as
 * `jsonData.uuid` — both wrong. Field is `quote_id`, value is `cobre_quote_id`.
 */
export async function executeOnrampExchange(
  cobreQuoteId: string
): Promise<ColursOnrampExecuteResponse> {
  logger.info(`colurs_fx: onramp execute quote_id=${cobreQuoteId}`)
  return colursPost<ColursOnrampExecuteResponse>('/v2/exchange/execute/', {
    quote_id: cobreQuoteId,
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
