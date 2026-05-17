/**
 * SMART MODE — unknown-command variant selector regression tests
 *
 * Pins the rules the production unknown handler depends on:
 *   • Three languages × two categories, each pool non-empty
 *   • SMART oosRedirect (when present + OOS) wins over the static table
 *   • Gibberish ignores oosRedirect (classifier schema invariant)
 *   • Same text → same variant (deterministic, no flicker on resend)
 *   • Different text → different distribution across the pool
 *   • Spanish stays neutral across LATAM — `dialect` is accepted but
 *     IGNORED (regional slang felt off in 2026-05-17 field test; see
 *     unknown_variants.ts header for rationale). The Spanish neutrality
 *     group also guards against slang particles re-entering on edit.
 *   • Hash never throws on empty / unicode / very long input
 */

import { test } from '@japa/runner'
import {
  selectUnknownVariant,
  __testing,
  type UnknownCategory,
} from '#services/smart_mode/unknown_variants'

const LANGS = ['en', 'es', 'pt'] as const
const CATEGORIES: UnknownCategory[] = ['out_of_scope', 'gibberish']

// ══════════════════════════════════════════════════════════════════════════════
// Pool invariants
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | pool invariants', () => {
  test('every (lang, category) pool is non-empty', ({ assert }) => {
    for (const lang of LANGS) {
      for (const category of CATEGORIES) {
        const pool = __testing.getVariantPool(category, lang, undefined)
        assert.isAbove(pool.length, 0, `${category}/${lang} pool must be non-empty`)
      }
    }
  })

  test('every (lang, category) pool has at least 3 entries', ({ assert }) => {
    // C.4 spec calls for "3-5 per OOS/gibberish per lang"
    for (const lang of LANGS) {
      for (const category of CATEGORIES) {
        const pool = __testing.getVariantPool(category, lang, undefined)
        assert.isAtLeast(
          pool.length,
          3,
          `${category}/${lang} must have ≥3 variants (spec: 3-5 per lang)`
        )
      }
    }
  })

  test('every variant is a non-empty trimmed string', ({ assert }) => {
    const all = [
      ...Object.values(__testing.OOS_BASE).flat(),
      ...Object.values(__testing.GIBBERISH_BASE).flat(),
      ...Object.values(__testing.OOS_ES_DIALECT).flat(),
      ...Object.values(__testing.GIBBERISH_ES_DIALECT).flat(),
    ]
    for (const v of all) {
      assert.isString(v)
      assert.equal(v, v.trim(), `variant should be trimmed: ${JSON.stringify(v)}`)
      assert.isAbove(v.length, 0)
    }
  })

  test('no variant contains emoji or AI-sounding patterns', ({ assert }) => {
    const all = [
      ...Object.values(__testing.OOS_BASE).flat(),
      ...Object.values(__testing.GIBBERISH_BASE).flat(),
      ...Object.values(__testing.OOS_ES_DIALECT).flat(),
      ...Object.values(__testing.GIBBERISH_ES_DIALECT).flat(),
    ]
    // Rough emoji range guard — pinpoints accidental copy-paste regressions.
    const EMOJI = /\p{Extended_Pictographic}/u
    for (const v of all) {
      assert.notMatch(v, EMOJI, `variant must not contain emoji: ${v}`)
      assert.notMatch(v, /\brevolution/i, `avoid AI cliches: ${v}`)
      assert.notMatch(v, /\bempower/i, `avoid AI cliches: ${v}`)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Determinism: same text → same variant
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | determinism', () => {
  test('same text returns the same variant across calls', ({ assert }) => {
    const args = {
      lang: 'es' as const,
      category: 'gibberish' as const,
      text: 'asdfgh',
    }
    const first = selectUnknownVariant(args)
    for (let i = 0; i < 50; i++) {
      assert.equal(selectUnknownVariant(args), first, 'must be deterministic')
    }
  })

  test('same text different category may diverge', ({ assert }) => {
    const oos = selectUnknownVariant({ lang: 'en', category: 'out_of_scope', text: 'weather?' })
    const gib = selectUnknownVariant({ lang: 'en', category: 'gibberish', text: 'weather?' })
    assert.isString(oos)
    assert.isString(gib)
    // Pools are disjoint — variant from one cannot appear in the other.
    assert.notInclude(__testing.GIBBERISH_BASE.en, oos)
    assert.notInclude(__testing.OOS_BASE.en, gib)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Distribution: many different inputs → reasonable spread across pool
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | distribution', () => {
  test('different inputs spread across at least 2 distinct variants', ({ assert }) => {
    const pool = __testing.GIBBERISH_BASE.en
    const seen = new Set<string>()
    // 50 distinct deterministic inputs is well above the pool size; with a
    // halfway-decent hash we should hit at least 2 distinct variants
    // (typically ~all of them). Probes are fully deterministic so a regression
    // in `hashIndex` distribution shows up as a hard, reproducible fail.
    for (let i = 0; i < 50; i++) {
      seen.add(
        selectUnknownVariant({
          lang: 'en',
          category: 'gibberish',
          text: `input-${i}-${i * 7919}`,
        })
      )
    }
    assert.isAtLeast(
      seen.size,
      2,
      `must use ≥2 distinct variants across 50 inputs (got ${seen.size})`
    )
    for (const v of seen) {
      assert.include(pool, v)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SMART oosRedirect override
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | oosRedirect override', () => {
  test('OOS with valid oosRedirect returns the redirect verbatim', ({ assert }) => {
    const redirect = 'Para staking, visita docs.sippy.lat'
    const out = selectUnknownVariant({
      lang: 'es',
      category: 'out_of_scope',
      text: 'staking?',
      oosRedirect: redirect,
    })
    assert.equal(out, redirect)
  })

  test('gibberish ignores oosRedirect even when provided', ({ assert }) => {
    // Classifier schema forbids oosRedirect on gibberish; the selector
    // must enforce this independently so a future schema bug can't leak
    // an unsanitized hint into the user reply.
    const redirect = 'this should never be returned'
    const out = selectUnknownVariant({
      lang: 'en',
      category: 'gibberish',
      text: 'qqqqq',
      oosRedirect: redirect,
    })
    assert.notEqual(out, redirect)
    assert.include(__testing.GIBBERISH_BASE.en, out)
  })

  test('null oosRedirect falls back to the static pool', ({ assert }) => {
    const out = selectUnknownVariant({
      lang: 'pt',
      category: 'out_of_scope',
      text: 'clima?',
      oosRedirect: null,
    })
    assert.include(__testing.OOS_BASE.pt, out)
  })

  test('empty-string oosRedirect falls back to the static pool', ({ assert }) => {
    // Truthy-check pattern in selector — empty string is treated as absent.
    const out = selectUnknownVariant({
      lang: 'en',
      category: 'out_of_scope',
      text: 'idk',
      oosRedirect: '',
    })
    assert.include(__testing.OOS_BASE.en, out)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Spanish neutrality — dialect-flavored pools intentionally empty
// (regional slang like "parce" / "pille" felt off in 2026-05-17 field test;
// see unknown_variants.ts header for rationale)
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | ES stays neutral across dialects', () => {
  test('ES+co OOS pool equals the neutral pool (no dialect widening)', ({ assert }) => {
    const pool = __testing.getVariantPool('out_of_scope', 'es', 'co')
    assert.deepEqual(pool, __testing.OOS_BASE.es)
  })

  test('ES+mx gibberish pool equals the neutral pool', ({ assert }) => {
    const pool = __testing.getVariantPool('gibberish', 'es', 'mx')
    assert.deepEqual(pool, __testing.GIBBERISH_BASE.es)
  })

  test('ES+neutral matches the base pool', ({ assert }) => {
    const pool = __testing.getVariantPool('out_of_scope', 'es', 'neutral')
    assert.deepEqual(pool, __testing.OOS_BASE.es)
  })

  test('no Spanish variant contains regional slang particles', ({ assert }) => {
    // Hard guard against slang re-entering the table on a future edit.
    const SLANG = /\b(parce|pille|pana|chamo|wey|guey|che|boludo|bacano|chido)\b/i
    for (const v of __testing.OOS_BASE.es) assert.notMatch(v, SLANG, `OOS variant has slang: ${v}`)
    for (const v of __testing.GIBBERISH_BASE.es)
      assert.notMatch(v, SLANG, `gibberish variant has slang: ${v}`)
  })

  test('EN ignores dialect arg', ({ assert }) => {
    const withDialect = __testing.getVariantPool('out_of_scope', 'en', 'co')
    const without = __testing.getVariantPool('out_of_scope', 'en', undefined)
    assert.deepEqual(withDialect, without)
  })

  test('PT ignores dialect arg', ({ assert }) => {
    const withDialect = __testing.getVariantPool('gibberish', 'pt', 'mx')
    const without = __testing.getVariantPool('gibberish', 'pt', undefined)
    assert.deepEqual(withDialect, without)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Hash robustness
// ══════════════════════════════════════════════════════════════════════════════

test.group('unknown_variants | hashIndex robustness', () => {
  test('returns a valid index in [0, n) for empty string', ({ assert }) => {
    for (let n = 1; n <= 10; n++) {
      const i = __testing.hashIndex('', n)
      assert.isAtLeast(i, 0)
      assert.isBelow(i, n)
    }
  })

  test('returns a valid index for unicode input', ({ assert }) => {
    const i = __testing.hashIndex('héllo 🦙 ñ', 5)
    assert.isAtLeast(i, 0)
    assert.isBelow(i, 5)
  })

  test('returns a valid index for very long input', ({ assert }) => {
    const i = __testing.hashIndex('a'.repeat(10_000), 4)
    assert.isAtLeast(i, 0)
    assert.isBelow(i, 4)
  })

  test('never returns negative even when XOR overflows the sign bit', ({ assert }) => {
    // djb2 with XOR can drive `h` negative on V8. Selector takes Math.abs(h | 0).
    const variants: number[] = []
    for (let i = 0; i < 200; i++) {
      variants.push(__testing.hashIndex(`probe-${i}-${i * 7919}`, 7))
    }
    assert.isTrue(
      variants.every((v) => v >= 0 && v < 7),
      'all indices must be in [0, n)'
    )
  })
})
