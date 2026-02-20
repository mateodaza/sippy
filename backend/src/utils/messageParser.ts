/**
 * Message Parser
 *
 * Regex-first parser with LLM fallback for ambiguous messages.
 * Send commands are regex-only — LLM never triggers money movement.
 */

import { ParsedCommand } from '../types/index.js';
import {
  isLLMEnabled,
  isRateLimited,
  parseMessageWithLLM,
  type CallMeta,
} from '../services/llm.service.js';
import { normalizePhoneNumber } from './phone.js';
import { logParseResult, ParseLogEntry } from '../services/db.js';

export { normalizePhoneNumber, verifySendAgreement } from './phone.js';

// ============================================================================
// Parse context (passed from server.ts for observability)
// ============================================================================

export interface ParseContext {
  messageId: string;
  phoneNumber: string;
}

// ============================================================================
// Pre-LLM send attempt detector
// ============================================================================

const SEND_KEYWORDS = /\b(send|transfer|pay|enviar|transferir|pagar|envie|mande|mandar)\b/i;
const HAS_NUMBER = /\d+/;

function isAttemptedSend(text: string): boolean {
  return SEND_KEYWORDS.test(text) && HAS_NUMBER.test(text);
}

// ============================================================================
// Regex parser (primary — zero cost, <1ms)
// ============================================================================

/**
 * Trilingual command patterns (EN/ES/PT).
 * Pattern from Camello: REGEX_INTENTS as Record<string, RegExp[]>
 */
const COMMAND_PATTERNS: Record<string, RegExp[]> = {
  start: [
    /^(start|begin)$/i,
    /^(comenzar|iniciar)$/i,
    /^(come[cç]ar|iniciar)$/i,
  ],
  help: [
    /^(help|\?)$/i,
    /^ayuda$/i,
    /^ajuda$/i,
  ],
  about: [
    /^about$/i,
    /^(what is sippy|whats sippy|what's sippy)$/i,
    /^(acerca|qu[eé] es sippy)$/i,
    /^(sobre|o que [eé] sippy|o que é sippy)$/i,
  ],
  balance: [
    /^balance$/i,
    /^(saldo|cu[aá]nto tengo|mi saldo)$/i,
    /^(saldo|quanto tenho|meu saldo)$/i,
  ],
  settings: [
    /^(settings?|config)$/i,
    /^(configuraci[oó]n|ajustes)$/i,
    /^(configura[cç][aã]o|ajustes)$/i,
  ],
  history: [
    /^(history|transactions?)$/i,
    /^(historial|transacciones?)$/i,
    /^(hist[oó]rico|transa[cç][oõ]es?)$/i,
  ],
  language: [
    // "language en", "language es", "language pt"
    /^language\s+(en|es|pt)$/i,
    // "idioma es", "idioma en", "idioma pt"
    /^idioma\s+(en|es|pt)$/i,
  ],
};

/** Trilingual send patterns — strict format, must extract amount + recipient */
const SEND_PATTERNS: RegExp[] = [
  // EN: "send 10 to +573001234567" or "send $10 to ..."
  /^send\s+\$?(\d+(?:\.\d+)?)\s+to\s+(.+)$/i,
  // ES: "enviar 10 a +573001234567" / "envía 10 a ..."
  /^env[ií]a?r?\s+\$?(\d+(?:\.\d+)?)\s+a\s+(.+)$/i,
  // PT: "enviar 10 para +573001234567"
  /^enviar?\s+\$?(\d+(?:\.\d+)?)\s+para\s+(.+)$/i,
];

/**
 * Parse message with regex (exact matching).
 * This is the primary parser — handles 80%+ of messages at zero cost.
 */
export function parseMessageWithRegex(text: string): ParsedCommand {
  const normalizedText = text.trim().toLowerCase();

  // Check language command first (needs to extract the lang code)
  for (const pattern of COMMAND_PATTERNS.language) {
    const match = normalizedText.match(pattern);
    if (match) {
      const lang = match[1].toLowerCase() as 'en' | 'es' | 'pt';
      return { command: 'language', detectedLanguage: lang };
    }
  }

  // Check non-send commands against trilingual patterns
  for (const [command, patterns] of Object.entries(COMMAND_PATTERNS)) {
    if (command === 'language') continue; // Already handled above
    if (patterns.some(p => p.test(normalizedText))) {
      return { command: command as ParsedCommand['command'] };
    }
  }

  // Check send patterns (need to extract amount + recipient)
  const trimmedText = text.trim();
  for (const pattern of SEND_PATTERNS) {
    const match = trimmedText.match(pattern);
    if (match) {
      return parseSendMatch(match, text);
    }
  }

  // Unknown command
  return { command: 'unknown', originalText: text };
}

// ============================================================================
// Send match extraction
// ============================================================================

function parseSendMatch(match: RegExpMatchArray, originalText: string): ParsedCommand {
  const amount = parseFloat(match[1]);

  if (amount <= 0 || amount > 100000) {
    return { command: 'unknown', originalText };
  }

  const rawRecipient = match[2].trim();
  const normalizedRecipient = normalizePhoneNumber(rawRecipient, originalText);

  if (!normalizedRecipient) {
    const digitsOnly = rawRecipient.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      return { command: 'unknown', originalText };
    }
    return { command: 'send', amount, recipient: digitsOnly };
  }

  return { command: 'send', amount, recipient: normalizedRecipient };
}

// ============================================================================
// Main parser: regex-first, LLM fallback
// ============================================================================

/**
 * Parse a user message into a command.
 *
 * Flow:
 * 1. Regex parser (zero cost, <1ms) — handles all known command formats
 * 2. Pre-LLM send detector — catches malformed send attempts, returns format hint
 * 3. LLM fallback — only for truly ambiguous messages (questions, natural language)
 *
 * Send commands are NEVER accepted from LLM for M1.
 */
export async function parseMessage(
  text: string,
  ctx?: ParseContext
): Promise<ParsedCommand> {
  const startTime = Date.now();

  // Step 1: Try regex first (zero cost)
  const regexResult = parseMessageWithRegex(text);

  if (regexResult.command !== 'unknown') {
    const result: ParsedCommand = { ...regexResult, usedLLM: false, llmStatus: 'skipped' };
    if (ctx) {
      logParse(ctx, result, 'regex', 'regex-matched', Date.now() - startTime);
    }
    return result;
  }

  // Step 2: Check if this is a malformed send attempt
  if (isAttemptedSend(text)) {
    const result: ParsedCommand = {
      command: 'send',
      originalText: text,
      usedLLM: false,
      llmStatus: 'format-hint',
    };
    if (ctx) {
      logParse(ctx, result, 'regex', 'format-hint', Date.now() - startTime);
    }
    return result;
  }

  // Step 3: LLM fallback for ambiguous messages
  if (!isLLMEnabled()) {
    const result: ParsedCommand = { ...regexResult, usedLLM: false, llmStatus: 'disabled' };
    if (ctx) {
      logParse(ctx, result, 'regex', 'llm-disabled', Date.now() - startTime);
    }
    return result;
  }

  if (isRateLimited()) {
    const result: ParsedCommand = { ...regexResult, usedLLM: false, llmStatus: 'rate-limited' };
    if (ctx) {
      logParse(ctx, result, 'regex', 'llm-rate-limited', Date.now() - startTime);
    }
    return result;
  }

  try {
    const llmResponse = await parseMessageWithLLM(text);

    if (llmResponse?.parsed) {
      const result: ParsedCommand = {
        ...llmResponse.parsed,
        originalText: text,
        usedLLM: true,
        llmStatus: 'success',
      };
      if (ctx) {
        logParse(ctx, result, 'llm', 'llm-success', Date.now() - startTime, llmResponse.meta);
      }
      return result;
    }

    const result: ParsedCommand = { ...regexResult, usedLLM: true, llmStatus: 'low-confidence' };
    if (ctx) {
      logParse(ctx, result, 'llm', 'llm-rejected', Date.now() - startTime, llmResponse?.meta);
    }
    return result;
  } catch (error) {
    const status: ParsedCommand['llmStatus'] =
      error instanceof Error && error.message === 'Timeout' ? 'timeout' : 'error';
    const logStatus = status === 'timeout' ? 'llm-timeout' : 'llm-error';
    const result: ParsedCommand = { ...regexResult, usedLLM: true, llmStatus: status };
    if (ctx) {
      logParse(ctx, result, 'llm', logStatus, Date.now() - startTime);
    }
    return result;
  }
}

// ============================================================================
// Parse logging (non-blocking)
// ============================================================================

function logParse(
  ctx: ParseContext,
  result: ParsedCommand,
  source: 'regex' | 'llm',
  status: string,
  latencyMs: number,
  meta?: CallMeta
): void {
  const entry: ParseLogEntry = {
    messageId: ctx.messageId,
    phoneNumber: ctx.phoneNumber,
    parseSource: source,
    intent: result.command,
    model: meta?.model,
    promptTokens: meta?.promptTokens,
    completionTokens: meta?.completionTokens,
    latencyMs,
    status,
    detectedLanguage: result.detectedLanguage,
  };
  // Fire-and-forget — never blocks message handling
  logParseResult(entry);
}

// Help/About re-exported from message catalog for backward compatibility
export { formatHelpMessage as getHelpText, formatAboutMessage as getAboutText } from './messages.js';
