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

test.group('Message Parser | Send Command Parsing & Safety', () => {
  const tests = [
    { input: 'send 100 to +573001234567', expectedCmd: 'send', expectedAmount: 100 },
    { input: 'send $50 to +573001234567', expectedCmd: 'send', expectedAmount: 50 },
    { input: 'send 25.5 to +573001234567', expectedCmd: 'send', expectedAmount: 25.5 },
  ]

  for (const t of tests) {
    test(`"${t.input}" → ${t.expectedCmd} ($${t.expectedAmount})`, async ({ assert }) => {
      const result = await parseMessage(t.input)
      assert.equal(result.command, t.expectedCmd)
      assert.isDefined(result.amount)
      assert.approximately(result.amount!, t.expectedAmount, 0.01)
    })
  }
})

test.group('Message Parser | Phone Number Validation', () => {
  test('Valid phone with + (+573001234567)', async ({ assert }) => {
    const result = await parseMessage('send 10 to +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })

  test('Valid 10-digit phone (+1234567890)', async ({ assert }) => {
    const result = await parseMessage('send 10 to +1234567890')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })

  test('Phone too short (+12345) rejects', async ({ assert }) => {
    const result = await parseMessage('send 10 to +12345')
    const worked = result.command === 'send' && !!result.recipient
    assert.isFalse(worked)
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

test.group('Message Parser | OriginalText Field (Bug Fix Verification)', () => {
  const unknownInputs = ['complete gibberish xyz', 'random nonsense', 'asdfghjkl']

  for (const input of unknownInputs) {
    test(`Unknown command includes originalText: "${input}"`, async ({ assert }) => {
      const result = await parseMessage(input)
      assert.isDefined(result.originalText)
    })
  }
})
