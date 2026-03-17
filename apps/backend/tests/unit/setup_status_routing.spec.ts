/**
 * Setup Status Routing Tests
 *
 * Verifies that routeCommand() gates help, greeting, social, unknown,
 * settings, and history based on user setup status (new_user, embedded_incomplete, onboarded).
 */

import { test } from '@japa/runner'
import { routeCommand } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { ParsedCommand } from '#types/index'
import type { Lang } from '#utils/messages'

const NO_OP_RATE_CTX: RateContext = {
  senderRate: null,
  senderCurrency: null,
  recipientRate: null,
  recipientCurrency: null,
}

const PHONE = '+573001111111'

function capture() {
  const messages: string[] = []
  const fakeMsg = async (_phone: string, msg: string, _lang: Lang) => {
    messages.push(msg)
  }
  return { messages, fakeMsg }
}

// Pass setupStatusOverride as the LAST positional arg.
// Signature: routeCommand(phone, cmd, lang, rateCtx, context, balanceHandler, sendHandler, generateResponseFn, sendMessageFn, pendingTxs, activeSendsSet, activeSendTimeoutMs, setupStatusOverride)
async function route(
  cmd: ParsedCommand,
  status: 'new_user' | 'embedded_incomplete' | 'onboarded',
  fakeMsg: any,
  fakeGenerate?: any
) {
  await routeCommand(
    PHONE,
    cmd,
    'en',
    NO_OP_RATE_CTX,
    [], // context
    undefined as any, // balanceHandler
    undefined as any, // sendHandler
    fakeGenerate ?? (async () => null), // generateResponseFn (returns null → fallback)
    fakeMsg, // sendMessageFn
    new Map(), // pendingTxs
    new Set(), // activeSendsSet
    60_000, // activeSendTimeoutMs
    status // setupStatusOverride
  )
}

// ── Help ──────────────────────────────────────────────────────────────────

test.group('Help | setup status gating', () => {
  const cmd: ParsedCommand = { command: 'help' }

  test('SS-01: help + new_user → setup-focused help with setup URL', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'new_user', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
    assert.include(messages[0], 'Sippy')
    assert.notInclude(messages[0], 'balance')
  })

  test('SS-02: help + embedded_incomplete → finish-setup help', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'embedded_incomplete', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
    assert.include(messages[0].toLowerCase(), 'finish')
  })

  test('SS-03: help + onboarded → normal help with commands', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'onboarded', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0].toLowerCase(), 'balance')
    assert.notInclude(messages[0], '/setup?phone=')
  })
})

// ── Settings ──────────────────────────────────────────────────────────────

test.group('Settings | setup status gating', () => {
  const cmd: ParsedCommand = { command: 'settings' }

  test('SS-04: settings + new_user → setup nudge', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'new_user', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-05: settings + embedded_incomplete → finish-setup nudge, NOT settings URL', async ({
    assert,
  }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'embedded_incomplete', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
    assert.notInclude(messages[0], '/settings')
  })

  test('SS-06: settings + onboarded → normal settings with /settings URL', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'onboarded', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/settings')
  })
})

// ── Greeting ──────────────────────────────────────────────────────────────

test.group('Greeting | setup status gating', () => {
  const cmd: ParsedCommand = { command: 'greeting', originalText: 'hola' }

  test('SS-07: greeting + new_user (LLM returns null) → new-user greeting with setup URL', async ({
    assert,
  }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'new_user', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-08: greeting + embedded_incomplete (LLM returns null) → incomplete greeting', async ({
    assert,
  }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'embedded_incomplete', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
    assert.include(messages[0].toLowerCase(), 'almost')
  })

  test('SS-09: greeting + onboarded (LLM returns null) → standard greeting', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'onboarded', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.notInclude(messages[0], '/setup?phone=')
    assert.include(messages[0].toLowerCase(), 'sippy')
  })

  test('SS-10: greeting + new_user (LLM returns reply) → uses LLM reply', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    const fakeGenerate = async () => 'LLM says hi'
    await route(cmd, 'new_user', fakeMsg, fakeGenerate)
    assert.lengthOf(messages, 1)
    assert.equal(messages[0], 'LLM says hi')
  })
})

// ── Unknown ───────────────────────────────────────────────────────────────

test.group('Unknown | setup status gating', () => {
  const cmd: ParsedCommand = { command: 'unknown', originalText: 'asdfgh' }

  test('SS-11: unknown + new_user → setup nudge', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'new_user', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-12: unknown + embedded_incomplete → finish-setup nudge', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'embedded_incomplete', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-13: unknown + onboarded → standard unknown message', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'onboarded', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.notInclude(messages[0], '/setup?phone=')
  })
})

// ── History ───────────────────────────────────────────────────────────────

test.group('History | setup status gating', () => {
  const cmd: ParsedCommand = { command: 'history' }

  test('SS-14: history + new_user → setup nudge', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'new_user', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-15: history + embedded_incomplete → finish-setup nudge', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'embedded_incomplete', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.include(messages[0], '/setup?phone=')
  })

  test('SS-16: history + onboarded → normal history', async ({ assert }) => {
    const { messages, fakeMsg } = capture()
    await route(cmd, 'onboarded', fakeMsg)
    assert.lengthOf(messages, 1)
    assert.notInclude(messages[0], '/setup?phone=')
  })
})
