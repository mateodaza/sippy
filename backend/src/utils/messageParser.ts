/**
 * Message Parser
 *
 * Parse incoming WhatsApp messages and extract commands
 */

import { ParsedCommand } from '../types';

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

  // BALANCE command
  if (normalizedText === 'balance') {
    return {
      command: 'balance',
    };
  }

  // SEND command: "send 10 to +573001234567" or "send 10 to 3001234567"
  const sendPattern = /^send\s+(\d+(?:\.\d+)?)\s+to\s+\+?(\d+)$/i;
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
  return (
    `📖 Available commands:\n\n` +
    `• *start* - Create your wallet\n` +
    `• *balance* - Check your PYUSD balance\n` +
    `• *send 10 to +57XXX* - Send money\n` +
    `• *history* - View your transactions\n` +
    `• *help* - Show this help\n\n` +
    `Example:\n` +
    `send 5 to +573001234567`
  );
}
