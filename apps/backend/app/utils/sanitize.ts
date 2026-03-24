/**
 * Outbound Message Sanitizer
 *
 * Final safety net before any message reaches the user via WhatsApp.
 * Catches raw JSON, LLM artifacts, forbidden terms, and formatting issues.
 *
 * Two levels:
 * - Clean: fix minor issues (markdown, emojis, length) and send the cleaned version
 * - Block: replace dangerous content (raw JSON, forbidden terms) with a safe fallback
 *
 * NOTE: All regexes used for cleaning are created inline (no module-level `g` flags)
 * to avoid stale lastIndex bugs. Blocking regexes have no `g` flag so .test() is safe.
 */

// ============================================================================
// Safe fallback (when content is too broken to salvage)
// ============================================================================

const SAFE_FALLBACK: Record<string, string> = {
  en: 'Something went wrong. Try again — just tell me what you need.',
  es: 'Algo salio mal. Intenta de nuevo — solo dime que necesitas.',
  pt: 'Algo deu errado. Tenta de novo — so me diz o que precisa.',
}

// ============================================================================
// Blocking patterns (no `g` flag — .test() is safe on these)
// ============================================================================

// Raw JSON that leaked from LLM or internal code
const RAW_JSON = /^\s*[\[{][\s\S]*["'][\w]+["']\s*:/

// Forbidden terms for a financial product (case-insensitive, no `g`)
const FORBIDDEN_TERMS =
  /\b(crypto(?:currency|currencies)?|blockchain|web3|defi|decentralized finance|smart contract|private key|seed phrase|mnemonic)\b/i

// Off-scope claims — things Sippy cannot do (case-insensitive, no `g`)
// Blocks LLM hallucinations that promise features we don't have
// Covers EN, ES, and PT variants
const OFF_SCOPE_CLAIMS =
  /\b(pagar? (?:facturas?|servicios?|cuentas?|contas?|boletos?)|compras? (?:en l[ií]nea|online)|tarjetas? (?:de (?:cr[eé]dito|d[eé]bito))?|cart[aã]o (?:de (?:cr[eé]dito|d[eé]bito))?|pr[eé]stamos?|empr[eé]stimos?|ahorros?|poupan[cç]a|inversiones?|investimentos?|interest|savings? account|credit card|debit card|loan|bill pay|online (?:shop|purchas|buy))/i

// Internal error stack traces
const STACK_TRACE = /(?:at\s+\w+\s+\(|Error:\s+\w+Error|node_modules\/)/

// ============================================================================
// Trusted URL domains (positive allowlist with boundary checks)
// ============================================================================

const TRUSTED_DOMAINS = ['arbiscan.io', 'sippy.lat']

function isUrlTrusted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return TRUSTED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// ============================================================================
// Types
// ============================================================================

// WhatsApp text body limit
const MAX_LENGTH = 4096

export interface SanitizeResult {
  text: string
  modified: boolean
  blocked: boolean
  violations: string[]
}

// ============================================================================
// Helpers — replace-and-track (avoids .test() on stateful regexes)
// ============================================================================

/**
 * Apply a regex replacement. If anything changed, push the violation tag.
 * Returns the (possibly modified) string.
 */
function strip(
  input: string,
  pattern: RegExp,
  replacement: string,
  tag: string,
  violations: string[]
): string {
  const result = input.replace(pattern, replacement)
  if (result !== input) violations.push(tag)
  return result
}

// ============================================================================
// Main sanitizer
// ============================================================================

export function sanitizeOutboundMessage(text: string, lang: string = 'en'): SanitizeResult {
  const fallback = SAFE_FALLBACK[lang] || SAFE_FALLBACK.en
  const violations: string[] = []

  // --- Empty check ---
  if (!text || !text.trim()) {
    return { text: fallback, modified: true, blocked: true, violations: ['empty-message'] }
  }

  let cleaned = text

  // --- Blocking checks (.test() on non-global regexes — safe) ---

  if (RAW_JSON.test(cleaned)) {
    violations.push('raw-json')
    return { text: fallback, modified: true, blocked: true, violations }
  }

  if (STACK_TRACE.test(cleaned)) {
    violations.push('stack-trace')
    return { text: fallback, modified: true, blocked: true, violations }
  }

  if (FORBIDDEN_TERMS.test(cleaned)) {
    violations.push('forbidden-terms')
    return { text: fallback, modified: true, blocked: true, violations }
  }

  if (OFF_SCOPE_CLAIMS.test(cleaned)) {
    violations.push('off-scope-claim')
    return { text: fallback, modified: true, blocked: true, violations }
  }

  // --- Cleaning checks (replace-and-compare, no .test() on g regexes) ---

  // Strip LLM thinking tags and their content
  cleaned = strip(
    cleaned,
    /<(?:think|thinking|reasoning|reflection|scratchpad)>[\s\S]*?<\/(?:think|thinking|reasoning|reflection|scratchpad)>/gi,
    '',
    'thinking-tags',
    violations
  )

  // Strip code blocks (extract inner content)
  cleaned = strip(cleaned, /```\w*\n?/g, '', 'code-blocks', violations)

  // Strip inline code markers
  cleaned = strip(cleaned, /`([^`]+)`/g, '$1', 'inline-code', violations)

  // Strip markdown headers
  cleaned = strip(cleaned, /^#{1,6}\s+/gm, '', 'markdown-headers', violations)

  // Simplify markdown bold to WhatsApp bold (single *)
  cleaned = strip(cleaned, /\*{2,3}([^*]+)\*{2,3}/g, '*$1*', 'markdown-emphasis', violations)

  // Replace untrusted URLs (positive allowlist with proper hostname parsing)
  const before = cleaned
  cleaned = cleaned.replace(/https?:\/\/[^\s)]+/gi, (url) => {
    return isUrlTrusted(url) ? url : '[link removed]'
  })
  if (cleaned !== before) violations.push('untrusted-url')

  // Strip emojis
  cleaned = strip(
    cleaned,
    /[\u{1F600}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
    '',
    'emojis',
    violations
  )

  // Strip control characters (except newline, tab)
  // eslint-disable-next-line no-control-regex
  cleaned = strip(cleaned, /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '', 'control-chars', violations)

  // Collapse excessive newlines (max 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // Trim
  cleaned = cleaned.trim()

  // Truncate if too long
  if (cleaned.length > MAX_LENGTH) {
    cleaned = cleaned.substring(0, MAX_LENGTH - 3) + '...'
    violations.push('truncated')
  }

  // Final empty check after cleaning
  if (!cleaned) {
    return {
      text: fallback,
      modified: true,
      blocked: true,
      violations: [...violations, 'empty-after-clean'],
    }
  }

  return {
    text: cleaned,
    modified: cleaned !== text,
    blocked: false,
    violations,
  }
}
