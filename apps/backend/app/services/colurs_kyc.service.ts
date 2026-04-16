/**
 * Colurs KYC Service
 *
 * Thin orchestration layer over colurs_user.service.ts.
 * Manages the colurs_kyc DB table and drives users through the Colurs
 * registration + verification + KYC flow.
 *
 * kyc_status state machine:
 *   unregistered → registered → phone_verified → email_verified
 *   → documents_submitted → approved
 *
 * counterparty_id is created once Level 5 is reached and reused for all
 * subsequent R2P onramp payments.
 */

import logger from '@adonisjs/core/services/logger'
import ColursKyc from '#models/colurs_kyc'
import { maskPhone } from '#utils/phone'
import {
  registerColursUser,
  loginColursUser,
  requestColursOtp,
  verifyColursPhone,
  verifyColursEmail,
  uploadColursDocument,
  submitColursProfileDocuments,
  idTypeToDocumentTypeId,
  getColursKycLevel,
} from '#services/colurs_user.service'
import { createCounterparty } from '#services/colurs_payment.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type KycStatus =
  | 'unregistered'
  | 'registered'
  | 'phone_verified'
  | 'email_verified'
  | 'documents_submitted'
  | 'approved'

export type IdType = 'CC' | 'CE' | 'NIT' | 'PA'

export interface KycRecord {
  phoneNumber: string
  fullname: string | null
  idType: IdType | null
  idNumber: string | null
  email: string | null
  colursUserId: number | null
  counterpartyId: string | null
  kycLevel: number
  kycStatus: KycStatus
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function getKyc(phoneNumber: string): Promise<KycRecord | null> {
  const row = await ColursKyc.find(phoneNumber)
  if (!row) return null
  return {
    phoneNumber: row.phoneNumber,
    fullname: row.fullname,
    idType: row.idType as IdType | null,
    idNumber: row.idNumber,
    email: row.email,
    colursUserId: row.colursUserId,
    counterpartyId: row.counterpartyId,
    kycLevel: row.kycLevel,
    kycStatus: row.kycStatus as KycStatus,
  }
}

async function upsertKyc(
  phoneNumber: string,
  fields: Partial<{
    fullname: string
    idType: string
    idNumber: string
    email: string
    colursUserId: number
    counterpartyId: string
    kycLevel: number
    kycStatus: KycStatus
  }>
): Promise<void> {
  const values: Partial<InstanceType<typeof ColursKyc>> = {}
  if (fields.fullname !== undefined) values.fullname = fields.fullname
  if (fields.idType !== undefined) values.idType = fields.idType
  if (fields.idNumber !== undefined) values.idNumber = fields.idNumber
  if (fields.email !== undefined) values.email = fields.email
  if (fields.colursUserId !== undefined) values.colursUserId = fields.colursUserId
  if (fields.counterpartyId !== undefined) values.counterpartyId = fields.counterpartyId
  if (fields.kycLevel !== undefined) values.kycLevel = fields.kycLevel
  if (fields.kycStatus !== undefined) values.kycStatus = fields.kycStatus

  await ColursKyc.updateOrCreate({ phoneNumber }, values)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Step 1: Register user on Colurs.
 * Creates their account with basic info and derives a managed password.
 */
export async function kycRegister(opts: {
  phoneNumber: string
  email: string
  fullname: string
  idType: IdType
  idNumber: string
}): Promise<void> {
  const colursUserId = await registerColursUser(opts)
  await upsertKyc(opts.phoneNumber, {
    fullname: opts.fullname,
    idType: opts.idType,
    idNumber: opts.idNumber,
    email: opts.email,
    colursUserId,
    kycStatus: 'registered',
  })
}

/**
 * Step 2 / 3: Request OTP.
 * Colurs sends a 6-digit code to the user's phone or email.
 */
export async function kycRequestOtp(phoneNumber: string, type: 'phone' | 'email'): Promise<void> {
  const kyc = await getKyc(phoneNumber)
  if (!kyc?.email) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber, email: kyc.email })
  await requestColursOtp(tokens.access, type)
}

/**
 * Step 2: Verify phone OTP.
 */
export async function kycVerifyPhone(phoneNumber: string, code: string): Promise<void> {
  const kyc = await getKyc(phoneNumber)
  if (!kyc?.email) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber, email: kyc.email })
  await verifyColursPhone(tokens.access, code)
  await upsertKyc(phoneNumber, { kycStatus: 'phone_verified' })
  logger.info(`colurs_kyc: phone verified for ${maskPhone(phoneNumber)}`)
}

/**
 * Step 3: Verify email OTP.
 */
export async function kycVerifyEmail(phoneNumber: string, code: string): Promise<void> {
  const kyc = await getKyc(phoneNumber)
  if (!kyc?.email) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber, email: kyc.email })
  await verifyColursEmail(tokens.access, code)
  await upsertKyc(phoneNumber, { kycStatus: 'email_verified' })
  logger.info(`colurs_kyc: email verified for ${maskPhone(phoneNumber)}`)
}

/**
 * Step 4: Upload identity document and submit for KYC review.
 * fileBase64: base64-encoded document image (front of ID).
 * After submission the user waits for Colurs compliance review (async).
 */
export async function kycSubmitDocument(opts: {
  phoneNumber: string
  fileBase64: string
  mimeType: 'image/jpeg' | 'image/png'
}): Promise<void> {
  const kyc = await getKyc(opts.phoneNumber)
  if (!kyc?.email || !kyc.idType) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber: opts.phoneNumber, email: kyc.email })

  const docTypeId = idTypeToDocumentTypeId(kyc.idType)
  const codeName = 'national_id_front'

  const url = await uploadColursDocument(tokens.access, opts.fileBase64, opts.mimeType, codeName)

  await submitColursProfileDocuments(tokens.access, [
    { code_name: codeName, url, type_document_id: docTypeId },
  ])

  await upsertKyc(opts.phoneNumber, { kycStatus: 'documents_submitted' })
  logger.info(`colurs_kyc: documents submitted for ${maskPhone(opts.phoneNumber)}, awaiting review`)
}

/**
 * Refresh KYC level from Colurs and update DB.
 * Called by the frontend to poll for Level 5 approval after document submission.
 * When Level 5 is reached, also creates the R2P counterparty for future onramps.
 */
export async function kycRefreshLevel(
  phoneNumber: string
): Promise<{ level: number; status: KycStatus; counterpartyId: string | null }> {
  const kyc = await getKyc(phoneNumber)
  if (!kyc?.email) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber, email: kyc.email })
  const level = await getColursKycLevel(tokens.access)

  let status = kyc.kycStatus
  let counterpartyId = kyc.counterpartyId

  if (level >= 5) {
    if (status !== 'approved') {
      status = 'approved'
    }

    // Create R2P counterparty if not yet present.
    // Retried on every kycRefreshLevel call until it succeeds — handles the case
    // where the first attempt failed silently (status already 'approved' but
    // counterpartyId is null because the previous createCounterparty call threw).
    if (!counterpartyId && kyc.fullname && kyc.idType && kyc.idNumber) {
      try {
        const cp = await createCounterparty({
          phoneNumber,
          fullname: kyc.fullname,
          idType: kyc.idType,
          idNumber: kyc.idNumber,
          email: kyc.email,
        })
        counterpartyId = cp.id
        logger.info(`colurs_kyc: counterparty created on Level 5 — ${counterpartyId}`)
      } catch (err) {
        logger.error(
          { err },
          `colurs_kyc: counterparty creation failed for ${maskPhone(phoneNumber)}`
        )
      }
    }
  }

  await upsertKyc(phoneNumber, {
    kycLevel: level,
    kycStatus: status,
    counterpartyId: counterpartyId ?? undefined,
  })
  return { level, status, counterpartyId: counterpartyId ?? null }
}

/** Returns the stored counterparty_id, or null if not yet approved. */
export async function getCounterpartyId(phoneNumber: string): Promise<string | null> {
  const kyc = await getKyc(phoneNumber)
  return kyc?.counterpartyId ?? null
}
