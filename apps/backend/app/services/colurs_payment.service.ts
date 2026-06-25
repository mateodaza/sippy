/**
 * Colurs Payment Service
 *
 * Handles onramp payment initiation via Colurs R2P (Request-to-Pay) rails.
 * Supports PSE, Nequi, and Bancolombia.
 *
 * Important UX difference per Colurs docs:
 *   PSE / Bancolombia — return payment_link; user completes on Colurs-hosted page
 *   Nequi            — payment_link is always null; user pays from the Nequi app
 *                      using tracking_key to find the pending charge
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { colursGet, colursPost } from '#services/colurs_http.service'
import { maskPhone } from '#utils/phone'

// ── Types ────────────────────────────────────────────────────────────────────

export type OnrampMethod = 'pse' | 'nequi' | 'bancolombia'

export interface ColursCounterparty {
  id: string
  [key: string]: unknown
}

export interface ColursPaymentResponse {
  money_movement_id: string
  /** null for Nequi — user pays from the Nequi app */
  payment_link: string | null
  tracking_key: string
  status: string
  fee_breakdown: Record<string, unknown>
}

export interface InitiatePaymentParams {
  counterpartyId: string
  amountCop: number
  externalId: string
  /** PSE only — bank institution code */
  financialInstitutionCode?: string
  /**
   * Internal Sippy order id — appended to redirect_url so the success page
   * can poll status by orderId without depending on Colurs's `transferCode` param.
   */
  orderId?: string
}

/**
 * Build the redirect URL Colurs will send the user to after payment.
 * Includes our internal orderId so the success page can poll status.
 */
function buildRedirectUrl(orderId?: string): string {
  const base = env.get('FRONTEND_URL', 'https://www.sippy.lat')
  const url = `${base}/onramp`
  return orderId ? `${url}?orderId=${encodeURIComponent(orderId)}` : url
}

// ── Counterparty ─────────────────────────────────────────────────────────────

/**
 * Maps Sippy internal id_type codes to the counterparty `id_type` enum
 * accepted by POST /api/reload/r2p/counterparty/. Per Colurs Recargas y Retiros
 * Postman: valid values are "cc", "ce", "nit", "passport". Note Sippy's "PA"
 * must become "passport" (not "pa") — that was the previous bug.
 */
const COUNTERPARTY_ID_TYPE_MAP: Record<string, string> = {
  CC: 'cc',
  CE: 'ce',
  NIT: 'nit',
  PA: 'passport',
}

/**
 * Creates a Colurs payer counterparty for the user.
 * Requires full KYC data — see colurs_kyc.service.ts for the public API.
 * In the normal onramp flow this is called via saveKycAndCreateCounterparty().
 */
export async function createCounterparty(opts: {
  phoneNumber: string
  fullname: string
  idType: string
  idNumber: string
  email: string
}): Promise<ColursCounterparty> {
  const idType = COUNTERPARTY_ID_TYPE_MAP[opts.idType.toUpperCase()]
  if (!idType) {
    throw new Error(`Unsupported id_type "${opts.idType}" for counterparty creation`)
  }
  logger.info(`colurs_payment: creating counterparty for ${maskPhone(opts.phoneNumber)}`)
  return colursPost<ColursCounterparty>('/api/reload/r2p/counterparty/', {
    fullname: opts.fullname,
    id_type: idType,
    id_number: opts.idNumber,
    phone: opts.phoneNumber,
    email: opts.email,
  })
}

// ── PSE ──────────────────────────────────────────────────────────────────────

/**
 * Initiates a PSE (Colombian bank transfer) payment.
 * Returns a payment_link the user visits to complete payment.
 */
export async function initiatePSE(params: InitiatePaymentParams): Promise<ColursPaymentResponse> {
  if (!params.financialInstitutionCode) {
    throw new Error('initiatePSE requires financialInstitutionCode')
  }

  logger.info(`colurs_payment: initiating PSE for external_id=${params.externalId}`)
  return colursPost<ColursPaymentResponse>('/api/reload/r2p/pse/', {
    counterparty_id: params.counterpartyId,
    amount_cop: params.amountCop,
    external_id: params.externalId,
    description_to_payer: 'Fondear Sippy',
    description_to_payee: 'Recarga usuario',
    redirect_url: buildRedirectUrl(params.orderId),
    financial_institution_code: params.financialInstitutionCode,
    fee_mode: 'payer',
  })
}

// ── Nequi ────────────────────────────────────────────────────────────────────

/**
 * Initiates a Nequi payment.
 * payment_link will be null — the user approves from the Nequi app using tracking_key.
 */
export async function initiateNequi(params: InitiatePaymentParams): Promise<ColursPaymentResponse> {
  logger.info(`colurs_payment: initiating Nequi for external_id=${params.externalId}`)
  return colursPost<ColursPaymentResponse>('/api/reload/r2p/nequi/', {
    counterparty_id: params.counterpartyId,
    amount: params.amountCop, // Colurs field is `amount` (not `amount_cop`) for Nequi
    external_id: params.externalId,
    description_to_payer: 'Fondear Sippy',
    description_to_payee: 'Recarga usuario',
    redirect_url: buildRedirectUrl(params.orderId),
    fee_mode: 'payer',
  })
}

// ── Bancolombia ──────────────────────────────────────────────────────────────

/**
 * Initiates a Bancolombia button payment.
 * Returns a payment_link the user visits to complete payment.
 */
export async function initiateBancolombia(
  params: InitiatePaymentParams
): Promise<ColursPaymentResponse> {
  logger.info(`colurs_payment: initiating Bancolombia for external_id=${params.externalId}`)
  return colursPost<ColursPaymentResponse>('/api/reload/r2p/bancolombia/', {
    counterparty_id: params.counterpartyId,
    amount: params.amountCop, // Colurs field is `amount` (not `amount_cop`) for Bancolombia
    external_id: params.externalId,
    description_to_payer: 'Fondear Sippy',
    description_to_payee: 'Recarga usuario',
    redirect_url: buildRedirectUrl(params.orderId),
    fee_mode: 'payer',
  })
}

// ── Payment status ────────────────────────────────────────────────────────────

export interface ColursPaymentStatus {
  money_movement_id: string
  status:
    | 'initiated'
    | 'pending'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'expired'
    | 'canceled'
    | 'returned'
    | string
  /** Machine-readable short code, e.g. "PAYMENT_COMPLETED", "PAYMENT_PENDING". */
  status_code?: string
  /** Human-readable reason string, useful for debugging failures. */
  status_description?: string
  tracking_key?: string
  [key: string]: unknown
}

/**
 * Poll the status of an R2P payment (PSE / Nequi / Bancolombia).
 * Status progression: initiated → pending → processing → succeeded / failed / expired
 *
 * Uses the public preview endpoint — same payload as /status/ but reliable on
 * Colurs's side (the legacy /status/ endpoint has been returning 500s).
 */
export async function getPaymentPreview(moneyMovementId: string): Promise<ColursPaymentStatus> {
  return colursGet<ColursPaymentStatus>(`/api/reload/r2p/preview/${moneyMovementId}/`)
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Unified entry point — picks the right initiation call based on method.
 */
export async function initiatePayment(
  method: OnrampMethod,
  params: InitiatePaymentParams
): Promise<ColursPaymentResponse> {
  switch (method) {
    case 'pse':
      return initiatePSE(params)
    case 'nequi':
      return initiateNequi(params)
    case 'bancolombia':
      return initiateBancolombia(params)
  }
}
