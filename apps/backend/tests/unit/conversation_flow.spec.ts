/**
 * Conversation Flow Tests
 *
 * Simulates realistic WhatsApp conversations end-to-end:
 * parser → command detection → response formatting.
 * Validates personality, normalizer, and safety without hitting external APIs.
 */

import { test } from '@japa/runner'
import { parseMessage, parseMessageWithRegex } from '#utils/message_parser'
import {
  formatHelpMessage,
  formatGreetingMessage,
  formatSocialReplyMessage,
  formatUnknownCommandMessage,
  formatInvalidSendFormat,
  formatTextOnlyMessage,
  formatRateLimitedMessage,
  formatCommandErrorMessage,
  formatWelcomeMessage,
  formatAboutMessage,
  formatHistoryMessage,
  formatSettingsMessage,
  type Lang,
} from '#utils/messages'

// ============================================================================
// 1. Personality: responses sound like a friend, not a support bot
// ============================================================================

test.group('Conversation | Personality — No Robotic Language', () => {
  const roboticWords = [
    'command',
    'Command',
    'COMMAND',
    'recognized',
    'invalid format',
    'Error processing',
  ]

  function assertNotRobotic(text: string, label: string) {
    for (const word of roboticWords) {
      if (text.includes(word)) {
        throw new Error(`${label} contains robotic word: "${word}"\n\nFull text: ${text}`)
      }
    }
  }

  const langs: Lang[] = ['en', 'es', 'pt']

  for (const lang of langs) {
    test(`help message (${lang}) sounds natural`, ({ assert }) => {
      const msg = formatHelpMessage(lang)
      assertNotRobotic(msg, `help(${lang})`)
      assert.isTrue(msg.length > 20)
    })

    test(`greeting message (${lang}) sounds natural`, ({ assert }) => {
      const msg = formatGreetingMessage(lang)
      assertNotRobotic(msg, `greeting(${lang})`)
      assert.isTrue(msg.length > 20)
    })

    test(`unknown command message (${lang}) sounds natural`, ({ assert }) => {
      const msg = formatUnknownCommandMessage('asdfgh', lang)
      assertNotRobotic(msg, `unknown(${lang})`)
      // Should NOT dump the full help — keep it short
      assert.isFalse(msg.includes('history'), `unknown(${lang}) should not dump full command list`)
    })

    test(`invalid send format (${lang}) sounds natural`, ({ assert }) => {
      const msg = formatInvalidSendFormat(lang)
      assertNotRobotic(msg, `invalidSend(${lang})`)
      assert.isTrue(msg.length > 20)
    })

    test(`social reply (${lang}) is short and casual`, ({ assert }) => {
      const msg = formatSocialReplyMessage(lang)
      assertNotRobotic(msg, `social(${lang})`)
      assert.isTrue(msg.length < 100, `social reply too long: ${msg.length} chars`)
    })

    test(`text-only message (${lang}) sounds natural`, () => {
      const msg = formatTextOnlyMessage(lang)
      assertNotRobotic(msg, `textOnly(${lang})`)
    })

    test(`rate-limited message (${lang}) sounds natural`, ({ assert }) => {
      const msg = formatRateLimitedMessage(lang)
      assertNotRobotic(msg, `rateLimited(${lang})`)
      assert.isFalse(
        msg.toLowerCase().includes('natural language'),
        `should not say "natural language"`
      )
    })

    test(`error message (${lang}) sounds natural`, () => {
      const msg = formatCommandErrorMessage(lang)
      assertNotRobotic(msg, `error(${lang})`)
    })
  }

  test('welcome message (new user, en) sounds natural', ({ assert }) => {
    const msg = formatWelcomeMessage({ wallet: '0x1234567890abcdef', isNew: true }, 'en')
    assertNotRobotic(msg, 'welcome-new')
    assert.isTrue(msg.includes("You're all set"))
  })

  test('welcome message (returning user, es) sounds natural', ({ assert }) => {
    const msg = formatWelcomeMessage({ wallet: '0x1234567890abcdef', isNew: false }, 'es')
    assertNotRobotic(msg, 'welcome-return-es')
    assert.isTrue(msg.includes('De vuelta'))
  })
})

// ============================================================================
// 2. Normalizer: slang/casual sends detected and parsed correctly
// ============================================================================

test.group('Conversation | Slang Send Detection (isAttemptedSend)', () => {
  // These should be detected as attempted sends and get a format-hint
  // (normalizer is off in tests, so they fall through to format-hint)
  // These have send keywords + numbers but don't match strict send regex
  // → isAttemptedSend triggers → with LLM off, falls to format-hint or skipped
  const slangSends = [
    { input: 'pasale 10 al 3116613414', expectCmd: 'send' },
    'manda 50 al 3001234567',
    'enviale 100 al 3112223344',
  ]

  for (const entry of slangSends) {
    const input = typeof entry === 'string' ? entry : entry.input
    test(`"${input}" → detected as send attempt`, async ({ assert }) => {
      const result = await parseMessage(input)
      // With LLM off, slang sends either match regex directly or get format-hint/skipped
      assert.equal(result.command, 'send')
    })
  }

  // These regex-matched sends should parse fully (amount + recipient via regex)
  const regexSends = [
    { input: 'mandale 20 a 3116613414', expectAmount: 20 },
    { input: 'manda 50 a +573001234567', expectAmount: 50 },
  ]

  for (const s of regexSends) {
    test(`"${s.input}" → regex-matched send ($${s.expectAmount})`, async ({ assert }) => {
      const result = await parseMessage(s.input)
      assert.equal(result.command, 'send')
      assert.approximately(result.amount!, s.expectAmount, 0.01)
    })
  }

  // These should NOT be detected as sends
  const notSends = ['hola como estas', 'cuanto tengo', 'dame ayuda']

  for (const input of notSends) {
    test(`"${input}" → NOT a send attempt`, async ({ assert }) => {
      const result = await parseMessage(input)
      assert.notEqual(result.llmStatus, 'format-hint')
    })
  }
})

// ============================================================================
// 3. Regex: standard commands still work perfectly
// ============================================================================

test.group('Conversation | Standard Commands (Regression)', () => {
  const conversations: { user: string; expectCommand: string; expectLang?: string }[] = [
    // English
    { user: 'help', expectCommand: 'help' },
    { user: 'balance', expectCommand: 'balance' },
    { user: 'history', expectCommand: 'history' },
    { user: 'about', expectCommand: 'about' },
    { user: 'start', expectCommand: 'start' },
    { user: 'settings', expectCommand: 'settings' },
    // Spanish (non-send commands don't set detectedLanguage in regex)
    { user: 'ayuda', expectCommand: 'help' },
    { user: 'saldo', expectCommand: 'balance' },
    { user: 'historial', expectCommand: 'history' },
    { user: 'ajustes', expectCommand: 'settings' },
    { user: 'iniciar', expectCommand: 'start' },
    // Portuguese
    { user: 'ajuda', expectCommand: 'help' },
    // Greetings
    { user: 'hola', expectCommand: 'greeting' },
    { user: 'hey', expectCommand: 'greeting' },
    { user: 'hi', expectCommand: 'greeting' },
    { user: 'buenas', expectCommand: 'greeting' },
    { user: 'oi', expectCommand: 'greeting' },
    // Social
    { user: 'gracias', expectCommand: 'social' },
    { user: 'thanks', expectCommand: 'social' },
    { user: 'obrigado', expectCommand: 'social' },
    // Confirm/cancel
    { user: 'si', expectCommand: 'confirm' },
    { user: 'yes', expectCommand: 'confirm' },
    { user: 'confirmar', expectCommand: 'confirm' },
    { user: 'no', expectCommand: 'cancel' },
    { user: 'cancelar', expectCommand: 'cancel' },
  ]

  for (const c of conversations) {
    test(`"${c.user}" → ${c.expectCommand}`, async ({ assert }) => {
      const result = await parseMessage(c.user)
      assert.equal(result.command, c.expectCommand)
      if (c.expectLang) {
        assert.equal(result.detectedLanguage, c.expectLang)
      }
    })
  }
})

// ============================================================================
// 4. Send commands: amount + recipient extraction across languages
// ============================================================================

test.group('Conversation | Send Parsing (Trilingual)', () => {
  const sends = [
    { user: 'send 10 to +573001234567', amount: 10, recipient: '+573001234567', lang: 'en' },
    { user: 'enviar 20 a +573116613414', amount: 20, recipient: '+573116613414', lang: 'es' },
    { user: 'enviar 15 para +5511999887766', amount: 15, recipient: '+5511999887766', lang: 'pt' },
    { user: 'manda 5 a +573001234567', amount: 5, recipient: '+573001234567', lang: 'es' },
    { user: 'transfer 100 to +12025551234', amount: 100, recipient: '+12025551234', lang: 'en' },
    { user: 'pay 50 to +573009876543', amount: 50, recipient: '+573009876543', lang: 'en' },
    // With $ sign
    { user: 'send $25 to +573001234567', amount: 25, recipient: '+573001234567', lang: 'en' },
    // Decimal amounts
    { user: 'enviar 10.50 a +573001234567', amount: 10.5, recipient: '+573001234567', lang: 'es' },
  ]

  for (const s of sends) {
    test(`"${s.user}" → send $${s.amount} to ${s.recipient}`, async ({ assert }) => {
      const result = await parseMessage(s.user)
      assert.equal(result.command, 'send')
      assert.approximately(result.amount!, s.amount, 0.01)
      assert.isOk(result.recipient)
      assert.equal(result.detectedLanguage, s.lang)
    })
  }
})

// ============================================================================
// 5. Anti-injection: regex rejects fabricated data
// ============================================================================

test.group('Conversation | Anti-Injection (Regex Layer)', () => {
  test('negative amounts rejected', async ({ assert }) => {
    const result = await parseMessage('send -10 to +573001234567')
    // Should not parse as a valid send with amount
    assert.isTrue(
      result.amount === undefined || result.llmStatus === 'format-hint',
      'negative amount should not produce a valid send'
    )
  })

  test('amount over 10000 rejected', ({ assert }) => {
    const result = parseMessageWithRegex('send 99999 to +573001234567')
    // Amount validation rejects >10000
    assert.isTrue(
      result.amount === undefined || result.amountError !== undefined,
      'amount >10000 should be rejected'
    )
  })

  test('phone too short rejected', ({ assert }) => {
    const result = parseMessageWithRegex('send 10 to +1234')
    assert.isTrue(result.recipient === undefined, 'phone with <7 digits should be rejected')
  })
})

// ============================================================================
// 6. Edge cases: empty, whitespace, gibberish
// ============================================================================

test.group('Conversation | Edge Cases', () => {
  test('empty string → unknown', async ({ assert }) => {
    const result = await parseMessage('')
    assert.equal(result.command, 'unknown')
  })

  test('whitespace only → unknown', async ({ assert }) => {
    const result = await parseMessage('   ')
    assert.equal(result.command, 'unknown')
  })

  test('gibberish → unknown', async ({ assert }) => {
    const result = await parseMessage('xkcd lmnop qrs')
    assert.equal(result.command, 'unknown')
  })

  test('very long message → does not crash', async ({ assert }) => {
    const longMsg = 'a'.repeat(5000)
    const result = await parseMessage(longMsg)
    assert.isString(result.command)
  })

  test('special characters → does not crash', async ({ assert }) => {
    const result = await parseMessage('💰🚀 ¿¡@#$%^&*()')
    assert.isString(result.command)
  })
})

// ============================================================================
// 7. Full conversation simulation (multi-turn)
// ============================================================================

test.group('Conversation | Multi-Turn Flow Simulation', () => {
  test('greeting → help → send → unknown → realistic flow', async ({ assert }) => {
    // Turn 1: User says hi (exact match required for regex greeting)
    const t1 = await parseMessage('hola')
    assert.equal(t1.command, 'greeting')
    const r1 = formatGreetingMessage('es')
    assert.isTrue(r1.length > 20)
    assert.isFalse(r1.includes('Command'))

    // Turn 2: User asks for help
    const t2 = await parseMessage('ayuda')
    assert.equal(t2.command, 'help')
    const r2 = formatHelpMessage('es')
    assert.isTrue(r2.includes('enviar'))

    // Turn 3: User sends money (standard format)
    const t3 = await parseMessage('enviar 10 a +573116613414')
    assert.equal(t3.command, 'send')
    assert.equal(t3.amount, 10)
    assert.isOk(t3.recipient)

    // Turn 4: User says something random
    const t4 = await parseMessage('que onda con el clima')
    assert.equal(t4.command, 'unknown')
    const r4 = formatUnknownCommandMessage('que onda con el clima', 'es')
    assert.isFalse(r4.includes('Command'))
    assert.isTrue(r4.length < 200, 'unknown response should be concise')

    // Turn 5: User says thanks
    const t5 = await parseMessage('gracias')
    assert.equal(t5.command, 'social')
    const r5 = formatSocialReplyMessage('es')
    assert.isTrue(r5.length < 100)
  })

  test('English flow: hi → balance → send → confirm', async ({ assert }) => {
    const t1 = await parseMessage('hey')
    assert.equal(t1.command, 'greeting')

    const t2 = await parseMessage('balance')
    assert.equal(t2.command, 'balance')

    const t3 = await parseMessage('send 5 to +573001234567')
    assert.equal(t3.command, 'send')
    assert.equal(t3.amount, 5)

    const t4 = await parseMessage('yes')
    assert.equal(t4.command, 'confirm')
  })

  test('Portuguese flow: oi → saldo → enviar → sim', async ({ assert }) => {
    const t1 = await parseMessage('oi')
    assert.equal(t1.command, 'greeting')

    const t2 = await parseMessage('saldo')
    assert.equal(t2.command, 'balance')

    const t3 = await parseMessage('enviar 20 para +5511999887766')
    assert.equal(t3.command, 'send')
    assert.equal(t3.amount, 20)
    assert.equal(t3.detectedLanguage, 'pt') // send patterns DO set language

    const t4 = await parseMessage('sim')
    assert.equal(t4.command, 'confirm')
  })
})

// ============================================================================
// 8. Response consistency: all messages return strings, no crashes
// ============================================================================

test.group('Conversation | Response Formatting Safety', () => {
  const langs: Lang[] = ['en', 'es', 'pt']

  for (const lang of langs) {
    test(`all formatters return non-empty strings (${lang})`, ({ assert }) => {
      const results = [
        formatHelpMessage(lang),
        formatGreetingMessage(lang),
        formatSocialReplyMessage(lang),
        formatUnknownCommandMessage('test', lang),
        formatInvalidSendFormat(lang),
        formatTextOnlyMessage(lang),
        formatRateLimitedMessage(lang),
        formatCommandErrorMessage(lang),
        formatAboutMessage(lang),
        formatHistoryMessage('+573001234567', lang),
        formatSettingsMessage('+573001234567', lang),
        formatWelcomeMessage({ wallet: '0xabc123', isNew: true }, lang),
        formatWelcomeMessage({ wallet: '0xabc123', isNew: false }, lang),
      ]

      for (const r of results) {
        assert.isString(r)
        assert.isTrue(r.length > 0, 'response should not be empty')
      }
    })
  }
})

// ============================================================================
// 9. Natural language improvements (WhatsApp interaction audit, Mar 2026)
// ============================================================================

test.group('Conversation | Natural Language — Identity & Wallet Queries', () => {
  test('"Quién eres?" → about', async ({ assert }) => {
    const result = await parseMessage('Quién eres?')
    assert.equal(result.command, 'about')
  })

  test('"quien eres" → about', async ({ assert }) => {
    const result = await parseMessage('quien eres')
    assert.equal(result.command, 'about')
  })

  test('"who are you" → about', async ({ assert }) => {
    const result = await parseMessage('who are you')
    assert.equal(result.command, 'about')
  })

  test('"Cuál es mi wallet" → balance', async ({ assert }) => {
    const result = await parseMessage('Cuál es mi wallet')
    assert.equal(result.command, 'balance')
  })

  test('"mi billetera" → balance', async ({ assert }) => {
    const result = await parseMessage('mi billetera')
    assert.equal(result.command, 'balance')
  })

  test('"my wallet" → balance', async ({ assert }) => {
    const result = await parseMessage('my wallet')
    assert.equal(result.command, 'balance')
  })
})

test.group('Conversation | Natural Language — Fund Intent', () => {
  test('"Agregar" → fund', async ({ assert }) => {
    const result = await parseMessage('Agregar')
    assert.equal(result.command, 'fund')
  })

  test('"agregar saldo" → fund (not balance)', async ({ assert }) => {
    const result = await parseMessage('agregar saldo')
    assert.equal(result.command, 'fund')
  })

  test('"Quiero agregar saldo a mi cuenta" → fund', async ({ assert }) => {
    const result = await parseMessage('Quiero agregar saldo a mi cuenta')
    assert.equal(result.command, 'fund')
  })

  test('"recargar" → fund', async ({ assert }) => {
    const result = await parseMessage('recargar')
    assert.equal(result.command, 'fund')
  })

  test('"quiero recargar" → fund', async ({ assert }) => {
    const result = await parseMessage('quiero recargar')
    assert.equal(result.command, 'fund')
  })
})

test.group('Conversation | Send with Currency Words', () => {
  test('"Envía 1 dólar a +573153007266" → send $1', async ({ assert }) => {
    const result = await parseMessage('Envía 1 dólar a +573153007266')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 1, 0.01)
    assert.isOk(result.recipient)
  })

  test('"send 5 dollars to +573001234567" → send $5', async ({ assert }) => {
    const result = await parseMessage('send 5 dollars to +573001234567')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 5, 0.01)
  })

  test('"enviar 10 dolares a +573001234567" → send $10', async ({ assert }) => {
    const result = await parseMessage('enviar 10 dolares a +573001234567')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 10, 0.01)
  })

  test('"manda 20 pesos a +573001234567" → send $20', async ({ assert }) => {
    const result = await parseMessage('manda 20 pesos a +573001234567')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 20, 0.01)
  })
})

test.group('Conversation | Send with Greeting Prefix', () => {
  test('"Hola envia 0.1 a +573153007266" → send $0.1', async ({ assert }) => {
    const result = await parseMessage('Hola envia 0.1 a +573153007266')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 0.1, 0.01)
    assert.isOk(result.recipient)
  })

  test('"Hey send 5 to +573001234567" → send $5', async ({ assert }) => {
    const result = await parseMessage('Hey send 5 to +573001234567')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 5, 0.01)
  })

  test('"Buenas, manda 10 a +573001234567" → send $10', async ({ assert }) => {
    const result = await parseMessage('Buenas, manda 10 a +573001234567')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 10, 0.01)
  })

  test('"Oi envia 5 para +5511999887766" → send $5', async ({ assert }) => {
    const result = await parseMessage('Oi envia 5 para +5511999887766')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 5, 0.01)
  })

  test('"Hola envia 0.1 a +57 315 3007266" (spaces in phone) → send', async ({ assert }) => {
    const result = await parseMessage('Hola envia 0.1 a +57 315 3007266')
    assert.equal(result.command, 'send')
    assert.approximately(result.amount!, 0.1, 0.01)
  })

  test('"Hola enviar dinero a +573001234567" (greeting + partial) → partial send', async ({
    assert,
  }) => {
    const result = await parseMessage('Hola enviar dinero a +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
    assert.isNotOk(result.amount)
  })
})

test.group('Conversation | Social Acknowledgments (Loop Prevention)', () => {
  const socialPhrases = [
    'ya',
    'ya vi',
    'entendido',
    'enterado',
    'arre',
    'sale',
    'joya',
    'de una',
    'todo bien',
    'a la orden',
    'noted',
    'understood',
    'sounds good',
    'beleza',
    'firmeza',
    'falou',
    'blz',
  ]
  for (const phrase of socialPhrases) {
    test(`"${phrase}" → social (not unknown)`, async ({ assert }) => {
      const result = await parseMessage(phrase)
      assert.equal(result.command, 'social')
    })
  }
})

// ============================================================================
// 11. Multi-turn sends: partial send detection
// ============================================================================

test.group('Conversation | Partial Send Detection', () => {
  test('"enviar dinero a +573001234567" → send with recipient only', async ({ assert }) => {
    const result = await parseMessage('enviar dinero a +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
    assert.isUndefined(result.amount)
  })

  test('"send to +573001234567" → send with recipient only', async ({ assert }) => {
    const result = await parseMessage('send to +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
    assert.isUndefined(result.amount)
  })

  test('"enviar a +5511999887766" → send with recipient only', async ({ assert }) => {
    const result = await parseMessage('enviar a +5511999887766')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
    assert.isUndefined(result.amount)
  })

  test('"manda plata a +573001234567" → send with recipient only', async ({ assert }) => {
    const result = await parseMessage('manda plata a +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
    assert.isUndefined(result.amount)
  })

  test('"enviar 5" → send with amount only', async ({ assert }) => {
    const result = await parseMessage('enviar 5')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 5)
    assert.isUndefined(result.recipient)
  })

  test('"send 10" → send with amount only', async ({ assert }) => {
    const result = await parseMessage('send 10')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 10)
    assert.isUndefined(result.recipient)
  })

  test('"envía 20 dólares" → send with amount only', async ({ assert }) => {
    const result = await parseMessage('envía 20 dólares')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 20)
    assert.isUndefined(result.recipient)
  })

  test('"mandar 1" → send with amount only', async ({ assert }) => {
    const result = await parseMessage('mandar 1')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 1)
    assert.isUndefined(result.recipient)
  })
})
