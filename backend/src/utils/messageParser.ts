/**
 * Message Parser
 *
 * Hybrid parser with LLM (natural language) + Regex (fallback)
 * Supports English and Spanish with intelligent command extraction
 */

import { ParsedCommand } from '../types/index.js';
import {
  isLLMEnabled,
  isRateLimited,
  parseMessageWithLLM,
} from '../services/llm.service.js';
import { normalizePhoneNumber, verifySendAgreement } from './phone.js';

export { normalizePhoneNumber, verifySendAgreement } from './phone.js';

/**
 * Parse message with regex (exact matching)
 * This is our reliable fallback method
 */
export function parseMessageWithRegex(text: string): ParsedCommand {
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
  // Phone must be at least 10 digits
  const sendPattern = /^send\s+\$?(\d+(?:\.\d+)?)\s+to\s+\+?(\d{10,})$/i;
  const sendMatch = text.trim().match(sendPattern);

  if (sendMatch) {
    const amount = parseFloat(sendMatch[1]);

    // Validate amount range (consistent with LLM validation)
    if (amount <= 0 || amount > 100000) {
      return {
        command: 'unknown',
        originalText: text,
      };
    }

    // Parse and normalize phone number
    const rawPhone = sendMatch[2];
    const normalizedCandidate = normalizePhoneNumber(rawPhone, text);
    const normalizedPhone =
      normalizedCandidate !== null ? normalizedCandidate : rawPhone;

    return {
      command: 'send',
      amount,
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
 * Hybrid message parser: LLM with regex fallback
 * This is the main entry point for message parsing
 */
export async function parseMessage(text: string): Promise<ParsedCommand> {
  // Track if we attempted LLM (to avoid double-calling for natural responses)
  let attemptedLLM = false;
  let llmStatus: ParsedCommand['llmStatus'] | undefined;

  // Layer 0: Check feature flag (instant kill switch)
  if (!isLLMEnabled()) {
    console.log('ℹ️  LLM disabled via USE_LLM flag');
    return { ...parseMessageWithRegex(text), llmStatus: 'disabled' };
  }

  // Check rate limits before attempting
  if (isRateLimited()) {
    console.log('⚠️  LLM rate limit reached, using regex');
    return {
      ...parseMessageWithRegex(text),
      usedLLM: true,
      llmStatus: 'rate-limited',
    };
  }

  try {
    // Layer 1: Try LLM
    attemptedLLM = true;
    const llmResult = await parseMessageWithLLM(text);

    if (llmResult) {
      // Critical command: Validate send with simple format checks
      if (llmResult.command === 'send') {
        const regexVerification = parseMessageWithRegex(text);

        // Validate LLM result has valid format
        const verification = verifySendAgreement(
          llmResult,
          regexVerification,
          text
        );

        if (verification.match) {
          console.log('✅ LLM parse (validated)');
          // Normalize the phone number before returning
          const normalizedRecipient = normalizePhoneNumber(
            llmResult.recipient!,
            text
          );

          // CRITICAL: Must always have a normalized phone (no + prefix)
          // If normalization fails, strip + manually as last resort
          const finalRecipient =
            normalizedRecipient ||
            llmResult.recipient!.replace(/^\+/, '').replace(/\D/g, '');

          return {
            ...llmResult,
            recipient: finalRecipient,
            usedLLM: true,
            llmStatus: 'success',
          };
        }

        // If LLM validation failed, explain why and fall back
        llmStatus = 'validation-failed';
        if (verification.mismatchReason === 'amount') {
          console.log('⚠️  LLM amount invalid, using regex fallback');
        } else if (verification.mismatchReason === 'recipient') {
          console.log('⚠️  LLM phone format invalid, using regex fallback');
        } else {
          console.log('⚠️  LLM send payload invalid, using regex fallback');
        }
      } else {
        // Non-critical commands: trust LLM
        console.log('✅ LLM parse');
        // Always include originalText for error messages
        return {
          ...llmResult,
          originalText: text,
          usedLLM: true,
          llmStatus: 'success',
        };
      }
    } else {
      // LLM returned null (low confidence, timeout, or other issue)
      llmStatus = 'low-confidence';
      console.log('⚠️  LLM returned no result, using regex');
    }
  } catch (error) {
    console.warn('⚠️  LLM parsing failed, using fallback:', error);
    attemptedLLM = true;
    llmStatus =
      error instanceof Error && error.message === 'Timeout'
        ? 'timeout'
        : 'error';
  }

  // Layer 2: Regex fallback (always works)
  // Include usedLLM flag if we attempted LLM (to prevent double-calling)
  const regexResult = parseMessageWithRegex(text);
  return {
    ...regexResult,
    usedLLM: attemptedLLM,
    llmStatus: llmStatus,
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
