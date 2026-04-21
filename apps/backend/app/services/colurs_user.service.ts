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
 * HMAC-SHA1 signature required by POST /base/upload_file/.
 * Per Colurs Postman collection: both HMAC key and message embed the same
 * shared secret + today's date (Bogotá) + the file_type string. Server validates
 * on the same day boundary — Colurs is Colombian, server runs UTC-5.
 * The shared key lives in COLURS_UPLOAD_HASH_KEY so it's not committed.
 */
function uploadHashKey(): string {
  const key = env.get('COLURS_UPLOAD_HASH_KEY', '')
  if (!key) throw new Error('COLURS_UPLOAD_HASH_KEY is not configured')
  return key
}

function bogotaDateYmd(): string {
  // en-CA locale with explicit timeZone gives ISO YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function computeUploadSign(fileType: string): string {
  const key = uploadHashKey()
  const date = bogotaDateYmd()
  const message = `${date}-${key}-${fileType}`
  return createHmac('sha1', key).update(message).digest('hex')
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

  const fileType = 'documents'
  const sign = computeUploadSign(fileType)
  // Field order matches Colurs Postman collection exactly (file, sign, file_type, file_name).
  // Multipart order is semantically insignificant per spec but some strict parsers check it.
  formData.append('file', new Blob([blob], { type: mimeType }), fileName)
  formData.append('sign', sign)
  formData.append('file_type', fileType)
  formData.append('file_name', fileName)

  logger.info(
    { codeName, file_type: fileType, file_name: fileName, bytes: blob.length, mimeType },
    'colurs_user: uploading document'
  )

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
 * Colurs KYC document type metadata returned by GET /type_documents/.
 * `id` is what `/profile_documents/` expects in the `id` field.
 * `code` is the semantic identifier ("national_id_front", "national_id_back", etc.).
 */
export interface ColursTypeDocument {
  id: number
  code: string
  name?: string
}

// Cached — the list rarely changes.
let typeDocumentsCache: ColursTypeDocument[] | null = null

/**
 * Fetch the KYC document type catalog. Each entry's `id` is used as the
 * `id` field in POST /profile_documents/. Per Colurs Postman 2.0 this endpoint
 * requires only x-api-key (no JWT).
 */
export async function getColursTypeDocuments(): Promise<ColursTypeDocument[]> {
  if (typeDocumentsCache) return typeDocumentsCache
  const res = await fetch(`${baseUrl()}/type_documents/`, {
    headers: {
      'x-api-key': apiKey(),
      'Accept': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    logColursError('/type_documents/', res.status, text)
    throw new Error(`Colurs /type_documents/ failed (${res.status})`)
  }
  const body = (await res.json()) as { data?: ColursTypeDocument[] } | ColursTypeDocument[]
  const list: ColursTypeDocument[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
      ? body.data
      : []
  typeDocumentsCache = list
  return list
}

/**
 * Resolve a `code` (e.g. "national_id_front") to the numeric `id` Colurs expects
 * on POST /profile_documents/. Throws if the code isn't present in the catalog.
 */
export async function resolveProfileDocumentTypeId(code: string): Promise<number> {
  const list = await getColursTypeDocuments()
  const match = list.find((t) => t.code === code)
  if (!match) {
    throw new Error(
      `Colurs type_documents: no entry for code="${code}". Available: ${list.map((t) => t.code).join(', ')}`
    )
  }
  return match.id
}

/**
 * Submit uploaded documents to the user's Colurs profile for KYC review.
 * Body shape per Colurs Postman 2.2: `{ documents: [{ id, url }] }`.
 *   - `id`  — TypeDocumentProfile.id from GET /type_documents/ (NOT type_document_id, NOT code_name)
 *   - `url` — exact S3 URL returned by POST /base/upload_file/
 */
export async function submitColursProfileDocuments(
  userToken: string,
  documents: Array<{ id: number; url: string }>
): Promise<void> {
  logger.info(
    { ids: documents.map((d) => d.id), count: documents.length },
    'colurs_user: submitting profile documents'
  )
  await userPost<unknown>('/profile_documents/', { documents }, userToken)
  logger.info(`colurs_user: ${documents.length} document(s) submitted for review`)
}

// ── KYC level / status ───────────────────────────────────────────────────────

/**
 * Colurs KYC status per Postman 2.3 (GET /checkbook-kyc/status/).
 *   pending   — profile exists, docs not yet submitted
 *   submitted — docs uploaded, under compliance review
 *   approved  — KYC approved (Level 5 equivalent — R2P counterparty allowed)
 *   rejected  — docs rejected, user must resubmit
 */
export type ColursKycStatus = 'pending' | 'submitted' | 'approved' | 'rejected'

/**
 * Fetch the user's current KYC level. We read TWO signals and return the max:
 *   - `/checkbook-kyc/status/` — checkbook queue (status string)
 *   - `GET /user/`             — profile's numeric `level`
 * Colurs support has been observed to flip one without the other, so taking
 * the max avoids "approved but our endpoint still says pending" lockouts.
 * Status mapping: approved→5, rejected→2, submitted→1, otherwise 0.
 */
export async function getColursKycLevel(userToken: string): Promise<number> {
  const [checkbookRaw, profileRaw] = await Promise.all([
    userGet<Record<string, unknown>>('/checkbook-kyc/status/', userToken).catch((err) => {
      logger.warn({ err: String(err) }, 'colurs_user: /checkbook-kyc/status/ failed')
      return {} as Record<string, unknown>
    }),
    userGet<Record<string, unknown>>('/user/', userToken).catch((err) => {
      logger.warn({ err: String(err) }, 'colurs_user: GET /user/ failed')
      return {} as Record<string, unknown>
    }),
  ])

  // TEMP full-body debug — Colurs approval not reflecting in either signal.
  // Remove once we've confirmed the correct field names / account.
  logger.info(
    { checkbookRaw, profileKeys: Object.keys(profileRaw), profileRaw },
    'colurs_user: KYC level raw bodies'
  )

  const checkbook = checkbookRaw as { status?: ColursKycStatus; kyc_status?: ColursKycStatus }
  const profile = profileRaw as { level?: number; document_status?: string }
  const status = checkbook.status ?? checkbook.kyc_status
  const fromCheckbook =
    status === 'approved' ? 5 : status === 'rejected' ? 2 : status === 'submitted' ? 1 : 0
  const fromProfile = typeof profile.level === 'number' ? profile.level : 0

  // Sandbox passthrough: Colurs dev confirmed `document_status === "APPROVED"` is
  // enough to initiate onramp, even while profile.level stays at 0 and
  // kyc_approved=false. Gated behind COLURS_KYC_PASSTHROUGH_ALLOWED so production
  // can still require the strict level>=5 path.
  const passthroughAllowed =
    env.get('COLURS_KYC_PASSTHROUGH_ALLOWED', 'false').toLowerCase() === 'true'
  const documentApproved = profile.document_status === 'APPROVED'
  const fromPassthrough = passthroughAllowed && documentApproved ? 5 : 0

  logger.info(
    {
      checkbookStatus: status ?? null,
      profileLevel: profile.level ?? null,
      documentStatus: profile.document_status ?? null,
      passthroughAllowed,
      fromCheckbook,
      fromProfile,
      fromPassthrough,
    },
    'colurs_user: KYC level check'
  )

  return Math.max(fromCheckbook, fromProfile, fromPassthrough)
}
