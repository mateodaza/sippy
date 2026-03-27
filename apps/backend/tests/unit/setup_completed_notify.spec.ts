/**
 * Setup Completed Notification — State Machine Tests
 *
 * Tests maybeNotifySetupCompleted() to verify:
 * A — First-time setup sends exactly once
 * B — Revoke + re-enable does not resend
 * C — Write-then-send: setupNotifiedAt is persisted even if notification fails
 * D — No pref row → no notification (defensive)
 */

import { test } from '@japa/runner'
import {
  maybeNotifySetupCompleted,
  __setSetupNotifyDepsForTest,
  __resetSetupNotifyDeps,
} from '#controllers/embedded_wallet_controller'

const PHONE = '+573001234567'
const PREF_KEY = '+573001234567'

// ── Mock pref builder ────────────────────────────────────────────────────────

function makePref(fields: Record<string, unknown> = {}) {
  const pref: Record<string, unknown> = {
    setupNotifiedAt: null,
    saveCalls: 0,
    save: async () => {
      pref.saveCalls = (pref.saveCalls as number) + 1
    },
    ...fields,
  }
  return pref as { setupNotifiedAt: unknown; save: () => Promise<unknown>; saveCalls: number }
}

// ── Group A — First-time setup sends exactly once ────────────────────────────

test.group('Setup notify | first-time setup', (group) => {
  group.teardown(() => __resetSetupNotifyDeps())

  test('A-01: sends notification when setupNotifiedAt is null', async ({ assert }) => {
    const pref = makePref()
    const notified: Array<{ phone: string; lang: string }> = []

    const result = await maybeNotifySetupCompleted(PHONE, {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => 'es',
      notifySetupCompleted: async (opts) => {
        notified.push(opts)
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    })

    assert.isTrue(result)
    assert.equal(notified.length, 1)
    assert.equal(notified[0].phone, PHONE)
    assert.equal(notified[0].lang, 'es')
  })

  test('A-02: sets setupNotifiedAt before sending', async ({ assert }) => {
    let notifiedAtWhenSending: unknown = 'NOT_SET'
    const pref = makePref()

    await maybeNotifySetupCompleted(PHONE, {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => 'en',
      notifySetupCompleted: async () => {
        // Capture the state of setupNotifiedAt at the moment notification fires
        notifiedAtWhenSending = pref.setupNotifiedAt
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    })

    assert.notEqual(
      notifiedAtWhenSending,
      null,
      'setupNotifiedAt should be set before notification fires'
    )
    assert.equal(pref.saveCalls, 1, 'save() should be called exactly once')
  })

  test('A-03: second call returns false and does not re-send', async ({ assert }) => {
    const pref = makePref()
    let sendCount = 0

    const deps = {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => 'en' as string | null,
      notifySetupCompleted: async () => {
        sendCount++
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    }

    // First call — should send
    const first = await maybeNotifySetupCompleted(PHONE, deps)
    assert.isTrue(first)
    assert.equal(sendCount, 1)

    // Second call — setupNotifiedAt is now set, should not send
    const second = await maybeNotifySetupCompleted(PHONE, deps)
    assert.isFalse(second)
    assert.equal(sendCount, 1, 'notification should not fire twice')
  })

  test('A-04: falls back to phone-based language when getUserLanguage returns null', async ({
    assert,
  }) => {
    const pref = makePref()
    let usedLang: string | undefined

    // PHONE is +57 (Colombia) → getLanguageForPhone returns 'es'
    await maybeNotifySetupCompleted(PHONE, {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => null,
      notifySetupCompleted: async (opts) => {
        usedLang = opts.lang
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    })

    assert.equal(usedLang, 'es')
  })
})

// ── Group B — Revoke + re-enable does not resend ─────────────────────────────

test.group('Setup notify | revoke + re-enable', (group) => {
  group.teardown(() => __resetSetupNotifyDeps())

  test('B-01: does not send when setupNotifiedAt is already set (simulates post-revoke re-enable)', async ({
    assert,
  }) => {
    // Simulate: user was notified before, then revoked, then re-enabled.
    // setupNotifiedAt survives revoke because it's on user_preferences, not phone_registry.
    const pref = makePref({ setupNotifiedAt: new Date('2026-03-20') })
    let notifyCalled = false

    const result = await maybeNotifySetupCompleted(PHONE, {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => 'en',
      notifySetupCompleted: async () => {
        notifyCalled = true
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    })

    assert.isFalse(result)
    assert.isFalse(notifyCalled)
    assert.equal(pref.saveCalls, 0, 'save() should not be called')
  })
})

// ── Group C — Write-then-send: persistence survives notification failure ─────

test.group('Setup notify | notification failure', (group) => {
  group.teardown(() => __resetSetupNotifyDeps())

  test('C-01: setupNotifiedAt is persisted even when notification throws', async ({ assert }) => {
    const pref = makePref()

    await assert.rejects(
      () =>
        maybeNotifySetupCompleted(PHONE, {
          resolveUserPrefKey: async () => PREF_KEY,
          findPref: async () => pref,
          getUserLanguage: async () => 'en',
          notifySetupCompleted: async () => {
            throw new Error('WhatsApp API down')
          },
          now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
        }),
      'WhatsApp API down'
    )

    // setupNotifiedAt was set and saved BEFORE the notification attempt
    assert.isNotNull(pref.setupNotifiedAt)
    assert.equal(pref.saveCalls, 1)
  })

  test('C-02: subsequent call after failed notification does NOT retry', async ({ assert }) => {
    const pref = makePref()
    let sendCount = 0

    const deps = {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => pref,
      getUserLanguage: async () => 'en' as string | null,
      notifySetupCompleted: async () => {
        sendCount++
        if (sendCount === 1) throw new Error('API down')
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    }

    // First call — notification fails, but setupNotifiedAt is set
    try {
      await maybeNotifySetupCompleted(PHONE, deps)
    } catch {
      // expected
    }
    assert.equal(sendCount, 1)

    // Second call — should not retry because setupNotifiedAt is already set
    const result = await maybeNotifySetupCompleted(PHONE, deps)
    assert.isFalse(result)
    assert.equal(sendCount, 1, 'should not retry notification')
  })
})

// ── Group D — No pref row ────────────────────────────────────────────────────

test.group('Setup notify | no pref row', (group) => {
  group.teardown(() => __resetSetupNotifyDeps())

  test('D-01: returns false when findPref returns null', async ({ assert }) => {
    let notifyCalled = false

    const result = await maybeNotifySetupCompleted(PHONE, {
      resolveUserPrefKey: async () => PREF_KEY,
      findPref: async () => null,
      getUserLanguage: async () => 'en',
      notifySetupCompleted: async () => {
        notifyCalled = true
      },
      now: () => ({ toISO: () => '2026-03-24T00:00:00' }) as any,
    })

    assert.isFalse(result)
    assert.isFalse(notifyCalled)
  })
})
