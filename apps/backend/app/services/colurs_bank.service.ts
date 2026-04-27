/**
 * Colurs Bank Service
 *
 * Manages Colombian bank account registration for offramp payouts.
 *
 * How it works:
 *   Sippy (as the Colurs operator) registers third-party bank accounts on behalf
 *   of users via POST /create_third_party_banks/. Each account gets a numeric ID
 *   from Colurs which is stored in colurs_bank_accounts.colurs_id and later
 *   used as bank_account_id in /v2/exchange/initiate/ for offramp payouts.
 *
 * Field type corrections (from Colurs docs):
 *   account_type              — 0 (Savings) or 1 (Checking), NOT a string
 *   account_holder_document_type — numeric int from /base/document_type/
 *   bank_name (API field)     — numeric int from /banks/
 *
 * Account state progression: Created → Enrollment in progress → Registered → Has an issue
 * Accounts are immutable once created — no edit or delete.
 */

import logger from '@adonisjs/core/services/logger'
import { colursGet, colursPost } from '#services/colurs_http.service'
import { maskPhone } from '#utils/phone'
import ColursBankAccountModel from '#models/colurs_bank_account'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColursBank {
  id: number
  name: string
  [key: string]: unknown
}

export interface ColursDocumentType {
  id: number
  name: string // e.g. "CC", "CE", "NIT", "TI", "PPT"
  [key: string]: unknown
}

export interface RegisterBankAccountParams {
  phoneNumber: string
  holderName: string
  /** Display code: CC | CE | NIT | TI | PPT */
  documentType: string
  documentNumber: string
  accountNumber: string
  /** Display: savings | checking */
  accountType: 'savings' | 'checking'
  /** Numeric bank ID from getBanks() */
  bankId: number
  bankName?: string
}

export interface ColursBankAccount {
  id: number // colurs_id (pk returned by Colurs)
  account_holder_name: string
  account_type: 1 | 2 // 1 = Ahorros, 2 = Corriente
  account_number: string
  bank_name: number
  state: string
  country_registered: string
}

// ── Response shape helpers ────────────────────────────────────────────────────

/**
 * Colurs list endpoints have been observed to return either a bare array or a
 * wrapper like `{results:[...]}` (DRF pagination) / `{data:[...]}`. Normalise so
 * callers always get an array.
 */
function toArray<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>
    if (Array.isArray(r.results)) return r.results as T[]
    if (Array.isArray(r.data)) return r.data as T[]
  }
  return []
}

// ── Document type mapping ─────────────────────────────────────────────────────

/**
 * Withdrawal-specific document type enum. Per Colurs Recargas y Retiros Postman
 * (section "Crear cuenta bancaria de tercero"): 1=CC, 2=CE, 3=NIT, 4=Pasaporte.
 * Note this is a different enum than `/base/document_type/` uses for /user/
 * registration (which returns 0=CC, 1=CE, 2=TI, 3=NIT, 4=PSP, ...).
 */
const WITHDRAWAL_DOCUMENT_TYPES: Array<ColursDocumentType> = [
  { id: 1, name: 'CC' },
  { id: 2, name: 'CE' },
  { id: 3, name: 'NIT' },
  { id: 4, name: 'PA' },
]

export async function getDocumentTypes(): Promise<ColursDocumentType[]> {
  return WITHDRAWAL_DOCUMENT_TYPES
}

/**
 * Maps a display code (CC, CE, NIT, PA) to the Colurs numeric document type ID
 * used by POST /api/create_third_party_banks/.
 */
async function resolveDocumentTypeId(displayCode: string): Promise<number> {
  const match = WITHDRAWAL_DOCUMENT_TYPES.find(
    (t) => t.name.toUpperCase() === displayCode.toUpperCase()
  )
  if (!match) {
    throw new Error(
      `Document type "${displayCode}" not supported. Allowed: ${WITHDRAWAL_DOCUMENT_TYPES.map((t) => t.name).join(', ')}`
    )
  }
  return match.id
}

// ── Available banks ───────────────────────────────────────────────────────────

let bankCache: ColursBank[] | null = null

/**
 * List available Colombian banks for the withdrawal account-registration dropdown.
 * Cached in memory — changes infrequently.
 *
 * Reverted to `/banks/?country=CO` after sandbox returned 502 on the Postman-documented
 * `/api/bank_list_third_party_withdraw/?country=CO`. Pending Colurs confirmation of
 * which path is canonical — ask in the next sync.
 */
export async function getBanks(): Promise<ColursBank[]> {
  if (bankCache) return bankCache
  const result = await colursGet<unknown>('/banks/?country=CO')
  bankCache = toArray<ColursBank>(result)
  return bankCache
}

// ── Account type mapping ──────────────────────────────────────────────────────

function resolveAccountType(displayType: 'savings' | 'checking'): 1 | 2 {
  // Per Colurs Recargas y Retiros Postman: 1 = Ahorros (savings), 2 = Corriente (checking).
  return displayType === 'savings' ? 1 : 2
}

// ── Bank account registration ─────────────────────────────────────────────────

/**
 * Registers a Colombian bank account with Colurs and stores it locally.
 *
 * Steps:
 *   1. Resolve document type display code → Colurs numeric ID
 *   2. Map account type string → 0/1
 *   3. POST /create_third_party_banks/ with all required fields
 *   4. Store the returned Colurs ID in colurs_bank_accounts
 *
 * Returns the local DB row ID.
 */
export async function registerBankAccount(params: RegisterBankAccountParams): Promise<number> {
  const {
    phoneNumber,
    holderName,
    documentType,
    documentNumber,
    accountNumber,
    accountType,
    bankId,
    bankName,
  } = params

  logger.info(`colurs_bank: registering bank account for ${maskPhone(phoneNumber)}`)

  const documentTypeId = await resolveDocumentTypeId(documentType)
  const accountTypeInt = resolveAccountType(accountType)

  const payload = {
    account_holder_name: holderName,
    account_type: accountTypeInt,
    account_holder_document_type: documentTypeId,
    account_holder_document: documentNumber,
    account_number: accountNumber,
    bank_name: bankId,
    country_registered: 'CO',
  }

  logger.info(
    {
      account_holder_name: holderName,
      account_type: accountTypeInt,
      account_holder_document_type: documentTypeId,
      account_holder_document_length: documentNumber.length,
      account_holder_document_last4: documentNumber.slice(-4),
      account_number_length: accountNumber.length,
      account_number_last4: accountNumber.slice(-4),
      bank_name: bankId,
      bank_name_display: bankName,
      country_registered: 'CO',
    },
    `colurs_bank: POST /create_third_party_banks/ payload for ${maskPhone(phoneNumber)}`
  )

  const colursResponse = await colursPost<Record<string, unknown>>(
    '/create_third_party_banks/',
    payload
  )

  // Per Colurs Recargas y Retiros Postman the response is `{ pk, account_holder_name, ... }`.
  // We also accept `id` and `data.id` as fallbacks since older Colurs surfaces may vary.
  const rawId =
    (colursResponse.pk as number | undefined) ??
    (colursResponse.id as number | undefined) ??
    ((colursResponse.data as Record<string, unknown> | undefined)?.id as number | undefined) ??
    ((colursResponse.data as Record<string, unknown> | undefined)?.pk as number | undefined)

  if (rawId === null || rawId === undefined || !Number.isFinite(Number(rawId))) {
    // Log response shape only — values may contain account PII
    logger.error(
      { responseKeys: Object.keys(colursResponse) },
      'colurs_bank: registration returned no valid ID'
    )
    throw new Error('Colurs bank registration returned no valid ID')
  }

  const colursId = Number(rawId)

  logger.info(`colurs_bank: account registered with Colurs ID=${colursId}`)

  // Store locally — colurs_bank_accounts
  const inserted = await ColursBankAccountModel.create({
    phoneNumber,
    colursId: String(colursId),
    holderName,
    documentType, // store display code (CC/CE/NIT) for UI
    documentNumber,
    accountNumber,
    accountType, // store 'savings'/'checking' for UI
    bankId,
    bankName: bankName ?? null,
    countryCode: 'CO',
  })

  const localId = inserted.id
  logger.info(`colurs_bank: stored locally as id=${localId}`)
  return localId
}

// ── List user's bank accounts ─────────────────────────────────────────────────

/**
 * Returns all registered bank accounts for a user from the local DB.
 * Fast path — no Colurs API call needed for listing.
 */
export async function listBankAccounts(
  phoneNumber: string
): Promise<InstanceType<typeof ColursBankAccountModel>[]> {
  return ColursBankAccountModel.query()
    .where('phoneNumber', phoneNumber)
    .orderBy('isDefault', 'desc')
    .orderBy('createdAt', 'desc')
}

/**
 * Set a bank account as the user's default for offramp.
 * Clears the existing default first.
 */
export async function setDefaultBankAccount(phoneNumber: string, accountId: number): Promise<void> {
  await ColursBankAccountModel.query()
    .where('phoneNumber', phoneNumber)
    .update({ isDefault: false })
  await ColursBankAccountModel.query()
    .where('id', accountId)
    .where('phoneNumber', phoneNumber)
    .update({ isDefault: true })
}
