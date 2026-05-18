/**
 * Message Parser Unit Tests
 *
 * Ported from Express: tests/unit/message-parser.test.ts
 * Tests all message parsing functionality including LLM and regex fallback.
 */

import { test } from '@japa/runner'
import {
  parseMessage,
  parseMessageWithRegex,
  matchLooseCommand,
  matchHighConfidencePreLlm,
} from '#utils/message_parser'

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

// ══════════════════════════════════════════════════════════════════════════════
// Loose dashboard routing — discoverability fix from 2026-05-18
// ══════════════════════════════════════════════════════════════════════════════
//
// User transcript: "No hay un Dashboard?" got back "you can check balance
// here" — the bot didn't know about the dashboard it had just learned to
// link to. Strict regex only matches exact tokens (`dashboard` alone);
// conversational forms fell through. These tests pin the loose patterns
// that catch the natural phrasings users actually type.
//
// `matchLooseCommand` runs as Step 4 in `parseMessage` (after LLM). We
// test it directly because the LLM-on path is non-deterministic in CI.

test.group('Message Parser | Loose dashboard routing (P0 discoverability)', () => {
  const DASHBOARD_LOOSE_CASES = [
    'no hay un dashboard?',
    'y no hay un panel?',
    'como entro a mi cuenta',
    'donde esta mi panel',
    'hay dashboard?',
    'mi cuenta',
    'panel',
    'meu painel',
  ]
  for (const input of DASHBOARD_LOOSE_CASES) {
    test(`"${input}" routes to dashboard via loose match`, ({ assert }) => {
      const result = matchLooseCommand(input)
      assert.exists(result, `${input} must match a loose pattern`)
      assert.equal(result?.command, 'dashboard')
    })
  }

  // Shadow guard — "mi cuenta de banco" / "mi cuenta de gmail" are NOT
  // about the Sippy dashboard. The loose pattern requires `mi cuenta` to
  // be at end-of-string (after punctuation strip) to avoid this shadow.
  // If this breaks, the regex got too greedy and a real user will get a
  // wrong-route reply.
  const SHADOW_GUARD_CASES = [
    'mi cuenta de banco',
    'mi cuenta de gmail',
    'cuenta de ahorros',
    'panel de yeso',
  ]
  for (const input of SHADOW_GUARD_CASES) {
    test(`shadow guard: "${input}" does NOT route to dashboard`, ({ assert }) => {
      const result = matchLooseCommand(input)
      if (result) {
        assert.notEqual(
          result.command,
          'dashboard',
          `${input} must NOT shadow into dashboard (got ${result.command})`
        )
      }
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Address queries route to balance (balance reply already includes address)
// ══════════════════════════════════════════════════════════════════════════════
//
// User transcript: "Sabes cuál es mi address pública?" → routed to
// settings (wrong). Per design call, route address-style queries to
// balance — the existing reply already shows `Billetera: 0x...` so no
// new format function is needed.

test.group('Message Parser | Address queries → balance', () => {
  const ADDRESS_LOOSE_CASES = [
    'mi address',
    'mi direccion',
    'mi dirección',
    'cual es mi direccion',
    'cuál es mi dirección',
    'cual es mi wallet',
    'cual es mi address',
    'direccion de mi wallet',
    'dirección de mi billetera',
    'billetera publica',
    'billetera pública',
    'wallet address',
    'my address',
  ]
  for (const input of ADDRESS_LOOSE_CASES) {
    test(`"${input}" routes to balance via loose match`, ({ assert }) => {
      const result = matchLooseCommand(input)
      assert.exists(result, `${input} must match a loose pattern`)
      assert.equal(result?.command, 'balance')
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Sippy Quest — referral_code command routing + pay_qr shadow guard
// ══════════════════════════════════════════════════════════════════════════════
//
// Critical no-shadow rule: the existing `mi codigo de pago` MUST keep
// routing to `pay_qr` (it's been the pay-QR keyword for months). Adding
// `mi codigo` for referrals would silently break pay-QR if the patterns
// weren't anchored carefully. pay_qr requires the `de pago|qr` suffix,
// referral_code matches BARE `mi codigo` only — these tests pin both
// sides so a future regex tweak can't reintroduce the shadow.

test.group('Message Parser | referral_code command (strict regex)', () => {
  const REFERRAL_CASES = [
    'mi codigo',
    'mi código',
    'MI CODIGO',
    'mi codigo de referido',
    'mi código de referido',
    'mi codigo de invitacion',
    'mi código de invitación',
    'mi codigo invite',
    'mi código referral',
    'my code',
    'my referral',
    'my invite code',
    'my referral code',
    'meu codigo',
    'meu código',
    'meu codigo de convite',
    'meu código de convite',
    // Question-form variants — regression from 2026-05-18 transcript.
    // `parseMessageWithRegex` calls `trim()` only (no punctuation
    // strip), so the regex itself must tolerate trailing `?` and
    // whitespace. Without this, "Mi código ?" falls through to the LLM
    // and gets mis-classified.
    'mi codigo?',
    'mi código?',
    'Mi código ?',
    'mi codigo de referido?',
    'Mi código de referido ?',
    'my code?',
    'my referral code?',
    'meu código?',
  ]
  for (const input of REFERRAL_CASES) {
    test(`"${input}" routes to referral_code`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'referral_code', `${input} must route to referral_code`)
    })
  }

  // Shadow guard — pay_qr must remain the owner of `mi codigo de pago`
  // and friends, since that wording predates the referral feature and
  // is documented in user-facing help copy.
  const PAY_QR_KEEP_CASES = [
    'mi codigo de pago',
    'mi código de pago',
    'mi qr de pago',
    'mi qr',
    'meu codigo de pagamento',
    'meu qr de pagamento',
    'como me pagan',
    'cómo me pagan',
    'pay qr',
    'pay code',
    'my pay qr',
    'my pay code',
  ]
  for (const input of PAY_QR_KEEP_CASES) {
    test(`shadow guard: "${input}" still routes to pay_qr (not referral_code)`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'pay_qr', `${input} must stay pay_qr`)
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Pre-LLM gate — high-confidence patterns must beat the LLM
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit P1 from 2026-05-18: post-LLM loose patterns don't fire when the LLM
// returns a wrong-but-valid command. The May-17/18 transcripts proved
// dashboard and address queries get misclassified into settings. The fix
// is a Step 1.5 in `parseMessage` that runs `matchHighConfidencePreLlm`
// BEFORE the LLM gets a chance. These tests pin both the pattern set and
// the structural ordering — if either drifts, the original bug returns.

test.group('Message Parser | Pre-LLM gate (P1)', () => {
  const DASHBOARD_PRE_LLM_CASES = [
    'no hay un dashboard?',
    'y no hay un panel?',
    'como entro a mi cuenta',
    'hay dashboard?',
    'mi cuenta',
    'panel',
  ]
  for (const input of DASHBOARD_PRE_LLM_CASES) {
    test(`pre-LLM: "${input}" → dashboard`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.exists(result, `${input} must match the pre-LLM gate`)
      assert.equal(result?.command, 'dashboard')
    })
  }

  const ADDRESS_PRE_LLM_CASES = [
    'mi address',
    'cual es mi direccion',
    'cuál es mi dirección',
    'billetera publica',
    'wallet address',
    'my address',
  ]
  for (const input of ADDRESS_PRE_LLM_CASES) {
    test(`pre-LLM: "${input}" → balance`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.exists(result, `${input} must match the pre-LLM gate`)
      assert.equal(result?.command, 'balance')
    })
  }

  // Shadow guards still hold pre-LLM (same patterns as post-LLM).
  const PRE_LLM_SHADOW_GUARDS = [
    'mi cuenta de banco',
    'mi cuenta de gmail',
    'cuenta de ahorros',
    'panel de yeso',
  ]
  for (const input of PRE_LLM_SHADOW_GUARDS) {
    test(`pre-LLM shadow guard: "${input}" → null`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.isNull(result, `${input} must NOT match the pre-LLM gate`)
    })
  }

  // Negative: the pre-LLM gate is INTENTIONALLY narrow — only dashboard
  // and address queries. Other intents (fund, withdraw, etc.) still go
  // through the LLM and post-LLM loose path. If someone widens the
  // gate, this test forces a deliberate decision.
  test('pre-LLM gate is narrow: only dashboard + balance (address)', ({ assert }) => {
    const seen = new Set<string>()
    for (const input of [
      ...DASHBOARD_PRE_LLM_CASES,
      ...ADDRESS_PRE_LLM_CASES,
      'agregar saldo',
      'retirar plata',
      'cuanto tengo',
      'hola',
    ]) {
      const result = matchHighConfidencePreLlm(input)
      if (result) seen.add(result.command)
    }
    assert.deepEqual(
      [...seen].sort(),
      ['balance', 'dashboard'],
      'pre-LLM gate should only ever produce dashboard or balance'
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Production-path integration: parseMessage routes through the pre-LLM
// gate when LLM is disabled (most direct test we can do without mocking
// the LLM service in ESM).
// ══════════════════════════════════════════════════════════════════════════════

test.group('Message Parser | parseMessage pre-LLM integration', (group) => {
  let originalUseLlm: string | undefined
  group.each.setup(() => {
    originalUseLlm = process.env.USE_LLM
    process.env.USE_LLM = 'false' // disable LLM so we hit pre-LLM + post-LLM only
  })
  group.each.teardown(() => {
    if (originalUseLlm === undefined) delete process.env.USE_LLM
    else process.env.USE_LLM = originalUseLlm
  })

  test('parseMessage("no hay un dashboard?") → dashboard (pre-LLM wins)', async ({ assert }) => {
    const result = await parseMessage('no hay un dashboard?')
    assert.equal(result.command, 'dashboard')
  })

  test('parseMessage("como entro a mi cuenta") → dashboard', async ({ assert }) => {
    const result = await parseMessage('como entro a mi cuenta')
    assert.equal(result.command, 'dashboard')
  })

  test('parseMessage("cual es mi address") → balance', async ({ assert }) => {
    const result = await parseMessage('cual es mi address')
    assert.equal(result.command, 'balance')
  })

  test('parseMessage("mi cuenta de banco") does NOT route to dashboard', async ({ assert }) => {
    const result = await parseMessage('mi cuenta de banco')
    assert.notEqual(result.command, 'dashboard')
  })
})
