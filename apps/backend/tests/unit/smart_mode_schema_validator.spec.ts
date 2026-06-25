/**
 * SMART MODE — schema + validator regression tests
 *
 * Pins the safety boundary between the LLM's structured output and the
 * existing send pipeline. The classifier can be wrong about which intent
 * a message expresses, but these invariants must hold regardless:
 *
 *  1. Slot shapes that would ship the wrong-currency send are rejected at
 *     the schema layer (amount + localAmount, localAmount alone, etc.).
 *  2. `validateSmartAction` downgrades action → ambiguous whenever the
 *     required slots for the intent aren't satisfied.
 *  3. `localAmount` (with `localCurrency`) satisfies the abstract "amount"
 *     requirement for send (mirrors the existing parser).
 *  4. Every SMART intent has exactly one entry in INTENT_CONDITIONS.
 *  5. The fall-through rule (`shouldFallThroughToExistingParser`) routes
 *     out_of_scope/gibberish back to the existing parser before we reply.
 *
 * No Groq, no network — these are pure type/logic tests.
 */

import { test } from '@japa/runner'
import {
  SmartClassification,
  classifierErrorFallback,
  SMART_INTENT_SLUGS,
} from '#services/smart_mode/types'
import { INTENT_CONDITIONS } from '#services/smart_mode/conditions'
import {
  validateSmartAction,
  shouldFallThroughToExistingParser,
} from '#services/smart_mode/validators'
import type { SmartClassification as SmartClassificationType } from '#services/smart_mode/types'

/** Compose a minimally-valid classification for the test under test to mutate. */
function makeClassification(overrides: Partial<SmartClassificationType>): SmartClassificationType {
  return {
    category: 'action',
    intent: 'balance',
    confidence: 0.9,
    reasoning: 'test fixture',
    clarifying_question: null,
    oos_redirect: null,
    slots: undefined,
    detectedLang: 'es',
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Schema — slot invariants
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode schema | slot invariants', () => {
  test('rejects amount + localAmount together (mutually exclusive)', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        intent: 'send',
        slots: {
          amount: 5,
          localAmount: 10,
          localCurrency: 'LOCAL',
          recipientRaw: 'mateo',
        },
      })
    )
    assert.isFalse(r.success, 'amount + localAmount must be mutually exclusive')
    if (!r.success) {
      assert.include(JSON.stringify(r.error.issues), 'mutually exclusive')
    }
  })

  test('rejects localAmount without localCurrency', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        intent: 'send',
        slots: { localAmount: 10, recipientRaw: 'mateo' },
      })
    )
    assert.isFalse(r.success, 'localAmount must pair with a currency code')
    if (!r.success) {
      assert.include(JSON.stringify(r.error.issues), 'localAmount requires localCurrency')
    }
  })

  test('rejects localCurrency without localAmount', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        intent: 'send',
        slots: { localCurrency: 'BRL', recipientRaw: 'carolina' },
      })
    )
    assert.isFalse(r.success, 'lone currency code is meaningless')
    if (!r.success) {
      assert.include(JSON.stringify(r.error.issues), 'localCurrency requires localAmount')
    }
  })

  test('accepts amount alone (USDC default path)', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        intent: 'send',
        slots: { amount: 5, recipientRaw: 'mateo' },
      })
    )
    assert.isTrue(r.success)
  })

  test('accepts localAmount + localCurrency (local-currency path)', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        intent: 'send',
        slots: { localAmount: 10, localCurrency: 'LOCAL', recipientRaw: 'mi mamá' },
      })
    )
    assert.isTrue(r.success)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Schema — category × intent invariants
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode schema | category × intent', () => {
  test('action requires intent', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({ category: 'action', intent: null })
    )
    assert.isFalse(r.success)
  })

  test('ambiguous requires intent + clarifying_question', ({ assert }) => {
    const r1 = SmartClassification.safeParse(
      makeClassification({ category: 'ambiguous', intent: null, clarifying_question: '¿qué?' })
    )
    assert.isFalse(r1.success, 'ambiguous without intent rejected')

    const r2 = SmartClassification.safeParse(
      makeClassification({ category: 'ambiguous', intent: 'send', clarifying_question: null })
    )
    assert.isFalse(r2.success, 'ambiguous without clarifying_question rejected')
  })

  test('out_of_scope forbids intent (no fake certainty)', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({ category: 'out_of_scope', intent: 'send', clarifying_question: null })
    )
    assert.isFalse(r.success)
  })

  test('gibberish forbids intent', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({ category: 'gibberish', intent: 'help', clarifying_question: null })
    )
    assert.isFalse(r.success)
  })

  test('out_of_scope with null intent is valid', ({ assert }) => {
    const r = SmartClassification.safeParse(
      makeClassification({
        category: 'out_of_scope',
        intent: null,
        oos_redirect: 'Puedo enviar, saldo, mi qr.',
      })
    )
    assert.isTrue(r.success)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// classifierErrorFallback — always-same-shape on error
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode | classifierErrorFallback', () => {
  test('returns a schema-valid gibberish fallback', ({ assert }) => {
    const fb = classifierErrorFallback('timeout')
    const r = SmartClassification.safeParse(fb)
    assert.isTrue(r.success, 'fallback must always pass its own schema')
    assert.equal(fb.category, 'gibberish')
    assert.isNull(fb.intent)
    assert.equal(fb.confidence, 0)
    assert.include(fb.reasoning, 'classifier_error')
  })

  test('truncates long reason so the 500-char cap can never be tripped', ({ assert }) => {
    const longReason = 'x'.repeat(1000)
    const fb = classifierErrorFallback(longReason)
    const r = SmartClassification.safeParse(fb)
    assert.isTrue(r.success, 'long reason must not trip Zod')
    assert.isAtMost(fb.reasoning.length, 500)
    assert.include(fb.reasoning, 'classifier_error:')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// validateSmartAction — semantic guard beyond Zod
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode validateSmartAction | required-slot downgrade', () => {
  test('downgrades send with no slots → ambiguous + clarifier', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'send',
      slots: undefined,
    })
    const out = validateSmartAction(input)
    assert.equal(out.category, 'ambiguous')
    assert.isNotNull(out.clarifying_question, 'must include a clarifying question to ask')
    assert.include(out.reasoning, 'downgraded: missing')
  })

  test('downgrades send with amount only → asks for recipient', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'send',
      slots: { amount: 5 },
    })
    const out = validateSmartAction(input)
    assert.equal(out.category, 'ambiguous')
    assert.equal(out.clarifying_question, '¿A quién?')
  })

  test('downgrades send with recipient only → asks for amount', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'send',
      slots: { recipientRaw: 'mateo' },
    })
    const out = validateSmartAction(input)
    assert.equal(out.category, 'ambiguous')
    assert.equal(out.clarifying_question, '¿Cuánto?')
  })

  test('downgrades invite with no recipient → asks for number', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'invite',
      slots: undefined,
    })
    const out = validateSmartAction(input)
    assert.equal(out.category, 'ambiguous')
    assert.isNotNull(out.clarifying_question)
    assert.include(out.clarifying_question!, 'A quién')
  })

  test('localAmount + localCurrency satisfies send amount requirement', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'send',
      slots: { localAmount: 10, localCurrency: 'LOCAL', recipientRaw: 'mi mamá' },
    })
    const out = validateSmartAction(input)
    assert.equal(
      out.category,
      'action',
      'localAmount must satisfy the abstract "amount" requirement'
    )
    assert.isNull(out.clarifying_question)
  })

  test('preserves LLM-authored clarifying_question on downgrade', ({ assert }) => {
    const input = makeClassification({
      category: 'action',
      intent: 'send',
      slots: { recipientRaw: 'mateo' },
      // Edge: classifier flagged a question even though it returned action
      clarifying_question: '¿Cuántos dólares para Mateo?',
    })
    const out = validateSmartAction(input)
    assert.equal(out.category, 'ambiguous')
    assert.equal(
      out.clarifying_question,
      '¿Cuántos dólares para Mateo?',
      'LLM-written question preferred over deterministic fallback'
    )
  })

  test('non-action classifications pass through unchanged', ({ assert }) => {
    const oos = makeClassification({
      category: 'out_of_scope',
      intent: null,
      oos_redirect: 'Puedo ver saldo o enviar.',
    })
    assert.deepEqual(validateSmartAction(oos), oos)

    const gib = makeClassification({
      category: 'gibberish',
      intent: null,
    })
    assert.deepEqual(validateSmartAction(gib), gib)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Dispatcher fall-through rule
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode | shouldFallThroughToExistingParser', () => {
  test('out_of_scope falls through (existing parser may know withdraw / settings / about)', ({
    assert,
  }) => {
    const c = makeClassification({
      category: 'out_of_scope',
      intent: null,
      oos_redirect: 'Puedo enviar o ver saldo.',
    })
    assert.isTrue(shouldFallThroughToExistingParser(c))
  })

  test('gibberish falls through (regex may catch typo or regional phrase)', ({ assert }) => {
    const c = makeClassification({ category: 'gibberish', intent: null })
    assert.isTrue(shouldFallThroughToExistingParser(c))
  })

  test('action does NOT fall through — SMART is authoritative', ({ assert }) => {
    const c = makeClassification({
      category: 'action',
      intent: 'balance',
    })
    assert.isFalse(shouldFallThroughToExistingParser(c))
  })

  test('ambiguous does NOT fall through — SMART owns the clarification', ({ assert }) => {
    const c = makeClassification({
      category: 'ambiguous',
      intent: 'send',
      clarifying_question: '¿A quién?',
      slots: { amount: 5 },
    })
    assert.isFalse(shouldFallThroughToExistingParser(c))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Conditions table integrity
// ══════════════════════════════════════════════════════════════════════════════

test.group('smart_mode | conditions table coverage', () => {
  test('every SMART intent has exactly one INTENT_CONDITIONS entry', ({ assert }) => {
    for (const slug of SMART_INTENT_SLUGS) {
      const matches = INTENT_CONDITIONS.filter((c) => c.slug === slug)
      assert.equal(matches.length, 1, `${slug} should have exactly one conditions entry`)
    }
  })

  test('no orphan condition entries (every entry is a SMART intent)', ({ assert }) => {
    const validSlugs = new Set<string>(SMART_INTENT_SLUGS)
    for (const c of INTENT_CONDITIONS) {
      assert.isTrue(
        validSlugs.has(c.slug),
        `${c.slug} is in conditions but not in SMART_INTENT_SLUGS`
      )
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2 vocabulary expansion (2026-05-18) — no-slot intents
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit thesis: "the model isn't smart enough — it should be aware of
// every bot capability or it will keep producing confident-wrong
// classifications". Five regex-only intents (start, settings, about,
// list_contacts, withdraw) were folded into SMART so the LLM can route
// conversational forms ('quiero retirar mi plata', 'qué eres?',
// 'muéstrame mis contactos') deterministically.
//
// These tests pin the contract for every expanded intent:
//   1. Is in SMART_INTENT_SLUGS (without these, the classifier prompt
//      doesn't enumerate them and the LLM can't pick them).
//   2. Has a conditions entry with:
//        - non-empty description (drives the prompt)
//        - 3+ examples (few-shot anchors)
//        - at least 1 notRoutedHere (shows misroute risks were considered)
//        - empty requiresSlots (no-slot family)
//   3. Survives validateSmartAction without being downgraded to ambiguous
//      (no missing required slots → action stays action).

const PHASE_2_EXPANSION = ['start', 'settings', 'about', 'list_contacts', 'withdraw'] as const

test.group('smart_mode | Phase 2 expansion contract', () => {
  for (const slug of PHASE_2_EXPANSION) {
    test(`${slug}: registered in SMART_INTENT_SLUGS`, ({ assert }) => {
      assert.include(SMART_INTENT_SLUGS as readonly string[], slug)
    })

    test(`${slug}: has a complete INTENT_CONDITIONS entry`, ({ assert }) => {
      const entry = INTENT_CONDITIONS.find((c) => c.slug === slug)
      assert.exists(entry, `${slug} must have a conditions entry`)
      assert.isAbove(
        entry!.description.length,
        20,
        `${slug} description must explain the trigger phrases`
      )
      assert.isAtLeast(entry!.examples.length, 3, `${slug} must have 3+ few-shot examples`)
      assert.isAtLeast(
        entry!.notRoutedHere?.length ?? 0,
        1,
        `${slug} must declare 1+ misroute guard (notRoutedHere)`
      )
      assert.lengthOf(
        entry!.requiresSlots,
        0,
        `${slug} is in the no-slot family — requiresSlots must be empty`
      )
    })

    test(`${slug}: action classification stays as action (no slot downgrade)`, ({ assert }) => {
      const c = makeClassification({
        category: 'action',
        intent: slug,
        slots: undefined,
      })
      const validated = validateSmartAction(c)
      assert.equal(
        validated.category,
        'action',
        `${slug} has no required slots — action must not downgrade to ambiguous`
      )
      assert.equal(validated.intent, slug)
    })
  }

  // Misroute regression: money paths must NOT route to withdraw. The
  // `notRoutedHere` declarations are advisory in the prompt; this test
  // is a structural check that the SMART_INTENT_SLUGS doesn't expose
  // withdraw in a way the classifier could grab as a send substitute.
  test('withdraw is in the no-slot family — cannot accept amount/recipient slots', ({ assert }) => {
    const c = makeClassification({
      category: 'action',
      intent: 'withdraw',
      // Even if the LLM hallucinates an amount + recipient on a withdraw
      // intent, validateSmartAction must not accept those as required
      // slots (withdraw has no required slots, so amount/recipient are
      // ignored noise — they don't get propagated as a send).
      slots: { amount: 50, recipientRaw: '+573001234567' },
    })
    const validated = validateSmartAction(c)
    assert.equal(validated.intent, 'withdraw', 'intent must NOT silently rewrite to send')
    assert.equal(validated.category, 'action')
  })
})
