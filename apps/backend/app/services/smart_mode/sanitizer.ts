/**
 * SMART MODE — text sanitizer for LLM-generated user-facing strings
 *
 * The classifier writes two free-form fields: `clarifying_question` (when
 * ambiguous) and `oos_redirect` (when out of scope). Both can leak unsafe
 * content if the model misbehaves:
 *
 *   • URLs the model invented (could phish)
 *   • Money amounts the model fabricated (could mislead about state)
 *   • YES/SI/SIM/CONFIRMAR tokens (would short-circuit the deterministic
 *     confirm flow if echoed back as a user reply expectation)
 *
 * This module returns null when the text fails any rule — the dispatcher
 * falls back to a deterministic template instead of trying to repair a
 * mangled string. A weird half-stripped sentence is worse than a stock one.
 *
 * Same rules apply to both `clarifying_question` and `oos_redirect` today.
 * Per audit feedback, intent-specific wrappers exist so the rules can
 * diverge later without touching call sites.
 */

const MAX_LEN = 160

// Match http(s):// or bare-domain URLs like "sippy.lat/x", "example.com"
const URL_RE = /https?:\/\/\S+|\b\S+\.(?:com|net|org|io|lat|app|me|dev|co|ai)\S*/i

// Money mentions — $ or numeric followed by currency word/code.
// Both spellings for major LATAM tokens included.
const AMOUNT_RE =
  /\$\s*\d|\b\d+\s*(?:usdc?|usd|dollars?|d[oó]lar(?:es)?|pesos?|reais?|soles?|lempiras?|quetzales?|colones?|bol[ií]vares?|guaranie?s?)\b/i

// Confirmation tokens — belong to the deterministic flow, not LLM copy
const CONFIRM_TOKEN_RE = /\b(?:yes|si|sí|sim|confirmar|confirma|confirmas)\b/i

/**
 * Apply the shared sanitization rules. Returns null on any rejection so
 * the caller falls back to a deterministic template — never returns a
 * partially-mutated string.
 *
 * Order matters: hard-reject checks run against the FULL trimmed string
 * BEFORE the length cap. Otherwise a banned token sitting past char 160
 * would be sliced off, the truncated result would pass, and we'd ship
 * the LLM's URL/amount/YES-bait to the user.
 */
function sanitize(text: string | null | undefined): string | null {
  if (!text) return null

  const trimmed = text.trim()
  if (trimmed.length === 0) return null

  // Hard rejects against the full trimmed input — must run BEFORE any
  // truncation. Banned content past the cap must still cause rejection.
  if (URL_RE.test(trimmed)) return null
  if (AMOUNT_RE.test(trimmed)) return null
  if (CONFIRM_TOKEN_RE.test(trimmed)) return null

  // Length cap — WhatsApp-shaped reply. Safe to truncate now: no banned
  // tokens survived the rejects above.
  const capped = trimmed.length > MAX_LEN ? trimmed.slice(0, MAX_LEN - 1).trim() + '…' : trimmed

  // Minimum useful length after trimming — a 2-char "ok" is gibberish, not a question
  if (capped.length < 5) return null

  return capped
}

/**
 * Sanitize an LLM-authored clarifying question before sending to the user.
 * Returns null when the text trips any rule; caller should fall back to
 * a deterministic per-slot clarifier (see `DEFAULT_CLARIFICATIONS` in
 * `validators.ts`).
 */
export function sanitizeClarification(text: string | null | undefined): string | null {
  return sanitize(text)
}

/**
 * Sanitize an LLM-authored OOS redirect before sending to the user.
 * Returns null when the text trips any rule; caller should fall back to
 * a deterministic capability hint.
 *
 * Currently shares rules with `sanitizeClarification`, but exposed as its
 * own export so divergence (e.g. allowing URLs in OOS for product
 * deep-links) is a one-line change here, not in every call site.
 */
export function sanitizeOosRedirect(text: string | null | undefined): string | null {
  return sanitize(text)
}
