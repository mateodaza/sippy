/**
 * Type definitions for Sippy backend
 */

export type AmountErrorCode =
  | 'ZERO'
  | 'TOO_SMALL'
  | 'TOO_LARGE'
  | 'TOO_MANY_DECIMALS'
  | 'AMBIGUOUS_SEPARATOR'
  | 'INVALID_FORMAT'

export interface Session {
  phoneNumber: string
  createdAt: number
  lastActivity: number
  status: 'active' | 'expired'
  cdpWalletId?: string
  walletAddress?: string
}

export interface UserWallet {
  phoneNumber: string
  cdpWalletId: string
  walletAddress: string
  createdAt: number
  lastActivity: number
  dailySpent: number // Track daily spending
  lastResetDate: string // For daily limit reset
}

export interface PendingTransaction {
  amount: number
  recipient: string // canonical E.164 phone
  timestamp: number // Date.now()
  lang: Lang // user's lang at time of send command
  // True iff this pending confirm originated from a pay-QR scan. Carried
  // across the confirm step so post-transfer flows (e.g. event-POAP claim
  // DM) can fire only on QR-initiated sends, not on chat-typed sends.
  // Required (not optional) so future send paths can't silently disable
  // POAP delivery by forgetting to thread the flag.
  payQrScan: boolean
}

export interface PartialSend {
  amount?: number // present if user gave an amount
  recipient?: string // present if user gave a phone (canonical E.164)
  recipientRaw?: string // present if user gave an alias/name that still needs resolution
  timestamp: number // Date.now()
  lang: Lang
  // Set when the user has expressed send intent but has not supplied either
  // required slot yet. Lets the next standalone "1" or "Carlos" advance the
  // same partial-send state machine instead of being parsed as a fresh turn.
  sendIntent?: boolean
  // Set when the user filled the amount slot with a local-currency word
  // ("200 pesos", "50 reais", "10 soles"). Carries the ISO/LOCAL code so
  // the eventual `complete` resolution synthesizes a ParsedCommand with
  // both `amount` AND `localCurrency` set — without this, the downstream
  // FX step skips conversion and we'd send USDC at the local face value
  // (a 400x money-correctness bug for COP/VES sends).
  localCurrency?: string
  // ── Pay-QR scan context (set by the kind='pay' bracket dispatcher) ─────
  // Present when this partial was created by a pay-QR scan. Carries forward
  // so the resolved send command can use the friendly display name in the
  // confirmation prompt instead of a masked phone, and so the send flow
  // can force the confirmation step regardless of CONFIRM_THRESHOLD.
  recipientDisplayName?: string
  payQrScan?: boolean
}

type Lang = 'en' | 'es' | 'pt'

export interface ParsedCommand {
  command:
    | 'start'
    | 'help'
    | 'about'
    | 'balance'
    | 'send'
    | 'history'
    | 'settings'
    | 'language'
    | 'greeting'
    | 'social'
    | 'privacy'
    | 'fund'
    | 'pay_qr'
    | 'invite'
    | 'confirm'
    | 'cancel'
    | 'save_contact'
    | 'delete_contact'
    | 'list_contacts'
    | 'withdraw'
    | 'dashboard'
    | 'referral_code'
    | 'quest_status'
    | 'unknown'
  amount?: number
  recipient?: string
  recipientRaw?: string // raw text when canonicalization fails — allows alias resolution
  alias?: string // contact alias for save/delete commands
  phone?: string // target phone for save_contact command
  privacyAction?: 'on' | 'off'
  originalText?: string
  helpfulMessage?: string // Natural, conversational response for unknown commands
  detectedLanguage?: 'en' | 'es' | 'pt' | 'ambiguous' // Language detected from current message
  usedLLM?: boolean // Track if LLM was used for parsing
  llmStatus?:
    | 'success'
    | 'skipped'
    | 'format-hint'
    | 'disabled'
    | 'rate-limited'
    | 'timeout'
    | 'error'
    | 'low-confidence'
    | 'normalized'
    | 'validation-failed'
  amountError?: AmountErrorCode // set when send regex matched but amount is invalid
  recipientError?: 'INVALID_PHONE' // set when amount is valid but phone canonicalization fails
  isLargeAmount?: boolean // true iff amount > 500 and no amountError
  localCurrency?: string // currency word detected in send (e.g. "pesos" → used for conversion)
  localAmount?: number // original amount in local currency before USDC conversion
  // ── Pay-QR scan context (carried over from PartialSend when this
  //    command was synthesized by resolving a pay-QR scan) ──────────────
  recipientDisplayName?: string
  payQrScan?: boolean
  // ── SMART MODE fall-through hint (set when SMART classified the
  //    inbound as out_of_scope or gibberish and then fell through to
  //    the regex/LLM parser, which also returned 'unknown'). Read by
  //    the unknown handler to pick a state-aware variant instead of
  //    the single static fallback. Unset for non-SMART paths. ────────
  smartCategory?: 'out_of_scope' | 'gibberish'
  smartOosRedirect?: string
  // ── Address-query intent on a balance route ────────────────────────────
  // True when the user asked specifically for their wallet address
  // ("mi address", "cuál es mi billetera", "wallet address", …) rather
  // than the balance number ("saldo", "balance"). Both route to the
  // balance handler, but the reply must show the FULL public address —
  // not the masked `0x80d6...948A` — so the user can copy/share it.
  addressQuery?: boolean
}

export interface WalletInfo {
  phone: string
  wallet: string
}

export interface WhatsAppContact {
  name?: {
    formatted_name?: string
    first_name?: string
    last_name?: string
  }
  phones?: Array<{
    phone?: string
    type?: string
    wa_id?: string
  }>
}

export interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  text?: {
    body: string
  }
  interactive?: {
    type: 'button_reply' | 'list_reply'
    button_reply?: {
      id: string
      title: string
    }
    list_reply?: {
      id: string
      title: string
      description?: string
    }
  }
  contacts?: WhatsAppContact[]
  type: string
}

export interface WebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: {
            name: string
          }
          wa_id: string
        }>
        messages?: WhatsAppMessage[]
        statuses?: Array<{
          id: string
          status: string
          timestamp: string
          recipient_id: string
          errors?: Array<{ code: number; title: string; message?: string }>
        }>
      }
      field: string
    }>
  }>
}

export interface WhatsAppAPIResponse {
  messaging_product: string
  contacts?: Array<{
    input: string
    wa_id: string
  }>
  messages?: Array<{
    id: string
  }>
}

export interface WhatsAppAPIError {
  error?: {
    message: string
    type: string
    code: number
    error_data?: {
      details: string
    }
    fbtrace_id?: string
  }
}

export interface SecurityLimits {
  dailyLimit: number // USDC per day
  transactionLimit: number // USDC per transaction
  sessionDurationHours: number // Session validity in hours
}

export interface TransferResult {
  transactionHash: string
  amount: number
  recipient: string
  timestamp: number
}
