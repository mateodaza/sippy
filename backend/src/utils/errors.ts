/**
 * Error Mapper
 *
 * Maps technical errors to user-friendly messages
 */

/**
 * Convert error to user-friendly message
 */
export function toUserErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  const message = error.message.toLowerCase();

  // Insufficient balance
  if (message.includes('insufficient') || message.includes('balance')) {
    return 'Insufficient balance or network fees. Please check your balance.';
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('fetch')
  ) {
    return 'Network issue. Please try again in a moment.';
  }

  // CDP/Wallet errors
  if (
    message.includes('wallet not found') ||
    message.includes('account') ||
    message.includes('cdp')
  ) {
    return 'Wallet error. Please send "start" to refresh your session.';
  }

  // WhatsApp API errors
  if (message.includes('whatsapp')) {
    return 'Messaging error. Your transaction may have succeeded - check "balance".';
  }

  // Session errors
  if (message.includes('session') || message.includes('expired')) {
    return 'Session expired. Send "start" to renew your session.';
  }

  // Transaction/gas errors
  if (
    message.includes('gas') ||
    message.includes('transaction') ||
    message.includes('revert')
  ) {
    return 'Transaction failed. Please try again or contact support.';
  }

  // Generic fallback
  return 'An error occurred. Please try again or contact support.';
}
