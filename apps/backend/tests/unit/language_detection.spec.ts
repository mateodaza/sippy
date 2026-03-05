/**
 * Language Detection Tests
 *
 * Tests the detectLanguage utility which drives which language
 * Sippy responds in for every message.
 */

import { test } from '@japa/runner'
import { detectLanguage, PERSIST_THRESHOLD } from '#utils/language'

test.group('detectLanguage | Spanish', () => {
  test('detects "hola, quiero enviar dinero"', ({ assert }) => {
    const result = detectLanguage('hola, quiero enviar dinero')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'es')
    assert.isAtLeast(result!.confidence, PERSIST_THRESHOLD)
  })

  test('detects "buenos días, necesito ayuda"', ({ assert }) => {
    const result = detectLanguage('buenos días, necesito ayuda')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'es')
  })

  test('detects "cuánto tengo"', ({ assert }) => {
    const result = detectLanguage('cuánto tengo')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'es')
  })
})

test.group('detectLanguage | Portuguese', () => {
  test('detects "obrigado, quanto tenho"', ({ assert }) => {
    const result = detectLanguage('obrigado, quanto tenho')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'pt')
  })

  test('detects "bom dia, preciso de ajuda"', ({ assert }) => {
    const result = detectLanguage('bom dia, preciso de ajuda')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'pt')
  })

  test('detects "tudo bem, minha carteira"', ({ assert }) => {
    const result = detectLanguage('tudo bem, minha carteira')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'pt')
  })
})

test.group('detectLanguage | English', () => {
  test('detects "hello, how do I send money"', ({ assert }) => {
    const result = detectLanguage('hello, how do I send money')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'en')
  })

  test('detects "thank you, I want to check my wallet"', ({ assert }) => {
    const result = detectLanguage('thank you, I want to check my wallet')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'en')
  })

  test('detects "good morning, can I send to"', ({ assert }) => {
    const result = detectLanguage('good morning, can I send to')
    assert.isNotNull(result)
    assert.equal(result!.lang, 'en')
  })
})

test.group('detectLanguage | Ambiguous / null', () => {
  test('returns null for ambiguous single word "balance"', ({ assert }) => {
    const result = detectLanguage('balance')
    assert.isNull(result)
  })

  test('returns null for ambiguous single word "saldo"', ({ assert }) => {
    const result = detectLanguage('saldo')
    assert.isNull(result)
  })

  test('returns null for ambiguous "ok"', ({ assert }) => {
    const result = detectLanguage('ok')
    assert.isNull(result)
  })

  test('returns null for very short input', ({ assert }) => {
    const result = detectLanguage('a')
    assert.isNull(result)
  })

  test('returns null for purely numeric input', ({ assert }) => {
    const result = detectLanguage('12345')
    assert.isNull(result)
  })

  test('returns null for "start"', ({ assert }) => {
    const result = detectLanguage('start')
    assert.isNull(result)
  })

  test('returns null for "help"', ({ assert }) => {
    const result = detectLanguage('help')
    assert.isNull(result)
  })

  test('returns null for no signal text', ({ assert }) => {
    const result = detectLanguage('xyz abc def')
    assert.isNull(result)
  })
})
