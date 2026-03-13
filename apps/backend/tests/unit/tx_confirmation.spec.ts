/**
 * TX-001 Transaction Confirmation Flow Tests
 *
 * Groups:
 * A  — Parser: confirm/cancel regex patterns
 * A2 — dale no longer matches social
 * B  — maskPhoneForConfirmation via formatConfirmationPrompt
 * C  — routeCommand: send with confirmation threshold
 * D  — routeCommand: confirm handler
 * E  — routeCommand: cancel handler
 * F  — dispatchCommand: pending tx cleared on unrelated command
 * G  — formatConfirmationPrompt: trilingual content
 */

import { test } from '@japa/runner'
import { parseMessageWithRegex } from '#utils/message_parser'
import {
  formatConfirmationPrompt,
  formatTransferCancelled,
  formatNoPendingTransfer,
  formatCommandErrorMessage,
} from '#utils/messages'
import { routeCommand, dispatchCommand } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { PendingTransaction } from '#types/index'
import type { Lang } from '#utils/messages'
import type { ParsedCommand } from '#types/index'

// ── Helpers ────────────────────────────────────────────────────────────────

const NO_OP_RATE_CTX: RateContext = {
  senderRate: null,
  senderCurrency: null,
  recipientRate: null,
  recipientCurrency: null,
}

function makePendingMap(entries: [string, PendingTransaction][] = []): Map<string, PendingTransaction> {
  return new Map(entries)
}

// ── Group A — Parser: confirm/cancel regex patterns ─────────────────────

test.group('Group A | Parser confirm/cancel patterns', () => {
  const confirmInputs = [
    ['yes', 'R-01'],
    ['si', 'R-02'],
    ['sí', 'R-03'],
    ['sim', 'R-04'],
    ['confirmar', 'R-05'],
    ['dale', 'R-06'],
    ['va', 'R-07'],
    ['YES', 'R-13'],
  ]

  for (const [input, id] of confirmInputs) {
    test(`${id}: "${input}" → confirm`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'confirm')
    })
  }

  const cancelInputs = [
    ['no', 'R-08'],
    ['cancel', 'R-09'],
    ['cancelar', 'R-10'],
    ['nao', 'R-11'],
    ['não', 'R-12'],
    ['NO', 'R-14'],
  ]

  for (const [input, id] of cancelInputs) {
    test(`${id}: "${input}" → cancel`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'cancel')
    })
  }
})

// ── Group A2 — dale no longer matches social ──────────────────────────────

test.group('Group A2 | dale is confirm not social', () => {
  test('R-15: "dale" → confirm (not social)', ({ assert }) => {
    const result = parseMessageWithRegex('dale')
    assert.equal(result.command, 'confirm')
  })
})

// ── Group B — maskPhoneForConfirmation via formatConfirmationPrompt ───────

test.group('Group B | Phone masking in formatConfirmationPrompt', () => {
  test('M-01: Colombia +57 → +57***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+573001234567', 'en')
    assert.include(msg, '+57***4567')
  })

  test('M-02: US +1 → +1***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+15551234567', 'en')
    assert.include(msg, '+1***4567')
  })

  test('M-03: Brazil +55 → +55***4321', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5511987654321', 'pt')
    assert.include(msg, '+55***4321')
  })

  test('M-04: Bolivia +591 → +591***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5914001234567', 'en')
    assert.include(msg, '+591***4567')
  })

  test('M-05: Ecuador +593 → +593***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5934001234567', 'en')
    assert.include(msg, '+593***4567')
  })

  test('M-06: Panama +507 → +507***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5074001234567', 'en')
    assert.include(msg, '+507***4567')
  })

  test('M-07: Curaçao +599 → +599***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5991234567', 'en')
    assert.include(msg, '+599***4567')
  })

  test('M-08: Aruba +297 → +297***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+2971234567', 'en')
    assert.include(msg, '+297***4567')
  })

  test('M-09: Suriname +597 → +597***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5971234567', 'en')
    assert.include(msg, '+597***4567')
  })

  test('M-10: Belize +501 → +501***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5011234567', 'en')
    assert.include(msg, '+501***4567')
  })

  test('M-11: Guyana +592 → +592***4567', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, '+5921234567', 'en')
    assert.include(msg, '+592***4567')
  })
})

// ── Group C — routeCommand: send with confirmation threshold ──────────────

test.group('Group C | routeCommand send threshold', () => {
  test('C-01: send $10 above default $5 → pending stored, confirmation prompt sent, sendHandler NOT called', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_phone: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipient: '+573001234567' }
    await routeCommand('+1555000001', cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(sendHandlerCalled)
    assert.equal(pendingTxs.size, 1)
    assert.isTrue(capturedMessages.some(m => m.includes('***')))
  })

  test('C-02: send $3 below threshold → sendHandler called immediately, map empty', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (..._args: any[]) => {}

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573001234567' }
    await routeCommand('+1555000002', cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isTrue(sendHandlerCalled)
    assert.equal(pendingTxs.size, 0)
  })

  test('C-03: send $5 exactly at threshold → sendHandler called immediately (≤ threshold)', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (..._args: any[]) => {}

    const cmd: ParsedCommand = { command: 'send', amount: 5, recipient: '+573001234567' }
    await routeCommand('+1555000003', cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isTrue(sendHandlerCalled)
    assert.equal(pendingTxs.size, 0)
  })

  test('C-04: second send while first pending → map contains only new pending tx', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    const fakeMsg = async (..._args: any[]) => {}
    const fakeSend = async (..._args: any[]) => { return true }

    const phone = '+1555000004'
    const cmd1: ParsedCommand = { command: 'send', amount: 10, recipient: '+573001111111' }
    const cmd2: ParsedCommand = { command: 'send', amount: 20, recipient: '+573002222222' }

    await routeCommand(phone, cmd1, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)
    await routeCommand(phone, cmd2, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.equal(pendingTxs.size, 1)
    assert.equal(pendingTxs.get(phone)?.recipient, '+573002222222')
    assert.equal(pendingTxs.get(phone)?.amount, 20)
  })
})

// ── Group D — routeCommand: confirm handler ───────────────────────────────

test.group('Group D | routeCommand confirm handler', () => {
  test('C-05: confirm with valid pending tx → sendHandler called, map empty after success', async ({ assert }) => {
    const phone = '+1555000005'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    let sendHandlerCalled = false
    let capturedAmount: number | undefined

    const fakeSend = async (_p: string, amount: number, ..._rest: any[]) => {
      sendHandlerCalled = true
      capturedAmount = amount
      return true
    }
    const fakeMsg = async (..._args: any[]) => {}

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isTrue(sendHandlerCalled)
    assert.equal(capturedAmount, 10)
    assert.equal(pendingTxs.size, 0)
  })

  test('C-05b: confirm with pending where sendHandler throws → routeCommand resolves, error message sent, pending NOT re-inserted', async ({ assert }) => {
    const phone = '+1555000005b'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { throw new Error('transfer failed') }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    // Should resolve (not reject) — outer try/catch swallows
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    // Error message sent
    const expectedError = formatCommandErrorMessage('en')
    assert.isTrue(capturedMessages.some(m => m === expectedError))
    // No rollback — pending tx stays consumed to prevent double-payment
    assert.equal(pendingTxs.size, 0)
  })

  test('C-05d: confirm where sendHandler returns false (handles error internally) → routeCommand resolves, pending NOT re-inserted', async ({ assert }) => {
    const phone = '+1555000005d'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    const capturedMessages: string[] = []

    // Simulates the real handleSendCommand: handles error internally, returns false, does NOT throw
    const fakeSend = async (..._args: any[]) => { return false }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    // Should resolve (not reject)
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    // No rollback — pending tx stays consumed to prevent double-payment
    assert.equal(pendingTxs.size, 0)
    // No generic error message sent — sendHandler already messaged the user
    const errorMsg = formatCommandErrorMessage('en')
    assert.isFalse(capturedMessages.some(m => m === errorMsg))
  })

  test('C-05c: two concurrent confirms → sendHandler called exactly once, second gets "No pending transfer."', async ({ assert }) => {
    const phone = '+1555000005c'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    let sendHandlerCallCount = 0
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCallCount++; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    // Start both without awaiting between — simulates concurrent messages
    const p1 = routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)
    const p2 = routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)
    await Promise.all([p1, p2])

    assert.equal(sendHandlerCallCount, 1)
    const noPendingMsg = formatNoPendingTransfer('en')
    assert.isTrue(capturedMessages.some(m => m === noPendingMsg))
  })

  test('C-06: confirm with no pending tx → "No pending transfer." sent, sendHandler NOT called', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand('+1555000006', cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(sendHandlerCalled)
    assert.isTrue(capturedMessages.some(m => m === formatNoPendingTransfer('en')))
  })

  test('C-07: confirm with expired pending tx → treated as no-pending, entry deleted', async ({ assert }) => {
    const phone = '+1555000007'
    const expired: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now() - 3 * 60 * 1000, // 3 minutes ago
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, expired]])
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(sendHandlerCalled)
    assert.isTrue(capturedMessages.some(m => m === formatNoPendingTransfer('en')))
    assert.equal(pendingTxs.size, 0)
  })
})

// ── Group E — routeCommand: cancel handler ────────────────────────────────

test.group('Group E | routeCommand cancel handler', () => {
  test('C-08: cancel with pending tx → map cleared, "Transfer cancelled." sent', async ({ assert }) => {
    const phone = '+1555000008'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    const capturedMessages: string[] = []

    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'cancel' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, undefined as any, undefined, fakeMsg as any, pendingTxs)

    assert.equal(pendingTxs.size, 0)
    assert.isTrue(capturedMessages.some(m => m === formatTransferCancelled('en')))
  })

  test('C-09: cancel with no pending tx → map stays empty, "Transfer cancelled." sent (graceful no-op)', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []

    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'cancel' }
    await routeCommand('+1555000009', cmd, 'en', NO_OP_RATE_CTX, [], undefined, undefined as any, undefined, fakeMsg as any, pendingTxs)

    assert.equal(pendingTxs.size, 0)
    assert.isTrue(capturedMessages.some(m => m === formatTransferCancelled('en')))
  })
})

// ── Group F — dispatchCommand: pending tx cleared on unrelated command ────

test.group('Group F | dispatchCommand clears pending on unrelated command', () => {
  test('C-10: balance command clears pending tx from injected map', async ({ assert }) => {
    const phone = '+1555000010'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])

    const fakeBalance = async (..._args: any[]) => {}
    const fakeSend = async (..._args: any[]) => {}

    const cmd: ParsedCommand = { command: 'balance' }
    await dispatchCommand(phone, cmd, 'en', [], fakeBalance as any, fakeSend as any, pendingTxs)

    assert.equal(pendingTxs.size, 0)
  })
})

// ── Group G — formatConfirmationPrompt: trilingual content ────────────────

test.group('Group G | formatConfirmationPrompt trilingual', () => {
  const recipient = '+573001234567' // → +57***4567

  test('P-01: en — correct confirmation message', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, recipient, 'en')
    assert.equal(msg, 'Send $10.00 to +57***4567? Reply YES to confirm or NO to cancel.')
  })

  test('P-02: es — correct confirmation message', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, recipient, 'es')
    assert.equal(msg, '¿Enviar $10.00 a +57***4567? Responde SI para confirmar o NO para cancelar.')
  })

  test('P-03: pt — correct confirmation message', ({ assert }) => {
    const msg = formatConfirmationPrompt(10, recipient, 'pt')
    assert.equal(msg, 'Enviar $10.00 para +57***4567? Responda SIM para confirmar ou NAO para cancelar.')
  })
})
