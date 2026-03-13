/**
 * verifySendAgreement Tests
 *
 * Tests the safety function that validates LLM-parsed send commands
 * against regex results before executing financial operations.
 */

process.env.DEFAULT_COUNTRY_CODE = '57'

import { test } from '@japa/runner'
import { verifySendAgreement } from '#utils/phone'
import type { ParsedCommand } from '#types/index'

function makeParsed(overrides: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    command: 'send',
    amount: 10,
    recipient: '+573001234567',
    originalText: 'enviar 10 a +573001234567',
    ...overrides,
  }
}

test.group('verifySendAgreement | Valid inputs', () => {
  test('accepts valid LLM result with matching regex', ({ assert }) => {
    const llm = makeParsed({ amount: 10, recipient: '+573001234567' })
    const regex = makeParsed({ amount: 10, recipient: '+573001234567' })
    const result = verifySendAgreement(llm, regex, 'enviar 10 a +573001234567')
    assert.isTrue(result.match)
  })

  test('accepts valid LLM result when regex did not parse as send', ({ assert }) => {
    const llm = makeParsed({ amount: 50, recipient: '+573001234567' })
    const regex = makeParsed({ command: 'unknown', amount: undefined })
    const result = verifySendAgreement(llm, regex, 'manda 50 a +573001234567')
    assert.isTrue(result.match)
  })

  test('accepts bare digit phone numbers (10+ digits)', ({ assert }) => {
    const llm = makeParsed({ recipient: '573001234567' })
    const regex = makeParsed({ command: 'unknown' })
    const result = verifySendAgreement(llm, regex, 'enviar 10 a 573001234567')
    assert.isTrue(result.match)
  })
})

test.group('verifySendAgreement | Invalid amount', () => {
  test('rejects null amount', ({ assert }) => {
    const llm = makeParsed({ amount: undefined })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar a +573001234567')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'invalid')
  })

  test('rejects zero amount', ({ assert }) => {
    const llm = makeParsed({ amount: 0 })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar 0 a +573001234567')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'invalid')
  })

  test('rejects negative amount', ({ assert }) => {
    const llm = makeParsed({ amount: -5 })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar -5 a +573001234567')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'invalid')
  })

  test('rejects absurdly large amount (>100000)', ({ assert }) => {
    const llm = makeParsed({ amount: 100001 })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar 100001 a +573001234567')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'amount')
  })
})

test.group('verifySendAgreement | Invalid recipient', () => {
  test('rejects null recipient', ({ assert }) => {
    const llm = makeParsed({ recipient: undefined })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar 10')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'recipient')
  })

  test('rejects too-short phone number', ({ assert }) => {
    const llm = makeParsed({ recipient: '12345' })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar 10 a 12345')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'recipient')
  })

  test('rejects non-numeric recipient', ({ assert }) => {
    const llm = makeParsed({ recipient: 'notanumber' })
    const regex = makeParsed()
    const result = verifySendAgreement(llm, regex, 'enviar 10 a notanumber')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'recipient')
  })
})

test.group('verifySendAgreement | Amount mismatch', () => {
  test('rejects when LLM and regex amounts disagree', ({ assert }) => {
    const llm = makeParsed({ amount: 10 })
    const regex = makeParsed({ amount: 20 })
    const result = verifySendAgreement(llm, regex, 'enviar 10 a +573001234567')
    assert.isFalse(result.match)
    assert.equal(result.mismatchReason, 'amount')
  })

  test('accepts small floating point differences (<0.01)', ({ assert }) => {
    const llm = makeParsed({ amount: 10.005 })
    const regex = makeParsed({ amount: 10.0 })
    const result = verifySendAgreement(llm, regex, 'enviar 10 a +573001234567')
    assert.isTrue(result.match)
  })
})
