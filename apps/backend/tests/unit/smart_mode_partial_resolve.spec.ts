/**
 * SMART MODE — seed-and-resolve integration regression tests
 *
 * Covers the bug from the May-16 staging report where SMART's ambiguous
 * `send` reply asked a clarifying question but did NOT persist the slots
 * the user already provided, so the follow-up message was re-classified
 * fresh and the user got stuck in a "amount? → 200 → recipient? → +57…
 * → amount?" loop.
 *
 * The fix has two halves:
 *   1. Dispatcher emits a `pending` payload on ambiguous send/invite turns
 *      ([smart_mode_dispatcher.spec.ts] pins the shape).
 *   2. Webhook seeds `partialSends` / `pendingInvites` from that payload;
 *      the existing resolvers pick up the next turn (this file).
 *
 * Tests focus on the resolver layer — the meat of the second half — and
 * mirror the exact dispatcher payloads the webhook stores, so a future
 * change in either half that breaks the contract surfaces here.
 *
 * Coverage:
 *   • Phone-number-only paths (no DB needed): the bug-trace fix, reverse
 *     order, pre-filled slots, fall-through, pending invite.
 *   • Local-currency carry-through (P1): "200 pesos" / "50 reais" / etc.
 *     must surface `localCurrency` on the complete resolution so FX runs
 *     — otherwise the user sends face-value USDC (a 400x money bug).
 *   • Alias resolution (P2): the real failing transcript used "A Carlos
 *     Mario", so the send + invite alias paths are exercised here with
 *     `db.rawQuery` stubbed via `setMockContacts(...)`. Mirrors the
 *     mocking pattern in smart_mode_cohort.spec.ts.
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { PartialSend } from '#types/index'
import { resolvePartialSend, resolvePendingInvite } from '#controllers/webhook_controller'
import type { SmartPendingState } from '#services/smart_mode/dispatcher'
import { formatAskForRecipient } from '#utils/messages'

const OWNER = '+573009999999'
const RECIPIENT = '+573001234567'
const CARLOS_PHONE = '+573153007266'

// Stub `db.rawQuery` so `smartResolveAlias` (called by the resolvers when
// text doesn't canonicalize to a phone) returns a controllable contact
// list instead of hitting Postgres. Matches the mocking pattern in
// smart_mode_cohort.spec.ts so the failure mode (DB unavailable in
// unit tests) is handled the same way across SMART specs.
let origRawQuery: typeof db.rawQuery
function setMockContacts(
  rows: Array<{
    alias: string
    aliasDisplay: string
    targetPhone: string
    source?: string
  }>
) {
  origRawQuery = db.rawQuery
  db.rawQuery = (async () => ({
    rows: rows.map((r) => ({ source: 'manual', ...r })),
    rowCount: rows.length,
  })) as unknown as typeof db.rawQuery
}
function mockNoAliasMatches() {
  setMockContacts([])
}
function restoreAlias() {
  db.rawQuery = origRawQuery
}

/**
 * Mirror the seed step the webhook does at reply-with-pending.
 * Keeps the test independent of the webhook's transient state, while
 * pinning the contract that `SmartPendingState` is structurally
 * compatible with `PartialSend`.
 */
function seedFromPending(pending: SmartPendingState, lang: 'es' = 'es'): PartialSend {
  if (pending.kind !== 'send') throw new Error('only send seeds a partial')
  return { ...pending.partial, timestamp: Date.now(), lang }
}

// ══════════════════════════════════════════════════════════════════════════════
// The exact bug-trace flow: sendIntent only → amount → recipient → done
// ══════════════════════════════════════════════════════════════════════════════

test.group('partial_resolve | sendIntent → amount → recipient (bug-trace fix)', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)
  test('seeded with sendIntent only, "200" progresses to amount-known', async ({ assert }) => {
    const seed = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const out = await resolvePartialSend(seed, '200', OWNER)
    assert.exists(out, 'must NOT fall through — sendIntent + standalone number = progress')
    if (!out) return
    assert.equal(out.kind, 'progress')
    if (out.kind !== 'progress') return
    assert.equal(out.partial.amount, 200)
    assert.isUndefined(out.partial.recipient, 'recipient not yet known')
    assert.equal(out.prompt, 'recipient', 'must ask for the missing slot next')
    assert.isTrue(out.partial.sendIntent, 'sendIntent flag carried forward')
  })

  test('then with recipient phone, completes the send', async ({ assert }) => {
    const progressed: PartialSend = {
      sendIntent: true,
      amount: 200,
      timestamp: Date.now(),
      lang: 'es',
    }
    const out = await resolvePartialSend(progressed, RECIPIENT, OWNER)
    assert.exists(out)
    if (!out) return
    assert.equal(out.kind, 'complete')
    if (out.kind !== 'complete') return
    assert.equal(out.amount, 200)
    assert.equal(out.recipient, RECIPIENT)
  })

  test('end-to-end: empty intent → "200" → "+57…" yields a complete send', async ({ assert }) => {
    let state: PartialSend = seedFromPending({ kind: 'send', partial: { sendIntent: true } })

    const step1 = await resolvePartialSend(state, '200', OWNER)
    assert.equal(step1?.kind, 'progress')
    if (step1?.kind !== 'progress') return
    state = step1.partial

    const step2 = await resolvePartialSend(state, RECIPIENT, OWNER)
    assert.equal(step2?.kind, 'complete')
    if (step2?.kind !== 'complete') return
    assert.equal(step2.amount, 200)
    assert.equal(step2.recipient, RECIPIENT)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Reverse order: recipient first, then amount
// ══════════════════════════════════════════════════════════════════════════════

test.group('partial_resolve | sendIntent → recipient → amount', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)
  test('seeded with sendIntent only, "+57…" progresses to recipient-known', async ({ assert }) => {
    const seed = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const out = await resolvePartialSend(seed, RECIPIENT, OWNER)
    assert.exists(out)
    if (!out) return
    assert.equal(out.kind, 'progress')
    if (out.kind !== 'progress') return
    assert.equal(out.partial.recipient, RECIPIENT)
    assert.isUndefined(out.partial.amount)
    assert.equal(out.prompt, 'amount')
  })

  test('then with amount, completes the send', async ({ assert }) => {
    const progressed: PartialSend = {
      sendIntent: true,
      recipient: RECIPIENT,
      timestamp: Date.now(),
      lang: 'es',
    }
    const out = await resolvePartialSend(progressed, '50', OWNER)
    assert.equal(out?.kind, 'complete')
    if (out?.kind !== 'complete') return
    assert.equal(out.amount, 50)
    assert.equal(out.recipient, RECIPIENT)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Pre-filled seeds — dispatcher already populated one slot
// ══════════════════════════════════════════════════════════════════════════════

test.group('partial_resolve | dispatcher pre-fills one slot', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)
  test('seeded with amount only, recipient phone completes', async ({ assert }) => {
    // Mirrors dispatcher output for "envia 200" — amount known, recipient missing.
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 200 },
    })
    const out = await resolvePartialSend(seed, RECIPIENT, OWNER)
    assert.equal(out?.kind, 'complete')
    if (out?.kind !== 'complete') return
    assert.equal(out.amount, 200)
    assert.equal(out.recipient, RECIPIENT)
  })

  test('seeded with recipient phone only, amount completes', async ({ assert }) => {
    // Mirrors dispatcher output for "mandale a +57..." — recipient known, amount missing.
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, recipient: RECIPIENT },
    })
    const out = await resolvePartialSend(seed, '15', OWNER)
    assert.equal(out?.kind, 'complete')
    if (out?.kind !== 'complete') return
    assert.equal(out.amount, 15)
    assert.equal(out.recipient, RECIPIENT)
  })

  test('amount-prefilled with "a +57…" lead also completes (lead-word strip)', async ({
    assert,
  }) => {
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 100 },
    })
    const out = await resolvePartialSend(seed, `a ${RECIPIENT}`, OWNER)
    assert.equal(out?.kind, 'complete')
  })

  test('amount-prefilled with currency-word reply ("200 dolares") completes', async ({
    assert,
  }) => {
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, recipient: RECIPIENT },
    })
    const out = await resolvePartialSend(seed, '200 dolares', OWNER)
    assert.equal(out?.kind, 'complete')
    if (out?.kind !== 'complete') return
    assert.equal(out.amount, 200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Negative cases — must fall through cleanly so normal parsing runs
// ══════════════════════════════════════════════════════════════════════════════

test.group('partial_resolve | fall-through behavior', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)
  test('non-numeric, non-phone reply returns null (caller falls back to parser)', async ({
    assert,
  }) => {
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 100 },
    })
    // "lol" is neither a phone nor an alias the test owner has — falls through.
    const out = await resolvePartialSend(seed, 'lol', OWNER)
    assert.isNull(out)
  })

  test('bare sendIntent + gibberish text returns null', async ({ assert }) => {
    const seed = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const out = await resolvePartialSend(seed, 'asdfgh', OWNER)
    assert.isNull(out)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Pending invite — second half of the May-16 fix
// ══════════════════════════════════════════════════════════════════════════════

test.group('pending_invite | resolves to invite command on follow-up', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)
  test('bare phone after invite ambiguity becomes invite command', async ({ assert }) => {
    const cmd = await resolvePendingInvite(OWNER, RECIPIENT)
    assert.exists(cmd)
    if (!cmd) return
    assert.equal(cmd.command, 'invite')
    assert.equal(cmd.recipient, RECIPIENT)
  })

  test('phone with "a" lead also resolves ("a +57…")', async ({ assert }) => {
    const cmd = await resolvePendingInvite(OWNER, `a ${RECIPIENT}`)
    assert.exists(cmd)
    assert.equal(cmd?.recipient, RECIPIENT)
  })

  test('non-phone non-alias reply returns null (caller falls back to parser)', async ({
    assert,
  }) => {
    const cmd = await resolvePendingInvite(OWNER, 'tomorrow maybe')
    assert.isNull(cmd)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Local-currency carry-through — P1 money-correctness regression
// ══════════════════════════════════════════════════════════════════════════════
//
// Without this, a multi-turn "Quiero enviar plata → 200 pesos → +57…" send
// produces a complete with amount=200 and no localCurrency, so the FX layer
// is skipped and the user sends $200 USDC at face value (a ~400x overshoot
// for COP). The resolver MUST carry `localCurrency` from the standalone
// amount reply through every progress / complete path.

test.group('partial_resolve | local-currency carry-through (P1)', (group) => {
  group.each.setup(mockNoAliasMatches)
  group.each.teardown(restoreAlias)

  test('sendIntent + "200 pesos" → progress with localCurrency=LOCAL', async ({ assert }) => {
    const seed = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const out = await resolvePartialSend(seed, '200 pesos', OWNER)
    if (out?.kind !== 'progress') throw new Error(`expected progress, got ${out?.kind}`)
    assert.equal(out.partial.amount, 200)
    assert.equal(out.partial.localCurrency, 'LOCAL', 'pesos must map to LOCAL for FX')
    assert.equal(out.prompt, 'recipient')
  })

  test('then with recipient phone, completes preserving localCurrency', async ({ assert }) => {
    const progressed: PartialSend = {
      sendIntent: true,
      amount: 200,
      localCurrency: 'LOCAL',
      timestamp: Date.now(),
      lang: 'es',
    }
    const out = await resolvePartialSend(progressed, RECIPIENT, OWNER)
    if (out?.kind !== 'complete') throw new Error(`expected complete, got ${out?.kind}`)
    assert.equal(out.amount, 200)
    assert.equal(out.recipient, RECIPIENT)
    assert.equal(out.localCurrency, 'LOCAL', 'localCurrency must survive recipient-fill step')
  })

  test('recipient-seeded then "50 reais" completes with BRL', async ({ assert }) => {
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, recipient: RECIPIENT },
    })
    const out = await resolvePartialSend(seed, '50 reais', OWNER)
    if (out?.kind !== 'complete') throw new Error(`expected complete, got ${out?.kind}`)
    assert.equal(out.amount, 50)
    assert.equal(out.localCurrency, 'BRL', 'reais must map to BRL')
  })

  test('"10 soles" completes with PEN', async ({ assert }) => {
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, recipient: RECIPIENT },
    })
    const out = await resolvePartialSend(seed, '10 soles', OWNER)
    if (out?.kind !== 'complete') throw new Error(`expected complete, got ${out?.kind}`)
    assert.equal(out.localCurrency, 'PEN')
  })

  test('USD-equivalent words ("50 dolares", "20 plata") do NOT set localCurrency', async ({
    assert,
  }) => {
    // null entries in STANDALONE_CURRENCY_MAP must NOT produce a localCurrency
    // — otherwise we'd trigger FX on a USDC-denominated send.
    for (const text of ['50 dolares', '20 plata', '15 usd', '100 dollars']) {
      const seed = seedFromPending({
        kind: 'send',
        partial: { sendIntent: true, recipient: RECIPIENT },
      })
      const out = await resolvePartialSend(seed, text, OWNER)
      if (out?.kind !== 'complete')
        throw new Error(`expected complete for "${text}", got ${out?.kind}`)
      assert.isUndefined(out.localCurrency, `"${text}" must not set localCurrency`)
    }
  })

  test('plain "200" (no currency word) leaves localCurrency undefined', async ({ assert }) => {
    const seed = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const out = await resolvePartialSend(seed, '200', OWNER)
    if (out?.kind !== 'progress') throw new Error(`expected progress, got ${out?.kind}`)
    assert.equal(out.partial.amount, 200)
    assert.isUndefined(out.partial.localCurrency)
  })

  test('end-to-end: "200 pesos" → "+57…" yields complete with LOCAL preserved', async ({
    assert,
  }) => {
    let state: PartialSend = seedFromPending({ kind: 'send', partial: { sendIntent: true } })
    const s1 = await resolvePartialSend(state, '200 pesos', OWNER)
    if (s1?.kind !== 'progress') throw new Error('step 1 must progress')
    state = s1.partial
    assert.equal(state.localCurrency, 'LOCAL')

    const s2 = await resolvePartialSend(state, RECIPIENT, OWNER)
    if (s2?.kind !== 'complete') throw new Error('step 2 must complete')
    assert.equal(s2.amount, 200)
    assert.equal(s2.recipient, RECIPIENT)
    assert.equal(s2.localCurrency, 'LOCAL', 'currency must survive both turns')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Alias resolution — P2: the real failing transcript used "A Carlos Mario"
// ══════════════════════════════════════════════════════════════════════════════
//
// The phone-number tests above pin the canonicalize path; these tests pin
// the smartResolveAlias path that the May-16 trace actually traveled.

test.group('partial_resolve | alias resolution (P2)', (group) => {
  group.each.teardown(restoreAlias)

  test('amount-seeded + "Carlos Mario" alias resolves to that contact', async ({ assert }) => {
    setMockContacts([
      { alias: 'carlos mario', aliasDisplay: 'Carlos Mario', targetPhone: CARLOS_PHONE },
    ])
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 0.1 },
    })
    const out = await resolvePartialSend(seed, 'Carlos Mario', OWNER)
    if (out?.kind !== 'complete') throw new Error(`expected complete, got ${out?.kind}`)
    assert.equal(out.amount, 0.1)
    assert.equal(out.recipient, CARLOS_PHONE, 'alias must resolve to mocked contact phone')
  })

  test('amount-seeded + "A Carlos Mario" (with "a" lead) resolves', async ({ assert }) => {
    setMockContacts([
      { alias: 'carlos mario', aliasDisplay: 'Carlos Mario', targetPhone: CARLOS_PHONE },
    ])
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 0.1 },
    })
    const out = await resolvePartialSend(seed, 'A Carlos Mario', OWNER)
    if (out?.kind !== 'complete') throw new Error(`expected complete, got ${out?.kind}`)
    assert.equal(out.recipient, CARLOS_PHONE)
  })

  test('multiple matches → fall through (null), no premature send', async ({ assert }) => {
    // Two contacts both matching "carlos" → smartResolveAlias returns 2 matches
    // → resolver returns null so the caller can disambiguate via the parser.
    // Critical safety: never auto-send to the wrong "carlos".
    setMockContacts([
      { alias: 'carlos mario', aliasDisplay: 'Carlos Mario', targetPhone: CARLOS_PHONE },
      { alias: 'carlos perez', aliasDisplay: 'Carlos Perez', targetPhone: '+573001111111' },
    ])
    const seed = seedFromPending({
      kind: 'send',
      partial: { sendIntent: true, amount: 0.1 },
    })
    const out = await resolvePartialSend(seed, 'Carlos', OWNER)
    assert.isNull(out, 'ambiguous alias must NOT auto-resolve')
  })

  test('pending invite + "Carlos Mario" resolves to invite command', async ({ assert }) => {
    setMockContacts([
      { alias: 'carlos mario', aliasDisplay: 'Carlos Mario', targetPhone: CARLOS_PHONE },
    ])
    const cmd = await resolvePendingInvite(OWNER, 'Carlos Mario')
    assert.exists(cmd)
    if (!cmd) return
    assert.equal(cmd.command, 'invite')
    assert.equal(cmd.recipient, CARLOS_PHONE)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Display polish — formatAskForRecipient agrees with the dispatcher echo
// ══════════════════════════════════════════════════════════════════════════════
//
// The partial-progress prompt and the SMART deterministic echo are two
// independent code paths that BOTH need to surface the user's currency
// word; otherwise mid-flow it looks like Sippy is about to send USDC
// at the local face value (the May-17 audit P3). These tests pin
// formatAskForRecipient's side; the dispatcher's side is pinned in
// smart_mode_dispatcher.spec.ts via the LOCAL/BRL seed tests.

test.group('formatAskForRecipient | currency-aware echo (P3)', () => {
  test('no localCurrency renders USD format', ({ assert }) => {
    const out = formatAskForRecipient(200, 'es')
    assert.include(out, '$200', 'USDC case must use $ formatting')
    assert.notInclude(out, 'pesos')
  })

  test('LOCAL renders as "pesos" (most common LATAM)', ({ assert }) => {
    const out = formatAskForRecipient(200, 'es', 'LOCAL')
    assert.include(out, '200 pesos')
    assert.notInclude(out, '$200', 'must NOT use USD formatting when local currency is set')
  })

  test('BRL renders as "reais"', ({ assert }) => {
    const out = formatAskForRecipient(50, 'pt', 'BRL')
    assert.include(out, '50 reais')
  })

  test('PEN renders as "soles"', ({ assert }) => {
    const out = formatAskForRecipient(10, 'es', 'PEN')
    assert.include(out, '10 soles')
  })

  test('unknown currency code falls back to USD format (no crash)', ({ assert }) => {
    // Defensive: if a future schema adds a code without updating the
    // word map, we'd rather show $X than crash or print "5 undefined".
    const out = formatAskForRecipient(5, 'en', 'ZZZ')
    assert.include(out, '$5')
  })
})
