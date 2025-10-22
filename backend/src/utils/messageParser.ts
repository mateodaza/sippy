/**
 * Message Parser
 *
 * Parse incoming WhatsApp messages and extract commands
 */

import { ParsedCommand } from '../types/index.js';

/**
 * Parse a message and determine command type
 */
export function parseMessage(text: string): ParsedCommand {
  const normalizedText = text.trim().toLowerCase();

  // START command
  if (normalizedText === 'start' || normalizedText === 'begin') {
    return {
      command: 'start',
    };
  }

  // HELP command
  if (normalizedText === 'help' || normalizedText === '?') {
    return {
      command: 'help',
    };
  }

  // ABOUT command
  if (
    normalizedText === 'about' ||
    normalizedText === 'what is sippy' ||
    normalizedText === 'whats sippy' ||
    normalizedText === "what's sippy"
  ) {
    return {
      command: 'about',
    };
  }

  // BALANCE command
  if (normalizedText === 'balance') {
    return {
      command: 'balance',
    };
  }

  // SEND command: "send 10 to +573001234567" or "send $10 to 3001234567"
  const sendPattern = /^send\s+\$?(\d+(?:\.\d+)?)\s+to\s+\+?(\d+)$/i;
  const sendMatch = text.trim().match(sendPattern);

  if (sendMatch) {
    // Parse and normalize phone number
    const rawPhone = sendMatch[2];
    let normalizedPhone = rawPhone;

    // If it starts with +57, remove +57 and add 57
    if (text.includes('+57')) {
      normalizedPhone = rawPhone.startsWith('57') ? rawPhone : '57' + rawPhone;
    }
    // If it's a 10-digit Colombian number, add country code
    else if (rawPhone.length === 10) {
      normalizedPhone = '57' + rawPhone;
    }
    // If it already has country code (57XXXXXXXXX)
    else if (rawPhone.startsWith('57') && rawPhone.length === 12) {
      normalizedPhone = rawPhone;
    }

    return {
      command: 'send',
      amount: parseFloat(sendMatch[1]),
      recipient: normalizedPhone,
    };
  }

  // HISTORY command
  if (normalizedText === 'history' || normalizedText === 'transactions') {
    return {
      command: 'history',
    };
  }

  // Unknown command
  return {
    command: 'unknown',
    originalText: text,
  };
}

/**
 * Get help text for available commands
 */
export function getHelpText(): string {
  const fundUrl = process.env.FUND_URL || 'https://www.sippy.lat/fund';
  return (
    `🤖 Sippy Bot Commands\n\n` +
    `🚀 start - Create your wallet\n` +
    `💰 balance - Check your PYUSD balance\n` +
    `💸 send <amount> to <phone> - Send PYUSD\n` +
    `   Example: send 5 to +573001234567\n` +
    `   Or: send $10 to +573001234567\n` +
    `📊 history - View your transactions\n` +
    `ℹ️  about - What is Sippy?\n` +
    `📞 help - Show this message\n\n` +
    `💡 Need funds? ${fundUrl}`
  );
}

/**
 * Get about text explaining Sippy
 */
export function getAboutText(): string {
  return (
    `💧 What is Sippy?\n\n` +
    `Sippy is a WhatsApp wallet that makes sending money as easy as sending a text message!\n\n` +
    `✨ How it works:\n\n` +
    `📱 Send to Phone Numbers\n` +
    `Just send money using a phone number. No extra apps, no complex codes or random numbers to remember!\n\n` +
    `💵 Always $1 = $1\n` +
    `Your balance uses PYUSD, a digital dollar backed by PayPal. Always stable, always $1.\n\n` +
    `🔒 Safe & Fast\n` +
    `Powered by Coinbase on Arbitrum network. Your money is secure and transfers happen in seconds.\n\n` +
    `🆓 No Transaction Fees\n` +
    `We cover the cost of your transfers daily. Just send money - we handle the rest!\n\n` +
    `Send "help" to see all commands.`
  );
}
