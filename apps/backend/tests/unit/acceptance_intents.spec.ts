/**
 * Acceptance-criteria intent smoke for Pizza Day eve.
 *
 * Confirms the regex parser routes each of the headline event-day
 * commands to the correct intent. The regex layer runs before SMART/LLM,
 * so a green run here means these strings cannot be mis-classified at
 * the LLM layer regardless of model wobble.
 *
 * The list is a backstop against silent regressions in COMMAND_PATTERNS
 * — `mi codigo` vs `mi codigo de pago` in particular has bitten us
 * before and the boundary deserves a dedicated assertion.
 */

import { test } from '@japa/runner'
import { parseMessageWithRegex } from '#utils/message_parser'

const cases: Array<{ input: string; expected: string; why?: string }> = [
  // 1. saldo / balance — core
  { input: 'saldo', expected: 'balance' },
  { input: 'SALDO', expected: 'balance', why: 'case-insensitive' },
  { input: 'mi saldo', expected: 'balance' },
  { input: 'balance', expected: 'balance' },
  { input: 'meu saldo', expected: 'balance' },

  // 2. mi billetera — routed to balance by design (reply appends dashboard link)
  { input: 'mi billetera', expected: 'balance' },
  { input: 'mi wallet', expected: 'balance' },
  { input: 'cual es mi billetera', expected: 'balance' },

  // 3. mi qr / pay_qr
  { input: 'mi qr', expected: 'pay_qr', why: 'bare mi qr — recently added pattern' },
  { input: 'mi codigo de pago', expected: 'pay_qr' },
  { input: 'pay qr', expected: 'pay_qr' },
  { input: 'my pay code', expected: 'pay_qr' },

  // 4. mi codigo — must NOT collide with pay_qr
  { input: 'mi codigo', expected: 'referral_code' },
  { input: 'mi código', expected: 'referral_code', why: 'accented' },
  { input: 'my code', expected: 'referral_code' },

  // 5. mi quest
  { input: 'mi quest', expected: 'quest_status' },
  { input: 'mis entradas', expected: 'quest_status' },
  { input: 'cuantas entradas tengo', expected: 'quest_status' },
  { input: 'como voy en el quest', expected: 'quest_status' },
  { input: 'how am I doing', expected: 'quest_status' },

  // 6. pizza_day — added after a real user asked "Que es el pizza day?"
  //    and the bot routed to out_of_scope. Now an explicit intent.
  { input: 'pizza day', expected: 'pizza_day' },
  { input: 'que es pizza day', expected: 'pizza_day' },
  { input: 'que es el pizza day', expected: 'pizza_day' },
  { input: 'Que es el pizza day?', expected: 'pizza_day', why: 'real transcript form' },
  { input: 'what is pizza day', expected: 'pizza_day', why: 'EN' },

  // Sanity — known no-collision commands stayed put
  { input: 'ayuda', expected: 'help' },
  { input: 'historial', expected: 'history' },
  { input: 'si', expected: 'confirm' },
  { input: 'cancelar', expected: 'cancel' },

  // 7. elongation tolerance — WhatsApp users emphasize by repeating final
  //    chars. Real 2026-05-22 transcript: "AYUDAAAA" missed the strict
  //    `^ayuda$` regex, fell to SMART, looked like the bot ignored it
  //    when an unrelated POAP DM was firing in parallel.
  { input: 'AYUDAAAA', expected: 'help', why: 'elongated ayuda' },
  { input: 'ayudaa', expected: 'help' },
  { input: 'helpp', expected: 'help', why: 'elongated EN help' },
  { input: 'helppppp', expected: 'help' },
  { input: 'ajudaa', expected: 'help', why: 'elongated PT ajuda' },
]

test.group('Acceptance intents | Pizza Day commands', () => {
  for (const ca of cases) {
    const title = `'${ca.input}' → ${ca.expected}${ca.why ? ` (${ca.why})` : ''}`
    test(title, async ({ assert }) => {
      const result = parseMessageWithRegex(ca.input)
      assert.equal(
        result.command,
        ca.expected,
        `expected '${ca.expected}' for input '${ca.input}', got '${result.command}'`
      )
    })
  }
})
