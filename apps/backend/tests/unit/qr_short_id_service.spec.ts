/**
 * QR Short-ID Service Unit Tests
 *
 * Covers:
 *  - generateShortId: length, alphabet membership, no ambiguous glyphs
 *  - generateUniqueShortId: returns first non-collision, retries past the
 *    initial collision, throws after MAX_COLLISION_RETRIES attempts
 *
 * No DB mocking required — the service is built around an injectable
 * existence-check function, so tests pass a fake `exists` callable.
 */

import { test } from '@japa/runner'
import {
  generateShortId,
  generateUniqueShortId,
  QR_SHORT_ID_ALPHABET,
  QR_SHORT_ID_LENGTH,
  QrShortIdCollisionError,
  type ShortIdExistsCheck,
} from '#services/qr_short_id.service'

// ── generateShortId ─────────────────────────────────────────────────────────

test.group('qr_short_id.service / generateShortId', () => {
  test('returns a string of QR_SHORT_ID_LENGTH characters', ({ assert }) => {
    const id = generateShortId()
    assert.equal(id.length, QR_SHORT_ID_LENGTH)
  })

  test('every character in 1000 samples belongs to the allowed alphabet', ({ assert }) => {
    for (let i = 0; i < 1000; i++) {
      const id = generateShortId()
      for (const char of id) {
        assert.include(QR_SHORT_ID_ALPHABET, char, `unexpected char '${char}' in id '${id}'`)
      }
    }
  })

  test('never produces ambiguous glyphs (0, 1, I, L, O) across 2000 samples', ({ assert }) => {
    const ambiguous = ['0', '1', 'I', 'L', 'O']
    for (let i = 0; i < 2000; i++) {
      const id = generateShortId()
      for (const glyph of ambiguous) {
        assert.notInclude(id, glyph, `id '${id}' contains ambiguous glyph '${glyph}'`)
      }
    }
  })

  test('alphabet itself contains no ambiguous glyphs and no duplicates', ({ assert }) => {
    assert.equal(QR_SHORT_ID_ALPHABET.length, 31)
    for (const glyph of ['0', '1', 'I', 'L', 'O']) {
      assert.notInclude(QR_SHORT_ID_ALPHABET, glyph)
    }
    // No duplicate characters — otherwise the index→char mapping is ambiguous
    // and the bias analysis in the implementation comment is wrong.
    const unique = new Set(QR_SHORT_ID_ALPHABET.split(''))
    assert.equal(unique.size, QR_SHORT_ID_ALPHABET.length)
  })
})

// ── generateUniqueShortId ───────────────────────────────────────────────────

test.group('qr_short_id.service / generateUniqueShortId', () => {
  test('returns the first generated id when no collision occurs', async ({ assert }) => {
    const exists: ShortIdExistsCheck = async () => false
    const generate = () => 'AAAAAAAA'

    const id = await generateUniqueShortId(exists, generate)
    assert.equal(id, 'AAAAAAAA')
  })

  test('retries and returns the second id when the first collides', async ({ assert }) => {
    // 'FIRSTONE' is taken; 'SECONDID' is free.
    const taken = new Set(['FIRSTONE'])
    const exists: ShortIdExistsCheck = async (id) => taken.has(id)

    const queue = ['FIRSTONE', 'SECONDID']
    const generate = () => queue.shift()!

    const id = await generateUniqueShortId(exists, generate)
    assert.equal(id, 'SECONDID')
    // Generator was called exactly twice — confirms retry without over-looping.
    assert.equal(queue.length, 0)
  })

  test('throws QrShortIdCollisionError after 5 consecutive collisions', async ({ assert }) => {
    const exists: ShortIdExistsCheck = async () => true // every id is "taken"
    const generate = () => 'COLLIDES'

    let caught: unknown
    try {
      await generateUniqueShortId(exists, generate)
    } catch (err) {
      caught = err
    }
    assert.instanceOf(caught, QrShortIdCollisionError)
  })

  test('checks existence at most 5 times before throwing', async ({ assert }) => {
    let calls = 0
    const exists: ShortIdExistsCheck = async () => {
      calls++
      return true
    }

    try {
      await generateUniqueShortId(exists, () => 'XXXXXXXX')
    } catch {
      // expected — we only care about the call count here
    }

    assert.equal(calls, 5)
  })

  test('default generator and injected existence work together (smoke)', async ({ assert }) => {
    // No generator override — exercises the real generateShortId path
    // alongside an injected exists that always returns false.
    const exists: ShortIdExistsCheck = async () => false
    const id = await generateUniqueShortId(exists)

    assert.equal(id.length, QR_SHORT_ID_LENGTH)
    for (const char of id) {
      assert.include(QR_SHORT_ID_ALPHABET, char)
    }
  })
})
