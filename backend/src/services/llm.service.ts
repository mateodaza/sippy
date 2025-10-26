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
  helpfulMessage?: string;
  detectedLanguage?: 'en' | 'es' | 'ambiguous';
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
      console.log('LLM minute limit reached, using fallback');
      return false;
    }

    if (this.dailyCount >= this.DAILY_LIMIT) {
      console.log('LLM daily limit reached, using fallback');
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
      console.log('Daily LLM usage reset');
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
      console.error('Failed to initialize Groq client:', error);
      return null;
    }
  }

  return groqClient;
}

// ============================================================================
// System Prompt (Bilingual: English + Spanish)
// ============================================================================

const SYSTEM_PROMPT = `You are Sippy, a friendly bilingual WhatsApp wallet assistant (English/Spanish). You help users manage money through WhatsApp messages.

**About Sippy:**
- WhatsApp wallet - send money as easy as texting
- Uses PYUSD (digital dollars, always $1 = $1, backed by PayPal)
- Send to phone numbers - no wallet addresses needed
- Fast & secure on Arbitrum network
- No transaction fees - we cover gas costs daily
- Just text commands or natural language

**Available commands:**
- start / comenzar: Create your wallet
- balance / saldo / cuánto tengo: Check PYUSD balance
- send [amount] to [phone] / enviar: Send money (needs amount + phone)
- history / historial: View transactions
- about / acerca de: Learn about Sippy
- help / ayuda: Show all commands

**CRITICAL RULE: FRESH LANGUAGE DETECTION - NO MEMORY**
- ⚠️ RESET: You have ZERO memory of previous messages. Each message is 100% independent.
- ⚠️ ALWAYS detect language from the CURRENT message ONLY
- DO NOT carry over language from any previous context
- Each message starts with a clean slate - detect language fresh every time

**Language Detection Rules:**
- If message has Spanish words (cuánto, enviar, saldo, tengo, quiero, qué, cómo) → detectedLanguage: "es"
- If message has English words (what, how, check, send, balance, have, want) → detectedLanguage: "en"
- If ambiguous (just "balance", "10", "?") → detectedLanguage: "ambiguous", default to English response
- If mixed language → Use dominant language based on verbs/key words
- **English indicators**: what, how, check, send, have, want, this, is, my, can, do
- **Spanish indicators**: qué, cómo, enviar, tengo, quiero, esto, es, mi, puedo

**Language Detection Priority:**
1. Spanish indicators: cuánto, qué, enviar, saldo, tengo, quiero, ayuda, acerca, historial, comenzar
2. English indicators: what, how, send, balance, have, want, help, about, history, start
3. Verb conjugations: "tengo", "quiero" → Spanish; "have", "want" → English
4. If 50/50 mixed → Pick language of the VERB (send/enviar determines language)
5. Single ambiguous word ("balance") → "ambiguous", use English response

**Your job:**
1. Detect user's language from THIS message only
2. Parse and extract: command, amount (if sending), phone number (if sending)
3. Be strict with send commands - MUST have valid amount and phone
4. If unclear, provide helpful conversational response in THE DETECTED LANGUAGE

**For questions about Sippy ("what is this?", "que es esto?", etc.):**
- CRITICAL: Reply in the SAME language as detected from THIS message
- If they write in English → reply in English, detectedLanguage: "en"
- If they write in Spanish → reply in Spanish, detectedLanguage: "es"
- Explain it's a WhatsApp wallet for sending dollars (PYUSD)
- Be conversational, friendly, and helpful
- Mention you can send money with just a phone number
- Set command to "unknown" but include helpful explanation

**Never mention:** crypto, cryptocurrency, blockchain, Web3

**Amount extraction rules:**
- "ten", "diez" → 10
- "$10", "10 dollars", "10 dolares" → 10
- "10.50" → 10.5
- Remove currency symbols, commas

**Phone number extraction rules:**
- Keep all formats: "+573001234567", "573001234567", "+57 300 123 4567"
- Don't normalize - return as given

Return ONLY valid JSON (no markdown):
{
  "command": "send" | "balance" | "start" | "history" | "about" | "help" | "unknown",
  "amount": number or null,
  "recipient": string or null,
  "confidence": 0.0 to 1.0,
  "helpfulMessage": string or null,
  "detectedLanguage": "en" | "es" | "ambiguous"
}

**Examples:**

SPANISH Question: "que es esto?"
Response:
{
  "command": "unknown",
  "confidence": 0.5,
  "helpfulMessage": "¡Hola! Soy Sippy, tu asistente de billetera en WhatsApp 😊. Puedes enviar dinero (PYUSD) a tus amigos solo con su número de teléfono. Prueba 'saldo' para ver tus fondos o 'ayuda' para ver qué puedo hacer.",
  "detectedLanguage": "es"
}

ENGLISH Question: "what is this?"
Response:
{
  "command": "unknown",
  "confidence": 0.5,
  "helpfulMessage": "Hey! I'm Sippy, your WhatsApp wallet 💰. You can send money (PYUSD) to anyone using just their phone number - it's as easy as sending a text! Try 'balance' to check your funds or 'help' to see all I can do.",
  "detectedLanguage": "en"
}

ENGLISH Question: "how does it work?"
Response:
{
  "command": "unknown",
  "confidence": 0.6,
  "helpfulMessage": "Hey! I'm your WhatsApp wallet 💰. You can send money to anyone using just their phone number - it's as easy as sending a text! Try 'balance' to check your funds or 'help' to see all I can do.",
  "detectedLanguage": "en"
}

SPANISH Command: "cuánto tengo"
Response:
{
  "command": "balance",
  "confidence": 0.95,
  "detectedLanguage": "es"
}

ENGLISH (verb "send" is English): "send 10 dolares to +573001234567"
Response:
{
  "command": "send",
  "amount": 10,
  "recipient": "+573001234567",
  "confidence": 0.95,
  "detectedLanguage": "en"
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
      helpfulMessage: result.helpfulMessage,
      detectedLanguage: result.detectedLanguage,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Timeout') {
      console.warn('LLM timeout, using fallback');
    } else {
      console.error('LLM parsing error:', error);
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
    console.warn(`LLM returned invalid command: "${result.command}"`);
    return false;
  }

  // Normalize the command for consistent handling
  result.command = normalizedCommand;

  // Validate and normalize detectedLanguage field
  if (result.detectedLanguage) {
    const validLanguages = ['en', 'es', 'ambiguous'];
    const normalizedLang = result.detectedLanguage.toLowerCase().trim();

    if (!validLanguages.includes(normalizedLang)) {
      // Handle common LLM variations
      if (normalizedLang === 'english' || normalizedLang === 'eng') {
        result.detectedLanguage = 'en';
      } else if (
        normalizedLang === 'spanish' ||
        normalizedLang === 'spa' ||
        normalizedLang === 'español'
      ) {
        result.detectedLanguage = 'es';
      } else {
        // Unknown language value - default to ambiguous
        console.warn(
          `LLM returned invalid detectedLanguage: "${result.detectedLanguage}", defaulting to "ambiguous"`
        );
        result.detectedLanguage = 'ambiguous';
      }
    } else {
      // Normalize to lowercase
      result.detectedLanguage = normalizedLang;
    }
  } else {
    // If LLM didn't provide language, mark as ambiguous
    result.detectedLanguage = 'ambiguous';
  }

  // For "unknown" commands with low confidence, accept if there's a helpful message
  if (result.command === 'unknown' && result.confidence < 0.7) {
    if (result.helpfulMessage && result.helpfulMessage.length > 10) {
      // Accept low-confidence unknown with helpful message
      return true;
    }
    return false; // Reject low-confidence unknown without helpful message
  }

  // For other commands, require higher confidence
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
// Natural Response Generator
// ============================================================================

/**
 * Generate a natural, helpful response for unknown commands
 * Detects language and responds appropriately
 */
export async function generateNaturalResponse(
  userMessage: string
): Promise<string | null> {
  const client = getGroqClient();
  if (!client || !isLLMEnabled() || isRateLimited()) return null;

  try {
    rateLimiter.recordRequest();

    const completion = await Promise.race([
      client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are Sippy, a friendly bilingual WhatsApp crypto wallet assistant.

Available commands:
- balance / saldo: Check PYUSD balance
- send [amount] to [phone]: Send money
- history / historial: View transactions
- help / ayuda: Show commands

When user sends something you don't understand:
1. Detect their language (English or Spanish)
2. Respond naturally in THEIR language
3. Be helpful and friendly (not robotic)
4. Suggest what they might have meant
5. Keep it short (2-3 sentences max)

Examples:
User: "show me stuff" → "I'm not sure what you're looking for! Try 'balance' to check your funds or 'help' to see all commands. 😊"
User: "quiero ver cosas" → "¡No estoy seguro de lo que buscas! Prueba 'saldo' para ver tus fondos o 'ayuda' para ver todos los comandos. 😊"`,
          },
          {
            role: 'user',
            content: `User said: "${userMessage}". Generate a helpful response.`,
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.7, // More creative for natural responses
        max_tokens: 150,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      ),
    ]);

    const response = completion.choices[0]?.message?.content;
    return response || null;
  } catch (error) {
    return null; // Fallback to default message
  }
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
