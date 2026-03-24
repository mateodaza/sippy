/**
 * Invite Service Unit Tests
 *
 * Tests createInvite() and checkAndNotifySender() by injecting mock
 * DB query and notification functions via __setDepsForTest.
 */

import { test } from '@japa/runner'
import {
  createInvite,
  checkAndNotifySender,
  retryPendingNotifications,
  __setDepsForTest,
  __resetDeps,
} from '#services/invite.service'
import {
  formatInviteSentToSender,
  formatInviteDeliveryFailed,
  formatInviteAlreadyPending,
  formatInviteDailyLimitReached,
} from '#utils/messages'

const SENDER = '+15550000001'
const SENDER_B = '+15550000002'
const RECIPIENT = '+15559999001'

// ── Mock helpers ──────────────────────────────────────────────────────────────

type QueryCall = { text: string; params: any[] }

function buildMockQuery(responses: Array<{ rows: any[]; rowCount?: number }>) {
  const calls: QueryCall[] = []
  let callIndex = 0

  const mockQuery = async (_text: string, _params?: any[]) => {
    calls.push({ text: _text, params: _params ?? [] })
    const response = responses[callIndex] ?? { rows: [], rowCount: 0 }
    callIndex++
    return { rows: response.rows, rowCount: response.rowCount ?? response.rows.length }
  }

  return { mockQuery: mockQuery as any, calls }
}

// ── Group A — createInvite: success with delivery ─────────────────────────────

test.group('InviteService | createInvite — success path', (group) => {
  group.teardown(() => __resetDeps())

  test('returns success:true, delivered:true when insert succeeds and notification delivers', async ({
    assert,
  }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [] }, // expire stale
      { rows: [{ count: '0' }] }, // count < 3
      { rows: [{ id: 42 }] }, // insert returned a row
    ])

    __setDepsForTest({
      query: mockQuery,
      notifyInviteRecipient: async () => true,
    })

    const result = await createInvite(SENDER, RECIPIENT, 10, 'en')
    assert.deepEqual(result, { success: true, delivered: true })
    assert.equal(calls.length, 3)
    assert.include(calls[0].text, 'expired')
    assert.include(calls[1].text, 'COUNT')
    assert.include(calls[2].text, 'INSERT')
  })

  test('returns success:true, delivered:false when notification fails', async ({ assert }) => {
    const { mockQuery } = buildMockQuery([
      { rows: [] },
      { rows: [{ count: '1' }] },
      { rows: [{ id: 43 }] },
    ])

    __setDepsForTest({
      query: mockQuery,
      notifyInviteRecipient: async () => false,
    })

    const result = await createInvite(SENDER, RECIPIENT, 10, 'es')
    assert.deepEqual(result, { success: true, delivered: false })
  })
})

// ── Group B — createInvite: daily limit ───────────────────────────────────────

test.group('InviteService | createInvite — daily limit', (group) => {
  group.teardown(() => __resetDeps())

  test('returns dailyLimitReached when count >= 10', async ({ assert }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [] }, // expire stale
      { rows: [{ count: '10' }] }, // count = 10 (matches service cap)
    ])

    __setDepsForTest({ query: mockQuery })

    const result = await createInvite(SENDER, RECIPIENT, 10, 'en')
    assert.deepEqual(result, { dailyLimitReached: true })
    // Should NOT attempt insert
    assert.equal(calls.length, 2)
  })

  test('count of 9 does not trigger limit', async ({ assert }) => {
    const { mockQuery } = buildMockQuery([
      { rows: [] },
      { rows: [{ count: '9' }] },
      { rows: [{ id: 50 }] },
    ])

    __setDepsForTest({
      query: mockQuery,
      notifyInviteRecipient: async () => true,
    })

    const result = await createInvite(SENDER, RECIPIENT, 10, 'en')
    assert.isTrue(result.success)
  })
})

// ── Group C — createInvite: deduplication ─────────────────────────────────────

test.group('InviteService | createInvite — deduplication', (group) => {
  group.teardown(() => __resetDeps())

  test('returns alreadyInvited when INSERT returns 0 rows (conflict)', async ({ assert }) => {
    const { mockQuery } = buildMockQuery([
      { rows: [] }, // expire stale
      { rows: [{ count: '0' }] }, // count ok
      { rows: [] }, // insert conflict — 0 rows returned
    ])

    let notifyCalled = false
    __setDepsForTest({
      query: mockQuery,
      notifyInviteRecipient: async () => {
        notifyCalled = true
        return true
      },
    })

    const result = await createInvite(SENDER, RECIPIENT, 10, 'en')
    assert.deepEqual(result, { alreadyInvited: true })
    // Notification should NOT be called when dedup triggers
    assert.isFalse(notifyCalled)
  })
})

// ── Group D — createInvite: error propagation ─────────────────────────────────

test.group('InviteService | createInvite — error propagation', (group) => {
  group.teardown(() => __resetDeps())

  test('throws when query fails (does not swallow DB errors)', async ({ assert }) => {
    const mockQuery = async () => {
      throw new Error('connection refused')
    }
    __setDepsForTest({ query: mockQuery as any })

    await assert.rejects(() => createInvite(SENDER, RECIPIENT, 10, 'en'), 'connection refused')
  })

  test('throws when insert query fails', async ({ assert }) => {
    let callIndex = 0
    const mockQuery = async () => {
      callIndex++
      if (callIndex <= 2) return { rows: [{ count: '0' }], rowCount: 1 }
      throw new Error('unique violation')
    }
    __setDepsForTest({ query: mockQuery as any })

    await assert.rejects(() => createInvite(SENDER, RECIPIENT, 10, 'en'), 'unique violation')
  })
})

// ── Group E — createInvite: expiry cleanup runs first ─────────────────────────

test.group('InviteService | createInvite — expiry cleanup', (group) => {
  group.teardown(() => __resetDeps())

  test('expire query runs before count and insert', async ({ assert }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [] },
      { rows: [{ count: '0' }] },
      { rows: [{ id: 1 }] },
    ])

    __setDepsForTest({
      query: mockQuery,
      notifyInviteRecipient: async () => true,
    })

    await createInvite(SENDER, RECIPIENT, 10, 'en')

    // First call must be the expire UPDATE
    assert.include(calls[0].text, 'expired')
    assert.equal(calls[0].params[0], SENDER)
    // Second call is the COUNT
    assert.include(calls[1].text, 'COUNT')
    // Third is INSERT
    assert.include(calls[2].text, 'INSERT')
  })
})

// ── Group F — checkAndNotifySender: success path ──────────────────────────────

test.group('InviteService | checkAndNotifySender — success', (group) => {
  group.teardown(() => __resetDeps())

  test('atomically claims rows via UPDATE SET notifying, then marks completed', async ({
    assert,
  }) => {
    const { mockQuery, calls } = buildMockQuery([
      // Atomic claim: UPDATE ... SET status = 'notifying' ... RETURNING
      {
        rows: [
          { id: 10, sender_phone: SENDER },
          { id: 11, sender_phone: SENDER_B },
        ],
      },
      // UPDATE #1 completed (for SENDER)
      { rows: [] },
      // UPDATE #2 completed (for SENDER_B)
      { rows: [] },
    ])

    const notifiedSenders: string[] = []
    const languagesLookedUp: string[] = []

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async (phone: string) => {
        languagesLookedUp.push(phone)
        return phone === SENDER ? 'es' : 'pt'
      },
      notifyInviteCompleted: async (opts: any) => {
        notifiedSenders.push(opts.senderPhone)
      },
    })

    await checkAndNotifySender(RECIPIENT)

    // Both senders notified
    assert.deepEqual(notifiedSenders, [SENDER, SENDER_B])
    // Language looked up for each sender
    assert.deepEqual(languagesLookedUp, [SENDER, SENDER_B])
    // Claim UPDATE + 2 completion UPDATEs
    assert.equal(calls.length, 3)
    assert.include(calls[0].text, 'notifying')
    assert.include(calls[1].text, 'completed')
    assert.include(calls[2].text, 'completed')
  })

  test('uses "en" as default when getUserLanguage returns null', async ({ assert }) => {
    const { mockQuery } = buildMockQuery([
      { rows: [{ id: 10, sender_phone: SENDER }] },
      { rows: [] },
    ])

    let usedLang: string | undefined

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async () => null as any,
      notifyInviteCompleted: async (opts: any) => {
        usedLang = opts.lang
      },
    })

    await checkAndNotifySender(RECIPIENT)
    assert.equal(usedLang, 'en')
  })
})

// ── Group G — checkAndNotifySender: notification failure ──────────────────────

test.group('InviteService | checkAndNotifySender — notification failure', (group) => {
  group.teardown(() => __resetDeps())

  test('reverts to pending when notification throws (no completed UPDATE)', async ({ assert }) => {
    const { mockQuery, calls } = buildMockQuery([
      // Claim UPDATE returns 1 row
      { rows: [{ id: 10, sender_phone: SENDER }] },
      // Revert UPDATE (status back to pending)
      { rows: [] },
    ])

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async () => {
        throw new Error('WhatsApp API down')
      },
    })

    // Should not throw (best-effort)
    await checkAndNotifySender(RECIPIENT)

    // Claim UPDATE + revert UPDATE (no completed UPDATE)
    assert.equal(calls.length, 2)
    assert.include(calls[0].text, 'notifying')
    assert.include(calls[1].text, 'pending')
  })

  test('continues to next sender when one notification fails', async ({ assert }) => {
    let callIndex = 0
    const calls: QueryCall[] = []

    const mockQuery = async (text: string, params?: any[]) => {
      calls.push({ text, params: params ?? [] })
      callIndex++
      if (callIndex === 1) {
        // Claim UPDATE returns 2 invites
        return {
          rows: [
            { id: 10, sender_phone: SENDER },
            { id: 11, sender_phone: SENDER_B },
          ],
          rowCount: 2,
        }
      }
      return { rows: [], rowCount: 0 }
    }

    const notifiedSenders: string[] = []
    let notifyCallCount = 0

    __setDepsForTest({
      query: mockQuery as any,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async (opts: any) => {
        notifyCallCount++
        if (notifyCallCount === 1) throw new Error('fail first')
        notifiedSenders.push(opts.senderPhone)
      },
    })

    await checkAndNotifySender(RECIPIENT)

    // Second sender was still notified and marked completed
    assert.deepEqual(notifiedSenders, [SENDER_B])
    // Claim + revert for first sender + completed UPDATE for second sender
    assert.equal(calls.length, 3)
    assert.include(calls[0].text, 'notifying') // claim
    assert.include(calls[1].text, 'pending') // revert first
    assert.include(calls[2].text, 'completed') // complete second
  })
})

// ── Group H — checkAndNotifySender: no pending invites ────────────────────────

test.group('InviteService | checkAndNotifySender — no invites', (group) => {
  group.teardown(() => __resetDeps())

  test('does nothing when no pending invites exist', async ({ assert }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [] }, // Claim UPDATE returns nothing
    ])

    let notifyCalled = false

    __setDepsForTest({
      query: mockQuery,
      notifyInviteCompleted: async () => {
        notifyCalled = true
      },
    })

    await checkAndNotifySender(RECIPIENT)

    assert.equal(calls.length, 1)
    assert.include(calls[0].text, 'notifying')
    assert.isFalse(notifyCalled)
  })
})

// ── Group I — checkAndNotifySender: DB error is swallowed ─────────────────────

test.group('InviteService | checkAndNotifySender — DB error', (group) => {
  group.teardown(() => __resetDeps())

  test('does not throw when claim query fails (best-effort)', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => {
        throw new Error('DB down')
      }) as any,
    })

    // Should not throw
    await checkAndNotifySender(RECIPIENT)
    assert.isTrue(true) // reached here = no throw
  })
})

// ── Group K — checkAndNotifySender: atomic claim prevents duplicates ──────────

test.group('InviteService | checkAndNotifySender — atomic claim', (group) => {
  group.teardown(() => __resetDeps())

  test('claim query uses UPDATE SET notifying with claimed_at and stale reclaim', async ({
    assert,
  }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [{ id: 10, sender_phone: SENDER }] },
      { rows: [] },
    ])

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async () => {},
    })

    await checkAndNotifySender(RECIPIENT)

    // First query must be an UPDATE that sets status to 'notifying' and claimed_at
    assert.include(calls[0].text, 'UPDATE')
    assert.include(calls[0].text, 'notifying')
    assert.include(calls[0].text, 'claimed_at')
    assert.include(calls[0].text, "status = 'pending'")
    assert.include(calls[0].text, 'RETURNING')
    // Must have 4 params: recipientPhone, now, now (claimed_at), now - timeout
    assert.equal(calls[0].params.length, 4)
    assert.equal(calls[0].params[0], RECIPIENT)
  })

  test('claim query also reclaims stale notifying rows (crashed process recovery)', async ({
    assert,
  }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [{ id: 10, sender_phone: SENDER }] },
      { rows: [] },
    ])

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async () => {},
    })

    await checkAndNotifySender(RECIPIENT)

    // Claim WHERE clause includes both pending AND stale notifying
    assert.include(calls[0].text, "status = 'pending'")
    assert.include(calls[0].text, "status = 'notifying' AND claimed_at")
  })

  test('concurrent caller gets 0 rows because first caller already claimed them', async ({
    assert,
  }) => {
    // Simulates what happens when two concurrent registerWallet() calls both
    // trigger checkAndNotifySender(). The atomic UPDATE ensures the second caller
    // gets 0 rows because the first already flipped status to 'notifying'.
    const { mockQuery: mockQuery2, calls: calls2 } = buildMockQuery([
      { rows: [] }, // Second caller: claim returns nothing (already claimed)
    ])

    let notifyCalled = false

    __setDepsForTest({
      query: mockQuery2,
      notifyInviteCompleted: async () => {
        notifyCalled = true
      },
    })

    await checkAndNotifySender(RECIPIENT)

    assert.equal(calls2.length, 1)
    assert.isFalse(notifyCalled) // No notification sent by second caller
  })

  test('revert on notification failure clears claimed_at and restores pending', async ({
    assert,
  }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [{ id: 10, sender_phone: SENDER }] }, // claim
      { rows: [] }, // revert
    ])

    __setDepsForTest({
      query: mockQuery,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async () => {
        throw new Error('template not approved')
      },
    })

    await checkAndNotifySender(RECIPIENT)

    // Revert query sets status back to 'pending', clears claimed_at, guards on 'notifying'
    assert.equal(calls.length, 2)
    assert.include(calls[1].text, "status = 'pending'")
    assert.include(calls[1].text, 'claimed_at = NULL')
    assert.include(calls[1].text, "status = 'notifying'")
    assert.deepEqual(calls[1].params, [10])
  })
})

// ── Group L — retryPendingNotifications ───────────────────────────────────────

test.group('InviteService | retryPendingNotifications', (group) => {
  group.teardown(() => __resetDeps())

  test('queries for pending invites with registered recipients and retries each', async ({
    assert,
  }) => {
    let callIndex = 0
    const calls: QueryCall[] = []

    const mockQuery = async (text: string, params?: any[]) => {
      calls.push({ text, params: params ?? [] })
      callIndex++
      if (callIndex === 1) {
        // retryPendingNotifications: SELECT DISTINCT recipient_phone JOIN phone_registry
        return { rows: [{ recipient_phone: RECIPIENT }], rowCount: 1 }
      }
      if (callIndex === 2) {
        // checkAndNotifySender claim for RECIPIENT
        return { rows: [{ id: 10, sender_phone: SENDER }], rowCount: 1 }
      }
      // checkAndNotifySender completed UPDATE
      return { rows: [], rowCount: 0 }
    }

    __setDepsForTest({
      query: mockQuery as any,
      getUserLanguage: async () => 'en',
      notifyInviteCompleted: async () => {},
    })

    await retryPendingNotifications()

    // 1st: SELECT DISTINCT ... JOIN phone_registry with bare-digit fallback
    assert.include(calls[0].text, 'phone_registry')
    assert.include(calls[0].text, 'pending_invites')
    assert.include(calls[0].text, 'LTRIM') // bare-digit compatibility
    // 2nd: checkAndNotifySender claim UPDATE for RECIPIENT
    assert.include(calls[1].text, 'notifying')
    // 3rd: completed UPDATE
    assert.include(calls[2].text, 'completed')
  })

  test('does nothing when no pending invites have registered recipients', async ({ assert }) => {
    const { mockQuery, calls } = buildMockQuery([
      { rows: [] }, // No matches
    ])

    let notifyCalled = false

    __setDepsForTest({
      query: mockQuery,
      notifyInviteCompleted: async () => {
        notifyCalled = true
      },
    })

    await retryPendingNotifications()

    assert.equal(calls.length, 1)
    assert.isFalse(notifyCalled)
  })

  test('does not throw on DB error (best-effort)', async ({ assert }) => {
    __setDepsForTest({
      query: (async () => {
        throw new Error('DB down')
      }) as any,
    })

    await retryPendingNotifications()
    assert.isTrue(true)
  })
})

// ── Group J — message formatters (real imports) ───────────────────────────────

test.group('InviteService | message formatters', () => {
  test('formatInviteSentToSender includes phone and Sippy (trilingual)', ({ assert }) => {
    for (const lang of ['en', 'es', 'pt'] as const) {
      const msg = formatInviteSentToSender(RECIPIENT, lang)
      assert.include(msg, RECIPIENT)
      assert.include(msg, 'Sippy')
    }
  })

  test('formatInviteDeliveryFailed includes phone', ({ assert }) => {
    const msg = formatInviteDeliveryFailed(RECIPIENT, 'en')
    assert.include(msg, RECIPIENT)
  })

  test('formatInviteAlreadyPending includes phone', ({ assert }) => {
    const msg = formatInviteAlreadyPending(RECIPIENT, 'en')
    assert.include(msg, RECIPIENT)
  })

  test('formatInviteDailyLimitReached includes "limit" (trilingual)', ({ assert }) => {
    assert.include(formatInviteDailyLimitReached('en'), 'limit')
    assert.include(formatInviteDailyLimitReached('es'), 'limite')
    assert.include(formatInviteDailyLimitReached('pt'), 'limite')
  })
})
