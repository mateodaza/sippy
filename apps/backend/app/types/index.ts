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
}

export interface PartialSend {
  amount?: number // present if user gave an amount
  recipient?: string // present if user gave a phone (canonical E.164)
  timestamp: number // Date.now()
  lang: Lang
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
    | 'invite'
    | 'confirm'
    | 'cancel'
    | 'save_contact'
    | 'delete_contact'
    | 'list_contacts'
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
