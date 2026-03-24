/**
 * TX-004 Amount Sanity Checks + Input Hardening Tests
 *
 * Groups:
 * A  — parseAndValidateAmount core cases
 * B  — Comma normalization
 * C  — isLarge flag
 * D  — Send parsing with amount errors (via parseMessageWithRegex)
 * E  — Large amount warning in confirmation (via routeCommand)
 * F  — Phone validation in send (via routeCommand)
 * G  — Trilingual error messages
 */

import { test } from '@japa/runner'
import { parseAndValidateAmount, parseMessageWithRegex } from '#utils/message_parser'
import {
  formatAmountError,
  formatInvalidPhoneNumberMessage,
  formatConfirmationPromptWithWarning,
  formatInvalidSendFormat,
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

function makePendingMap(
  entries: [string, PendingTransaction][] = []
): Map<string, PendingTransaction> {
  return new Map(entries)
}

// ── Group A — parseAndValidateAmount core cases ────────────────────────────

test.group('Group A | parseAndValidateAmount core cases', () => {
  test('A-01: "10.50" → value=10.50, no error', ({ assert }) => {
    const r = parseAndValidateAmount('10.50')
    assert.equal(r.value, 10.5)
    assert.isNull(r.errorCode)
  })

  test('A-02: "500" → value=500, no error', ({ assert }) => {
    const r = parseAndValidateAmount('500')
    assert.equal(r.value, 500)
    assert.isNull(r.errorCode)
  })

  test('A-03: "0.99" → value=0.99, no error', ({ assert }) => {
    const r = parseAndValidateAmount('0.99')
    assert.equal(r.value, 0.99)
    assert.isNull(r.errorCode)
  })

  test('A-04: "10000" → value=10000, no error (boundary — exactly at limit)', ({ assert }) => {
    const r = parseAndValidateAmount('10000')
    assert.equal(r.value, 10000)
    assert.isNull(r.errorCode)
  })

  test('A-05: "0" → ZERO', ({ assert }) => {
    const r = parseAndValidateAmount('0')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'ZERO')
  })

  test('A-06: "0.00" → ZERO', ({ assert }) => {
    const r = parseAndValidateAmount('0.00')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'ZERO')
  })

  test('A-07: "10.123" → AMBIGUOUS_SEPARATOR (exactly 3 decimal digits)', ({ assert }) => {
    const r = parseAndValidateAmount('10.123')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'AMBIGUOUS_SEPARATOR')
  })

  test('A-08: "10.1234" → TOO_MANY_DECIMALS (4 decimal digits)', ({ assert }) => {
    const r = parseAndValidateAmount('10.1234')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_MANY_DECIMALS')
  })

  test('A-09: "10001" → TOO_LARGE', ({ assert }) => {
    const r = parseAndValidateAmount('10001')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_LARGE')
  })

  test('A-10: "10000.01" → TOO_LARGE', ({ assert }) => {
    const r = parseAndValidateAmount('10000.01')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_LARGE')
  })

  test('A-11: "1.000" → AMBIGUOUS_SEPARATOR', ({ assert }) => {
    const r = parseAndValidateAmount('1.000')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'AMBIGUOUS_SEPARATOR')
  })

  test('A-12: "2.500" → AMBIGUOUS_SEPARATOR', ({ assert }) => {
    const r = parseAndValidateAmount('2.500')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'AMBIGUOUS_SEPARATOR')
  })

  test('A-15: "0.05" → TOO_SMALL (below 0.1 minimum)', ({ assert }) => {
    const r = parseAndValidateAmount('0.05')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_SMALL')
  })

  test('A-16: "0.09" → TOO_SMALL (just below 0.1)', ({ assert }) => {
    const r = parseAndValidateAmount('0.09')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_SMALL')
  })

  test('A-17: "0.01" → TOO_SMALL', ({ assert }) => {
    const r = parseAndValidateAmount('0.01')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'TOO_SMALL')
  })

  test('A-18: "0.10" → value=0.10, no error (exactly at minimum)', ({ assert }) => {
    const r = parseAndValidateAmount('0.10')
    assert.equal(r.value, 0.1)
    assert.isNull(r.errorCode)
  })

  test('A-13: "abc" → INVALID_FORMAT', ({ assert }) => {
    const r = parseAndValidateAmount('abc')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'INVALID_FORMAT')
  })

  test('A-14: "1.2.3" → INVALID_FORMAT (multiple dots)', ({ assert }) => {
    const r = parseAndValidateAmount('1.2.3')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'INVALID_FORMAT')
  })
})

// ── Group B — Comma normalization ──────────────────────────────────────────

test.group('Group B | Comma normalization', () => {
  test('B-01: "10,50" → value=10.50 (LATAM decimal comma)', ({ assert }) => {
    const r = parseAndValidateAmount('10,50')
    assert.equal(r.value, 10.5)
    assert.isNull(r.errorCode)
  })

  test('B-02: "10,5" → value=10.5', ({ assert }) => {
    const r = parseAndValidateAmount('10,5')
    assert.equal(r.value, 10.5)
    assert.isNull(r.errorCode)
  })

  test('B-03: "0,99" → value=0.99', ({ assert }) => {
    const r = parseAndValidateAmount('0,99')
    assert.equal(r.value, 0.99)
    assert.isNull(r.errorCode)
  })

  test('B-04: "1,000" → AMBIGUOUS_SEPARATOR (comma→dot → "1.000")', ({ assert }) => {
    const r = parseAndValidateAmount('1,000')
    assert.isNull(r.value)
    assert.equal(r.errorCode, 'AMBIGUOUS_SEPARATOR')
  })
})

// ── Group C — isLarge flag ─────────────────────────────────────────────────

test.group('Group C | isLarge flag', () => {
  test('C-01: "500" → isLarge=false (boundary — exactly 500, not large)', ({ assert }) => {
    const r = parseAndValidateAmount('500')
    assert.isFalse(r.isLarge)
  })

  test('C-02: "500.01" → isLarge=true', ({ assert }) => {
    const r = parseAndValidateAmount('500.01')
    assert.isTrue(r.isLarge)
  })

  test('C-03: "999" → isLarge=true', ({ assert }) => {
    const r = parseAndValidateAmount('999')
    assert.isTrue(r.isLarge)
  })

  test('C-04: "10000" → isLarge=true (10000 > 500 and valid)', ({ assert }) => {
    const r = parseAndValidateAmount('10000')
    assert.isTrue(r.isLarge)
  })
})

// ── Group D — Send parsing with amount errors ──────────────────────────────

test.group('Group D | Send parsing with amount errors (parseMessageWithRegex)', () => {
  test('D-01: "send 10,50 to +573001234567" → command=send, amount=10.50, no errors', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 10,50 to +573001234567')
    assert.equal(r.command, 'send')
    assert.isUndefined(r.amountError)
    assert.isUndefined(r.recipientError)
    assert.equal(r.amount, 10.5)
  })

  test('D-02: "send 1.000 to +573001234567" → command=send, amountError=AMBIGUOUS_SEPARATOR', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 1.000 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amountError, 'AMBIGUOUS_SEPARATOR')
    assert.isUndefined(r.recipientError)
    assert.isUndefined(r.amount)
  })

  test('D-03: "send 0 to +573001234567" → command=send, amountError=ZERO', ({ assert }) => {
    const r = parseMessageWithRegex('send 0 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amountError, 'ZERO')
    assert.isUndefined(r.amount)
  })

  test('D-04: "send 10.1234 to +573001234567" → command=send, amountError=TOO_MANY_DECIMALS', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 10.1234 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amountError, 'TOO_MANY_DECIMALS')
    assert.isUndefined(r.amount)
  })

  test('D-05: "send 99999 to +573001234567" → command=send, amountError=TOO_LARGE', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 99999 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amountError, 'TOO_LARGE')
    assert.isUndefined(r.amount)
  })

  test('D-09: "send 0.05 to +573001234567" → command=send, amountError=TOO_SMALL', ({ assert }) => {
    const r = parseMessageWithRegex('send 0.05 to +573001234567')
    assert.equal(r.command, 'send')
    assert.equal(r.amountError, 'TOO_SMALL')
    assert.isUndefined(r.amount)
  })

  test('D-06: "send 10 to 0" → command=send, recipientError=INVALID_PHONE, amount=10', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 10 to 0')
    assert.equal(r.command, 'send')
    assert.isUndefined(r.amountError)
    assert.equal(r.recipientError, 'INVALID_PHONE')
    assert.equal(r.amount, 10)
  })

  test('D-07: "send 10 to 123" → command=send, recipientError=INVALID_PHONE, amount=10', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 10 to 123')
    assert.equal(r.command, 'send')
    assert.equal(r.recipientError, 'INVALID_PHONE')
    assert.equal(r.amount, 10)
  })

  test('D-08: "send 10 to 12345678901234567" → command=send, recipientError=INVALID_PHONE, amount=10', ({
    assert,
  }) => {
    const r = parseMessageWithRegex('send 10 to 12345678901234567')
    assert.equal(r.command, 'send')
    assert.equal(r.recipientError, 'INVALID_PHONE')
    assert.equal(r.amount, 10)
  })
})

// ── Group E — Large amount warning in confirmation ─────────────────────────

test.group('Group E | Large amount warning in confirmation (routeCommand)', () => {
  test('E-01: amount=600, valid recipient → confirmation prompt includes large transfer warning (en)', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 600,
      recipient: '+573001234567',
      isLargeAmount: true,
    }
    await routeCommand(
      '+1555000201',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m.includes('This is a large transfer.')))
  })

  test('E-02: amount=300, valid recipient → confirmation prompt does NOT include warning (en)', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 300,
      recipient: '+573001234567',
      isLargeAmount: false,
    }
    await routeCommand(
      '+1555000202',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isFalse(capturedMessages.some((m) => m.includes('large transfer')))
  })

  test('E-03: amount=600, es → confirmation prompt includes ES warning line', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 600,
      recipient: '+573001234567',
      isLargeAmount: true,
    }
    await routeCommand(
      '+573009990203',
      cmd,
      'es',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m.includes('Esta es una transferencia grande.')))
  })

  test('E-04: amount=600, pt → confirmation prompt includes PT warning line', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = {
      command: 'send',
      amount: 600,
      recipient: '+5511987654321',
      isLargeAmount: true,
    }
    await routeCommand(
      '+5511900000204',
      cmd,
      'pt',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m.includes('Esta e uma transferencia grande.')))
  })
})

// ── Group F — Phone validation in send ────────────────────────────────────

test.group('Group F | Phone validation in send (routeCommand)', () => {
  const invalidPhoneMsg = formatInvalidPhoneNumberMessage('en')
  const invalidFormatMsg = formatInvalidSendFormat('en')

  test('F-01: "send 10 to 0" → routeCommand sends formatInvalidPhoneNumberMessage, NOT formatInvalidSendFormat', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipientError: 'INVALID_PHONE' }
    await routeCommand(
      '+1555000301',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m === invalidPhoneMsg))
    assert.isFalse(capturedMessages.some((m) => m === invalidFormatMsg))
  })

  test('F-02: short phone "123" → sends invalid phone message', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipientError: 'INVALID_PHONE' }
    await routeCommand(
      '+1555000302',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m === invalidPhoneMsg))
  })

  test('F-03: too-long phone "12345678901234567" → sends invalid phone message', async ({
    assert,
  }) => {
    const pendingTxs = makePendingMap()
    const capturedMessages: string[] = []
    const fakeMsg = async (_p: string, msg: string, _lang: Lang) => {
      capturedMessages.push(msg)
    }
    const fakeSend = async (..._args: any[]) => {
      return true
    }

    const cmd: ParsedCommand = { command: 'send', amount: 10, recipientError: 'INVALID_PHONE' }
    await routeCommand(
      '+1555000303',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(capturedMessages.some((m) => m === invalidPhoneMsg))
  })

  test('F-04: valid recipient "+573001234567" → proceeds (no phone error)', async ({ assert }) => {
    const pendingTxs = makePendingMap()
    let sendHandlerCalled = false
    const fakeMsg = async (..._args: any[]) => {}
    const fakeSend = async (..._args: any[]) => {
      sendHandlerCalled = true
      return true
    }

    const cmd: ParsedCommand = { command: 'send', amount: 3, recipient: '+573001234567' }
    await routeCommand(
      '+1555000304',
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      undefined,
      fakeMsg as any,
      pendingTxs
    )

    assert.isTrue(sendHandlerCalled)
  })
})

// ── Group G — Trilingual error messages ────────────────────────────────────

test.group('Group G | Trilingual error messages', () => {
  test('G-01: formatAmountError TOO_LARGE en → contains "10,000"', ({ assert }) => {
    const msg = formatAmountError('TOO_LARGE', 'en')
    assert.include(msg, '10,000')
  })

  test('G-02: formatAmountError TOO_LARGE es → Spanish string', ({ assert }) => {
    const msg = formatAmountError('TOO_LARGE', 'es')
    assert.include(msg, '10,000')
    assert.include(msg.toLowerCase(), 'monto')
  })

  test('G-03: formatAmountError TOO_LARGE pt → Portuguese string', ({ assert }) => {
    const msg = formatAmountError('TOO_LARGE', 'pt')
    assert.include(msg, '10,000')
    assert.include(msg.toLowerCase(), 'valor')
  })

  test('G-04: formatAmountError AMBIGUOUS_SEPARATOR en → contains example without separators', ({
    assert,
  }) => {
    const msg = formatAmountError('AMBIGUOUS_SEPARATOR', 'en')
    assert.include(msg, '1000')
    assert.include(msg, '10.50')
  })

  test('G-05: formatAmountError ZERO es → Spanish zero-amount message', ({ assert }) => {
    const msg = formatAmountError('ZERO', 'es')
    assert.include(msg.toLowerCase(), 'mayor')
    assert.include(msg.toLowerCase(), 'cero')
  })

  test('G-09: formatAmountError TOO_SMALL en → contains "0.10"', ({ assert }) => {
    const msg = formatAmountError('TOO_SMALL', 'en')
    assert.include(msg, '0.10')
  })

  test('G-10: formatAmountError TOO_SMALL es → Spanish minimum message', ({ assert }) => {
    const msg = formatAmountError('TOO_SMALL', 'es')
    assert.include(msg, '0.10')
    assert.include(msg.toLowerCase(), 'mínimo')
  })

  test('G-11: formatAmountError TOO_SMALL pt → Portuguese minimum message', ({ assert }) => {
    const msg = formatAmountError('TOO_SMALL', 'pt')
    assert.include(msg, '0.10')
    assert.include(msg.toLowerCase(), 'mínimo')
  })

  test('G-06: formatInvalidPhoneNumberMessage pt → Portuguese phone message', ({ assert }) => {
    const msg = formatInvalidPhoneNumberMessage('pt')
    assert.include(msg.toLowerCase(), 'telefone')
  })

  test('G-07: formatConfirmationPromptWithWarning isLargeAmount=false → same as base prompt', ({
    assert,
  }) => {
    const base = formatConfirmationPromptWithWarning(10, '+573001234567', false, 'en')
    assert.isFalse(base.includes('large transfer'))
    assert.include(base, '***')
  })

  test('G-08: formatConfirmationPromptWithWarning isLargeAmount=true → appends warning', ({
    assert,
  }) => {
    const msg = formatConfirmationPromptWithWarning(600, '+573001234567', true, 'en')
    assert.include(msg, 'This is a large transfer.')
  })
})
