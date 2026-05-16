/**
 * SMART MODE — dispatcher orchestration tests
 *
 * Pins the pipeline classifier → validator → sanitizer → outcome:
 *
 *   • action with full slots → kind='execute' + synthesized ParsedCommand
 *   • action missing required slot → validator downgrades → kind='reply' with clarifier
 *   • ambiguous with clean clarifying_question → kind='reply' with sanitized text
 *   • ambiguous with banned token in question → kind='reply' with deterministic fallback
 *   • out_of_scope → kind='fall_through' (oosRedirect populated when sanitizer passes)
 *   • gibberish → kind='fall_through' (oosRedirect always null)
 *   • classifier error → typed gibberish → kind='fall_through'
 *
 * Plus ParsedCommand synthesis correctness:
 *   • amount + recipientRaw (USDC path)
 *   • localAmount + localCurrency (FX path)
 *   • recipientRaw that canonicalizes to a phone → command.recipient set
 *   • recipientRaw that doesn't canonicalize → command.recipientRaw preserved
 */

import { test } from '@japa/runner'
import { dispatchSmartMode } from '#services/smart_mode/dispatcher'
import type { ClassifierGroqClient } from '#services/smart_mode/classifier'

// ── Mock classifier — returns one canned JSON per call ───────────────────

function mockClient(json: object): ClassifierGroqClient {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify(json) } }],
        }),
      },
    },
  }
}

const BASE_ARGS = {
  text: 'irrelevant — mock overrides classifier output',
  phoneNumber: '+573001234567',
  context: [],
  preferredLang: 'es' as const,
}

// ══════════════════════════════════════════════════════════════════════════════
// action → execute
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | action → execute', () => {
  test('balance with no slots → execute with command.command=balance', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'balance',
      confidence: 0.95,
      reasoning: 'mi saldo',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'execute')
    if (out.kind !== 'execute') return
    assert.equal(out.command.command, 'balance')
    assert.isTrue(out.command.usedLLM, 'tagged as LLM-synthesized')
  })

  test('send with amount + recipientRaw → execute with USDC slot', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: 'envia 5 a mateo',
      clarifying_question: null,
      oos_redirect: null,
      slots: { amount: 5, recipientRaw: 'mateo' },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'execute')
    if (out.kind !== 'execute') return
    assert.equal(out.command.command, 'send')
    assert.equal(out.command.amount, 5)
    assert.equal(out.command.recipientRaw, 'mateo', 'alias passed through for downstream resolver')
    assert.isFalse(out.command.isLargeAmount, '5 USDC is below the large-amount threshold')
  })

  test('send with localAmount + localCurrency → execute with FX-ready shape (both amount + localAmount set)', async ({
    assert,
  }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: '10 pesos a mama',
      clarifying_question: null,
      oos_redirect: null,
      slots: {
        localAmount: 10,
        localCurrency: 'LOCAL',
        recipientRaw: 'mama',
      },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'execute')
    if (out.kind !== 'execute') return
    // Mirrors message_parser.ts:639-645 — both fields carry the raw
    // pre-conversion value; downstream FX uses localCurrency as the signal
    // and replaces `amount` with the USDC equivalent. Setting only
    // localAmount would bypass conversion and ship a wrong-currency send.
    assert.equal(
      out.command.amount,
      10,
      'amount must equal localAmount pre-FX (regex parser parity)'
    )
    assert.equal(out.command.localAmount, 10)
    assert.equal(out.command.localCurrency, 'LOCAL')
  })

  test('FX shape with large localAmount (>500) sets isLargeAmount=true', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: '600 pesos a mama',
      clarifying_question: null,
      oos_redirect: null,
      slots: {
        localAmount: 600,
        localCurrency: 'LOCAL',
        recipientRaw: 'mama',
      },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    if (out.kind !== 'execute') throw new Error('expected execute')
    assert.isTrue(out.command.isLargeAmount, 'isLargeAmount derived from localAmount on FX path')
  })

  test('send with E.164 phone in recipientRaw → command.recipient (canonicalized), no recipientRaw', async ({
    assert,
  }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.95,
      reasoning: 'envia 5 a +573001234567',
      clarifying_question: null,
      oos_redirect: null,
      slots: { amount: 5, recipientRaw: '+573001234567' },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'execute')
    if (out.kind !== 'execute') return
    assert.equal(out.command.recipient, '+573001234567', 'phone resolved to canonical recipient')
    assert.isUndefined(
      out.command.recipientRaw,
      'recipientRaw cleared when canonicalization succeeds'
    )
  })

  test('originalText is threaded into the synthesized command', async ({ assert }) => {
    // greeting/social/help handlers downstream use originalText to generate
    // a conversational reply from the user's actual input. Synthesizer
    // dropping it would weaken the "human-like" paths SMART MODE exists
    // to improve.
    const client = mockClient({
      category: 'action',
      intent: 'greeting',
      confidence: 0.95,
      reasoning: 'salutation',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({
      ...BASE_ARGS,
      text: 'buenas, qué tal!',
      clientFactory: () => client,
    })
    if (out.kind !== 'execute') throw new Error('expected execute')
    assert.equal(out.command.originalText, 'buenas, qué tal!')
  })

  test('large send (amount > 500) sets isLargeAmount=true', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: 'envia 600 a mateo',
      clarifying_question: null,
      oos_redirect: null,
      slots: { amount: 600, recipientRaw: 'mateo' },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    if (out.kind !== 'execute') throw new Error('expected execute')
    assert.isTrue(out.command.isLargeAmount)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Validator downgrade — action missing required slot → ambiguous reply
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | action → validator downgrade → ambiguous', () => {
  test('send with no amount → downgraded to ambiguous, reply asks "¿Cuánto?"', async ({
    assert,
  }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: 'envia a mateo',
      clarifying_question: null,
      oos_redirect: null,
      slots: { recipientRaw: 'mateo' },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'reply')
    if (out.kind !== 'reply') return
    assert.equal(out.text, '¿Cuánto?')
  })

  test('send with no recipient → downgraded, asks "¿A quién?"', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'send',
      confidence: 0.9,
      reasoning: 'pasame 10',
      clarifying_question: null,
      oos_redirect: null,
      slots: { amount: 10 },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    if (out.kind !== 'reply') throw new Error('expected reply after downgrade')
    assert.equal(out.text, '¿A quién?')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ambiguous → reply with sanitized clarifying_question (or fallback)
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | ambiguous → reply', () => {
  test('clean clarifying_question passes through sanitized', async ({ assert }) => {
    const client = mockClient({
      category: 'ambiguous',
      intent: 'send',
      confidence: 0.5,
      reasoning: 'multiple matches',
      clarifying_question: '¿A cuál Mateo le pagas?',
      oos_redirect: null,
      slots: { amount: 5 },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'reply')
    if (out.kind !== 'reply') return
    assert.equal(out.text, '¿A cuál Mateo le pagas?')
  })

  test('banned-content question → falls back to deterministic text', async ({ assert }) => {
    const client = mockClient({
      category: 'ambiguous',
      intent: 'send',
      confidence: 0.5,
      reasoning: 'leaky LLM',
      clarifying_question: 'Confirma 5 USDC a tu contacto?', // sanitizer must reject
      oos_redirect: null,
      slots: { amount: 5 },
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'reply')
    if (out.kind !== 'reply') return
    assert.notEqual(
      out.text,
      'Confirma 5 USDC a tu contacto?',
      'sanitizer must strip the banned LLM text'
    )
    assert.isAbove(out.text.length, 5, 'fallback message is non-empty')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// out_of_scope → fall_through (with optional oosRedirect)
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | out_of_scope → fall_through', () => {
  test('returns fall_through with sanitized oosRedirect when LLM provided a clean hint', async ({
    assert,
  }) => {
    const client = mockClient({
      category: 'out_of_scope',
      intent: null,
      confidence: 0.7,
      reasoning: 'asked about weather',
      clarifying_question: null,
      oos_redirect: 'Puedo ver saldo, enviar plata o mostrar tu QR.',
      slots: null,
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'fall_through')
    if (out.kind !== 'fall_through') return
    assert.equal(out.oosRedirect, 'Puedo ver saldo, enviar plata o mostrar tu QR.')
  })

  test('oosRedirect with banned content is sanitized to null', async ({ assert }) => {
    const client = mockClient({
      category: 'out_of_scope',
      intent: null,
      confidence: 0.7,
      reasoning: 'leaky LLM',
      clarifying_question: null,
      oos_redirect: 'Visita https://sippy.lat/wallet ahora',
      slots: null,
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'fall_through')
    if (out.kind !== 'fall_through') return
    assert.isNull(out.oosRedirect, 'URL in oos_redirect must be rejected')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// gibberish → fall_through (oosRedirect always null)
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | gibberish → fall_through', () => {
  test('returns fall_through with null oosRedirect', async ({ assert }) => {
    const client = mockClient({
      category: 'gibberish',
      intent: null,
      confidence: 0.8,
      reasoning: 'asdfgh',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })

    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })

    assert.equal(out.kind, 'fall_through')
    if (out.kind !== 'fall_through') return
    assert.isNull(out.oosRedirect)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// classifier error → typed gibberish → fall_through
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | classifier error → fall_through', () => {
  test('no Groq client → fall_through (classifier returns typed gibberish)', async ({ assert }) => {
    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => null })

    assert.equal(out.kind, 'fall_through')
    if (out.kind !== 'fall_through') return
    assert.equal(out.classification.category, 'gibberish')
    assert.include(out.classification.reasoning, 'classifier_error')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Outcome includes the underlying classification (for uniform logging)
// ══════════════════════════════════════════════════════════════════════════════

test.group('dispatcher | classification echoed on every outcome', () => {
  test('execute outcome carries the classification', async ({ assert }) => {
    const client = mockClient({
      category: 'action',
      intent: 'balance',
      confidence: 0.95,
      reasoning: 'baseline',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })
    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    assert.exists(out.classification)
    assert.equal(out.classification.intent, 'balance')
  })

  test('reply outcome carries the classification', async ({ assert }) => {
    const client = mockClient({
      category: 'ambiguous',
      intent: 'send',
      confidence: 0.5,
      reasoning: 'baseline',
      clarifying_question: '¿A quién?',
      oos_redirect: null,
      slots: { amount: 5 },
      detectedLang: 'es',
    })
    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    assert.exists(out.classification)
    assert.equal(out.classification.category, 'ambiguous')
  })

  test('fall_through outcome carries the classification', async ({ assert }) => {
    const client = mockClient({
      category: 'gibberish',
      intent: null,
      confidence: 0.8,
      reasoning: 'baseline',
      clarifying_question: null,
      oos_redirect: null,
      slots: null,
      detectedLang: 'es',
    })
    const out = await dispatchSmartMode({ ...BASE_ARGS, clientFactory: () => client })
    assert.exists(out.classification)
    assert.equal(out.classification.category, 'gibberish')
  })
})
