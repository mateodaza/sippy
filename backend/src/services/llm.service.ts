/**
 * LLM Service - Natural Language Understanding with Groq
 *
 * Provides intelligent message parsing using Groq's FREE Llama 3.1 model.
 * Includes feature flag, rate limiting, and graceful fallback handling.
 */

import Groq from 'groq-sdk';
import { ParsedCommand } from '../types/index.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface LLMParseResult {
  command: string;
  amount?: number;
  recipient?: string;
  confidence: number;
}

interface HealthStatus {
  available: boolean;
  reason?: string;
}

// ============================================================================
// Feature Flag
// ============================================================================

/**
 * Check if LLM is enabled via environment variable
 * Defaults to true for best UX
 */
export function isLLMEnabled(): boolean {
  const useLLM = process.env.USE_LLM?.toLowerCase();

  // Default to true if not set (best UX)
  if (useLLM === undefined || useLLM === '') return true;

  // Explicit disable
  if (useLLM === 'false' || useLLM === '0' || useLLM === 'no') return false;

  return true;
}

// ============================================================================
// Rate Limiter (Ensure FREE forever)
// ============================================================================

class FreeRateLimiter {
  private minuteCount = 0;
  private dailyCount = 0;
  private lastReset = Date.now();
  private dayStart = Date.now();

  private readonly MINUTE_LIMIT = 25; // Conservative (real: 30)
  private readonly DAILY_LIMIT = 14000; // Conservative (real: 14,400)

  canMakeRequest(): boolean {
    this.resetIfNeeded();

    // Hard stop at limits
    if (this.minuteCount >= this.MINUTE_LIMIT) {
      console.log('⚠️  LLM minute limit reached, using fallback');
      return false;
    }

    if (this.dailyCount >= this.DAILY_LIMIT) {
      console.log('⚠️  LLM daily limit reached, using fallback');
      return false;
    }

    return true;
  }

  recordRequest(): void {
    this.minuteCount++;
    this.dailyCount++;
  }

  private resetIfNeeded(): void {
    const now = Date.now();

    // Reset minute counter
    if (now - this.lastReset >= 60000) {
      this.minuteCount = 0;
      this.lastReset = now;
    }

    // Reset daily counter
    if (now - this.dayStart >= 86400000) {
      this.dailyCount = 0;
      this.dayStart = now;
      console.log('📊 Daily LLM usage reset');
    }
  }

  getStats() {
    return {
      minuteCount: this.minuteCount,
      dailyCount: this.dailyCount,
      minuteRemaining: this.MINUTE_LIMIT - this.minuteCount,
      dailyRemaining: this.DAILY_LIMIT - this.dailyCount,
    };
  }
}

const rateLimiter = new FreeRateLimiter();

// ============================================================================
// Groq Client
// ============================================================================

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!isLLMEnabled()) return null;

  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      return null;
    }

    try {
      groqClient = new Groq({ apiKey });
    } catch (error) {
      console.error('❌ Failed to initialize Groq client:', error);
      return null;
    }
  }

  return groqClient;
}

// ============================================================================
// System Prompt (Bilingual: English + Spanish)
// ============================================================================

const SYSTEM_PROMPT = `You are a bilingual payment assistant for Sippy wallet. Parse user messages in English or Spanish.

Available commands:
- start / comenzar: Create new wallet
- balance / saldo / cuánto tengo: Check PYUSD balance
- send / enviar / transferir: Send money (needs amount + phone)
- history / historial: View transactions
- about / acerca de: Learn about Sippy
- help / ayuda: Show commands

Extract from user message:
1. Command type
2. Amount (if sending money)
3. Phone number (if sending money)

Be strict with send commands - must have valid amount and phone number.

Return ONLY valid JSON (no markdown):
{
  "command": "send" | "balance" | "start" | "history" | "about" | "help" | "unknown",
  "amount": number or null,
  "recipient": string or null,
  "confidence": 0.0 to 1.0
}`;

// ============================================================================
// LLM Parse Function
// ============================================================================

export async function parseMessageWithLLM(
  text: string
): Promise<ParsedCommand | null> {
  const client = getGroqClient();
  if (!client) return null;

  // Check rate limits
  if (!rateLimiter.canMakeRequest()) return null;

  try {
    // Record request for rate limiting
    rateLimiter.recordRequest();

    // Call Groq with 3 second timeout
    const completion = await Promise.race([
      client.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1, // Low temperature for consistent parsing
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      ),
    ]);

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    // Parse JSON response
    const result: LLMParseResult = JSON.parse(content);

    // Validate result
    if (!validateLLMResult(result)) return null;

    // Convert to ParsedCommand format
    return {
      command: result.command as ParsedCommand['command'],
      amount: result.amount,
      recipient: result.recipient,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      console.warn('⚠️  LLM timeout, using fallback');
    } else {
      console.error('❌ LLM parsing error:', error);
    }
    return null;
  }
}

// ============================================================================
// Validation
// ============================================================================

function validateLLMResult(result: any): boolean {
  if (!result || !result.command) return false;

  // Whitelist: Only accept known commands (case-insensitive)
  const validCommands = [
    'send',
    'balance',
    'start',
    'history',
    'about',
    'help',
    'unknown',
  ];
  const normalizedCommand = result.command.toLowerCase().trim();

  if (!validCommands.includes(normalizedCommand)) {
    console.warn(`⚠️  LLM returned invalid command: "${result.command}"`);
    return false;
  }

  // Normalize the command for consistent handling
  result.command = normalizedCommand;

  // Confidence threshold
  if (result.confidence < 0.7) return false;

  // Send command validation
  if (result.command === 'send') {
    // Must have valid amount (reasonable range)
    if (!result.amount || result.amount <= 0 || result.amount > 100000) {
      return false;
    }

    // Must have valid phone (10+ characters including formatting)
    if (!result.recipient || result.recipient.length < 10) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkLLMHealth(): Promise<HealthStatus> {
  if (!isLLMEnabled()) {
    return {
      available: false,
      reason: 'LLM disabled via USE_LLM flag',
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return {
      available: false,
      reason: 'GROQ_API_KEY not configured',
    };
  }

  const client = getGroqClient();
  if (!client) {
    return {
      available: false,
      reason: 'Failed to initialize Groq client',
    };
  }

  return {
    available: true,
  };
}

// ============================================================================
// Utilities
// ============================================================================

export function isRateLimited(): boolean {
  return !rateLimiter.canMakeRequest();
}

export function getRateLimitStats() {
  return rateLimiter.getStats();
}
