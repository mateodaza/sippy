/**
 * Colurs User Service
 *
 * Manages end-user Colurs accounts on behalf of Sippy users.
 * Each Sippy user who wants to onramp gets a corresponding Colurs account
 * that goes through the full KYC flow (registration → phone OTP → email OTP
 * → document upload → Level 5 approval).
 *
 * Why: Colombian financial law requires KYC for fiat transactions.
 * Colurs (the licensed entity) handles document review and compliance.
 *
 * Password strategy: per-user passwords are derived from COLURS_USER_PASSWORD_SECRET
 * using HMAC-SHA256(secret, phoneNumber) → base64url, 32 chars. Never stored.
 *
 * Token strategy: user access tokens are short-lived (15 min). We log in fresh
 * each time they're needed for a KYC step. Refresh tokens are not stored —
 * we always re-login to avoid token management complexity.
 *
 * All functions throw on failure — callers must catch and map to HTTP responses.
 */

import { createHmac } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { apiKey, baseUrl, logColursError, userGet, userPost } from '#services/colurs_http.service'
import { maskPhone } from '#utils/phone'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColursUserTokens {
  access: string
  refresh: string
}

export interface ColursUserProfile {
  id: number
  level: number
  email_verified: boolean
  phone_verified: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a deterministic password for a Sippy user's Colurs account. */
export function deriveColursPassword(phoneNumber: string): string {
  const secret = env.get('COLURS_USER_PASSWORD_SECRET', '')
  if (!secret) throw new Error('COLURS_USER_PASSWORD_SECRET is not configured')
  return createHmac('sha256', secret).update(phoneNumber).digest('base64url').slice(0, 32)
}

/**
 * Colurs document type IDs (per Colurs support, 2026-04-17):
 *   0 = CC   — Cédula de ciudadanía
 *   1 = CE   — Cédula de extranjería
 *   2 = TI   — Tarjeta de identidad
 *   3 = NIT  — Número de identificación tributaria
 *   4 = PSP  — Pasaporte
 *   5 = PPT  — Permiso de protección temporal
 *   6 = PEP  — Permiso especial de permanencia
 *
 * Note: Colurs's public docs previously suggested string values like "CC"/"CE"/"PASSPORT".
 * That was wrong — the API accepts numeric strings ("0".."6") on /user/ and numeric ints on
 * /profile_documents/ (`type_document_id`). Sippy's internal id_type ("CC"/"CE"/"NIT"/"PA")
 * maps to Colurs IDs via the table below.
 */
const SIPPY_TO_COLURS_DOC_ID: Record<string, number> = {
  CC: 0,
  CE: 1,
  NIT: 3,
  PA: 4, // Sippy "PA" (passport) → Colurs "PSP"
}

function colursDocId(idType: string): number {
  const id = SIPPY_TO_COLURS_DOC_ID[idType.toUpperCase()]
  if (id === undefined) throw new Error(`Unknown Sippy id_type "${idType}" — no Colurs mapping`)
  return id
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new Colurs user account for a Sippy user.
 * Returns the Colurs numeric user ID.
 */
export async function registerColursUser(opts: {
  phoneNumber: string
  email: string
  fullname: string
  idType: string
  idNumber: string
}): Promise<number> {
  const { phoneNumber, email, fullname, idType, idNumber } = opts

  // Strip leading + and country code for Colurs (they want local number + country_code separately)
  // e.g. +573001234567 → phone: "3001234567", country_code: "57"
  const e164 = phoneNumber.replace(/^\+/, '')
  const countryCode = e164.slice(0, 2) // assume Colombia +57
  const localPhone = e164.slice(2)

  const [firstName, ...rest] = fullname.trim().split(' ')
  const lastName = rest.join(' ') || firstName

  const password = deriveColursPassword(phoneNumber)

  logger.info(`colurs_user: registering ${maskPhone(phoneNumber)} on Colurs`)

  const res = await userPost<{
    id: number
    username: string
    email: string
  }>('/user/', {
    username: email,
    email,
    password,
    phone: localPhone,
    country_code: countryCode,
    first_name: firstName,
    last_name: lastName,
    // Per Colurs support (2026-04-17): document_type on /user/ is a numeric STRING
    // matching their internal enum (CC=0, CE=1, TI=2, NIT=3, PSP=4, PPT=5, PEP=6).
    // Public docs saying "CC"/"CE"/"PASSPORT" were incorrect.
    // /api/reload/r2p/counterparty/ still uses its own lowercase `id_type` ("cc"/"ce"/"nit").
    document_type: String(colursDocId(idType)),
    document_number: idNumber,
    type_person: 1, // NATURAL
    // /user/ only accepts APP or PANEL (login /token/ still accepts API).
    platform: 'APP',
    country: 'CO',
  })

  logger.info(`colurs_user: registered id=${res.id} for ${maskPhone(phoneNumber)}`)
  return res.id
}

// ── Login as user ─────────────────────────────────────────────────────────────

/** Log in as a Sippy user's Colurs account and return the access token. */
export async function loginColursUser(opts: {
  phoneNumber: string
  email: string
}): Promise<ColursUserTokens> {
  const password = deriveColursPassword(opts.phoneNumber)

  const res = await userPost<ColursUserTokens>('/token/', {
    username: opts.email,
    password,
    platform: 'API',
  })

  if (!res.access) throw new Error('Colurs login returned no access token')
  return res
}

// ── OTP ───────────────────────────────────────────────────────────────────────

/** Request a phone or email verification OTP from Colurs. */
export async function requestColursOtp(userToken: string, type: 'phone' | 'email'): Promise<void> {
  await userPost<unknown>(
    '/request_confirmation/',
    { phone: type === 'phone', email: type === 'email' },
    userToken
  )
  logger.info(`colurs_user: OTP requested for ${type}`)
}

/** Verify the phone OTP sent by Colurs. */
export async function verifyColursPhone(userToken: string, code: string): Promise<void> {
  await userPost<unknown>('/verify_phone/', { code, by_phone: true }, userToken)
  logger.info('colurs_user: phone verified')
}

/** Verify the email OTP sent by Colurs. */
export async function verifyColursEmail(userToken: string, code: string): Promise<void> {
  await userPost<unknown>('/verify_email/', { code, by_phone: false }, userToken)
  logger.info('colurs_user: email verified')
}

// ── Document upload ───────────────────────────────────────────────────────────

/**
 * Upload a document image to Colurs and return the file URL.
 * fileBase64: base64-encoded image (JPEG or PNG)
 * codeName: e.g. "national_id_front", "national_id_back", "selfie"
 */
export async function uploadColursDocument(
  userToken: string,
  fileBase64: string,
  mimeType: 'image/jpeg' | 'image/png',
  codeName: string
): Promise<string> {
  // Colurs expects multipart/form-data for file upload
  const blob = Buffer.from(fileBase64, 'base64')
  const formData = new FormData()
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const fileName = `${codeName}.${ext}`

  formData.append('file', new Blob([blob], { type: mimeType }), fileName)
  // Per docs, file_type is a category string ("documents"), not the MIME type.
  formData.append('file_type', 'documents')
  formData.append('file_name', fileName)
  // TODO(colurs): docs list a required `sign` FormData field ("Security signature")
  // but don't specify how to compute it. Uploads may fail until we get clarification
  // from Colurs on whether this is HMAC of file bytes, a timestamp, or something else.
  // formData.append('sign', ???)

  const res = await fetch(`${baseUrl()}/base/upload_file/`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'Authorization': `Bearer ${userToken}`,
      // Note: do NOT set Content-Type — fetch sets it automatically with boundary for FormData
    },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    logColursError('/base/upload_file/', res.status, text)
    throw new Error(`Colurs upload_file failed (${res.status})`)
  }

  const data = (await res.json()) as { url?: string; file_url?: string }
  const url = data.url ?? data.file_url
  if (!url) throw new Error('Colurs upload_file returned no URL')

  logger.info(`colurs_user: document uploaded — codeName=${codeName}`) // url omitted (sensitive)
  return url
}

/**
 * Submit uploaded documents to the user's Colurs profile for KYC review.
 * documents: array of { code_name, url, type_document_id }
 * type_document_id 1 = national ID (CC), 2 = foreign ID (CE), 3 = passport (PA), etc.
 */
export async function submitColursProfileDocuments(
  userToken: string,
  documents: Array<{ code_name: string; url: string; type_document_id: number }>
): Promise<void> {
  await userPost<unknown>('/profile_documents/', { documents }, userToken)
  logger.info(`colurs_user: ${documents.length} document(s) submitted for review`)
}

/**
 * Map Sippy id_type (CC/CE/NIT/PA) to Colurs `type_document_id` (numeric) for
 * use on POST /profile_documents/. Uses the same Colurs enum as /user/ (see
 * SIPPY_TO_COLURS_DOC_ID above) — previously used a wrong 1-based mapping.
 */
export function idTypeToDocumentTypeId(idType: string): number {
  return colursDocId(idType)
}

// ── KYC level ─────────────────────────────────────────────────────────────────

/** Fetch the user's current Colurs KYC level (0, 1, 2, or 5). */
export async function getColursKycLevel(userToken: string): Promise<number> {
  // Docs: GET /user/ returns the profile with a `level` field.
  // Previously polled /profile_documents/ which returned doc review rows, not level.
  const profile = await userGet<{ level?: number; kyc_level?: number }>('/user/', userToken)
  return profile.level ?? profile.kyc_level ?? 0
}
