/**
 * Dual Currency — Send Message Formatter Tests (DC-004)
 *
 * Verifies that formatSendProcessingMessage, formatSendSuccessMessage,
 * formatSendRecipientMessage, and formatInsufficientBalanceMessage each
 * accept optional localRate/localCurrency params and produce dual-currency
 * output via formatDualAmount.
 */

import { test } from '@japa/runner'
import {
  formatSendProcessingMessage,
  formatSendSuccessMessage,
  formatSendRecipientMessage,
  formatInsufficientBalanceMessage,
} from '#utils/messages'

// ── formatSendProcessingMessage ──────────────────────────────────────────────

test.group('formatSendProcessingMessage | no rate', () => {
  test('en: USD only', ({ assert }) => {
    const msg = formatSendProcessingMessage({ amount: 10, toPhone: '+573001234567' }, 'en')
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })

  test('es: USD only', ({ assert }) => {
    const msg = formatSendProcessingMessage({ amount: 5, toPhone: '+573001234567' }, 'es')
    assert.include(msg, '$5.00')
    assert.notInclude(msg, '~')
  })

  test('pt: USD only', ({ assert }) => {
    const msg = formatSendProcessingMessage({ amount: 20, toPhone: '+553001234567' }, 'pt')
    assert.include(msg, '$20.00')
    assert.notInclude(msg, '~')
  })
})

test.group('formatSendProcessingMessage | with rate', () => {
  test('en: shows dual amount', ({ assert }) => {
    const msg = formatSendProcessingMessage(
      { amount: 10, toPhone: '+573001234567', localRate: 4000, localCurrency: 'COP' },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.include(msg, '~40,000 COP')
  })

  test('es: shows dual amount', ({ assert }) => {
    const msg = formatSendProcessingMessage(
      { amount: 5, toPhone: '+573001234567', localRate: 4000, localCurrency: 'COP' },
      'es'
    )
    assert.include(msg, '$5.00')
    assert.include(msg, '~20,000 COP')
  })

  test('pt: shows dual amount', ({ assert }) => {
    const msg = formatSendProcessingMessage(
      { amount: 10, toPhone: '+553001234567', localRate: 5, localCurrency: 'BRL' },
      'pt'
    )
    assert.include(msg, '$10.00')
    assert.include(msg, '~50 BRL')
  })
})

// ── formatSendSuccessMessage ─────────────────────────────────────────────────

test.group('formatSendSuccessMessage | no rate', () => {
  test('en: USD only', ({ assert }) => {
    const msg = formatSendSuccessMessage(
      { amount: 10, toPhone: '+573001234567', txHash: '0xabc123' },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })
})

test.group('formatSendSuccessMessage | with rate', () => {
  test('en: shows dual amount', ({ assert }) => {
    const msg = formatSendSuccessMessage(
      {
        amount: 10,
        toPhone: '+573001234567',
        txHash: '0xabc123',
        localRate: 4000,
        localCurrency: 'COP',
      },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.include(msg, '~40,000 COP')
  })

  test('es: shows dual amount', ({ assert }) => {
    const msg = formatSendSuccessMessage(
      {
        amount: 5,
        toPhone: '+573001234567',
        txHash: '0xabc123',
        localRate: 4000,
        localCurrency: 'COP',
      },
      'es'
    )
    assert.include(msg, '$5.00')
    assert.include(msg, '~20,000 COP')
  })

  test('gasCovered flag unaffected by rate', ({ assert }) => {
    const withoutRate = formatSendSuccessMessage(
      { amount: 10, toPhone: '+573001234567', txHash: '0xabc123', gasCovered: false },
      'en'
    )
    const withRate = formatSendSuccessMessage(
      {
        amount: 10,
        toPhone: '+573001234567',
        txHash: '0xabc123',
        gasCovered: false,
        localRate: 4000,
        localCurrency: 'COP',
      },
      'en'
    )
    // gasCovered=false means no gas line in either case
    assert.notInclude(withoutRate, 'Gas')
    assert.notInclude(withRate, 'Gas')
  })
})

// ── formatSendRecipientMessage ───────────────────────────────────────────────

test.group('formatSendRecipientMessage | no rate', () => {
  test('en: USD only', ({ assert }) => {
    const msg = formatSendRecipientMessage(
      { amount: 10, fromPhone: '+13105551234', txHash: '0xabc123' },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })
})

test.group('formatSendRecipientMessage | with rate (recipient currency)', () => {
  test('en: shows BRL dual amount for recipient', ({ assert }) => {
    const msg = formatSendRecipientMessage(
      {
        amount: 10,
        fromPhone: '+13105551234',
        txHash: '0xabc123',
        localRate: 5,
        localCurrency: 'BRL',
      },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.include(msg, '~50 BRL')
  })

  test('pt: shows BRL dual amount for recipient', ({ assert }) => {
    const msg = formatSendRecipientMessage(
      {
        amount: 20,
        fromPhone: '+13105551234',
        txHash: '0xabc123',
        localRate: 5,
        localCurrency: 'BRL',
      },
      'pt'
    )
    assert.include(msg, '$20.00')
    assert.include(msg, '~100 BRL')
  })
})

// ── formatInsufficientBalanceMessage ────────────────────────────────────────

test.group('formatInsufficientBalanceMessage | no rate', () => {
  test('en: USD only for both balance and needed', ({ assert }) => {
    const msg = formatInsufficientBalanceMessage({ balance: 3, needed: 10 }, 'en')
    assert.include(msg, '$3.00')
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })
})

test.group('formatInsufficientBalanceMessage | with rate', () => {
  test('en: both balance and needed show dual', ({ assert }) => {
    const msg = formatInsufficientBalanceMessage(
      { balance: 3, needed: 10, localRate: 4000, localCurrency: 'COP' },
      'en'
    )
    assert.include(msg, '$3.00')
    assert.include(msg, '~12,000 COP')
    assert.include(msg, '$10.00')
    assert.include(msg, '~40,000 COP')
  })

  test('es: both balance and needed show dual', ({ assert }) => {
    const msg = formatInsufficientBalanceMessage(
      { balance: 3, needed: 10, localRate: 4000, localCurrency: 'COP' },
      'es'
    )
    assert.include(msg, '$3.00')
    assert.include(msg, '~12,000 COP')
    assert.include(msg, '$10.00')
    assert.include(msg, '~40,000 COP')
  })
})

// ── Backward compatibility ───────────────────────────────────────────────────

test.group('Backward compatibility | no new params', () => {
  test('formatSendProcessingMessage without new params returns USD-only string', ({ assert }) => {
    const msg = formatSendProcessingMessage({ amount: 10, toPhone: '+573001234567' }, 'en')
    assert.equal(msg, 'Sending $10.00 to ***4567...\n\nUsually instant, may take up to 30 seconds.')
  })

  test('formatSendSuccessMessage without new params contains USD-only amount', ({ assert }) => {
    const msg = formatSendSuccessMessage(
      { amount: 10, toPhone: '+573001234567', txHash: '0xabcdef1234' },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })

  test('formatSendRecipientMessage without new params contains USD-only amount', ({ assert }) => {
    const msg = formatSendRecipientMessage(
      { amount: 10, fromPhone: '+13105551234', txHash: '0xabcdef1234' },
      'en'
    )
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })

  test('formatInsufficientBalanceMessage without new params contains USD-only amounts', ({
    assert,
  }) => {
    const msg = formatInsufficientBalanceMessage({ balance: 3, needed: 10 }, 'en')
    assert.include(msg, '$3.00')
    assert.include(msg, '$10.00')
    assert.notInclude(msg, '~')
  })
})
