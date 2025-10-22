/**
 * Type definitions for Sippy backend
 */

export interface Session {
  phoneNumber: string;
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'expired';
  cdpWalletId?: string;
  walletAddress?: string;
}

export interface UserWallet {
  phoneNumber: string;
  cdpWalletId: string;
  walletAddress: string;
  createdAt: number;
  lastActivity: number;
  dailySpent: number; // Track daily spending
  lastResetDate: string; // For daily limit reset
}

export interface ParsedCommand {
  command:
    | 'start'
    | 'help'
    | 'about'
    | 'balance'
    | 'send'
    | 'history'
    | 'unknown';
  amount?: number;
  recipient?: string;
  originalText?: string;
  helpfulMessage?: string; // Natural, conversational response for unknown commands
  detectedLanguage?: 'en' | 'es' | 'ambiguous'; // Language detected from current message
  usedLLM?: boolean; // Track if LLM was used for parsing
  llmStatus?:
    | 'success'
    | 'disabled'
    | 'rate-limited'
    | 'timeout'
    | 'error'
    | 'low-confidence'
    | 'validation-failed'; // Why LLM wasn't used
}

export interface WalletInfo {
  phone: string;
  wallet: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  type: string;
}

export interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: WhatsAppMessage[];
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppAPIResponse {
  messaging_product: string;
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
  }>;
}

export interface WhatsAppAPIError {
  error?: {
    message: string;
    type: string;
    code: number;
    error_data?: {
      details: string;
    };
    fbtrace_id?: string;
  };
}

export interface SecurityLimits {
  dailyLimit: number; // PYUSD per day
  transactionLimit: number; // PYUSD per transaction
  sessionDurationHours: number; // Session validity in hours
}

export interface TransferResult {
  transactionHash: string;
  amount: number;
  recipient: string;
  timestamp: number;
}
