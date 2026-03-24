/**
 * LLM Response Validator Tests
 *
 * Groups:
 * A — validateLLMResponse unit tests (mock Groq, feature flag, edge cases)
 * B — routeCommand integration (validator wired in, template fallbacks)
 */

import { test } from '@japa/runner'
import { validateLLMResponse } from '#services/llm_validator.service'
import { routeCommand } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { ParsedCommand, PendingTransaction } from '#types/index'
import type { ValidationResult } from '#services/llm_validator.service'

// ── Helpers ────────────────────────────────────────────────────────────────

const NO_OP_RATE_CTX: RateContext = {
  senderRate: null,
  senderCurrency: null,
  recipientRate: null,
  recipientCurrency: null,
}

function makePendingMap(
  entries: [string, PendingTransaction][] = []
): Map<string, PendingTransaction> {
  return new Map(entries)
}

// ── Group A — validateLLMResponse unit tests ──────────────────────────────

test.group('Group A | validateLLMResponse unit behavior', () => {
  test('A-01: returns pass-through when LLM_VALIDATOR env is not set', async ({ assert }) => {
    // LLM_VALIDATOR is not set in test env, so it should always pass through
    const result = await validateLLMResponse('Hola! Como estas?', 'hola', 'es')
    assert.isTrue(result.passed)
    assert.isNull(result.correctedText)
    assert.isNull(result.reason)
  })

  test('A-02: returns pass-through when LLM_VALIDATOR is "false"', async ({ assert }) => {
    // Even if somehow set to 'false', exact === 'true' check means pass-through
    const result = await validateLLMResponse('Hey there!', 'hello', 'en')
    assert.isTrue(result.passed)
    assert.isNull(result.correctedText)
  })

  test('A-03: pass-through preserves all fields as null', async ({ assert }) => {
    const result = await validateLLMResponse('Oi! Tudo bem?', 'oi', 'pt')
    assert.deepEqual(result, { passed: true, correctedText: null, reason: null })
  })

  test('A-04: handles empty proposed message gracefully', async ({ assert }) => {
    const result = await validateLLMResponse('', 'hola', 'es')
    assert.isTrue(result.passed)
  })

  test('A-05: handles empty user message gracefully', async ({ assert }) => {
    const result = await validateLLMResponse('Hola!', '', 'es')
    assert.isTrue(result.passed)
  })

  test('A-06: accepts all supported languages', async ({ assert }) => {
    for (const lang of ['en', 'es', 'pt']) {
      const result = await validateLLMResponse('Test message', 'test', lang)
      assert.isTrue(result.passed, `should pass for lang=${lang}`)
    }
  })

  test('A-07: accepts optional setupStatus parameter', async ({ assert }) => {
    const result = await validateLLMResponse('Set up your wallet!', 'hola', 'en', [], 'new_user')
    assert.isTrue(result.passed)
  })

  test('A-08: accepts optional dialectHint parameter', async ({ assert }) => {
    const result = await validateLLMResponse(
      'Quiubo parce!',
      'hola',
      'es',
      [],
      'onboarded',
      'Use natural Colombian Spanish.'
    )
    assert.isTrue(result.passed)
  })
})

// ── Group B — routeCommand integration with injectable validator ──────────

test.group('Group B | routeCommand with validator', () => {
  // Always-pass validator (same as default when LLM_VALIDATOR is off)
  const alwaysPass = async (): Promise<ValidationResult> => ({
    passed: true,
    correctedText: null,
    reason: null,
  })

  // Always-fail validator with corrected text
  const alwaysFailWithCorrection = async (): Promise<ValidationResult> => ({
    passed: false,
    correctedText: 'Fixed reply.',
    reason: 'tone',
  })

  // Always-fail validator without corrected text (forces template fallback)
  const alwaysFailNoCorrection = async (): Promise<ValidationResult> => ({
    passed: false,
    correctedText: null,
    reason: 'scope',
  })

  test('B-01: greeting with passing validator sends LLM reply', async ({ assert }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }
    const fakeGen = async () => 'Hey! Check your balance or send some cash.'

    const cmd: ParsedCommand = { command: 'greeting', originalText: 'hola' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      fakeGen as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysPass
    )

    assert.equal(messages.length, 1)
    assert.equal(messages[0], 'Hey! Check your balance or send some cash.')
  })

  test('B-02: greeting with failing validator (has correction) sends corrected text', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }
    const fakeGen = async () => 'I am here to assist you with your blockchain needs.'

    const cmd: ParsedCommand = { command: 'greeting', originalText: 'hola' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      fakeGen as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailWithCorrection
    )

    assert.equal(messages.length, 1)
    assert.equal(messages[0], 'Fixed reply.')
  })

  test('B-03: greeting with failing validator (no correction) falls back to template', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }
    const fakeGen = async () => 'Bad reply that will be rejected.'

    const cmd: ParsedCommand = { command: 'greeting', originalText: 'hola' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      fakeGen as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailNoCorrection
    )

    assert.equal(messages.length, 1)
    // Falls through to formatGreetingMessage template (not the LLM reply)
    assert.isTrue(messages[0].length > 10)
    assert.notEqual(messages[0], 'Bad reply that will be rejected.')
  })

  test('B-04: social with failing validator falls back to template', async ({ assert }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }
    const fakeGen = async () => 'I can help you invest in crypto tokens.'

    const cmd: ParsedCommand = { command: 'social', originalText: 'gracias' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      fakeGen as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailNoCorrection
    )

    assert.equal(messages.length, 1)
    assert.notEqual(messages[0], 'I can help you invest in crypto tokens.')
  })

  test('B-05: confirm no-pending with failing validator falls back to social template', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }
    const fakeGen = async () => 'Let me assist you with your DeFi needs.'

    const cmd: ParsedCommand = { command: 'confirm', originalText: 'dale' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      fakeGen as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailNoCorrection
    )

    assert.equal(messages.length, 1)
    assert.notEqual(messages[0], 'Let me assist you with your DeFi needs.')
  })

  test('B-06: unknown with helpfulMessage — failing validator falls back to unknown template', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }

    const cmd: ParsedCommand = {
      command: 'unknown',
      originalText: 'puedo comprar acciones?',
      helpfulMessage: 'Sure! You can buy stocks and invest in blockchain.',
    }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      undefined as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailNoCorrection
    )

    assert.equal(messages.length, 1)
    // Should fall back to formatUnknownCommandMessage, not send the bad helpfulMessage
    assert.notEqual(messages[0], 'Sure! You can buy stocks and invest in blockchain.')
  })

  test('B-07: unknown with helpfulMessage — passing validator sends helpfulMessage', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }

    const cmd: ParsedCommand = {
      command: 'unknown',
      originalText: 'cuantas personas usan sippy?',
      helpfulMessage: 'Sippy te ayuda a enviar dolares por WhatsApp.',
    }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      undefined as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysPass
    )

    assert.equal(messages.length, 1)
    assert.equal(messages[0], 'Sippy te ayuda a enviar dolares por WhatsApp.')
  })

  test('B-08: template commands (help, balance, etc.) are NOT affected by validator', async ({
    assert,
  }) => {
    const messages: string[] = []
    const fakeMsg = async (_p: string, msg: string) => {
      messages.push(msg)
    }

    // Even with a failing validator, help should send the template directly
    const cmd: ParsedCommand = { command: 'help' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      undefined as any,
      undefined as any,
      fakeMsg as any,
      makePendingMap(),
      new Set(),
      30_000,
      'onboarded',
      'neutral',
      alwaysFailNoCorrection
    )

    assert.equal(messages.length, 1)
    assert.isTrue(messages[0].length > 20)
  })
})
