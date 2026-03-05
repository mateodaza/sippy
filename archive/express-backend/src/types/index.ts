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
    | 'settings'
    | 'language'
    | 'greeting'
    | 'social'
    | 'unknown';
  amount?: number;
  recipient?: string;
  originalText?: string;
  helpfulMessage?: string; // Natural, conversational response for unknown commands
  detectedLanguage?: 'en' | 'es' | 'pt' | 'ambiguous'; // Language detected from current message
  usedLLM?: boolean; // Track if LLM was used for parsing
  llmStatus?:
    | 'success'
    | 'skipped'
    | 'format-hint'
    | 'disabled'
    | 'rate-limited'
    | 'timeout'
    | 'error'
    | 'low-confidence'
    | 'validation-failed';
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
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
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
  dailyLimit: number; // USDC per day
  transactionLimit: number; // USDC per transaction
  sessionDurationHours: number; // Session validity in hours
}

export interface TransferResult {
  transactionHash: string;
  amount: number;
  recipient: string;
  timestamp: number;
}
