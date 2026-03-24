/**
 * PV-004 Privacy Command Tests
 *
 * Group 1: Message Parser — Privacy Regex
 * Group 2: routeCommand — Privacy Dispatch
 */

import { test } from '@japa/runner'
import { parseMessageWithRegex } from '#utils/message_parser'
import { routeCommand } from '#controllers/webhook_controller'
import type { RateContext } from '#controllers/webhook_controller'
import type { Lang } from '#utils/messages'
import type { ParsedCommand } from '#types/index'
import UserPreference from '#models/user_preference'

// ── Group 1: Message Parser — Privacy Regex ──────────────────────────────────

test.group('Message Parser | Privacy Regex', () => {
  test('TC-PV-004-U-R01: "privacy on" → command=privacy, action=on, lang=en', ({ assert }) => {
    const result = parseMessageWithRegex('privacy on')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'on')
    assert.equal(result.detectedLanguage, 'en')
  })

  test('TC-PV-004-U-R02: "privacy off" → command=privacy, action=off, lang=en', ({ assert }) => {
    const result = parseMessageWithRegex('privacy off')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'off')
    assert.equal(result.detectedLanguage, 'en')
  })

  test('TC-PV-004-U-R03: "PRIVACY ON" (uppercase) → command=privacy, action=on, lang=en', ({
    assert,
  }) => {
    const result = parseMessageWithRegex('PRIVACY ON')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'on')
    assert.equal(result.detectedLanguage, 'en')
  })

  test('TC-PV-004-U-R04: "privacidad on" → command=privacy, action=on, lang=es', ({ assert }) => {
    const result = parseMessageWithRegex('privacidad on')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'on')
    assert.equal(result.detectedLanguage, 'es')
  })

  test('TC-PV-004-U-R05: "privacidad off" → command=privacy, action=off, lang=es', ({ assert }) => {
    const result = parseMessageWithRegex('privacidad off')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'off')
    assert.equal(result.detectedLanguage, 'es')
  })

  test('TC-PV-004-U-R06: "privacidade on" → command=privacy, action=on, lang=pt', ({ assert }) => {
    const result = parseMessageWithRegex('privacidade on')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'on')
    assert.equal(result.detectedLanguage, 'pt')
  })

  test('TC-PV-004-U-R07: "privacidade off" → command=privacy, action=off, lang=pt', ({
    assert,
  }) => {
    const result = parseMessageWithRegex('privacidade off')
    assert.equal(result.command, 'privacy')
    assert.equal(result.privacyAction, 'off')
    assert.equal(result.detectedLanguage, 'pt')
  })

  test('TC-PV-004-U-R08: "privacy" (no action) → command=unknown', ({ assert }) => {
    const result = parseMessageWithRegex('privacy')
    assert.equal(result.command, 'unknown')
  })

  test('TC-PV-004-U-R09: "privacy maybe" (invalid action) → command=unknown', ({ assert }) => {
    const result = parseMessageWithRegex('privacy maybe')
    assert.equal(result.command, 'unknown')
  })

  test('TC-PV-004-U-R10: "privacy on" carries originalText', ({ assert }) => {
    const result = parseMessageWithRegex('privacy on')
    assert.equal(result.command, 'privacy')
    assert.equal(result.originalText, 'privacy on')
  })
})

// ── Group 2: routeCommand — Privacy Dispatch ─────────────────────────────────

const originalFindBy = UserPreference.findBy.bind(UserPreference)
const originalUpdateOrCreate = UserPreference.updateOrCreate.bind(UserPreference)

function restoreUserPreference() {
  ;(UserPreference as any).findBy = originalFindBy
  ;(UserPreference as any).updateOrCreate = originalUpdateOrCreate
}

const emptyRateCtx: RateContext = {
  senderRate: null,
  senderCurrency: null,
  recipientRate: null,
  recipientCurrency: null,
}

test.group('routeCommand | Privacy Dispatch', (group) => {
  group.each.teardown(() => {
    restoreUserPreference()
  })

  test('TC-PV-004-U-C01: privacy on, lang=en, no legacy row → phoneVisible=true, message contains "visible"', async ({
    assert,
  }) => {
    // Simulate post-SH-003: no bare-digit row
    ;(UserPreference as any).findBy = async () => null

    let updateOrCreateSearch: unknown
    let updateOrCreateData: unknown
    ;(UserPreference as any).updateOrCreate = async (search: unknown, data: unknown) => {
      updateOrCreateSearch = search
      updateOrCreateData = data
      return {}
    }

    let sentMessage = ''
    const fakeSend = async (_phone: string, msg: string) => {
      sentMessage = msg
    }

    const cmd: ParsedCommand = { command: 'privacy', privacyAction: 'on' }
    await routeCommand(
      '+573001234567',
      cmd,
      'en' as Lang,
      emptyRateCtx,
      [],
      undefined,
      undefined,
      undefined,
      fakeSend as any
    )

    assert.deepEqual(updateOrCreateSearch, { phoneNumber: '+573001234567' })
    assert.deepEqual(updateOrCreateData, { phoneVisible: true })
    assert.include(sentMessage, 'visible')
  })

  test('TC-PV-004-U-C02: privacy off, lang=en, no legacy row → phoneVisible=false, message contains "hidden"', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => null

    let updateOrCreateData: unknown
    ;(UserPreference as any).updateOrCreate = async (_search: unknown, data: unknown) => {
      updateOrCreateData = data
      return {}
    }

    let sentMessage = ''
    const fakeSend = async (_phone: string, msg: string) => {
      sentMessage = msg
    }

    const cmd: ParsedCommand = { command: 'privacy', privacyAction: 'off' }
    await routeCommand(
      '+573001234567',
      cmd,
      'en' as Lang,
      emptyRateCtx,
      [],
      undefined,
      undefined,
      undefined,
      fakeSend as any
    )

    assert.deepEqual(updateOrCreateData, { phoneVisible: false })
    assert.include(sentMessage, 'hidden')
  })

  test('TC-PV-004-U-C03: privacy on, lang=es → updateOrCreate called, ES message contains "visible"', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => null

    let updateOrCreateCalled = false
    ;(UserPreference as any).updateOrCreate = async () => {
      updateOrCreateCalled = true
      return {}
    }

    let sentMessage = ''
    const fakeSend = async (_phone: string, msg: string) => {
      sentMessage = msg
    }

    const cmd: ParsedCommand = { command: 'privacy', privacyAction: 'on' }
    await routeCommand(
      '+573001234567',
      cmd,
      'es' as Lang,
      emptyRateCtx,
      [],
      undefined,
      undefined,
      undefined,
      fakeSend as any
    )

    assert.isTrue(updateOrCreateCalled)
    assert.include(sentMessage, 'visible')
  })

  test('TC-PV-004-U-C04: privacy off, lang=pt → updateOrCreate called, PT message contains "oculto"', async ({
    assert,
  }) => {
    ;(UserPreference as any).findBy = async () => null

    let updateOrCreateCalled = false
    ;(UserPreference as any).updateOrCreate = async () => {
      updateOrCreateCalled = true
      return {}
    }

    let sentMessage = ''
    const fakeSend = async (_phone: string, msg: string) => {
      sentMessage = msg
    }

    const cmd: ParsedCommand = { command: 'privacy', privacyAction: 'off' }
    await routeCommand(
      '+573001234567',
      cmd,
      'pt' as Lang,
      emptyRateCtx,
      [],
      undefined,
      undefined,
      undefined,
      fakeSend as any
    )

    assert.isTrue(updateOrCreateCalled)
    assert.include(sentMessage, 'oculto')
  })

  test('TC-PV-004-U-C05: privacy on, legacy bare-digit row exists → updateOrCreate uses bare-digit key', async ({
    assert,
  }) => {
    // Simulate pre-SH-003: bare-digit row exists
    const legacyPref = { phoneNumber: '573001234567', phoneVisible: false }
    ;(UserPreference as any).findBy = async (_key: string, value: string) => {
      if (value === '573001234567') return legacyPref
      return null
    }

    let updateOrCreateSearch: unknown
    ;(UserPreference as any).updateOrCreate = async (search: unknown, _data: unknown) => {
      updateOrCreateSearch = search
      return {}
    }

    let sentMessage = ''
    const fakeSend = async (_phone: string, msg: string) => {
      sentMessage = msg
    }

    const cmd: ParsedCommand = { command: 'privacy', privacyAction: 'on' }
    await routeCommand(
      '+573001234567',
      cmd,
      'en' as Lang,
      emptyRateCtx,
      [],
      undefined,
      undefined,
      undefined,
      fakeSend as any
    )

    // Bare-digit key must be used (not the + canonical key)
    assert.deepEqual(updateOrCreateSearch, { phoneNumber: '573001234567' })
    assert.include(sentMessage, 'visible')
  })
})
