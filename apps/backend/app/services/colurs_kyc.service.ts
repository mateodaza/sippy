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
  resolveProfileDocumentTypeId,
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
  | 'rejected'

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
 * Step 1: Register user on Colurs (FULL KYC PATH).
 * Creates their /user/ account with basic info and derives a managed password.
 * Used for the upgrade path when a quick-flow user trips the monthly cap.
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
 * Quick-flow alternative to kycRegister.
 *
 * Per Colurs: natural persons making small-amount onramps don't require
 * full KYC. We skip POST /user/ + OTPs + doc upload entirely and just
 * create the R2P counterparty so the user can immediately generate
 * payment links.
 *
 * Discriminator: colurs_user_id stays NULL. The /initiate gate uses that
 * to apply the monthly USD cap. Once the user trips the cap, kycRegister
 * (above) is invoked to fill in colurs_user_id and lift the cap.
 *
 * State after this call: { kycStatus: 'approved', kycLevel: 5,
 *                          counterparty_id: cp_xxx, colurs_user_id: NULL }
 */
export async function kycQuickRegister(opts: {
  phoneNumber: string
  email: string
  fullname: string
  idType: IdType
  idNumber: string
}): Promise<string> {
  logger.info(`colurs_kyc: quick-register for ${maskPhone(opts.phoneNumber)}`)

  const cp = await createCounterparty({
    phoneNumber: opts.phoneNumber,
    fullname: opts.fullname,
    idType: opts.idType,
    idNumber: opts.idNumber,
    email: opts.email,
  })

  // kyc_level = 0 (NOT 5): the user is "approved" for the quick-flow gate
  // (counterparty + status='approved' is enough), but the monthly cap still
  // applies until they complete real Colurs KYC review (which sets level to 5
  // via kycRefreshLevel). This is the correct discriminator for the cap —
  // colurs_user_id alone is too weak because it gets set when upgrade kicks
  // off, before any actual verification has happened.
  await upsertKyc(opts.phoneNumber, {
    fullname: opts.fullname,
    idType: opts.idType,
    idNumber: opts.idNumber,
    email: opts.email,
    counterpartyId: cp.id,
    kycLevel: 0,
    kycStatus: 'approved',
  })

  logger.info(
    `colurs_kyc: quick-register complete for ${maskPhone(opts.phoneNumber)} — cp=${cp.id}`
  )
  return cp.id
}

/**
 * Escape hatch for users mid-full-KYC who don't want to wait for Colurs's
 * compliance review. Uses the identity already on the colurs_kyc row to
 * create a counterparty (if not present) and bumps the row to quick-flow
 * approved state. Subject to the same monthly cap as fresh quick-flow users.
 *
 * Idempotent: returns the existing counterparty_id if one is already set.
 *
 * Throws 'MISSING_IDENTITY' if the row doesn't have enough data — caller
 * should ask the user to register from scratch.
 */
export async function kycUseQuickFlow(opts: { phoneNumber: string }): Promise<string> {
  const kyc = await getKyc(opts.phoneNumber)
  if (!kyc?.fullname || !kyc.idType || !kyc.idNumber || !kyc.email) {
    const err = new Error('Identity data missing on colurs_kyc row') as Error & { code?: string }
    err.code = 'MISSING_IDENTITY'
    throw err
  }

  let counterpartyId = kyc.counterpartyId
  if (!counterpartyId) {
    const cp = await createCounterparty({
      phoneNumber: opts.phoneNumber,
      fullname: kyc.fullname,
      idType: kyc.idType,
      idNumber: kyc.idNumber,
      email: kyc.email,
    })
    counterpartyId = cp.id
  }

  // Don't pass kycLevel — preserve whatever the row has. Mid-full-KYC rows
  // are at level 0 (correct for cap); already-approved rows would be at 5
  // (preserved, no cap).
  await upsertKyc(opts.phoneNumber, {
    counterpartyId,
    kycStatus: 'approved',
  })

  logger.info(
    `colurs_kyc: switched to quick-flow for ${maskPhone(opts.phoneNumber)} — cp=${counterpartyId}`
  )
  return counterpartyId
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
 * Step 4: Upload identity documents and submit for KYC review.
 *
 * Colombia CC requires BOTH front and back of the national ID. We upload each
 * to S3 via /base/upload_file/, resolve each doc type's numeric id via
 * /type_documents/, and submit both to /profile_documents/ in a single call.
 *
 * After submission the user waits for Colurs compliance review (async).
 */
export async function kycSubmitDocument(opts: {
  phoneNumber: string
  frontBase64: string
  frontMimeType: 'image/jpeg' | 'image/png'
  backBase64: string
  backMimeType: 'image/jpeg' | 'image/png'
}): Promise<void> {
  const kyc = await getKyc(opts.phoneNumber)
  if (!kyc?.email || !kyc.idType) throw new Error('KYC record not found')

  const tokens = await loginColursUser({ phoneNumber: opts.phoneNumber, email: kyc.email })

  // Colurs code names for the CC front/back photos. The Postman's example used
  // `national_id_front` but the real /type_documents/ catalog exposes these as
  // `doc_identification_*`. Discovered at runtime from the "Available:" list in
  // resolveProfileDocumentTypeId's error message.
  const FRONT_CODE = 'doc_identification_front'
  const BACK_CODE = 'doc_identification_back'

  // Resolve the TypeDocumentProfile.id for each code in parallel.
  const [frontTypeId, backTypeId] = await Promise.all([
    resolveProfileDocumentTypeId(FRONT_CODE),
    resolveProfileDocumentTypeId(BACK_CODE),
  ])

  // Upload each side of the CC to Colurs's S3.
  const [frontUrl, backUrl] = await Promise.all([
    uploadColursDocument(tokens.access, opts.frontBase64, opts.frontMimeType, FRONT_CODE),
    uploadColursDocument(tokens.access, opts.backBase64, opts.backMimeType, BACK_CODE),
  ])

  await submitColursProfileDocuments(tokens.access, [
    { id: frontTypeId, url: frontUrl },
    { id: backTypeId, url: backUrl },
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
  } else if (level === 2) {
    // Colurs mapped "rejected" → level 2 (see getColursKycLevel).
    // Surface it so the frontend can route the user back to the document step.
    status = 'rejected'
    logger.info(`colurs_kyc: documents rejected for ${maskPhone(phoneNumber)} — requires resubmit`)
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
