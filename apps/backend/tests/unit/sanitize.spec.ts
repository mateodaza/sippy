/**
 * Outbound Message Sanitizer Tests
 *
 * Tests the sanitizeOutboundMessage function which is the last safety net
 * before any message reaches users via WhatsApp.
 */

import { test } from '@japa/runner'
import { sanitizeOutboundMessage } from '#utils/sanitize'

test.group('sanitizeOutboundMessage | Empty/whitespace', () => {
  test('returns safe fallback for empty string', ({ assert }) => {
    const result = sanitizeOutboundMessage('', 'en')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'empty-message')
    assert.include(result.text, 'Something went wrong')
  })

  test('returns safe fallback for whitespace-only', ({ assert }) => {
    const result = sanitizeOutboundMessage('   \n\t  ', 'en')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'empty-message')
  })

  test('returns Spanish fallback when lang is es', ({ assert }) => {
    const result = sanitizeOutboundMessage('', 'es')
    assert.isTrue(result.blocked)
    assert.include(result.text, 'Algo salio mal')
  })

  test('returns Portuguese fallback when lang is pt', ({ assert }) => {
    const result = sanitizeOutboundMessage('', 'pt')
    assert.isTrue(result.blocked)
    assert.include(result.text, 'Algo deu errado')
  })
})

test.group('sanitizeOutboundMessage | Blocking patterns', () => {
  test('blocks raw JSON', ({ assert }) => {
    const result = sanitizeOutboundMessage('{"command": "balance", "amount": 0}')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'raw-json')
  })

  test('blocks stack traces', ({ assert }) => {
    const result = sanitizeOutboundMessage('Error: TypeError at processWebhook (server.ts:42)')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'stack-trace')
  })

  test('blocks forbidden term: blockchain', ({ assert }) => {
    const result = sanitizeOutboundMessage('Your blockchain wallet is ready')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'forbidden-terms')
  })

  test('blocks forbidden term: private key', ({ assert }) => {
    const result = sanitizeOutboundMessage('Never share your private key with anyone')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'forbidden-terms')
  })

  test('blocks forbidden term: seed phrase', ({ assert }) => {
    const result = sanitizeOutboundMessage('Write down your seed phrase')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'forbidden-terms')
  })

  test('blocks forbidden term: cryptocurrency', ({ assert }) => {
    const result = sanitizeOutboundMessage('Send cryptocurrency to your friend')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'forbidden-terms')
  })

  test('blocks forbidden term: web3', ({ assert }) => {
    const result = sanitizeOutboundMessage('Welcome to web3!')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'forbidden-terms')
  })
})

test.group('sanitizeOutboundMessage | Off-scope claims', () => {
  test('blocks ES: pagar facturas', ({ assert }) => {
    const result = sanitizeOutboundMessage('Puedes pagar facturas o realizar compras en línea.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks ES: tarjeta de crédito', ({ assert }) => {
    const result = sanitizeOutboundMessage('Puedes usar tu tarjeta de crédito para pagar.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks ES: préstamos', ({ assert }) => {
    const result = sanitizeOutboundMessage('Ofrecemos préstamos personales.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks ES: ahorros', ({ assert }) => {
    const result = sanitizeOutboundMessage('Puedes abrir una cuenta de ahorros.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks ES: inversiones', ({ assert }) => {
    const result = sanitizeOutboundMessage('Haz inversiones desde tu celular.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks PT: pagar contas', ({ assert }) => {
    const result = sanitizeOutboundMessage('Voce pode pagar contas pelo app.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks PT: cartão de crédito', ({ assert }) => {
    const result = sanitizeOutboundMessage('Use seu cartão de crédito.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks PT: empréstimo', ({ assert }) => {
    const result = sanitizeOutboundMessage('Solicite um empréstimo agora.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks PT: poupança', ({ assert }) => {
    const result = sanitizeOutboundMessage('Abra sua poupança digital.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks PT: investimentos', ({ assert }) => {
    const result = sanitizeOutboundMessage('Faça investimentos com facilidade.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks EN: credit card', ({ assert }) => {
    const result = sanitizeOutboundMessage('Pay with your credit card.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks EN: savings account', ({ assert }) => {
    const result = sanitizeOutboundMessage('Open a savings account today.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('blocks EN: online shopping', ({ assert }) => {
    const result = sanitizeOutboundMessage('Go online shopping with Sippy.')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'off-scope-claim')
  })

  test('does not block legitimate Sippy messages', ({ assert }) => {
    const legitimate = [
      'Tu saldo es $50.00',
      'Transferencia completada.',
      'I can check your balance or send money — just tell me.',
      'Enviamos un convite para +573001234567.',
    ]
    for (const msg of legitimate) {
      const result = sanitizeOutboundMessage(msg)
      assert.isFalse(result.blocked, `Should not block: "${msg}"`)
    }
  })
})

test.group('sanitizeOutboundMessage | Cleaning', () => {
  test('strips thinking tags', ({ assert }) => {
    const result = sanitizeOutboundMessage('<think>internal reasoning</think>Hello user')
    assert.isFalse(result.blocked)
    assert.equal(result.text, 'Hello user')
    assert.include(result.violations, 'thinking-tags')
  })

  test('strips markdown headers', ({ assert }) => {
    const result = sanitizeOutboundMessage('## Your Balance\nYou have $10')
    assert.isFalse(result.blocked)
    assert.equal(result.text, 'Your Balance\nYou have $10')
  })

  test('converts markdown bold to WhatsApp bold', ({ assert }) => {
    const result = sanitizeOutboundMessage('Your **balance** is ready')
    assert.isFalse(result.blocked)
    assert.equal(result.text, 'Your *balance* is ready')
  })

  test('replaces untrusted URLs with [link removed]', ({ assert }) => {
    const result = sanitizeOutboundMessage('Visit https://evil.com for more info')
    assert.isFalse(result.blocked)
    assert.include(result.text, '[link removed]')
    assert.include(result.violations, 'untrusted-url')
  })

  test('preserves trusted arbiscan.io URLs', ({ assert }) => {
    const result = sanitizeOutboundMessage('View tx: https://arbiscan.io/tx/0xabc123')
    assert.isFalse(result.blocked)
    assert.include(result.text, 'https://arbiscan.io/tx/0xabc123')
  })

  test('preserves trusted sippy.lat URLs', ({ assert }) => {
    const result = sanitizeOutboundMessage('Set up at https://sippy.lat/setup')
    assert.isFalse(result.blocked)
    assert.include(result.text, 'https://sippy.lat/setup')
  })

  test('truncates messages exceeding 4096 chars', ({ assert }) => {
    const longMessage = 'A'.repeat(5000)
    const result = sanitizeOutboundMessage(longMessage)
    assert.isTrue(result.text.length <= 4096)
    assert.isTrue(result.text.endsWith('...'))
    assert.include(result.violations, 'truncated')
  })

  test('blocks content that becomes empty after cleaning', ({ assert }) => {
    // Only emojis - should be stripped, leaving empty
    const result = sanitizeOutboundMessage('\u{1F600}\u{1F601}')
    assert.isTrue(result.blocked)
    assert.include(result.violations, 'empty-after-clean')
  })
})

test.group('sanitizeOutboundMessage | Pass-through', () => {
  test('passes clean text through unmodified', ({ assert }) => {
    const text = 'Your balance is $42.50 USDC'
    const result = sanitizeOutboundMessage(text)
    assert.isFalse(result.blocked)
    assert.isFalse(result.modified)
    assert.equal(result.text, text)
    assert.lengthOf(result.violations, 0)
  })
})
