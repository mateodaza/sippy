/**
 * Pre-SMART Short-Circuit Tests
 *
 * Pins the deterministic safety rails that run AHEAD of SMART MODE in
 * processWebhook. Two rules:
 *
 *   1. PENDING CONFIRM/CANCEL — when a pending tx or contact-overwrite is
 *      waiting on a yes/no, strict regex routes the standard tokens to the
 *      confirm/cancel handlers. SMART's vocabulary excludes confirm/cancel
 *      (smart_mode/types.ts:80-87), so without this guard "si" classifies
 *      as `social`, trips clearPendingIfUnrelated, and the pending tx is
 *      silently dropped.
 *
 *   2. HIGH-CONFIDENCE LOOSE PATTERNS — "mi address", "cuál es mi
 *      billetera", "dashboard", … live in matchHighConfidencePreLlm inside
 *      parseMessage. SMART pre-empts parseMessage, so without lifting these
 *      ahead of SMART the classifier routes them to pay_qr (the May 2026
 *      bug Mateo saw: "Y mi address?" returned a pay link instead of the
 *      wallet address).
 */

import { test } from '@japa/runner'
import {
  tryPreSmartShortCircuit,
  clearPendingIfUnrelated,
  pendingTransactions,
  pendingContactOverwrites,
  partialSends,
  pendingInvites,
} from '#controllers/webhook_controller'
import { matchHighConfidencePreLlm, parseMessageWithRegex } from '#utils/message_parser'
import { formatBalanceMessage } from '#utils/messages'
import type { PendingTransaction, ParsedCommand } from '#types/index'

// ── Group A — Pending confirm/cancel guard ──────────────────────────────

test.group('Pre-SMART | confirm/cancel when pending', (group) => {
  group.each.setup(() => {
    pendingTransactions.clear()
    pendingContactOverwrites.clear()
  })

  const confirmInputs = ['Si', 'sí', 'SI', 'yes', 'YES', 'sim', 'confirmar', 'dale', 'va']
  for (const input of confirmInputs) {
    test(`pending + "${input}" → confirm`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, true)
      assert.isNotNull(result)
      assert.equal(result!.command, 'confirm')
    })
  }

  const cancelInputs = ['no', 'NO', 'cancel', 'cancelar', 'nao', 'não']
  for (const input of cancelInputs) {
    test(`pending + "${input}" → cancel`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, true)
      assert.isNotNull(result)
      assert.equal(result!.command, 'cancel')
    })
  }
})

// ── Group B — No pending state: confirm/cancel words pass through ──────

test.group('Pre-SMART | no pending → confirm/cancel pass through', () => {
  // Without pending state, bare "Si" must NOT short-circuit. It needs to
  // reach SMART / parseMessage so social classifications stay intact and
  // a stray "ok" doesn't fabricate a transfer that never existed.
  const acks = ['Si', 'sí', 'yes', 'dale', 'no', 'cancel']
  for (const input of acks) {
    test(`no pending + "${input}" → null (defer to SMART)`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, false)
      assert.isNull(result)
    })
  }
})

// ── Group C — HIGH_CONFIDENCE_PRE_LLM lifted ahead of SMART ─────────────

test.group('Pre-SMART | high-confidence loose patterns', () => {
  const balanceInputs = [
    'mi address',
    'Y mi address?',
    'cual es mi address',
    'cuál es mi address',
    'mi dirección',
    'mi direccion',
    'cual es mi billetera',
    'Cuál es mi billetera?',
    'mi billetera',
    'mi wallet',
    'cuál es mi wallet',
    'wallet address',
    'my address',
    'dirección de mi billetera',
  ]
  for (const input of balanceInputs) {
    test(`"${input}" → balance with addressQuery=true`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, false)
      assert.isNotNull(result, `${input} must short-circuit`)
      assert.equal(result!.command, 'balance', `${input} must route to balance, not pay_qr`)
      assert.isTrue(
        result!.addressQuery,
        `${input} must set addressQuery so balance reply shows full public address`
      )
    })
  }

  const dashboardInputs = ['dashboard', 'mi cuenta', 'panel', 'meu painel', 'home']
  for (const input of dashboardInputs) {
    test(`"${input}" → dashboard`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, false)
      assert.isNotNull(result)
      assert.equal(result!.command, 'dashboard')
    })
  }
})

// ── Group C2 — Strict regex address-query subset of balance ─────────────
// "mi billetera" / "mi wallet" / etc. match the strict balance regex
// (anchored exact, no question mark), but the address-y subset must set
// addressQuery=true. "saldo" / "balance" must NOT — those want the number.

test.group('parseMessageWithRegex | addressQuery flag on balance', () => {
  const addressQueryInputs = [
    'mi billetera',
    'mi wallet',
    'mi cartera',
    'cuál es mi billetera',
    'cual es mi wallet',
    'my wallet',
    'minha carteira',
  ]
  for (const input of addressQueryInputs) {
    test(`"${input}" → balance + addressQuery=true`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'balance')
      assert.isTrue(
        result.addressQuery,
        `${input} names the wallet/address — reply must show full address`
      )
    })
  }

  const balanceNumberInputs = ['balance', 'saldo', 'cuanto tengo', 'mi saldo', 'meu saldo']
  for (const input of balanceNumberInputs) {
    test(`"${input}" → balance + addressQuery=falsy`, ({ assert }) => {
      const result = parseMessageWithRegex(input)
      assert.equal(result.command, 'balance')
      assert.notEqual(
        result.addressQuery,
        true,
        `${input} asks for the number — address should stay masked`
      )
    })
  }
})

// ── Group C3 — formatBalanceMessage honors addressQuery ─────────────────
//
// User incident on 2026-05-21: "Sabes cual es mi address?" routed
// correctly to balance, but the reply showed `0x80d6...948A` (masked).
// The full public address must appear when the user asked for it.

test.group('formatBalanceMessage | full address on addressQuery', () => {
  const fullAddress = '0x80d6f5a17a39bc4567890abcdef1234567890948A'

  test('addressQuery=true → reply contains FULL address', ({ assert }) => {
    const msg = formatBalanceMessage(
      { balance: 89.91, wallet: fullAddress, addressQuery: true },
      'es'
    )
    assert.include(msg, fullAddress, 'full public address must appear in reply')
    assert.notInclude(msg, '0x80d6...948A', 'masked form must not appear when addressQuery is set')
  })

  test('addressQuery=false → reply contains MASKED address (default)', ({ assert }) => {
    const msg = formatBalanceMessage(
      { balance: 89.91, wallet: fullAddress, addressQuery: false },
      'es'
    )
    assert.notInclude(msg, fullAddress, 'full address must not bloat the balance reply')
    assert.include(msg, '0x80d6...948A', 'masked form for balance-number queries')
  })

  test('addressQuery omitted → reply contains MASKED address (legacy default)', ({ assert }) => {
    const msg = formatBalanceMessage({ balance: 89.91, wallet: fullAddress }, 'es')
    assert.include(msg, '0x80d6...948A')
  })
})

// ── Group D — Unrelated text falls through ──────────────────────────────

test.group('Pre-SMART | unrelated text returns null', () => {
  const fallthroughInputs = [
    'hola',
    'gracias',
    'envia 5 a +573001234567',
    'quiero recargar',
    'random gibberish xyz',
  ]
  for (const input of fallthroughInputs) {
    test(`"${input}" + no pending → null`, ({ assert }) => {
      const result = tryPreSmartShortCircuit(input, false)
      assert.isNull(result)
    })
  }
})

// ── Group E — Extended balance regex pins "billetera" / "wallet" ────────
// Direct assertion against matchHighConfidencePreLlm so the regex change
// has its own pin separate from the short-circuit wiring.

// ── Group F — SMART reply branch must clear stale pending tx ────────────
//
// Audit gap: when SMART returns kind='reply' with pending.kind='send'/'invite',
// it seeds a NEW partialSends / pendingInvites entry. Without clearing the
// existing pendingTransactions / pendingContactOverwrites first, a later
// "Si" reply (which now correctly short-circuits through tryPreSmartShortCircuit)
// would consume the STALE transfer — not the one the user is mid-flow building.
//
// `clearPendingIfUnrelated` is the shared chokepoint. These tests pin that
// passing a synthetic {command:'send'} or {command:'invite'} command drops
// the stale pending tx, while {command:'confirm'} preserves it — i.e. the
// exact contract the SMART reply branch relies on.

function makePending(): PendingTransaction {
  return {
    amount: 50,
    recipient: '+573009999999',
    timestamp: Date.now(),
    lang: 'es',
    payQrScan: false,
  }
}

test.group('clearPendingIfUnrelated | SMART reply stale-tx contract', (group) => {
  const phone = '+573001234567'
  group.each.setup(() => {
    pendingTransactions.clear()
    pendingContactOverwrites.clear()
    partialSends.delete(phone)
    pendingInvites.delete(phone)
  })

  test('synthetic {send} clears stale pending tx', ({ assert }) => {
    pendingTransactions.set(phone, makePending())
    const cmd: ParsedCommand = { command: 'send', originalText: 'envia 5' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(pendingTransactions.has(phone), 'stale $50 transfer must be dropped')
  })

  test('synthetic {invite} clears stale pending tx', ({ assert }) => {
    pendingTransactions.set(phone, makePending())
    const cmd: ParsedCommand = { command: 'invite', originalText: 'invita +57…' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(pendingTransactions.has(phone))
  })

  test('synthetic {send} clears stale contact overwrite', ({ assert }) => {
    pendingContactOverwrites.set(phone, {
      alias: 'mom',
      newPhone: '+573001111111',
      timestamp: Date.now(),
    })
    const cmd: ParsedCommand = { command: 'send', originalText: 'envia 5' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(pendingContactOverwrites.has(phone))
  })

  test('confirm PRESERVES pending tx', ({ assert }) => {
    pendingTransactions.set(phone, makePending())
    const cmd: ParsedCommand = { command: 'confirm', originalText: 'si' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isTrue(
      pendingTransactions.has(phone),
      'confirm must NOT drop the tx it is about to consume'
    )
  })

  test('cancel PRESERVES pending tx', ({ assert }) => {
    // cancel handler clears the tx itself; clearPendingIfUnrelated must leave
    // it in place so the cancel handler is the unambiguous owner of cleanup.
    pendingTransactions.set(phone, makePending())
    const cmd: ParsedCommand = { command: 'cancel', originalText: 'no' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isTrue(pendingTransactions.has(phone))
  })

  test('send clears opposite-kind pendingInvites', ({ assert }) => {
    pendingInvites.set(phone, { timestamp: Date.now(), lang: 'es' })
    const cmd: ParsedCommand = { command: 'send', originalText: 'envia 5' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(pendingInvites.has(phone), 'a new send intent must drop a stale invite hand-off')
  })

  test('invite clears opposite-kind partialSends', ({ assert }) => {
    partialSends.set(phone, { sendIntent: true, timestamp: Date.now(), lang: 'es' })
    const cmd: ParsedCommand = { command: 'invite', originalText: 'invita +57…' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(partialSends.has(phone))
  })

  // ── Bracket-token (QR scan) stale-clear contract ──────────────────────
  //
  // When the webhook bracket-token branch handles an event/status QR scan
  // (NOT pay-QR), it synthesizes a {command:'unknown'} and calls
  // clearPendingIfUnrelated. These tests pin the contract that the
  // bracket-token branch relies on: a QR scan must drop ALL prior
  // confirmable state so a delayed "si" can't confirm the stale transfer.
  //
  // Regression scenario:
  //   1. User has pending $50 → Alice
  //   2. User scans an event QR like [POAP123]
  //   3. Bot replies "Welcome to Pizza Day!"
  //   4. User replies "si"
  // Without the clear, step 4 would confirm the $50 transfer Alice never
  // expected. With the clear, step 4 falls through to social/no-pending.

  test('event-scan {unknown} clears stale pending tx', ({ assert }) => {
    pendingTransactions.set(phone, makePending())
    const cmd: ParsedCommand = { command: 'unknown', originalText: '[POAP123]' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(
      pendingTransactions.has(phone),
      'QR scan must drop pre-scan pending tx — a later "si" cannot confirm a stale transfer'
    )
  })

  test('event-scan {unknown} clears stale contact overwrite', ({ assert }) => {
    pendingContactOverwrites.set(phone, {
      alias: 'mom',
      newPhone: '+573001111111',
      timestamp: Date.now(),
    })
    const cmd: ParsedCommand = { command: 'unknown', originalText: '[POAP123]' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(pendingContactOverwrites.has(phone))
  })

  test('event-scan {unknown} clears stale partialSends + pendingInvites', ({ assert }) => {
    partialSends.set(phone, { sendIntent: true, timestamp: Date.now(), lang: 'es' })
    pendingInvites.set(phone, { timestamp: Date.now(), lang: 'es' })
    const cmd: ParsedCommand = { command: 'unknown', originalText: '[POAP123]' }
    clearPendingIfUnrelated(phone, cmd, pendingTransactions)
    assert.isFalse(partialSends.has(phone))
    assert.isFalse(pendingInvites.has(phone))
  })
})

test.group('matchHighConfidencePreLlm | billetera + wallet variants', () => {
  const cases = [
    'mi billetera',
    'mi wallet',
    'mi cartera',
    'cual es mi billetera',
    'cuál es mi billetera',
    'cual es mi wallet',
    'dirección de mi cartera',
  ]
  for (const input of cases) {
    test(`"${input}" → balance`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.isNotNull(result, `${input} must match HIGH_CONFIDENCE_PRE_LLM balance pattern`)
      assert.equal(result!.command, 'balance')
    })
  }
})

// Pins the production path that beats SMART for the real-world bug
// transcript from 2026-05-21 ("Que es el pizza day?" classified as
// out_of_scope). Without this lift, SMART can mis-route Pizza Day
// questions even with the prompt knowledge — the regex/short-circuit
// guarantees the deterministic answer.
test.group('matchHighConfidencePreLlm | pizza_day pre-SMART gate', () => {
  const cases = [
    'pizza day',
    'pizzaday',
    'que es pizza day',
    'qué es el pizza day',
    'Que es el pizza day?',
    'what is pizza day',
    "what's pizza day",
    'what is the pizza day',
    'o que é pizza day',
  ]
  for (const input of cases) {
    test(`"${input}" → pizza_day (pre-SMART)`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.isNotNull(result, `${input} must match HIGH_CONFIDENCE_PRE_LLM pizza_day pattern`)
      assert.equal(result!.command, 'pizza_day')
    })
  }
})

// Acceptance pins for the poap_code intent. Without these, a SMART
// classifier drift could silently route "mi poap" → out_of_scope and the
// attendee loses their claim link. Mirror the pizza_day gate's shape:
// canonical phrasings must hit the pre-LLM regex; shadow phrasings that
// SHOULD route elsewhere (referral code, pay code) must NOT match.
test.group('matchHighConfidencePreLlm | poap_code pre-SMART gate', () => {
  const positiveCases = [
    'mi poap',
    'Mi poap',
    'mi poap?',
    'my poap',
    'meu poap',
    'poap',
    'poap code',
    'poap codigo',
    'poap código',
    'poap link',
    'codigo poap',
    'código de poap',
    'code poap',
    'claim poap',
    'reclamar mi poap',
    'resgatar meu poap',
    'donde esta mi poap',
    'dónde está mi poap',
    'where is my poap',
    'where my poap',
    'cade meu poap',
    'cadê meu poap',
  ]
  for (const input of positiveCases) {
    test(`"${input}" → poap_code (pre-SMART)`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      assert.isNotNull(result, `${input} must match HIGH_CONFIDENCE_PRE_LLM poap_code pattern`)
      assert.equal(result!.command, 'poap_code')
    })
  }

  // Shadow guards — these are different intents (referral code, pay-QR
  // code) and MUST NOT collide with poap_code or the user gets the wrong
  // reply on an unrelated request.
  const negativeCases = [
    'mi codigo',
    'mi código',
    'mi codigo de pago',
    'mi código de pago',
    'my code',
    'meu código',
    'codigo',
    'código',
  ]
  for (const input of negativeCases) {
    test(`"${input}" must NOT match poap_code`, ({ assert }) => {
      const result = matchHighConfidencePreLlm(input)
      if (result !== null) {
        assert.notEqual(
          result.command,
          'poap_code',
          `${input} should not route to poap_code (it's a different intent)`
        )
      }
    })
  }
})
