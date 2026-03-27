/**
 * Address Book — controller-level regression tests
 *
 * Tests exercised through routeCommand's injectable interface,
 * same pattern as tx_confirmation.spec.ts Groups C/D/E.
 *
 * Groups:
 * A — Confirm priority: pendingContactOverwrite vs pendingTransaction
 * B — save_contact / delete_contact / list_contacts routing
 * C — Cancel clears all pending state
 * D — handleContactCard DB error propagation (validates processWebhook try-catch)
 * E — resolveAlias DB error propagation (validates resolvePartialSend try-catch)
 */

import { test } from '@japa/runner'
import { routeCommand, pendingContactOverwrites } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { PendingTransaction, ParsedCommand } from '#types/index'
import type { Lang } from '#utils/messages'
import { handleContactCard } from '#commands/contact_command'
import { resolveAlias } from '#services/contact.service'

// ── Helpers ────────────────────────────────────────────────────────────────

const PHONE_A = '+1555000001'
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

function makeMessageCapture(): {
  messages: string[]
  fn: (phone: string, msg: string, lang: Lang) => Promise<void>
} {
  const messages: string[] = []
  return {
    messages,
    fn: async (_phone: string, msg: string, _lang: Lang) => {
      messages.push(msg)
    },
  }
}

const fakeSend = async (..._args: any[]) => true
const fakeGenerate = async () => null

// ── Group A — Confirm priority ──────────────────────────────────────────────

test.group('A | Confirm priority: overwrite vs transaction', () => {
  test('A-01: both pending → money transfer wins, overwrite discarded', async ({ assert }) => {
    // Set up both pending states
    const pendingTxs = makePendingMap([
      [PHONE_A, { amount: 50, recipient: '+573001234567', timestamp: Date.now(), lang: 'en' }],
    ])
    pendingContactOverwrites.set(PHONE_A, {
      alias: 'mom',
      newPhone: '+573009999999',
      timestamp: Date.now(),
    })

    let sendHandlerCalled = false
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      async (..._args: any[]) => {
        sendHandlerCalled = true
        return true
      },
      fakeGenerate as any,
      capture.fn as any,
      pendingTxs
    )

    // Money transfer should execute
    assert.isTrue(sendHandlerCalled, 'sendHandler should be called for the money transfer')
    // Pending tx should be consumed
    assert.equal(pendingTxs.size, 0, 'pending tx should be consumed')
    // Overwrite should be discarded
    assert.isFalse(pendingContactOverwrites.has(PHONE_A), 'overwrite should be cleared')
  })

  test('A-02: only overwrite pending → overwrite executes (not money transfer)', async ({
    assert,
  }) => {
    // Only set up contact overwrite (no pending tx)
    // Since updateContact hits DB and will fail in test env, we verify the
    // message output indicates an attempt was made (error message from the catch)
    const pendingTxs = makePendingMap()
    pendingContactOverwrites.set(PHONE_A, {
      alias: 'mom',
      newPhone: '+573009999999',
      timestamp: Date.now(),
    })

    let sendHandlerCalled = false
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      async (..._args: any[]) => {
        sendHandlerCalled = true
        return true
      },
      fakeGenerate as any,
      capture.fn as any,
      pendingTxs
    )

    // Money transfer should NOT execute
    assert.isFalse(sendHandlerCalled, 'sendHandler should NOT be called')
    // Overwrite should be cleared (consumed)
    assert.isFalse(pendingContactOverwrites.has(PHONE_A))
    // Should have sent a message (either success or error from DB)
    assert.isTrue(capture.messages.length > 0, 'should send a response')
  })

  test('A-03: expired overwrite + valid tx → tx executes normally', async ({ assert }) => {
    const pendingTxs = makePendingMap([
      [PHONE_A, { amount: 10, recipient: '+573001234567', timestamp: Date.now(), lang: 'en' }],
    ])
    // Expired overwrite (timestamp far in the past)
    pendingContactOverwrites.set(PHONE_A, {
      alias: 'mom',
      newPhone: '+573009999999',
      timestamp: Date.now() - 120_000, // 2 minutes ago, well past 60s TTL
    })

    let sendHandlerCalled = false

    const cmd: ParsedCommand = { command: 'confirm' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      async (..._args: any[]) => {
        sendHandlerCalled = true
        return true
      },
      fakeGenerate as any,
      (async () => {}) as any,
      pendingTxs
    )

    assert.isTrue(sendHandlerCalled, 'sendHandler should execute for valid tx')
    assert.isFalse(pendingContactOverwrites.has(PHONE_A), 'expired overwrite should be cleaned up')
  })
})

// ── Group B — Contact command routing ───────────────────────────────────────

test.group('B | Contact command routing', () => {
  test('B-01: save_contact routes to handler and sends response', async ({ assert }) => {
    // save_contact will fail at DB but should still send an error message
    const pendingTxs = makePendingMap()
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = {
      command: 'save_contact',
      alias: 'mom',
      phone: '+573001234567',
    }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      fakeGenerate as any,
      capture.fn as any,
      pendingTxs
    )

    // Should send exactly one message (save result or error)
    assert.isTrue(capture.messages.length > 0, 'should send a response message')
  })

  test('B-02: save_contact with missing alias sends response (not crash)', async ({ assert }) => {
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'save_contact' } // no alias or phone
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      fakeGenerate as any,
      capture.fn as any
    )

    // Should get invalid_alias message (sanitizeAlias('') → null → invalid_alias)
    assert.isTrue(capture.messages.length > 0)
    assert.isTrue(
      capture.messages.some((m) => m.includes('Invalid') || m.includes('inv\u00e1lid')),
      'should return an invalid alias/phone message'
    )
  })

  test('B-03: delete_contact routes and sends response', async ({ assert }) => {
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'delete_contact', alias: 'mom' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      fakeGenerate as any,
      capture.fn as any
    )

    // DB will fail → deleteContact returns false → "Contact not found" (which is acceptable)
    // Or it could throw → outer catch → formatCommandErrorMessage
    assert.isTrue(capture.messages.length > 0)
  })

  test('B-04: list_contacts routes and sends response', async ({ assert }) => {
    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'list_contacts' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      fakeGenerate as any,
      capture.fn as any
    )

    // DB will fail → listContacts throws → outer catch → error message
    // OR if DB happens to be up → empty list → "No saved contacts yet."
    assert.isTrue(capture.messages.length > 0)
  })
})

// ── Group C — Cancel clears all pending state ───────────────────────────────

test.group('C | Cancel clears all pending state', () => {
  test('C-01: cancel clears pendingTx, pendingOverwrite, and partialSend', async ({ assert }) => {
    const pendingTxs = makePendingMap([
      [PHONE_A, { amount: 10, recipient: '+573001234567', timestamp: Date.now(), lang: 'en' }],
    ])
    pendingContactOverwrites.set(PHONE_A, {
      alias: 'mom',
      newPhone: '+573009999999',
      timestamp: Date.now(),
    })

    const capture = makeMessageCapture()

    const cmd: ParsedCommand = { command: 'cancel' }
    await routeCommand(
      PHONE_A,
      cmd,
      'en',
      NO_OP_RATE_CTX,
      [],
      undefined,
      fakeSend as any,
      fakeGenerate as any,
      capture.fn as any,
      pendingTxs
    )

    assert.equal(pendingTxs.size, 0, 'pending tx should be cleared')
    assert.isFalse(pendingContactOverwrites.has(PHONE_A), 'overwrite should be cleared')
    assert.isTrue(capture.messages.length > 0, 'should send cancellation message')
  })
})

// ── Group D — handleContactCard throws on DB error ──────────────────────────
// This validates that the try-catch in processWebhook (I4 fix) is necessary:
// handleContactCard propagates DB errors, so without the catch the user gets
// no response and Meta retries forever.

test.group('D | handleContactCard propagates DB errors', () => {
  test('D-01: handleContactCard throws when DB is down (not swallowed)', async ({ assert }) => {
    // Call handleContactCard with a valid vCard — it will try to saveContact,
    // which calls query(), which throws ECONNREFUSED in test env.
    // The point: handleContactCard does NOT catch DB errors internally,
    // so the processWebhook try-catch (I4 fix) is the safety net.
    const contacts = [
      {
        name: { formatted_name: 'Test User' },
        phones: [{ phone: '+573001234567' }],
      },
    ]

    let threw = false
    try {
      await handleContactCard(PHONE_A, contacts, 'en')
    } catch {
      threw = true
    }
    assert.isTrue(threw, 'handleContactCard should propagate DB errors (not swallow them)')
  })

  test('D-02: handleContactCard with empty contacts returns vcard_no_valid (no throw)', async ({
    assert,
  }) => {
    // No DB call needed — all contacts lack name/phone, so loop body is skipped
    const contacts = [{ name: undefined, phones: undefined }]
    const result = await handleContactCard(PHONE_A, contacts as any, 'en')
    // Should return the "no valid" message, not throw
    assert.isString(result)
    assert.isTrue(result.length > 0)
  })
})

// ── Group E — resolveAlias throws on DB error ───────────────────────────────
// This validates that the try-catch around resolvePartialSend (I5 fix) is
// necessary: resolveAlias propagates DB errors, so without the catch the
// partial-send follow-up path would crash with no user response.

test.group('E | resolveAlias propagates DB errors', () => {
  test('E-01: resolveAlias throws when DB is down (not swallowed)', async ({ assert }) => {
    // resolveAlias calls query() which throws ECONNREFUSED.
    // This proves the try-catch in processWebhook around resolvePartialSend
    // (I5 fix) is necessary — without it, a DB error during alias resolution
    // in the partial-send path would crash with no user response.
    let threw = false
    try {
      await resolveAlias(PHONE_A, 'mom')
    } catch {
      threw = true
    }
    assert.isTrue(threw, 'resolveAlias should propagate DB errors (not swallow them)')
  })

  test('E-02: resolveAlias with invalid alias returns null (no DB call)', async ({ assert }) => {
    // sanitizeAlias('!!!') → null → resolveAlias returns null immediately
    const result = await resolveAlias(PHONE_A, '!!!')
    assert.isNull(result)
  })
})
