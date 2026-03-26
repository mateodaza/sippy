/**
 * Message Parser
 *
 * Regex-first parser with LLM fallback for ambiguous messages.
 * Send commands use regex for final validation — the LLM normalizer
 * can reformat slang but regex always validates the output, and
 * amount + recipient must appear in the original text (anti-injection).
 */

import { type ParsedCommand, type AmountErrorCode } from '../types/index.js'
import {
  isLLMEnabled,
  isRateLimited,
  parseMessageWithLLM,
  normalizeSendCommand,
  type CallMeta,
} from '../services/llm.service.js'
import logger from '@adonisjs/core/services/logger'
import { canonicalizePhone } from './phone.js'
import { logParseResult, type ParseLogEntry, type ContextMessage } from '../services/db.js'

export { normalizePhoneNumber, verifySendAgreement } from './phone.js'

// ============================================================================
// Parse context (passed from server.ts for observability)
// ============================================================================

export interface ParseContext {
  messageId: string
  phoneNumber: string
}

// ============================================================================
// Pre-LLM send attempt detector
// ============================================================================

const SEND_KEYWORDS =
  /\b(send|transfer|pay|enviar?|transferir|pagar?|envie|enviale|mand[aáe]|mandale|mandar|pasale?|pas[aá])\b/i
const HAS_NUMBER = /\d+/

function isAttemptedSend(text: string): boolean {
  return SEND_KEYWORDS.test(text) && HAS_NUMBER.test(text)
}

// ============================================================================
// Regex parser (primary — zero cost, <1ms)
// ============================================================================

/**
 * Trilingual command patterns (EN/ES/PT).
 * Pattern from Camello: REGEX_INTENTS as Record<string, RegExp[]>
 */
const COMMAND_PATTERNS: Record<string, RegExp[]> = {
  start: [/^(start|begin)$/i, /^(comenzar|iniciar)$/i, /^(come[cç]ar|iniciar)$/i],
  help: [/^(help|\?)$/i, /^ayuda$/i, /^ajuda$/i],
  about: [
    /^about$/i,
    /^(what is sippy|whats sippy|what's sippy)$/i,
    /^(acerca|qu[eé] es sippy)$/i,
    /^(sobre|o que [eé] sippy|o que é sippy)$/i,
    // Identity questions: "quién eres?", "who are you?"
    /^(qui[eé]n eres|quien eres|who are you|quem [eé] voc[eê])\??$/i,
  ],
  balance: [
    /^balance$/i,
    /^(saldo|cu[aá]nto tengo|mi saldo)$/i,
    /^(saldo|quanto tenho|meu saldo)$/i,
    // Wallet queries: "cuál es mi wallet", "mi billetera", "my wallet"
    /^(cu[aá]l es )?mi (wallet|billetera|cartera)$/i,
    /^(my wallet|minha carteira)$/i,
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
  greeting: [
    /^(hi|hello|hey|yo|sup|what's up|whats up|good morning|good afternoon|good evening)$/i,
    /^(hola|buenas?|qu[eé] tal|buenos d[ií]as|buenas tardes|buenas noches|saludos)$/i,
    /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií])$/i,
  ],
  confirm: [/^(yes|s[ií]|sim|confirmar|dale|va)$/i],
  cancel: [/^(no|cancel|cancelar|n[aã]o)$/i],
  fund: [
    /^(fund|add funds|add money|deposit|top.?up)$/i,
    /^(fundear|agregar fondos|agregar plata|agregar dinero|agregar saldo|agregar|recargar|depositar|cargar)$/i,
    /^(adicionar fundos|adicionar dinheiro|adicionar saldo|depositar|carregar)$/i,
    // Natural: "quiero agregar saldo", "quiero recargar", "want to add funds"
    /^quiero (agregar|recargar|depositar|cargar|fundear)/i,
    /^(i want to|i'd like to) (add funds|add money|deposit|top.?up)/i,
    /^quero (adicionar|depositar|carregar)/i,
  ],
  social: [
    /^(thanks|thank you|thx|ty|ok|okay|cool|got it|great|nice|perfect|awesome|sure|bye|goodbye|see you|alright|sounds good|noted|understood)$/i,
    /^(gracias|listo|vale|bien|bueno|genial|perfecto|ok[aá]y?|chao|adi[oó]s|hasta luego|de nada|ya|ya vi|entendido|enterado|arre|sale|joya|de una|todo bien|a la orden)$/i,
    /^(obrigado|obrigada|valeu|beleza|legal|perfeito|tchau|at[eé] logo|de nada|entendi|entendido|j[oó]ia|firmeza|falou|blz)$/i,
  ],
}

/** Privacy patterns — each paired with the language it signals */
const PRIVACY_PATTERNS: Array<{ pattern: RegExp; lang: 'en' | 'es' | 'pt' }> = [
  { pattern: /^privacy\s+(on|off)$/i, lang: 'en' },
  { pattern: /^privacidad\s+(on|off)$/i, lang: 'es' },
  { pattern: /^privacidade\s+(on|off)$/i, lang: 'pt' },
]

/**
 * Loose keyword patterns for read-only commands.
 * Matched when strict regex fails — catches natural language like
 * "Hola sippy! cuanto es mi balance?" without needing the LLM.
 * Only safe (non-financial) commands are included here.
 *
 * Uses (?:^|\s) / (?:\s|$) instead of \b because JS \b treats accented
 * characters (á, ó, ç, ã, õ) as non-word — breaks Spanish/Portuguese patterns.
 * Order matters: earlier entries take priority when multiple patterns match.
 */
// Order matters: fund must come before balance so "agregar saldo" matches fund, not balance.
const LOOSE_COMMAND_PATTERNS: Array<[string, RegExp]> = [
  [
    'fund',
    /(?:^|\s)(fund|fundear|add funds|add money|deposit|top.?up|agregar (?:fondos|plata|dinero|saldo)|agregar$|recargar|depositar|adicionar (?:fundos|dinheiro|saldo)|cargar|carregar)(?:\s|$)/i,
  ],
  [
    'balance',
    /(?:^|\s)(balance|saldo|cu[aá]nto tengo|quanto tenho|meu saldo|mi saldo|mi balance|cu[aá]nto es mi|mi (?:wallet|billetera|cartera)|my wallet|minha carteira)(?:\s|$)/i,
  ],
  ['help', /(?:^|\s)(help(?!ful|less|ing|er|ed)|ayuda|ajuda)(?:\s|$)/i],
  [
    'history',
    /(?:^|\s)(history|historial|hist[oó]rico|transactions?|transacciones?|transa[cç][oõ]es?)(?:\s|$)/i,
  ],
  ['settings', /(?:^|\s)(settings?|configuraci[oó]n|configura[cç][aã]o|ajustes)(?:\s|$)/i],
  [
    'about',
    /(?:^|\s)(what is sippy|whats sippy|what's sippy|qu[eé] es sippy|o que [eé] sippy|qui[eé]n eres|who are you|quem [eé] voc[eê])(?:\s|$)/i,
  ],
]

// ── Contact management patterns ────────────────────────────────────────────
const SAVE_CONTACT_PATTERNS: RegExp[] = [
  /^(?:save|add)\s+(.{1,30}?)\s+(?:as\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
  /^(?:guardar|agregar|a[nñ]adir)\s+(.{1,30}?)\s+(?:como\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
  /^(?:salvar|adicionar)\s+(.{1,30}?)\s+(?:como\s+)?(\+?\d[\d\s\-()]{6,18}\d)$/i,
]

const DELETE_CONTACT_PATTERNS: RegExp[] = [
  /^(?:delete|remove)\s+(?:contact\s+)?(.{1,30})$/i,
  /^(?:borrar|eliminar|quitar)\s+(?:contacto\s+)?(.{1,30})$/i,
  /^(?:apagar|remover|excluir)\s+(?:contato\s+)?(.{1,30})$/i,
]

const LIST_CONTACT_PATTERNS: RegExp[] = [
  /^(?:my\s+)?contacts$/i,
  /^(?:address\s*book|phonebook)$/i,
  /^(?:mis\s+)?contactos$/i,
  /^(?:libreta|agenda)$/i,
  /^(?:meus\s+)?contatos$/i,
]

/** Invite patterns: "invitar +573116613414", "invite +57...", "convidar +55..." */
const INVITE_PATTERNS: Array<{ pattern: RegExp; lang: 'en' | 'es' | 'pt' }> = [
  // EN: "invite +573001234567"
  { pattern: /^invite\s+(.+)$/i, lang: 'en' },
  // ES: "invitar +57...", "invitar a +57...", "invitale a +57...", "invita a +57...", "invítale a +57..."
  { pattern: /^inv[ií]t[aá]r?(?:le|les)?\s+(?:a\s+)?(.+)$/i, lang: 'es' },
  // PT: "convidar +55...", "convida +55...", "convidar o +55..."
  { pattern: /^convid[aá]r?\s+(?:(?:o|a)\s+)?(.+)$/i, lang: 'pt' },
]

// Optional currency word after amount: "1 dólar", "5 dolares", "10 pesos", "20 dollars"
const CURRENCY_WORD = `(?:\\s+(?:d[oó]lar(?:es)?|dollars?|pesos?|usd|plata))?`

/** Trilingual send patterns — strict format, must extract amount + recipient */
const SEND_PATTERNS: Array<{ pattern: RegExp; lang: 'en' | 'es' | 'pt' }> = [
  // EN: "send 10 to +573001234567" or "send $10 to ..." or "send 10 dollars to ..."
  {
    pattern: new RegExp(`^send\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+to\\s+(.+)$`, 'i'),
    lang: 'en',
  },
  // ES: "enviar/envía/envia/envíe/envie 10 a ..." (infinitive, imperative, subjunctive)
  // Also handles pronoun suffixes: "enviale/envíale/enviales 10 a ..."
  // Accepts optional currency word: "envía 1 dólar a ..."
  {
    pattern: new RegExp(
      `^env[ií][ae]?r?(?:le|les|lo|la|los|las)?\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+a\\s+(.+)$`,
      'i'
    ),
    lang: 'es',
  },
  // PT: "enviar/envie 10 para ..."
  {
    pattern: new RegExp(
      `^env[ií][ae]?r?\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+para\\s+(.+)$`,
      'i'
    ),
    lang: 'pt',
  },
  // ES casual: "manda/mandá/mande/mandale 5 a ..." / "transfiere/transferir 5 a ..." / "pasa/pasale 5 a ..." / "paga/pague 5 a ..."
  {
    pattern: new RegExp(
      `^(?:mand[aáe]|transfier[ae]|transferir|pas[aá]|pague?|pagar?)(?:le|les|lo|la|los|las)?\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+a\\s+(.+)$`,
      'i'
    ),
    lang: 'es',
  },
  // PT casual: "manda/mande 5 para ..." / "transfere/transferir 5 para ..." / "pague 5 para ..."
  {
    pattern: new RegExp(
      `^(?:mand[aáe]|transfere|transferir|pague?)\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+para\\s+(.+)$`,
      'i'
    ),
    lang: 'pt',
  },
  // EN alt verbs: "transfer 5 to ..." / "pay 5 to ..."
  {
    pattern: new RegExp(
      `^(?:transfer|pay)\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+to\\s+(.+)$`,
      'i'
    ),
    lang: 'en',
  },
  // Cross-language: "send 5 a ..." (EN verb + ES preposition)
  {
    pattern: new RegExp(`^send\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+a\\s+(.+)$`, 'i'),
    lang: 'es',
  },
  // Cross-language: "send 5 para ..." (EN verb + PT preposition)
  {
    pattern: new RegExp(`^send\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+para\\s+(.+)$`, 'i'),
    lang: 'pt',
  },
  // Cross-language: "enviar/envie 5 to ..." (ES/PT verb + EN preposition)
  {
    pattern: new RegExp(
      `^env[ií][ae]?r?\\s+\\$?(\\d+(?:[.,]\\d+)?)${CURRENCY_WORD}\\s+to\\s+(.+)$`,
      'i'
    ),
    lang: 'en',
  },
]

/**
 * Parse message with regex (exact matching).
 * This is the primary parser — handles 80%+ of messages at zero cost.
 */
export function parseMessageWithRegex(text: string): ParsedCommand {
  const normalizedText = text.trim().toLowerCase()

  // Check language command first (needs to extract the lang code)
  for (const pattern of COMMAND_PATTERNS.language) {
    const match = normalizedText.match(pattern)
    if (match) {
      const lang = match[1].toLowerCase() as 'en' | 'es' | 'pt'
      return { command: 'language', detectedLanguage: lang, originalText: text }
    }
  }

  // Check non-send commands against trilingual patterns
  for (const [command, patterns] of Object.entries(COMMAND_PATTERNS)) {
    if (command === 'language') continue // Already handled above
    if (patterns.some((p) => p.test(normalizedText))) {
      return { command: command as ParsedCommand['command'], originalText: text }
    }
  }

  // Check privacy command (needs capture group for action + language signal)
  for (const { pattern, lang } of PRIVACY_PATTERNS) {
    const match = normalizedText.match(pattern)
    if (match) {
      const privacyAction = match[1].toLowerCase() as 'on' | 'off'
      return { command: 'privacy', privacyAction, detectedLanguage: lang, originalText: text }
    }
  }

  // Contact management — check before send patterns to prevent
  // "save mom +573..." matching as a send command
  const trimmedText = text.trim()
  for (const pattern of SAVE_CONTACT_PATTERNS) {
    const match = trimmedText.match(pattern)
    if (match) {
      return { command: 'save_contact', alias: match[1].trim(), phone: match[2].trim() }
    }
  }

  for (const pattern of DELETE_CONTACT_PATTERNS) {
    const match = trimmedText.match(pattern)
    if (match) {
      return { command: 'delete_contact', alias: match[1].trim() }
    }
  }

  for (const pattern of LIST_CONTACT_PATTERNS) {
    if (pattern.test(normalizedText)) {
      return { command: 'list_contacts' }
    }
  }

  // Check send patterns (need to extract amount + recipient)
  for (const { pattern, lang } of SEND_PATTERNS) {
    const match = trimmedText.match(pattern)
    if (match) {
      return parseSendMatch(match, text, lang)
    }
  }

  // Check invite patterns (need to extract recipient phone)
  for (const { pattern, lang } of INVITE_PATTERNS) {
    const match = trimmedText.match(pattern)
    if (match) {
      const rawRecipient = match[1].trim()
      const recipient = canonicalizePhone(rawRecipient)
      if (recipient) {
        return { command: 'invite', recipient, detectedLanguage: lang, originalText: text }
      }
    }
  }

  // Strip greeting/filler prefix and retry send patterns
  // Catches: "Hola envia 5 a +57...", "Hey send 10 to ...", "Listo envia 5 a +57..."
  const GREETING_PREFIX =
    /^(?:hola|hey|hi|oi|buenas|oye|epa|que tal|buenos d[ií]as|buenas (?:tardes|noches)|listo|dale|vale|va|ok[aá]y?|ya|bueno|bien|si|s[ií]|sure|yes|ready)[,!.;]?\s+/i
  const withoutGreeting = trimmedText.replace(GREETING_PREFIX, '')
  if (withoutGreeting !== trimmedText) {
    for (const { pattern, lang } of SEND_PATTERNS) {
      const match = withoutGreeting.match(pattern)
      if (match) {
        return parseSendMatch(match, text, lang)
      }
    }
    // Also try partial sends after stripping greeting
    const partialAfterGreeting = matchPartialSend(withoutGreeting)
    if (partialAfterGreeting) return partialAfterGreeting
  }

  // Check partial send patterns (recipient only, no amount)
  const partialResult = matchPartialSend(trimmedText)
  if (partialResult) return partialResult

  // Unknown command
  return { command: 'unknown', originalText: text }
}

// ============================================================================
// Partial send patterns (amount-only or recipient-only)
// ============================================================================

/** Patterns for "send to <phone>" without amount */
const PARTIAL_RECIPIENT_PATTERNS: Array<{ pattern: RegExp; lang: 'en' | 'es' | 'pt' }> = [
  // EN: "send to +573001234567", "send money to +57..."
  { pattern: /^send(?:\s+(?:money|dollars?))?\s+to\s+(.+)$/i, lang: 'en' },
  // ES: "enviar a +57...", "enviar dinero a +57...", "envía a +57...", "mandar a +57..."
  {
    pattern:
      /^(?:env[ií][ae]?r?|mand[aáe]r?|transferir|pas[aá]r?)(?:le|les)?\s+(?:(?:dinero|plata|d[oó]lares?)\s+)?a\s+(.+)$/i,
    lang: 'es',
  },
  // PT: "enviar para +55...", "enviar dinheiro para +55..."
  {
    pattern: /^(?:env[ií][ae]?r?|mand[aáe]r?|transferir)\s+(?:(?:dinheiro|grana)\s+)?para\s+(.+)$/i,
    lang: 'pt',
  },
]

/** Patterns for "send <amount>" without recipient */
const PARTIAL_AMOUNT_PATTERNS: Array<{ pattern: RegExp; lang: 'en' | 'es' | 'pt' }> = [
  // EN: "send 5", "send $10"
  {
    pattern: /^send\s+\$?(\d+(?:[.,]\d+)?)(?:\s+(?:d[oó]lar(?:es)?|dollars?|pesos?|usd|plata))?$/i,
    lang: 'en',
  },
  // ES: "enviar 5", "envía 10 dólares"
  {
    pattern:
      /^(?:env[ií][ae]?r?|mand[aáe]r?|transferir|pas[aá]r?)(?:le|les)?\s+\$?(\d+(?:[.,]\d+)?)(?:\s+(?:d[oó]lar(?:es)?|pesos?|usd|plata))?$/i,
    lang: 'es',
  },
  // PT: "enviar 5", "manda 10"
  {
    pattern:
      /^(?:env[ií][ae]?r?|mand[aáe]r?|transferir)\s+\$?(\d+(?:[.,]\d+)?)(?:\s+(?:d[oó]lar(?:es)?|reais?|usd|grana))?$/i,
    lang: 'pt',
  },
]

/**
 * Match partial sends: sends with amount but no recipient, or recipient but no amount.
 * Returns a send command with only the available piece filled in.
 */
function matchPartialSend(text: string): ParsedCommand | null {
  // Recipient-only: "enviar dinero a +573001234567"
  for (const { pattern, lang } of PARTIAL_RECIPIENT_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const rawRecipient = match[1].trim()
      const recipient = canonicalizePhone(rawRecipient)
      if (recipient) {
        return { command: 'send', recipient, detectedLanguage: lang, originalText: text }
      }
    }
  }

  // Amount-only: "enviar 5"
  for (const { pattern, lang } of PARTIAL_AMOUNT_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const result = parseAndValidateAmount(match[1])
      if (result.value !== null && result.errorCode === null) {
        return {
          command: 'send',
          amount: result.value,
          isLargeAmount: result.isLarge,
          detectedLanguage: lang,
          originalText: text,
        }
      }
      if (result.errorCode) {
        return {
          command: 'send',
          amountError: result.errorCode,
          detectedLanguage: lang,
          originalText: text,
        }
      }
    }
  }

  return null
}

/**
 * Try loose keyword matching for read-only commands.
 * Only fires when strict regex returned 'unknown'.
 */
function matchLooseCommand(text: string): ParsedCommand | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:¿¡]+/g, '')
    .trim()
  for (const [command, pattern] of LOOSE_COMMAND_PATTERNS) {
    if (pattern.test(normalized)) {
      return { command: command as ParsedCommand['command'], originalText: text }
    }
  }
  return null
}

// ============================================================================
// Amount parsing and validation
// ============================================================================

interface AmountParseResult {
  value: number | null
  errorCode: AmountErrorCode | null
  isLarge: boolean // true iff value > 500 and errorCode is null
}

export function parseAndValidateAmount(raw: string): AmountParseResult {
  // Step 1: Replace all commas with dots (LATAM decimal normalization)
  const normalized = raw.replace(/,/g, '.')

  // Step 2: If more than one dot, invalid format
  const dotCount = (normalized.match(/\./g) || []).length
  if (dotCount > 1) {
    return { value: null, errorCode: 'INVALID_FORMAT', isLarge: false }
  }

  // Step 3: Exactly 3 digits after the only dot → ambiguous separator
  if (/^\d+\.\d{3}$/.test(normalized)) {
    return { value: null, errorCode: 'AMBIGUOUS_SEPARATOR', isLarge: false }
  }

  // Step 4: Parse float
  const value = Number.parseFloat(normalized)
  if (Number.isNaN(value)) {
    return { value: null, errorCode: 'INVALID_FORMAT', isLarge: false }
  }

  // Step 5: Zero check
  if (value === 0) {
    return { value: null, errorCode: 'ZERO', isLarge: false }
  }

  // Step 5b: Minimum amount check (0.1 USDC)
  if (value < 0.1) {
    return { value: null, errorCode: 'TOO_SMALL', isLarge: false }
  }

  // Step 6: Too many decimals (4+ decimal places)
  const parts = normalized.split('.')
  if (parts[1] !== undefined && parts[1].length > 2) {
    return { value: null, errorCode: 'TOO_MANY_DECIMALS', isLarge: false }
  }

  // Step 7: Too large
  if (value > 10_000) {
    return { value: null, errorCode: 'TOO_LARGE', isLarge: false }
  }

  return { value, errorCode: null, isLarge: value > 500 }
}

// ============================================================================
// Send match extraction
// ============================================================================

function parseSendMatch(
  match: RegExpMatchArray,
  originalText: string,
  lang: 'en' | 'es' | 'pt'
): ParsedCommand {
  const rawAmount = match[1] // literal text from regex, e.g. "10,50" or "1.000"
  const result = parseAndValidateAmount(rawAmount)

  if (result.errorCode !== null) {
    // Amount is invalid — carry error to controller for a specific reply
    return { command: 'send', amountError: result.errorCode, detectedLanguage: lang, originalText }
  }

  const rawRecipient = match[2].trim()
  const canonicalRecipient = canonicalizePhone(rawRecipient)
  if (!canonicalRecipient) {
    // Amount is valid but phone is bad — preserve raw text for alias resolution
    return {
      command: 'send',
      amount: result.value!,
      recipientRaw: rawRecipient,
      detectedLanguage: lang,
      originalText,
    }
  }

  return {
    command: 'send',
    amount: result.value!,
    recipient: canonicalRecipient,
    isLargeAmount: result.isLarge,
    detectedLanguage: lang,
  }
}

// ============================================================================
// Main parser: regex-first, LLM fallback
// ============================================================================

/**
 * Parse a user message into a command.
 *
 * Flow (Camello pattern: regex fast-path → LLM primary → keyword safety net):
 * 1. Strict regex (zero cost, <1ms) — exact command formats only
 * 2. Send detector — catches malformed send attempts, returns format hint
 * 3. LLM (primary classifier) — handles natural language, detects language,
 *    generates helpful messages. This is where most value comes from.
 * 4. Loose keyword matching (safety net) — catches obvious intents when LLM
 *    is disabled, rate-limited, or fails. Never as good as LLM (no language
 *    detection, no helpful messages) but prevents "unknown command" for
 *    clear queries like "cuanto es mi balance?"
 *
 * Send commands are NEVER accepted from LLM for M1.
 */
export async function parseMessage(
  text: string,
  ctx?: ParseContext,
  context: ContextMessage[] = []
): Promise<ParsedCommand> {
  const startTime = Date.now()

  // Step 1: Strict regex (exact match, zero cost)
  const regexResult = parseMessageWithRegex(text)

  if (regexResult.command !== 'unknown') {
    const result: ParsedCommand = { ...regexResult, usedLLM: false, llmStatus: 'skipped' }
    if (ctx) {
      logParse(ctx, result, 'regex', 'regex-matched', Date.now() - startTime)
    }
    return result
  }

  // Step 2: Malformed send detector → LLM normalizer → re-parse
  // The normalizer uses llama-3.1-8b-instant which has its own internal rate limiter
  // (14.4K RPD), so we only gate on isLLMEnabled() — not isRateLimited() which
  // checks the primary model (1K RPD) and would block the normalizer unnecessarily.
  if (isAttemptedSend(text)) {
    // Try LLM normalizer: turn slang into standard "enviar X a Y"
    if (isLLMEnabled()) {
      try {
        const normalized = await normalizeSendCommand(text)
        if (normalized) {
          const reparse = parseMessageWithRegex(normalized)
          if (reparse.command === 'send' && reparse.amount && reparse.recipient) {
            // Safety: verify amount and recipient from LLM output exist in the original text.
            // This prevents prompt injection from fabricating amounts or recipients.
            // Compare digits only (strip spaces/dashes from original) so "+57 315 3007266"
            // matches "573153007266".
            const amountStr = String(reparse.amount)
            const amountComma = amountStr.replace('.', ',')
            const recipientDigits = reparse.recipient.replace(/\+/g, '')
            const textDigitsOnly = text.replace(/[\s\-().]/g, '')
            if (
              (!text.includes(amountStr) && !text.includes(amountComma)) ||
              !textDigitsOnly.includes(recipientDigits)
            ) {
              logger.warn(
                'normalizeSendCommand: LLM output contains data not in original text — original: "%s", normalized: "%s"',
                text,
                normalized
              )
              // Fall through to format hint
            } else {
              const result: ParsedCommand = {
                ...reparse,
                originalText: text,
                usedLLM: true,
                llmStatus: 'normalized',
              }
              if (ctx) {
                logParse(ctx, result, 'llm', 'normalized-send', Date.now() - startTime)
              }
              return result
            }
          }
        }
      } catch (error) {
        logger.warn('normalizeSendCommand failed: %o', error)
      }
    }

    // Normalizer didn't help — return format hint
    const result: ParsedCommand = {
      command: 'send',
      originalText: text,
      usedLLM: false,
      llmStatus: 'format-hint',
    }
    if (ctx) {
      logParse(ctx, result, 'regex', 'format-hint', Date.now() - startTime)
    }
    return result
  }

  // Step 3: LLM — primary classifier for natural language
  let fallbackLlmStatus: ParsedCommand['llmStatus']
  if (!isLLMEnabled()) {
    fallbackLlmStatus = 'disabled'
  } else if (isRateLimited()) {
    fallbackLlmStatus = 'rate-limited'
  } else {
    fallbackLlmStatus = 'low-confidence' // default — overwritten on error/timeout
    try {
      const llmResponse = await parseMessageWithLLM(text, context)

      if (llmResponse?.parsed) {
        const result: ParsedCommand = {
          ...llmResponse.parsed,
          originalText: text,
          usedLLM: true,
          llmStatus: 'success',
        }
        if (ctx) {
          logParse(
            ctx,
            result,
            'llm',
            'llm-success',
            Date.now() - startTime,
            llmResponse.meta,
            text
          )
        }
        return result
      }

      // LLM returned null (low confidence / validation fail) — fall through to loose matching
      if (ctx) {
        logParse(
          ctx,
          { ...regexResult, usedLLM: true, llmStatus: 'low-confidence' },
          'llm',
          'llm-rejected',
          Date.now() - startTime,
          llmResponse?.meta
        )
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Timeout'
      fallbackLlmStatus = isTimeout ? 'timeout' : 'error'
      if (isTimeout) {
        logger.warn('LLM timeout in parseMessage')
      } else {
        logger.error('LLM error in parseMessage: %o', error)
      }
      if (ctx) {
        logParse(
          ctx,
          { ...regexResult, usedLLM: true, llmStatus: fallbackLlmStatus },
          'llm',
          isTimeout ? 'llm-timeout' : 'llm-error',
          Date.now() - startTime
        )
      }
      // Fall through to loose matching
    }
  }

  // Step 4: Loose keyword matching (safety net when LLM unavailable/failed)
  const looseResult = matchLooseCommand(text)
  if (looseResult) {
    const result: ParsedCommand = { ...looseResult, usedLLM: false, llmStatus: fallbackLlmStatus }
    if (ctx) {
      logParse(ctx, result, 'regex', 'loose-matched', Date.now() - startTime)
    }
    return result
  }

  // Nothing matched — return unknown
  const result: ParsedCommand = { ...regexResult, usedLLM: false, llmStatus: fallbackLlmStatus }
  if (ctx) {
    logParse(
      ctx,
      result,
      'regex',
      fallbackLlmStatus === 'disabled' ? 'llm-disabled' : 'fallback-miss',
      Date.now() - startTime
    )
  }
  return result
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
  meta?: CallMeta,
  originalText?: string
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
    originalText, // sanitized into matched_phrase inside logParseResult for llm-success rows
  }
  // Fire-and-forget — never blocks message handling
  logParseResult(entry)
}

// Help/About re-exported from message catalog for backward compatibility
export { formatHelpMessage as getHelpText, formatAboutMessage as getAboutText } from './messages.js'
