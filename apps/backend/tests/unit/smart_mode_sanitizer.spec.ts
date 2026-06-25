/**
 * SMART MODE — sanitizer regression tests
 *
 * Pure regex / string ops, no LLM. Pin the behavior:
 *
 *   • URL detected → null (caller falls back to template)
 *   • Money amount detected → null
 *   • YES/SI/SIM/CONFIRMAR detected → null
 *   • Length cap applied
 *   • Empty / whitespace-only / too-short after trim → null
 *   • Clean text passes unchanged
 *
 * Both `sanitizeClarification` and `sanitizeOosRedirect` share the rule set
 * today — we test both entry points to lock the interface even when the
 * underlying rules diverge later.
 */

import { test } from '@japa/runner'
import { sanitizeClarification, sanitizeOosRedirect } from '#services/smart_mode/sanitizer'

const FNS = [
  { name: 'sanitizeClarification', fn: sanitizeClarification },
  { name: 'sanitizeOosRedirect', fn: sanitizeOosRedirect },
]

// ══════════════════════════════════════════════════════════════════════════════
// Hard rejects
// ══════════════════════════════════════════════════════════════════════════════

for (const { name, fn } of FNS) {
  test.group(`sanitizer | ${name} | hard rejects`, () => {
    test('rejects https:// URLs', ({ assert }) => {
      assert.isNull(fn('Visita https://sippy.lat/setup para empezar'))
    })

    test('rejects bare-domain URLs like sippy.lat/x', ({ assert }) => {
      assert.isNull(fn('Visita sippy.lat/wallet para tu QR'))
    })

    test('rejects $-amount mentions', ({ assert }) => {
      assert.isNull(fn('¿Quieres pagar $5?'))
    })

    test('rejects "5 USDC" mentions', ({ assert }) => {
      assert.isNull(fn('Confirma 5 USDC a tu contacto?'))
    })

    test('rejects "5 dolares" mentions', ({ assert }) => {
      assert.isNull(fn('Le mandas 5 dolares a quién?'))
    })

    test('rejects "10 pesos" mentions', ({ assert }) => {
      assert.isNull(fn('¿Son 10 pesos para Carolina?'))
    })

    test('rejects "20 reais"', ({ assert }) => {
      assert.isNull(fn('Para 20 reais a quem?'))
    })

    test('rejects YES token', ({ assert }) => {
      assert.isNull(fn('Reply YES to confirm'))
    })

    test('rejects SI (with and without accent)', ({ assert }) => {
      assert.isNull(fn('Escribe SI para confirmar'))
      assert.isNull(fn('Escribe SÍ para confirmar'))
    })

    test('rejects SIM (PT)', ({ assert }) => {
      assert.isNull(fn('Responda SIM para confirmar'))
    })

    test('rejects "confirmar" / "confirmas"', ({ assert }) => {
      assert.isNull(fn('¿Quieres confirmar el envío?'))
      assert.isNull(fn('¿Confirmas el envío?'))
    })

    // ── Regression: banned content past the 160-char cap must STILL reject ─
    // Earlier ordering truncated first then matched, which let URLs/amounts
    // beyond the cutoff slip through. These pin the "reject before truncate"
    // contract.

    test('rejects URL that sits past the 160-char cap', ({ assert }) => {
      const filler = '¿Cuál es la pregunta corta que te quiero hacer? '.repeat(4) // ~180 chars
      const text = filler + 'https://sippy.lat/x'
      assert.isAbove(text.length, 160, 'sanity: URL is past the cap')
      assert.isNull(fn(text))
    })

    test('rejects amount that sits past the 160-char cap', ({ assert }) => {
      const filler = 'Hola, esto es solo un texto bastante largo de relleno. '.repeat(4)
      const text = filler + 'Confirma 5 USDC?'
      assert.isAbove(text.length, 160)
      assert.isNull(fn(text))
    })

    test('rejects YES token that sits past the 160-char cap', ({ assert }) => {
      const filler = 'Pregunta larga con bastante contexto sobre tu cuenta y movimientos. '.repeat(
        3
      )
      const text = filler + 'Reply YES'
      assert.isAbove(text.length, 160)
      assert.isNull(fn(text))
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Empty / too-short
// ══════════════════════════════════════════════════════════════════════════════

for (const { name, fn } of FNS) {
  test.group(`sanitizer | ${name} | empty / short`, () => {
    test('null input → null', ({ assert }) => {
      assert.isNull(fn(null))
    })

    test('undefined input → null', ({ assert }) => {
      assert.isNull(fn(undefined))
    })

    test('empty string → null', ({ assert }) => {
      assert.isNull(fn(''))
    })

    test('whitespace-only → null', ({ assert }) => {
      assert.isNull(fn('   \n\t  '))
    })

    test('< 5 chars after trim → null', ({ assert }) => {
      assert.isNull(fn('ok'))
      assert.isNull(fn('  ?  '))
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Length cap
// ══════════════════════════════════════════════════════════════════════════════

for (const { name, fn } of FNS) {
  test.group(`sanitizer | ${name} | length cap`, () => {
    test('truncates text > 160 chars with ellipsis', ({ assert }) => {
      const long = '¿Cuánto le pagas a tu contacto? '.repeat(20) // ~640 chars
      const out = fn(long)
      assert.isNotNull(out)
      assert.isAtMost(out!.length, 160)
      assert.isTrue(out!.endsWith('…'))
    })

    test('leaves text ≤ 160 chars untouched (length-wise)', ({ assert }) => {
      const ok = '¿Cuánto le pagas a tu contacto?'
      const out = fn(ok)
      assert.equal(out, ok)
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Happy path — clean text passes through
// ══════════════════════════════════════════════════════════════════════════════

for (const { name, fn } of FNS) {
  test.group(`sanitizer | ${name} | clean text passes`, () => {
    test('Spanish clarifying question passes', ({ assert }) => {
      const text = '¿A quién le quieres pagar?'
      assert.equal(fn(text), text)
    })

    test('English OOS redirect passes', ({ assert }) => {
      const text = 'I can check your balance, send money, or show your pay QR.'
      assert.equal(fn(text), text)
    })

    test('Portuguese question passes', ({ assert }) => {
      const text = 'Para quem você quer enviar?'
      assert.equal(fn(text), text)
    })

    test('trims surrounding whitespace', ({ assert }) => {
      assert.equal(fn('   ¿A quién?   '), '¿A quién?')
    })
  })
}
