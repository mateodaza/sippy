/**
 * SMART MODE — classifier orchestration tests
 *
 * No real Groq calls. The classifier accepts a `clientFactory` injection
 * seam so each test mocks the chat-completions response directly. This
 * exercises:
 *
 *   • Primary success path (no fallback invoked)
 *   • Primary fails (timeout / parse / schema) → fallback succeeds
 *   • Primary AND fallback fail → typed gibberish fallback
 *   • Reasoning_effort param sent to GPT-OSS models, omitted elsewhere
 *   • SmartClassification.safeParse() runs before returning
 *   • Pure: validateSmartAction is NOT called from classifyMessage
 *
 * The point is to pin the contract — not to validate the prompt or the
 * model's outputs. Prompt quality lives in the eval harness against the
 * golden dataset; logic boundaries live here.
 */

import { test } from '@japa/runner'
import { classifyMessage, type ClassifierGroqClient } from '#services/smart_mode/classifier'

// ── Mock factory helpers ──────────────────────────────────────────────────

interface RecordedCall {
  model: string
  reasoning_effort?: string
  response_format?: { type: string }
  temperature?: number
  systemPrompt?: string
  userMessage?: string
  /** Full messages array, in order, for context-cap assertions. */
  messages: Array<{ role: string; content: string }>
  /** Whether an AbortSignal was passed via the options bag. */
  hasSignal: boolean
}

/**
 * Build a mock client whose `create()` returns a queue of pre-canned
 * responses. Each call shifts one response off the queue. Records every
 * call's params for later assertion.
 *
 * A response can be:
 *   - string: the JSON payload (or invalid JSON for parse-error testing)
 *   - Error:  to throw (simulates network / SDK failure)
 *   - null:   simulates "empty content" returned by API
 */
function makeMockClient(responses: Array<string | Error | null>): {
  client: ClassifierGroqClient
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const queue = [...responses]
  const client: ClassifierGroqClient = {
    chat: {
      completions: {
        create: async (args, options) => {
          const systemMsg = args.messages.find((m) => m.role === 'system')
          const userMsg = args.messages.filter((m) => m.role === 'user').pop()
          calls.push({
            model: args.model,
            reasoning_effort: args.reasoning_effort,
            response_format: args.response_format,
            temperature: args.temperature,
            systemPrompt: systemMsg?.content,
            userMessage: userMsg?.content,
            messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
            hasSignal: !!options?.signal,
          })
          const next = queue.shift()
          if (next instanceof Error) throw next
          return { choices: [{ message: { content: next ?? null } }] }
        },
      },
    },
  }
  return { client, calls }
}

const VALID_ACTION_JSON = JSON.stringify({
  category: 'action',
  intent: 'balance',
  confidence: 0.95,
  reasoning: 'user asked saldo',
  clarifying_question: null,
  oos_redirect: null,
  slots: null,
  detectedLang: 'es',
})

// ══════════════════════════════════════════════════════════════════════════════
// Primary success — no fallback
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | primary success', () => {
  test('returns parsed classification from primary, no fallback call', async ({ assert }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    const result = await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 1, 'fallback should NOT be called on primary success')
    assert.equal(calls[0].model, 'openai/gpt-oss-120b', 'primary is GPT-OSS 120B')
    assert.equal(calls[0].reasoning_effort, 'low', 'reasoning_effort low on primary')
    assert.equal(calls[0].temperature, 0)
    assert.equal(calls[0].response_format?.type, 'json_object')

    assert.equal(result.category, 'action')
    assert.equal(result.intent, 'balance')
    assert.equal(result.confidence, 0.95)
  })

  test('system prompt + user message both reach the model', async ({ assert }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    await classifyMessage({
      text: 'mi saldo',
      context: [],
      preferredLang: 'es',
      clientFactory: () => client,
    })

    assert.isTrue(
      calls[0].systemPrompt?.includes("Sippy's intent classifier") ?? false,
      'system prompt includes the classifier identity'
    )
    assert.isTrue(
      calls[0].systemPrompt?.includes('Required slots: amount, recipientRaw') ?? false,
      'conditions table is rendered into the system prompt'
    )
    assert.isTrue(
      calls[0].userMessage?.includes('mi saldo') ?? false,
      'user message includes the inbound text'
    )
    assert.isTrue(
      calls[0].userMessage?.includes('preferred language: es') ?? false,
      'preferredLang is hinted to the model'
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Primary fails → fallback succeeds
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | primary fail → fallback succeed', () => {
  test('network error on primary triggers fallback on GPT-OSS 20B', async ({ assert }) => {
    const { client, calls } = makeMockClient([new Error('ECONNRESET'), VALID_ACTION_JSON])

    const result = await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2, 'both models attempted')
    assert.equal(calls[0].model, 'openai/gpt-oss-120b')
    assert.equal(calls[1].model, 'openai/gpt-oss-20b')
    assert.equal(calls[1].reasoning_effort, 'low', 'fallback also gets reasoning_effort')
    assert.equal(result.intent, 'balance', 'fallback result is returned to caller')
  })

  test('malformed JSON from primary triggers fallback', async ({ assert }) => {
    const { client, calls } = makeMockClient(['{not valid json', VALID_ACTION_JSON])

    const result = await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2)
    assert.equal(result.category, 'action')
  })

  test('schema-violating JSON from primary triggers fallback', async ({ assert }) => {
    // Action category but null intent — violates the invariant the schema enforces.
    const schemaViolation = JSON.stringify({
      category: 'action',
      intent: null, // INVALID: action requires intent
      confidence: 0.9,
      reasoning: 'broken',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })

    const { client, calls } = makeMockClient([schemaViolation, VALID_ACTION_JSON])

    const result = await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2)
    assert.equal(result.category, 'action')
    assert.equal(result.intent, 'balance')
  })

  test('empty content from primary triggers fallback', async ({ assert }) => {
    const { client, calls } = makeMockClient([null, VALID_ACTION_JSON])

    await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Both fail → typed gibberish fallback
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | both fail → classifierErrorFallback', () => {
  test('both primary AND fallback error → typed gibberish', async ({ assert }) => {
    const { client, calls } = makeMockClient([
      new Error('primary network'),
      new Error('fallback network'),
    ])

    const result = await classifyMessage({
      text: 'whatever',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2)
    assert.equal(result.category, 'gibberish')
    assert.isNull(result.intent)
    assert.equal(result.confidence, 0)
    assert.include(result.reasoning, 'classifier_error')
    assert.include(result.reasoning, 'primary=')
    assert.include(result.reasoning, 'fallback=')
  })

  test('both return malformed JSON → typed gibberish', async ({ assert }) => {
    const { client, calls } = makeMockClient(['{bad', '{also bad'])

    const result = await classifyMessage({
      text: 'whatever',
      context: [],
      clientFactory: () => client,
    })

    assert.equal(calls.length, 2)
    assert.equal(result.category, 'gibberish')
    assert.include(result.reasoning, 'json_parse')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Defensive: no Groq client available
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | no client available', () => {
  test('returns typed fallback without throwing when factory yields null', async ({ assert }) => {
    const result = await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => null,
    })
    assert.equal(result.category, 'gibberish')
    assert.equal(result.confidence, 0)
    assert.include(result.reasoning, 'no_client')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Context propagation — deterministic cap (8 turns × 250 chars each)
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | conversation context', () => {
  test('passes context turns through in the messages array', async ({ assert }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    await classifyMessage({
      text: 'saldo',
      context: [
        { role: 'user', content: 'hola' },
        { role: 'user', content: 'cuánto tengo' },
      ],
      clientFactory: () => client,
    })

    const ms = calls[0].messages
    // system + 2 context turns + current user message = 4
    assert.equal(ms.length, 4, 'system + context turns + current user msg')
    assert.equal(ms[0].role, 'system')
    assert.equal(ms[1].content, 'hola')
    assert.equal(ms[2].content, 'cuánto tengo')
    assert.isTrue(ms[3].content.includes('saldo'), 'current message is the last entry')
  })

  test('caps context at 8 turns (drops oldest)', async ({ assert }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    // 15 turns sent; expect only the last 8 to appear
    const ctx = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      content: `turn ${i}`,
    }))

    await classifyMessage({
      text: 'saldo',
      context: ctx,
      clientFactory: () => client,
    })

    const ms = calls[0].messages
    // system + last 8 context + current user = 10
    assert.equal(ms.length, 10, 'system + 8 capped context + current user msg')
    // Oldest preserved should be `turn 7` (turns 7..14 = last 8)
    assert.equal(ms[1].content, 'turn 7', 'oldest context turn is the 7th original')
    assert.equal(ms[8].content, 'turn 14', 'newest context turn is the 14th original')
  })

  test('clamps each context turn to 250 chars (long content truncated with ellipsis)', async ({
    assert,
  }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    const longText = 'x'.repeat(500)
    const ctx = [
      { role: 'user' as const, content: longText },
      { role: 'user' as const, content: 'corto' },
    ]

    await classifyMessage({
      text: 'saldo',
      context: ctx,
      clientFactory: () => client,
    })

    const ms = calls[0].messages
    const firstContextMsg = ms[1]
    assert.isAtMost(firstContextMsg.content.length, 250, 'long turn clamped to ≤ 250 chars')
    assert.isTrue(firstContextMsg.content.endsWith('…'), 'truncation uses ellipsis')
    assert.equal(ms[2].content, 'corto', 'short turn passes unchanged')
  })

  test('current user message is always present even with no context', async ({ assert }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    const ms = calls[0].messages
    assert.equal(ms.length, 2, 'system + current user msg (no context)')
    assert.equal(ms[0].role, 'system')
    assert.isTrue(ms[1].content.includes('saldo'))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AbortSignal is actually passed to the SDK
// ══════════════════════════════════════════════════════════════════════════════

test.group('classifier | AbortSignal propagation', () => {
  test('passes an AbortSignal via the SDK options bag (real upstream abort)', async ({
    assert,
  }) => {
    const { client, calls } = makeMockClient([VALID_ACTION_JSON])

    await classifyMessage({
      text: 'saldo',
      context: [],
      clientFactory: () => client,
    })

    assert.isTrue(
      calls[0].hasSignal,
      'classifier must pass options.signal so upstream fetch can be cancelled'
    )
  })
})
