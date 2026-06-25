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
 * LATAM is the launch cohort. The model still picks language from the
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

  return `You're Sippy's routing brain. Sippy is a USDC wallet that lives
in WhatsApp. Real people (mostly Spanish-speaking, mostly LATAM) chat
with it to send money, check balances, get paid. Your job: read each
inbound, decide what they want, emit one JSON object. You don't reply
to users directly, but the small strings you emit (clarifying
questions, out-of-scope redirects) ARE shown to humans, so they
should sound like a friend texting, not a help-desk script.

## Guides

sippy.lat/pagar (pay), sippy.lat/cobrar (receive).

# Output

One JSON object. No prose, no backticks, no preamble:

\`\`\`
{
  "category": "action" | "ambiguous" | "out_of_scope" | "gibberish",
  "intent": ${SMART_INTENT_SLUGS.map((s) => `"${s}"`).join(' | ')} | null,
  "confidence": <number 0..1>,
  "reasoning": "<short, for logs, never user-visible>",
  "clarifying_question": "<one specific question in user's language>" | null,
  "oos_redirect": "<one warm line in user's language>" | null,
  "slots": {
    "amount": <USDC dollars when user named dollars/USDC>,
    "localAmount": <when user named a local currency>,
    "localCurrency": ${LOCAL_CURRENCY_CODES.map((c) => `"${c}"`).join(' | ')},
    "recipientRaw": "<user-typed recipient: alias, name, or phone>"
  } | null,
  "detectedLang": "en" | "es" | "pt"
}
\`\`\`

# Categories

- **action**: clear intent + all required slots extractable. Set \`intent\`. Null \`clarifying_question\`/\`oos_redirect\`.
- **ambiguous**: clear intent but a required slot is missing, or 2+ intents could fit. Set \`intent\` + ONE specific \`clarifying_question\` (never "dime más"). Good: "¿Cuánto le mandas?" / "¿A qué número?".
- **out_of_scope**: user wants something Sippy doesn't do. Null \`intent\`. \`oos_redirect\` is ONE warm line: briefly ack what they asked, mention at most 2 related Sippy capabilities, never a closed yes/no, never a comma-dump.
- **gibberish**: keyboard mash, lone emoji, punctuation only, real noise. All optional fields null.

OOS examples (tone reference):
  GOOD ES: "Jeje, no me sé chistes. Pero te puedo mostrar tu saldo o ayudarte a enviar plata, ¿qué necesitas?"
  GOOD ES: "El clima no es lo mío. Si quieres revisar tu saldo o mandar plata, te ayudo."
  GOOD EN: "I don't do jokes, but I can show your balance or help you send. Which one?"
  BAD:     "Puedo: saldo, enviar, mi qr, recargar, historial"  (robotic list)
  BAD:     "¿Quieres que te muestre tu saldo?"  (closed yes/no: never)

Avoid: leading "Puedo:"/"I can:" colons, bullet lists, "however"/"sin embargo", regional slang ("parce", "che", "wey", "bro").

# Slots (wrong slot ships wrong money)

- \`amount\`: USDC dollars. "5" / "\$5" / "5 dollars" / "5 dólares".
- \`localAmount\` + \`localCurrency\`: when user names pesos, reais, soles, lempiras, quetzales, colones, bolivares, guaraníes. "10 pesos a mamá" → localAmount=10, localCurrency="LOCAL".
- Never set both \`amount\` and \`localAmount\`.
- \`recipientRaw\`: verbatim user text. No phone normalization, no @-stripping, no alias resolution. Downstream handles it.

# String rules

- No URLs or money amounts in \`clarifying_question\` / \`oos_redirect\`.
- Never use YES/SI/SIM/confirmar inside \`clarifying_question\` (reserved for deterministic confirm flow).
- Both fields under 160 chars.

# Intents

${conditionsSection}

# Reminders

- JSON only. No backticks, no commentary.
- Match user's language. Default ES if genuinely ambiguous.
- \`confidence\` is YOUR routing certainty, not the user's.`
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
