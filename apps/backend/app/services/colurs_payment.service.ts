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
import { colursHeaders } from '#services/colurs_auth.service'
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
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseUrl(): string {
  return env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
}

function logColursError(path: string, status: number, body: string): void {
  let errorKeys: string | undefined
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    errorKeys = Object.keys(parsed).join(', ')
  } catch {
    /* non-JSON body — omit */
  }
  logger.warn({ path, status, errorKeys }, 'colurs_payment: request failed')
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
    throw new Error(`Colurs ${path} failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

// ── Counterparty ─────────────────────────────────────────────────────────────

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
  logger.info(`colurs_payment: creating counterparty for ${maskPhone(opts.phoneNumber)}`)
  return colursPost<ColursCounterparty>('/api/reload/r2p/counterparty/', {
    fullname: opts.fullname,
    id_type: opts.idType.toLowerCase(), // Colurs expects lowercase: cc, ce, nit, pa
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
    redirect_url: `${env.get('FRONTEND_URL', 'https://app.sippy.lat')}/onramp/success`,
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
    redirect_url: `${env.get('FRONTEND_URL', 'https://app.sippy.lat')}/onramp/success`,
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
    redirect_url: `${env.get('FRONTEND_URL', 'https://app.sippy.lat')}/onramp/success`,
    fee_mode: 'payer',
  })
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
