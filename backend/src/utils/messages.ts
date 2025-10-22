/**
 * Message Templates
 *
 * Centralized English message templates for WhatsApp bot
 */

const RECEIPT_BASE_URL =
  process.env.RECEIPT_BASE_URL || 'https://www.sippy.lat/receipt/';
const FUND_URL = process.env.FUND_URL || 'https://www.sippy.lat/fund';

/**
 * Format currency in USD
 */
export function formatCurrencyUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Mask wallet address (show first 6 and last 4 chars)
 */
export function maskAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

/**
 * Shorten transaction hash (show first 10 and last 3 chars)
 */
export function shortHash(hash: string): string {
  if (hash.length < 13) return hash;
  return `${hash.substring(0, 10)}...${hash.substring(hash.length - 3)}`;
}

/**
 * Format date in UTC
 */
export function formatDateUTC(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

/**
 * Help message with all available commands
 */
export function formatHelpMessage(): string {
  return (
    `🤖 Sippy Bot Commands\n\n` +
    `💰 balance - Check your PYUSD balance\n` +
    `💸 send <amount> to <phone> - Send PYUSD\n` +
    `   Example: send 5 to +573001234567\n` +
    `   Or: send $10 to +573001234567\n\n` +
    `📞 help - Show this message\n\n` +
    `💡 Need funds? ${FUND_URL}`
  );
}

/**
 * Balance message
 */
export function formatBalanceMessage(params: {
  balance: number;
  wallet: string;
}): string {
  return (
    `💰 Balance\n\n` +
    `PYUSD: ${formatCurrencyUSD(params.balance)}\n` +
    `Wallet: ${maskAddress(params.wallet)}\n\n` +
    `Add funds: ${FUND_URL}`
  );
}

/**
 * Send processing message
 */
export function formatSendProcessingMessage(params: {
  amount: number;
  toPhone: string;
}): string {
  return (
    `⏳ Sending ${formatCurrencyUSD(params.amount)} PYUSD to +${
      params.toPhone
    }...\n\n` + `This may take up to ~1 minute.`
  );
}

/**
 * Send success message (for sender)
 */
export function formatSendSuccessMessage(params: {
  amount: number;
  toPhone: string;
  txHash: string;
  gasCovered?: boolean;
}): string {
  const receiptUrl = RECEIPT_BASE_URL + params.txHash;
  let message =
    `✅ Sent\n\n` +
    `• Amount: ${formatCurrencyUSD(params.amount)} PYUSD\n` +
    `• To: +${params.toPhone}\n` +
    `• Tx: ${shortHash(params.txHash)}\n`;

  if (params.gasCovered && process.env.DEMO_SHOW_REFUEL === 'true') {
    message += `• Gas: Covered by Sippy\n`;
  }

  message += `\n📄 Receipt: ${receiptUrl}`;

  return message;
}

/**
 * Send recipient notification message
 */
export function formatSendRecipientMessage(params: {
  amount: number;
  fromPhone: string;
  txHash: string;
}): string {
  const receiptUrl = RECEIPT_BASE_URL + params.txHash;
  return (
    `💰 Money received!\n\n` +
    `You received ${formatCurrencyUSD(params.amount)} PYUSD from +${
      params.fromPhone
    }.\n\n` +
    `📄 Receipt: ${receiptUrl}`
  );
}

/**
 * Insufficient balance message
 */
export function formatInsufficientBalanceMessage(params: {
  balance: number;
  needed: number;
}): string {
  return (
    `💸 Insufficient balance\n\n` +
    `Balance: ${formatCurrencyUSD(params.balance)} PYUSD\n` +
    `Needed: ${formatCurrencyUSD(params.needed)} PYUSD\n\n` +
    `Add funds: ${FUND_URL}`
  );
}

/**
 * Generic error message
 */
export function formatErrorMessage(params: { reason: string }): string {
  return `❌ ${params.reason}`;
}

/**
 * Start/Welcome message
 */
export function formatWelcomeMessage(params: {
  wallet: string;
  isNew: boolean;
}): string {
  if (params.isNew) {
    return (
      `🎉 Welcome to Sippy!\n\n` +
      `Your wallet is ready:\n` +
      `${maskAddress(params.wallet)}\n\n` +
      `💡 Get started:\n` +
      `• Add funds: ${FUND_URL}\n` +
      `• Check balance: "balance"\n` +
      `• Send PYUSD: "send 5 to +57..."\n` +
      `• Get help: "help"`
    );
  } else {
    return (
      `👋 Welcome back!\n\n` +
      `Your wallet: ${maskAddress(params.wallet)}\n\n` +
      `Need help? Send "help" to see all commands.`
    );
  }
}

/**
 * No wallet / need to start message
 */
export function formatNoWalletMessage(): string {
  return (
    `❌ No wallet found!\n\n` +
    `Send "start" to create your Sippy wallet first.`
  );
}

/**
 * Session expired message
 */
export function formatSessionExpiredMessage(): string {
  return `⏰ Session expired!\n\nSend "start" to renew your session and try again.`;
}

/**
 * Recipient not found message
 */
export function formatRecipientNotFoundMessage(phone: string): string {
  return (
    `❌ Recipient not found!\n\n` +
    `+${phone} is not registered with Sippy.\n\n` +
    `Ask them to send "start" to this number to create their wallet.`
  );
}

/**
 * Invalid amount message
 */
export function formatInvalidAmountMessage(): string {
  return (
    `❌ Invalid amount\n\n` +
    `Please send a positive number.\n\n` +
    `Example: send 5 to +573001234567`
  );
}
