/**
 * Sippy Quest — referral token extraction tests
 *
 * Pure parser tests for `extractReferralToken` (no DB, no side effects).
 * Pins:
 *   • Parses `[REF-XXXXXX]` with 6-char Crockford payload
 *   • Case-insensitive on input; returns uppercase
 *   • Strips the token from the message (downstream parsers don't see it)
 *   • Does NOT swallow QR 8-char tokens (`[ABC23XYZ]`)
 *   • Parsing-order discipline: when called BEFORE extractBracketToken
 *     (the production order), a referral token never reaches QR dispatch
 *
 * This is the audit-required regression net for the bracket-token
 * collision concern from 2026-05-18: even though the two patterns can't
 * collide today (prefix + length differ), we test the order explicitly
 * so a future widening of either pattern can't accidentally route a
 * referral through the QR dispatcher.
 */

import { test } from '@japa/runner'
import { extractReferralToken, extractBracketToken } from '#services/bracket_token.service'

// ══════════════════════════════════════════════════════════════════════════════
// Happy path
// ══════════════════════════════════════════════════════════════════════════════

test.group('extractReferralToken | happy path', () => {
  test('parses [REF-ABC234] in a typical wa.me invite message', ({ assert }) => {
    const r = extractReferralToken('Hola Sippy! [REF-ABC234]')
    assert.equal(r.code, 'ABC234')
    assert.equal(r.stripped, 'Hola Sippy!')
  })

  test('strips the bracket and collapses whitespace', ({ assert }) => {
    const r = extractReferralToken('Hola   [REF-ABC234]   Sippy')
    assert.equal(r.code, 'ABC234')
    assert.equal(r.stripped, 'Hola Sippy', 'whitespace collapse around the strip')
  })

  test('token at start of message', ({ assert }) => {
    const r = extractReferralToken('[REF-ABC234] balance')
    assert.equal(r.code, 'ABC234')
    assert.equal(r.stripped, 'balance')
  })

  test('token at end of message', ({ assert }) => {
    const r = extractReferralToken('hola [REF-ABC234]')
    assert.equal(r.code, 'ABC234')
    assert.equal(r.stripped, 'hola')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Case insensitivity — WhatsApp auto-capitalizes; users may also lowercase
// ══════════════════════════════════════════════════════════════════════════════

test.group('extractReferralToken | case insensitivity', () => {
  test('accepts lowercase [ref-abc234] and uppercases the result', ({ assert }) => {
    const r = extractReferralToken('hola [ref-abc234]')
    assert.equal(r.code, 'ABC234', 'normalized to uppercase regardless of input case')
  })

  test('accepts mixed case [Ref-AbC234]', ({ assert }) => {
    const r = extractReferralToken('hola [Ref-AbC234]')
    assert.equal(r.code, 'ABC234')
  })

  test('preserves surrounding text case during strip', ({ assert }) => {
    const r = extractReferralToken('Hola SIPPY! [ref-abc234] What is My Balance')
    assert.equal(r.stripped, 'Hola SIPPY! What is My Balance')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Negative cases — must NOT match
// ══════════════════════════════════════════════════════════════════════════════

test.group('extractReferralToken | rejection', () => {
  test('returns null for missing token', ({ assert }) => {
    const r = extractReferralToken('Hola Sippy')
    assert.isNull(r.code)
    assert.equal(r.stripped, 'Hola Sippy')
  })

  test('returns null for QR bracket token (no REF- prefix)', ({ assert }) => {
    // 8-char Crockford — must be ignored by the referral extractor,
    // left intact for the QR extractor.
    const r = extractReferralToken('hola [ABC23XYZ]')
    assert.isNull(r.code)
    assert.equal(r.stripped, 'hola [ABC23XYZ]', 'QR token left intact')
  })

  test('rejects payload with ambiguous Crockford glyphs (0/1/I/L/O)', ({ assert }) => {
    // Generator never emits these — the extractor's strict alphabet
    // catches any hand-typed token using them.
    assert.isNull(extractReferralToken('[REF-0BC234]').code, 'rejects 0')
    assert.isNull(extractReferralToken('[REF-1BC234]').code, 'rejects 1')
    assert.isNull(extractReferralToken('[REF-IBC234]').code, 'rejects I')
    assert.isNull(extractReferralToken('[REF-LBC234]').code, 'rejects L')
    assert.isNull(extractReferralToken('[REF-OBC234]').code, 'rejects O')
  })

  test('rejects wrong payload length (5 chars)', ({ assert }) => {
    assert.isNull(extractReferralToken('[REF-ABC23]').code)
  })

  test('rejects wrong payload length (7 chars)', ({ assert }) => {
    assert.isNull(extractReferralToken('[REF-ABC2345]').code)
  })

  test('rejects malformed prefix variants', ({ assert }) => {
    assert.isNull(extractReferralToken('[REFABC234]').code, 'no hyphen')
    assert.isNull(extractReferralToken('[REF_ABC234]').code, 'underscore not hyphen')
    assert.isNull(extractReferralToken('[REFER-ABC234]').code, 'wrong prefix')
  })

  test('empty / null-ish input is a no-op', ({ assert }) => {
    assert.equal(extractReferralToken('').code, null)
    assert.equal(extractReferralToken('   ').code, null)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Order discipline — production calls referral FIRST, then QR
// ══════════════════════════════════════════════════════════════════════════════
//
// Audit P0 (2026-05-18): even though the two patterns can't collide
// today, parsing-order discipline matters so a future widening of either
// pattern can't accidentally route a referral through the QR dispatcher.
// These tests pin the production-order contract.

test.group('parsing order | referral wins before QR', () => {
  test('referral-only input: extractBracketToken sees nothing after referral strip', ({
    assert,
  }) => {
    const text = 'Hola Sippy! [REF-ABC234]'
    const ref = extractReferralToken(text)
    const qr = extractBracketToken(ref.stripped)
    assert.equal(ref.code, 'ABC234')
    assert.isNull(qr.shortId, 'QR extractor sees a referral-stripped string')
  })

  test('QR-only input: referral extractor leaves it untouched for QR', ({ assert }) => {
    const text = 'Hola Sippy! [ABC23XYZ]'
    const ref = extractReferralToken(text)
    const qr = extractBracketToken(ref.stripped)
    assert.isNull(ref.code, 'referral does not match a QR token')
    assert.equal(qr.shortId, 'ABC23XYZ', 'QR extractor catches it')
    assert.equal(ref.stripped, text, 'referral left QR token in place')
  })

  test('both tokens present: referral captured, QR token survives for QR extractor', ({
    assert,
  }) => {
    // Edge case — a user could be invited AND scan a QR in the same
    // message (e.g. malicious payload, or a future flow). Referral
    // extractor pulls the [REF-...] out; QR extractor then gets the
    // [ABC23XYZ] from the stripped text. Both fire, both succeed,
    // no cross-contamination.
    const text = 'Hola! [REF-ABC234] [ABC23XYZ]'
    const ref = extractReferralToken(text)
    const qr = extractBracketToken(ref.stripped)
    assert.equal(ref.code, 'ABC234')
    assert.equal(qr.shortId, 'ABC23XYZ')
  })

  test('referral token cannot smuggle a QR-shaped payload', ({ assert }) => {
    // 8-char Crockford INSIDE a REF-prefix would fail the 6-char
    // payload length check. Confirms the referral extractor doesn't
    // accidentally match a QR shortId hidden under a REF- prefix.
    const r = extractReferralToken('hola [REF-ABC23XYZ]')
    assert.isNull(r.code, 'wrong payload length must reject')
  })
})
