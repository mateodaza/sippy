/**
 * TX-002 Self-send Block + Concurrent Send Protection Tests
 *
 * Groups:
 * A  — Self-send block
 * B  — Concurrent send protection (immediate/send path)
 * C  — Confirm path concurrent protection
 * D  — Interaction with existing pending tx behavior
 * T  — Safety valve timer
 */

import { test } from '@japa/runner'
import {
  formatSelfSendMessage,
  formatConcurrentSendMessage,
} from '#utils/messages'
import { routeCommand } from '#controllers/webhook_controller'
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

// ── Group A — Self-send block ──────────────────────────────────────────────

test.group('Group A | Self-send block', () => {
  test('A-01: send to own phone (immediate path, amount ≤ threshold) → self-send message sent; sendHandler NOT called; pendingTxs empty', async ({ assert }) => {
    const phone = '+573001234001'
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: phone }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(sendHandlerCalled)
    assert.equal(pendingTxs.size, 0)
    assert.isTrue(capturedMessages.some(m => m === formatSelfSendMessage('en')))
  })

  test('A-02: send to different phone (immediate path) → no self-send message; sendHandler called', async ({ assert }) => {
    const phone = '+1555000002'
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573001234567' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isTrue(sendHandlerCalled)
    assert.isFalse(capturedMessages.some(m => m === formatSelfSendMessage('en')))
  })

  test('A-03: send to own phone (above threshold / confirmation path) → self-send message sent; pending tx NOT stored', async ({ assert }) => {
    const phone = '+573001234003'
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipient: phone }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(sendHandlerCalled)
    assert.equal(pendingTxs.size, 0)
    assert.isTrue(capturedMessages.some(m => m === formatSelfSendMessage('en')))
  })

  test('A-04: self-send message — es', ({ assert }) => {
    const msg = formatSelfSendMessage('es')
    assert.include(msg, 'ti mismo')
  })

  test('A-05: self-send message — pt', ({ assert }) => {
    const msg = formatSelfSendMessage('pt')
    assert.include(msg, 'voce mesmo')
  })

  test('A-06: canonicalizePhone returns null for malformed recipient → self-send check skipped; no self-send message sent', async ({ assert }) => {
    const phone = '+1555000006'
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    // 'notaphone' has no digits matching E.164 pattern → canonicalizePhone returns null
    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: 'notaphone' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.isFalse(capturedMessages.some(m => m === formatSelfSendMessage('en')))
  })
})

// ── Group B — Concurrent send protection (immediate/send path) ────────────

test.group('Group B | Concurrent send protection (immediate path)', () => {
  test('B-01: activeSendsSet pre-seeded with user phone → concurrent message sent; sendHandler NOT called', async ({ assert }) => {
    const phone = '+1555000011'
    const pendingTxs = makePendingMap()
    const activeSendsSet = new Set<string>([phone])
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573009999999' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs, activeSendsSet)

    assert.isFalse(sendHandlerCalled)
    assert.isTrue(capturedMessages.some(m => m === formatConcurrentSendMessage('en')))
  })

  test('B-02: activeSendsSet empty → send executes normally; set empty after completion', async ({ assert }) => {
    const phone = '+1555000012'
    const pendingTxs = makePendingMap()
    const activeSendsSet = new Set<string>()
    let sendHandlerCalled = false
    const fakeMsg = async (..._args: any[]) => {}
    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573009999999' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs, activeSendsSet)

    assert.isTrue(sendHandlerCalled)
    assert.isFalse(activeSendsSet.has(phone))
  })

  test('B-03: sendHandler throws → activeSendsSet still cleared after (finally fires on throw)', async ({ assert }) => {
    const phone = '+1555000013'
    const pendingTxs = makePendingMap()
    const activeSendsSet = new Set<string>()
    const fakeMsg = async (..._args: any[]) => {}
    const throwingHandler = async (..._args: any[]) => { throw new Error('send failed') }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573009999999' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, throwingHandler as any, undefined, fakeMsg as any, pendingTxs, activeSendsSet)

    assert.isFalse(activeSendsSet.has(phone))
  })

  test('B-04: concurrent message — es', ({ assert }) => {
    const msg = formatConcurrentSendMessage('es')
    assert.include(msg.toLowerCase(), 'ya hay')
  })

  test('B-05: concurrent message — pt', ({ assert }) => {
    const msg = formatConcurrentSendMessage('pt')
    assert.include(msg.toLowerCase(), 'aguarde')
  })
})

// ── Group C — Confirm path concurrent protection ───────────────────────────

test.group('Group C | Confirm path concurrent protection', () => {
  test('C-01: confirm with pending + activeSendsSet pre-seeded → concurrent message sent; sendHandler NOT called; pending tx REMAINS', async ({ assert }) => {
    const phone = '+1555000021'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    const activeSendsSet = new Set<string>([phone])
    let sendHandlerCalled = false
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs, activeSendsSet)

    assert.isFalse(sendHandlerCalled)
    assert.isTrue(capturedMessages.some(m => m === formatConcurrentSendMessage('en')))
    assert.equal(pendingTxs.size, 1, 'pending tx should remain retryable')
  })

  test('C-02: confirm with pending + empty activeSendsSet → sendHandler called; set empty after; pending consumed', async ({ assert }) => {
    const phone = '+1555000022'
    const pending: PendingTransaction = {
      amount: 10,
      recipient: '+573001234567',
      timestamp: Date.now(),
      lang: 'en',
    }
    const pendingTxs = makePendingMap([[phone, pending]])
    const activeSendsSet = new Set<string>()
    let sendHandlerCalled = false
    const fakeMsg = async (..._args: any[]) => {}
    const fakeSend = async (..._args: any[]) => { sendHandlerCalled = true; return true }

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs, activeSendsSet)

    assert.isTrue(sendHandlerCalled)
    assert.isFalse(activeSendsSet.has(phone))
    assert.equal(pendingTxs.size, 0)
  })
})

// ── Group D — Interaction with existing pending tx behavior ───────────────

test.group('Group D | Self-send before threshold check', () => {
  test('D-01: send to self above threshold → self-send fires first; no pending stored', async ({ assert }) => {
    const phone = '+573001234031'
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []

    const fakeSend = async (..._args: any[]) => { return true }
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => { capturedMessages.push(msg) }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipient: phone }
    await routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, fakeSend as any, undefined, fakeMsg as any, pendingTxs)

    assert.equal(pendingTxs.size, 0)
    assert.isTrue(capturedMessages.some(m => m === formatSelfSendMessage('en')))
  })
})

// ── Group T — Safety valve timer ──────────────────────────────────────────

test.group('Group T | Safety valve timer', () => {
  test('T-01: safety valve clears activeSendsSet after timeout when processing hangs', async ({ assert }) => {
    const activeSendsSet = new Set<string>()
    const phone = '+1555000099'
    const pendingTxs = makePendingMap()
    let hangResolve!: () => void

    const hangingHandler = async (..._args: any[]) => {
      await new Promise<void>(r => { hangResolve = r })
    }
    const noopMsg = async (..._args: any[]) => {}

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573009999999' }

    // Fire without awaiting — sendHandler will hang
    routeCommand(phone, cmd, 'en', NO_OP_RATE_CTX, [], undefined, hangingHandler as any,
      undefined, noopMsg as any, pendingTxs, activeSendsSet, 50)

    // Let synchronous code run (phone is added to activeSendsSet before first await)
    await new Promise(r => setTimeout(r, 10))
    assert.isTrue(activeSendsSet.has(phone), 'phone should be in activeSendsSet while processing')

    // Wait for safety valve (50ms) + buffer
    await new Promise(r => setTimeout(r, 100))
    assert.isFalse(activeSendsSet.has(phone), 'safety valve should have cleared activeSendsSet')

    // Clean up the hanging handler to avoid dangling promise
    hangResolve()
  })
})
