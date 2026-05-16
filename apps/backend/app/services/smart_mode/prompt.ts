/**
 * SMART MODE — prompt builder
 *
 * Generates the system prompt for the classifier LLM call. Built from the
 * INTENT_CONDITIONS table so adding/editing an intent updates the prompt
 * automatically — never hand-edit a prompt section that should be data.
 *
 * Hard rules embedded in the prompt (mirrored by Zod schema + validator):
 *   - JSON output ONLY, matching the documented shape
 *   - `intent` MUST be null for category=out_of_scope or gibberish
 *   - `intent` MUST be a value from SMART_INTENT_SLUGS for action/ambiguous
 *   - For send: extract `slots.localAmount` + `slots.localCurrency` when
 *     a local currency word is present; never set both `amount` and
 *     `localAmount`
 *   - `clarifying_question` must be one specific question, never
 *     "tell me more" — populated only for category=ambiguous
 *
 * Spanish-primary: examples and clarification text default to ES because
 * Pizza Day is the launch cohort. The model still picks language from the
 * inbound message (set `detectedLang` in output).
 */

import type { ContextMessage } from '#services/db'
import { INTENT_CONDITIONS } from './conditions.js'
import { SMART_INTENT_SLUGS, LOCAL_CURRENCY_CODES } from './types.js'

// Deterministic context cap: at most N turns, each clamped to M chars.
// Predictable token usage; no token counting heuristics.
const MAX_CONTEXT_TURNS = 8
const MAX_CHARS_PER_TURN = 250

/**
 * Build the system prompt. Pure function of the conditions table — same
 * input always produces same output (no Date.now(), no randomness).
 */
export function buildSystemPrompt(): string {
  const conditionsSection = INTENT_CONDITIONS.map((c) => {
    const slotsLine = c.requiresSlots.length
      ? `Required slots: ${c.requiresSlots.join(', ')}`
      : 'No slots required'
    const examplesLine = `Examples: ${c.examples.map((e) => `"${e}"`).join(' | ')}`
    const antiLine = c.notRoutedHere?.length
      ? `Do NOT classify as ${c.slug}: ${c.notRoutedHere.map((e) => `"${e}"`).join(' | ')}`
      : ''
    return [`### ${c.slug}`, c.description, slotsLine, examplesLine, antiLine]
      .filter(Boolean)
      .join('\n')
  }).join('\n\n')

  return `You are Sippy's intent classifier for WhatsApp messages.

Your ONLY job: read the user's message and emit ONE JSON object describing
its category, intent (if any), and extracted slots. Never write prose,
never explain, never apologize. JSON only.

# Output schema

\`\`\`
{
  "category": "action" | "ambiguous" | "out_of_scope" | "gibberish",
  "intent": ${SMART_INTENT_SLUGS.map((s) => `"${s}"`).join(' | ')} | null,
  "confidence": <number 0..1>,
  "reasoning": "<short — for logs, never user-visible>",
  "clarifying_question": "<one specific question in user's language>" | null,
  "oos_redirect": "<one-line capability hint in user's language>" | null,
  "slots": {
    "amount": <USDC dollars when user named dollars/USDC>,
    "localAmount": <when user named a local currency>,
    "localCurrency": ${LOCAL_CURRENCY_CODES.map((c) => `"${c}"`).join(' | ')},
    "recipientRaw": "<user-typed recipient: alias, name, or phone>"
  } | null,
  "detectedLang": "en" | "es" | "pt"
}
\`\`\`

# Category rules (HARD)

- **action**: the user clearly wants Sippy to do one of the listed intents AND
  all required slots are extractable. \`intent\` MUST be set. \`clarifying_question\`
  and \`oos_redirect\` MUST be null.
- **ambiguous**: intent is identifiable but at least one required slot is missing,
  or the message could be 2+ intents. \`intent\` MUST be set. \`clarifying_question\`
  MUST be set — ONE specific question, never "dime más" / "tell me more".
- **out_of_scope**: the user wants something Sippy doesn't do (weather, crypto
  trivia, unrelated services). \`intent\` MUST be null. \`oos_redirect\` MUST be set
  with a one-line "I can: saldo, enviar, mi qr" style hint.
- **gibberish**: keyboard mash, single emoji, punctuation only, repeated chars,
  random noise. \`intent\` MUST be null. \`oos_redirect\` and \`clarifying_question\`
  null.

# Slot extraction rules (HARD — wrong slot ships wrong money)

- \`amount\`: USDC dollars. Use when user typed "5", "$5", "5 dollars", "5 dolares".
- \`localAmount\` + \`localCurrency\`: when the user names a local currency word
  (pesos, reais, soles, lempiras, quetzales, colones, bolivares, guaraníes).
  Example: "10 pesos a mamá" → localAmount=10, localCurrency="LOCAL".
- NEVER set both \`amount\` and \`localAmount\` — pick one.
- \`recipientRaw\`: pass through exactly what the user typed. Don't normalize
  phone numbers, don't strip "@", don't resolve aliases — downstream handles it.

# Strings (HARD)

- Never put URLs in clarifying_question or oos_redirect.
- Never put money amounts in clarifying_question or oos_redirect.
- Never use "YES", "SI", "SIM", "confirmar" in clarifying_question — those are
  reserved for the deterministic confirm flow.
- Keep clarifying_question + oos_redirect under 160 chars.

# Intents

${conditionsSection}

# Final reminders

- JSON ONLY. No backticks, no prose, no preamble.
- Default language: match the user's message. When ambiguous, ES.
- Confidence reflects YOUR certainty about the category + intent, not the
  user's certainty about what they want.`
}

/**
 * Project conversation context into Groq chat-format messages. Deterministic
 * cap: last MAX_CONTEXT_TURNS messages, each clamped to MAX_CHARS_PER_TURN.
 *
 * Returns an array suitable for spreading into `messages` between the
 * system prompt and the current user message. Empty array when context is
 * empty.
 */
export function buildContextMessages(
  context: ContextMessage[]
): Array<{ role: 'user'; content: string }> {
  if (!context.length) return []
  const tail = context.slice(-MAX_CONTEXT_TURNS)
  return tail.map((m) => ({
    role: 'user',
    content:
      m.content.length > MAX_CHARS_PER_TURN
        ? m.content.slice(0, MAX_CHARS_PER_TURN - 1) + '…'
        : m.content,
  }))
}

/**
 * Wrap the current user message for the classifier. Light envelope —
 * marks it as the message-to-classify so the LLM doesn't confuse it with
 * the context history.
 */
export function buildUserMessage(text: string, preferredLang?: 'en' | 'es' | 'pt'): string {
  const langHint = preferredLang ? `[User's preferred language: ${preferredLang}]\n` : ''
  return `${langHint}Message to classify: ${text}`
}
