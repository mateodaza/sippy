/**
 * Phone Number Validation Tests
 *
 * Ported from Express: tests/unit/phone-validation.test.ts
 */

import { test } from '@japa/runner'
import { parseMessage } from '#utils/message_parser'

test.group('Phone Validation | Format Validation', () => {
  const tests = [
    { input: 'send 10 to +573001234567', desc: 'Standard format (+57 10 digits)', shouldWork: true },
    { input: 'send 10 to +1234567890', desc: 'US format (+1 10 digits)', shouldWork: true },
    { input: 'send 10 to +573001234567890', desc: 'Valid long format', shouldWork: true },
    { input: 'send 10 to +123', desc: 'Too short (3 digits)', shouldWork: false },
    { input: 'send 10 to +12345', desc: 'Too short (5 digits)', shouldWork: false },
    { input: 'send 10 to phone', desc: 'Non-numeric', shouldWork: false },
  ]

  for (const t of tests) {
    test(t.desc, async ({ assert }) => {
      const result = await parseMessage(t.input)
      const worked = result.command === 'send' && !!result.recipient
      assert.equal(worked, t.shouldWork)
    })
  }
})

test.group('Phone Validation | Normalization', () => {
  test('With + prefix', async ({ assert }) => {
    const result = await parseMessage('send 10 to +573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })

  test('Without + prefix', async ({ assert }) => {
    const result = await parseMessage('send 10 to 573001234567')
    assert.equal(result.command, 'send')
    assert.isOk(result.recipient)
  })
})

test.group('Phone Validation | Bare Digits Handling (LLM Feature)', () => {
  test('10-digit bare number handles without crashing', async ({ assert }) => {
    const result = await parseMessage('send 10 to 3001234567')
    assert.isDefined(result)
  })

  test('With country code, no + handles without crashing', async ({ assert }) => {
    const result = await parseMessage('send 5 to 573001234567')
    assert.isDefined(result)
  })
})
