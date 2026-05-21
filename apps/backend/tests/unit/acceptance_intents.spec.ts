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

  // Sanity — known no-collision commands stayed put
  { input: 'ayuda', expected: 'help' },
  { input: 'historial', expected: 'history' },
  { input: 'si', expected: 'confirm' },
  { input: 'cancelar', expected: 'cancel' },
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
