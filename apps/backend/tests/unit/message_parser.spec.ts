/**
 * Message Parser Unit Tests
 *
 * Ported from Express: tests/unit/message-parser.test.ts
 * Tests all message parsing functionality including LLM and regex fallback.
 */

import { test } from '@japa/runner'
import { parseMessage, parseMessageWithRegex } from '#utils/message_parser'

test.group('Message Parser | Exact Commands (Regex Compatibility)', () => {
  const tests = [
    { input: 'start', expected: 'start' },
    { input: 'balance', expected: 'balance' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: 'history', expected: 'history' },
    { input: 'about', expected: 'about' },
    { input: 'help', expected: 'help' },
  ]

  for (const t of tests) {
    test(`"${t.input}" → ${t.expected}`, async ({ assert }) => {
      const result = await parseMessage(t.input)
      assert.equal(result.command, t.expected)
    })
  }
})

test.group('Message Parser | Regex Fallback (Core Guarantee)', () => {
  const tests = [
    { input: 'balance', expected: 'balance' },
    { input: 'send 10 to +573001234567', expected: 'send' },
    { input: 'history', expected: 'history' },
  ]

  for (const t of tests) {
    test(`Regex: "${t.input}" → ${t.expected}`, ({ assert }) => {
      const result = parseMessageWithRegex(t.input)
      assert.equal(result.command, t.expected)
    })
  }
})

// COMMENTED OUT: English NL tests require Groq LLM API (USE_LLM=true).
// Regex handles exact commands and trilingual keyword patterns but not free-form
// natural language like "how much do I have?". Uncomment for full LLM coverage.
//
// test.group('Message Parser | Natural Language (English)', () => {
//   const tests = [
//     { input: 'how much do I have?', expected: 'balance' },
//     { input: 'check my balance', expected: 'balance' },
//     { input: "what's my balance", expected: 'balance' },
//     { input: 'show me my balance please', expected: 'balance' },
//     { input: 'transfer 10 to +573001234567', expected: 'send' },
//     { input: 'can you send 5 to +573001234567', expected: 'send' },
//     { input: 'view my transactions', expected: 'history' },
//     { input: 'show me my history', expected: 'history' },
//     { input: 'what is this?', expected: 'about' },
//     { input: 'i need help', expected: 'help' },
//   ]
//
//   for (const t of tests) {
//     test(`"${t.input}" → ${t.expected}`, async ({ assert }) => {
//       const result = await parseMessage(t.input)
//       assert.equal(result.command, t.expected)
//     })
//   }
// })

// COMMENTED OUT: Spanish NL and typo tolerance depend on Groq LLM API.
// Regex handles English NL but not Spanish or typos. These would be flaky/slow.
// Uncomment when running with GROQ_API_KEY for full coverage.

// test.group('Message Parser | Natural Language (Spanish)', () => { ... })
// test.group('Message Parser | Typo Tolerance', () => { ... })

test.group('Message Parser | Loose Keyword Matching (Natural Language)', () => {
  const tests = [
    { input: 'Hola sippy! cuanto es mi balance?', expected: 'balance' },
    { input: 'hey, what is my balance?', expected: 'balance' },
    { input: 'quiero ver mi saldo por favor', expected: 'balance' },
    { input: 'oye necesito ayuda', expected: 'help' },
    { input: 'can you show me my history?', expected: 'history' },
    { input: 'quiero ver mi historial', expected: 'history' },
    { input: 'where are the settings?', expected: 'settings' },
    { input: 'como cambio la configuración?', expected: 'settings' },
    { input: 'what is sippy exactly?', expected: 'about' },
    // pay_qr — discoverability of the /wallet/pay-qr surface
    { input: 'mi qr', expected: 'pay_qr' },
    { input: 'mi codigo de pago', expected: 'pay_qr' },
    { input: 'mi código de pago por favor', expected: 'pay_qr' },
    { input: 'pay qr', expected: 'pay_qr' },
    { input: 'pay link', expected: 'pay_qr' },
    { input: 'como me pagan', expected: 'pay_qr' },
    { input: 'my pay qr please', expected: 'pay_qr' },
    { input: 'meu codigo de pagamento', expected: 'pay_qr' },
  ]

  for (const t of tests) {
    test(`"${t.input}" → ${t.expected}`, async ({ assert }) => {
      const result = await parseMessage(t.input)
      assert.equal(result.command, t.expected)
    })
  }

  // False positive guards — these should NOT match loose patterns
  test('"that was really helpful" → unknown (not help)', async ({ assert }) => {
    const result = await parseMessage('that was really helpful')
    assert.notEqual(result.command, 'help')
  })

  // Accented boundary: cuánto (with accent) should match
  test('"cuánto tengo?" → balance (accented)', async ({ assert }) => {
    const result = await parseMessage('hola cuánto tengo?')
    assert.equal(result.command, 'balance')
  })

  // Multi-keyword: first match wins (balance before help)
  test('"I need help checking my balance" → balance (first match)', async ({ assert }) => {
    const result = await parseMessage('I need help checking my balance')
    assert.equal(result.command, 'balance')
  })
})

test.group('Message Parser | Send Command Parsing & Safety', () => {
  const tests = [
    { input: 'send 100 to +573001234567', expectedCmd: 'send', expectedAmount: 100 },
    { input: 'send $50 to +573001234567', expectedCmd: 'send', expectedAmount: 50 },
    { input: 'send 25.5 to +573001234567', expectedCmd: 'send', expectedAmount: 25.5 },
    // ES verbs
    { input: 'envía 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'enviar 20 a +573001234567', expectedCmd: 'send', expectedAmount: 20 },
    { input: 'manda 5 a +573001234567', expectedCmd: 'send', expectedAmount: 5 },
    { input: 'transfiere 15 a +573001234567', expectedCmd: 'send', expectedAmount: 15 },
    // PT verbs
    { input: 'enviar 10 para +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'manda 5 para +573001234567', expectedCmd: 'send', expectedAmount: 5 },
    // EN alt verbs
    { input: 'transfer 10 to +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'pay 25 to +573001234567', expectedCmd: 'send', expectedAmount: 25 },
    // Imperative/subjunctive forms
    { input: 'envie 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'envíe 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'envie 10 para +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'pague 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'pague 10 para +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'mande 5 a +573001234567', expectedCmd: 'send', expectedAmount: 5 },
    // Argentine voseo
    { input: 'mandá 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    // Infinitive transferir
    { input: 'transferir 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'transferir 10 para +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    // Cross-language
    { input: 'send 10 a +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'send 10 para +573001234567', expectedCmd: 'send', expectedAmount: 10 },
    { input: 'enviar 10 to +573001234567', expectedCmd: 'send', expectedAmount: 10 },
  ]

  for (const t of tests) {
    test(`"${t.input}" → ${t.expectedCmd} ($${t.expectedAmount})`, async ({ assert }) => {
      const result = await parseMessage(t.input)
      assert.equal(result.command, t.expectedCmd)
      assert.isDefined(result.amount)
      assert.approximately(result.amount!, t.expectedAmount, 0.01)
    })
  }

  // Language detection on send commands
  test('"envía 10 a ..." detects Spanish', async ({ assert }) => {
    const result = await parseMessage('envía 10 a +573001234567')
    assert.equal(result.detectedLanguage, 'es')
  })

  test('"enviar 10 para ..." detects Portuguese', async ({ assert }) => {
    const result = await parseMessage('enviar 10 para +573001234567')
    assert.equal(result.detectedLanguage, 'pt')
  })

  test('"send 10 to ..." detects English', async ({ assert }) => {
    const result = await parseMessage('send 10 to +573001234567')
    assert.equal(result.detectedLanguage, 'en')
  })

  test('"send 10 a ..." detects Spanish (cross-language)', async ({ assert }) => {
    const result = await parseMessage('send 10 a +573001234567')
    assert.equal(result.detectedLanguage, 'es')
  })
})

test.group('Message Parser | Phone Number Validation', () => {
  test('Valid phone with + (+573001234567)', async ({ assert }) => {
    const result = await parseMessage('send 10 to +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })

  test('Valid international phone (+12345678901)', async ({ assert }) => {
    const result = await parseMessage('send 10 to +12345678901')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })

  test('Phone too short (+12345) rejects', async ({ assert }) => {
    const result = await parseMessage('send 10 to +12345')
    const worked = result.command === 'send' && !!result.recipient
    assert.isFalse(worked)
  })
})

test.group('Message Parser | Invite Command Parsing', () => {
  const tests = [
    // EN
    { input: 'invite +573116613414', expectedCmd: 'invite', expectedLang: 'en' },
    { input: 'invite +5531999998888', expectedCmd: 'invite', expectedLang: 'en' },
    // ES
    { input: 'invitar +573116613414', expectedCmd: 'invite', expectedLang: 'es' },
    { input: 'invitar a +573116613414', expectedCmd: 'invite', expectedLang: 'es' },
    { input: 'invita +573116613414', expectedCmd: 'invite', expectedLang: 'es' },
    { input: 'invitale a +573116613414', expectedCmd: 'invite', expectedLang: 'es' },
    { input: 'invítale a +573116613414', expectedCmd: 'invite', expectedLang: 'es' },
    // PT
    { input: 'convidar +5531999998888', expectedCmd: 'invite', expectedLang: 'pt' },
    { input: 'convida +5531999998888', expectedCmd: 'invite', expectedLang: 'pt' },
    { input: 'convidar o +5531999998888', expectedCmd: 'invite', expectedLang: 'pt' },
  ]

  for (const t of tests) {
    test(`"${t.input}" → ${t.expectedCmd} (${t.expectedLang})`, ({ assert }) => {
      const result = parseMessageWithRegex(t.input)
      assert.equal(result.command, t.expectedCmd)
      assert.equal(result.detectedLanguage, t.expectedLang)
      assert.isOk(result.recipient)
    })
  }

  test('invite extracts canonical phone number', ({ assert }) => {
    const result = parseMessageWithRegex('invitar +573116613414')
    assert.equal(result.recipient, '+573116613414')
  })

  test('invite with bare digits canonicalizes phone', ({ assert }) => {
    const result = parseMessageWithRegex('invitar 573116613414')
    assert.isOk(result.recipient)
    assert.equal(result.recipient, '+573116613414')
  })

  test('invite with invalid phone → unknown (not invite)', ({ assert }) => {
    const result = parseMessageWithRegex('invitar 12345')
    assert.notEqual(result.command, 'invite')
  })

  test('"invitar" alone (no phone) → unknown', ({ assert }) => {
    const result = parseMessageWithRegex('invitar')
    assert.equal(result.command, 'unknown')
  })
})

test.group('Message Parser | Edge Cases', () => {
  test('"" → unknown', async ({ assert }) => {
    const result = await parseMessage('')
    assert.equal(result.command, 'unknown')
  })

  test('"   " → unknown', async ({ assert }) => {
    const result = await parseMessage('   ')
    assert.equal(result.command, 'unknown')
  })

  test('"random gibberish xyz" → unknown', async ({ assert }) => {
    const result = await parseMessage('random gibberish xyz')
    assert.equal(result.command, 'unknown')
  })

  test('"send -10 to +573001234567" → send (format-hint, malformed amount)', async ({ assert }) => {
    const result = await parseMessage('send -10 to +573001234567')
    // Regex rejects negative amounts, but isAttemptedSend detects it as a
    // malformed send attempt and returns format-hint so the user gets helpful feedback.
    assert.equal(result.command, 'send')
    assert.equal(result.llmStatus, 'format-hint')
  })
})

test.group('Message Parser | OriginalText Field', () => {
  const unknownInputs = ['complete gibberish xyz', 'random nonsense', 'asdfghjkl']

  for (const input of unknownInputs) {
    test(`Unknown command includes originalText: "${input}"`, async ({ assert }) => {
      const result = await parseMessage(input)
      assert.isDefined(result.originalText)
    })
  }

  // All regex-matched intents must now carry originalText so handlers can
  // pass it to generateResponse for greeting/social personality replies.
  const regexIntents: { input: string; command: string }[] = [
    { input: 'hola', command: 'greeting' },
    { input: 'gracias', command: 'social' },
    { input: 'balance', command: 'balance' },
    { input: 'ayuda', command: 'help' },
    { input: 'historial', command: 'history' },
    { input: 'ajustes', command: 'settings' },
    { input: 'start', command: 'start' },
    { input: 'about', command: 'about' },
    { input: 'language es', command: 'language' },
  ]

  for (const { input, command } of regexIntents) {
    test(`Regex-matched "${command}" includes originalText`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, command)
      assert.equal(result.originalText, input)
    })
  }
})

test.group('Message Parser | Context Parameter', () => {
  test('parseMessage accepts context without error', async ({ assert }) => {
    const context = [{ role: 'user' as const, content: 'cuánto tengo?' }]
    const result = await parseMessage('y el historial?', undefined, context)
    // Context is forwarded to LLM — for unknown input, command is unknown or history
    assert.isString(result.command)
  })

  test('parseMessage works normally with empty context', async ({ assert }) => {
    const result = await parseMessage('balance', undefined, [])
    assert.equal(result.command, 'balance')
  })

  test('parseMessage works normally with no context argument', async ({ assert }) => {
    const result = await parseMessage('balance')
    assert.equal(result.command, 'balance')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Partial-amount currency capture (P1 money-correctness regression)
// ══════════════════════════════════════════════════════════════════════════════
//
// Trace from 2026-05-17: "envia 200 pesos" via the regex partial-amount
// path returned `{amount: 200}` with NO `localCurrency`, so the stored
// partial later resolved into a $200 USDC send instead of 200 COP.
// The amount-only regex now captures the currency word and sets BOTH
// `amount` + `localAmount` + `localCurrency` so the downstream FX step
// runs on the completing turn. Mirrors the action-path semantics.

test.group('Message Parser | Partial-amount currency capture', () => {
  test('"envia 200 pesos" (ES) sets localCurrency=LOCAL and localAmount', ({ assert }) => {
    const result = parseMessageWithRegex('envia 200 pesos')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 200)
    assert.equal(result.localAmount, 200, 'localAmount must mirror amount for FX')
    assert.equal(result.localCurrency, 'LOCAL', 'pesos must map to LOCAL')
    assert.isUndefined(result.recipient, 'still no recipient — partial')
  })

  test('"manda 50 reais" (PT) sets localCurrency=BRL', ({ assert }) => {
    const result = parseMessageWithRegex('manda 50 reais')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 50)
    assert.equal(result.localCurrency, 'BRL')
  })

  test('"send 100 pesos" (EN) captures pesos as LOCAL', ({ assert }) => {
    const result = parseMessageWithRegex('send 100 pesos')
    assert.equal(result.command, 'send')
    assert.equal(result.localCurrency, 'LOCAL')
  })

  test('"envia 200" (no currency word) does NOT set localCurrency', ({ assert }) => {
    const result = parseMessageWithRegex('envia 200')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 200)
    assert.isUndefined(result.localCurrency, 'plain USDC: no FX trigger')
    assert.isUndefined(result.localAmount)
  })

  test('"envia 5 dolares" (USD-equivalent word) does NOT set localCurrency', ({ assert }) => {
    // dolar/dolares/plata/usd/dollars all map to null in CURRENCY_WORD_MAP
    // and must NOT trigger FX — they're spoken shorthand for USDC.
    const result = parseMessageWithRegex('envia 5 dolares')
    assert.equal(result.command, 'send')
    assert.equal(result.amount, 5)
    assert.isUndefined(result.localCurrency)
  })

  test('accent variants ("envía 200 pesos") still capture currency', ({ assert }) => {
    const result = parseMessageWithRegex('envía 200 pesos')
    assert.equal(result.localCurrency, 'LOCAL')
  })

  // Dashboard keyword — new bot command pointing to `/wallet`. Coverage
  // matters because "bot is the front door" relies on every web surface
  // being reachable; we also need to confirm dashboard doesn't shadow
  // balance keywords (which intentionally still route to `balance`).
  const DASHBOARD_KEYWORDS = [
    'dashboard',
    'my app',
    'home',
    'mi app',
    'mi cuenta',
    'panel',
    'meu painel',
    'meu app',
  ]
  for (const kw of DASHBOARD_KEYWORDS) {
    test(`"${kw}" routes to dashboard`, ({ assert }) => {
      const result = parseMessageWithRegex(kw)
      assert.equal(result.command, 'dashboard', `${kw} must route to dashboard`)
    })
  }

  // Balance-keyword shadowing guard: keywords historically owned by
  // `balance` MUST keep routing to balance (we surface the dashboard
  // through the appended "Ver todo" link instead, not by rerouting).
  const BALANCE_KEYWORDS = ['balance', 'saldo', 'mi wallet', 'my wallet', 'mi billetera']
  for (const kw of BALANCE_KEYWORDS) {
    test(`"${kw}" still routes to balance (not dashboard)`, ({ assert }) => {
      const result = parseMessageWithRegex(kw)
      assert.equal(result.command, 'balance', `${kw} must still be balance`)
    })
  }

  // Unified currency-word grammar: partial path now supports every currency
  // SEND_PATTERNS supports. Pins parity so a future addition to one path
  // can't drift from the other (silent USDC fallback = real money bug).
  const UNIFIED_CASES: Array<{ input: string; localCurrency: string; lang: string }> = [
    { input: 'envia 50 soles', localCurrency: 'PEN', lang: 'ES partial' },
    { input: 'envia 100 lempiras', localCurrency: 'HNL', lang: 'ES partial' },
    { input: 'envia 25 quetzales', localCurrency: 'GTQ', lang: 'ES partial' },
    { input: 'envia 5000 colones', localCurrency: 'CRC', lang: 'ES partial' },
    { input: 'envia 30 bolivares', localCurrency: 'VES', lang: 'ES partial' },
    { input: 'envia 10000 guaranies', localCurrency: 'PYG', lang: 'ES partial' },
    { input: 'send 50 soles', localCurrency: 'PEN', lang: 'EN partial' },
    { input: 'manda 50 reais', localCurrency: 'BRL', lang: 'PT partial' },
  ]
  for (const { input, localCurrency, lang } of UNIFIED_CASES) {
    test(`unified currency: ${lang} "${input}" → localCurrency=${localCurrency}`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'send', `${input} must match as send`)
      assert.equal(
        result.localCurrency,
        localCurrency,
        `${input} must set localCurrency=${localCurrency} (parity with SEND_PATTERNS)`
      )
    })
  }
})
