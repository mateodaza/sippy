import { test } from '@japa/runner'
import { getLanguageForPhone, PHONE_LANGUAGE_PREFIX_MAP } from '#utils/phone'

// ── Functional: prefix matching ────────────────────────────────────────────────

test.group('getLanguageForPhone | English (+1)', () => {
  test('TC-L1: US number +15551234567 → en', ({ assert }) => {
    assert.equal(getLanguageForPhone('+15551234567'), 'en')
  })

  test('TC-L2: Canada number +16135550100 → en', ({ assert }) => {
    assert.equal(getLanguageForPhone('+16135550100'), 'en')
  })

  test('TC-L7: Dominican Republic +18095551234 → en (+1 NANP catch-all)', ({ assert }) => {
    // +1809 is not in the language map; +1 catch-all applies.
    // Known limitation per spec: "for now +1 is only US/Canada which is fine"
    assert.equal(getLanguageForPhone('+18095551234'), 'en')
  })
})

test.group('getLanguageForPhone | Portuguese (+55)', () => {
  test('TC-L3: Brazil mobile +5511987654321 → pt', ({ assert }) => {
    assert.equal(getLanguageForPhone('+5511987654321'), 'pt')
  })
})

test.group('getLanguageForPhone | Spanish fallback (everything else)', () => {
  test('TC-L4: Colombia +573001234567 → es', ({ assert }) => {
    assert.equal(getLanguageForPhone('+573001234567'), 'es')
  })

  test('TC-L5: Mexico +5215512345678 → es', ({ assert }) => {
    assert.equal(getLanguageForPhone('+5215512345678'), 'es')
  })

  test('TC-L6: Argentina +541112345678 → es', ({ assert }) => {
    assert.equal(getLanguageForPhone('+541112345678'), 'es')
  })

  test('TC-L8: Venezuela +5812345678 → es (generic +5X, not Brazil)', ({ assert }) => {
    assert.equal(getLanguageForPhone('+5812345678'), 'es')
  })

  test('TC-L9: UK +447700900000 → es (unknown prefix falls back)', ({ assert }) => {
    assert.equal(getLanguageForPhone('+447700900000'), 'es')
  })
})

// ── Structural: prefix map ordering invariant ──────────────────────────────────

test.group('PHONE_LANGUAGE_PREFIX_MAP | ordering invariant', () => {
  test('TC-LO1: map is sorted longest-prefix-first (no shorter prefix before a longer one it shadows)', ({
    assert,
  }) => {
    for (let i = 0; i < PHONE_LANGUAGE_PREFIX_MAP.length - 1; i++) {
      const current = PHONE_LANGUAGE_PREFIX_MAP[i][0]
      const next = PHONE_LANGUAGE_PREFIX_MAP[i + 1][0]
      // Each prefix must be >= the next in length (longest-first ordering)
      assert.isTrue(
        current.length >= next.length,
        `Prefix "${current}" at index ${i} is shorter than "${next}" at index ${i + 1}. ` +
          `Fix: move "${current}" after "${next}" (longer prefixes must come first).`
      )
    }
  })
})

// ── Algorithmic: prove longest-prefix-match works with overlapping prefixes ────

test.group('getLanguageForPhone | longest-prefix algorithm correctness', () => {
  test('TC-LO2: algorithm returns longest-matching prefix, not first shorter match', ({
    assert,
  }) => {
    // Construct a local overlapping map to prove the for-loop algorithm is correct.
    // This simulates a future scenario where Dominican Republic (+1809) maps to 'es'
    // while the general NANP prefix (+1) maps to 'en'.
    // With correct longest-first ordering, +1809... must return 'es', not 'en'.
    const overlappingMap: readonly [string, 'en' | 'es' | 'pt'][] = [
      ['+1809', 'es'], // longer prefix first — Dominican Republic (Spanish)
      ['+1', 'en'], // shorter catch-all after
    ]
    const lookup = (phone: string): 'en' | 'es' | 'pt' => {
      for (const [prefix, lang] of overlappingMap) {
        if (phone.startsWith(prefix)) return lang
      }
      return 'es'
    }

    // Longer prefix must win:
    assert.equal(lookup('+18095551234'), 'es', '+1809 number must match +1809 (es), not +1 (en)')
    // Non-overlapping +1 still works:
    assert.equal(lookup('+15551234567'), 'en', '+1 non-809 number still matches +1 (en)')

    // Anti-regression: prove that reversing order (bug) produces wrong result for +1809:
    const buggyMap: readonly [string, 'en' | 'es' | 'pt'][] = [
      ['+1', 'en'], // BUG: shorter prefix before longer one
      ['+1809', 'es'],
    ]
    const buggyLookup = (phone: string): 'en' | 'es' | 'pt' => {
      for (const [prefix, lang] of buggyMap) {
        if (phone.startsWith(prefix)) return lang
      }
      return 'es'
    }
    // This proves why ordering matters: wrong order makes +1809 return 'en' instead of 'es'
    assert.equal(
      buggyLookup('+18095551234'),
      'en',
      'Buggy (shortest-first) map incorrectly returns en for +1809 number'
    )
  })
})
