/**
 * `services/db.query` — pg-to-knex placeholder translation tests
 *
 * The `query()` wrapper exists for one reason: a lot of the codebase
 * was written against pg-style `$N` placeholders (legacy Express era)
 * and we wanted to migrate to Adonis Lucid (knex `?` placeholders)
 * without rewriting every call site. The wrapper does the translation
 * on the fly.
 *
 * One subtle property of pg's `$N` syntax is REUSE: a single binding
 * can be referenced multiple times (`WHERE a = $1 OR b = $1` with a
 * single binding). knex's `?` syntax does NOT support reuse — every
 * `?` demands its own binding. A naive `$N → ?` regex without binding
 * expansion sends an under-bound query to knex, which errors with
 * "Expected X bindings, saw Y" — the exact 2026-05-18 prod outage that
 * broke every `mi quest` reply ("Algo salio mal").
 *
 * These tests pin both halves of the contract:
 *   1. Non-reused $N stays correct (no regression for the common case)
 *   2. Reused $N gets expanded — knex receives one binding per `?`
 *   3. The expansion preserves binding values in placeholder order, so
 *      a re-write that scrambles the order would fail the test
 */

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { query } from '#services/db'

// ── rawQuery capture ────────────────────────────────────────────────────

interface RawQueryCall {
  sql: string
  bindings: unknown[]
}

let lastCall: RawQueryCall | null = null
let origRawQuery: typeof db.rawQuery

function installCapture() {
  lastCall = null
  origRawQuery = db.rawQuery
  db.rawQuery = (async (sql: string, bindings: unknown[]) => {
    lastCall = { sql, bindings }
    return { rows: [], rowCount: 0 }
  }) as unknown as typeof db.rawQuery
}
function restore() {
  db.rawQuery = origRawQuery
}

// ══════════════════════════════════════════════════════════════════════════════
// $N → ? translation (no reuse) — baseline
// ══════════════════════════════════════════════════════════════════════════════

test.group('db.query | $N translation | no reuse', (group) => {
  group.each.setup(installCapture)
  group.each.teardown(restore)

  test('single-use $N converts 1:1, bindings pass through', async ({ assert }) => {
    await query('SELECT * FROM t WHERE a = $1 AND b = $2', ['x', 42])

    assert.equal(lastCall!.sql, 'SELECT * FROM t WHERE a = ? AND b = ?')
    assert.deepEqual(lastCall!.bindings, ['x', 42])
  })

  test('handles $10, $11 etc (two-digit positions)', async ({ assert }) => {
    const params = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']
    await query('SELECT $10, $11', params)

    assert.equal(lastCall!.sql, 'SELECT ?, ?')
    assert.deepEqual(lastCall!.bindings, ['j', 'k'])
  })

  test('passes empty bindings array when no $N in SQL', async ({ assert }) => {
    await query('SELECT 1')

    assert.equal(lastCall!.sql, 'SELECT 1')
    assert.deepEqual(lastCall!.bindings, [])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// $N REUSE — the 2026-05-18 footgun
// ══════════════════════════════════════════════════════════════════════════════

test.group('db.query | $N translation | placeholder reuse', (group) => {
  group.each.setup(installCapture)
  group.each.teardown(restore)

  test('$1 reused twice expands to two ? bindings (same value)', async ({ assert }) => {
    await query('SELECT * FROM t WHERE a = $1 OR b = $1', ['x'])

    assert.equal(lastCall!.sql, 'SELECT * FROM t WHERE a = ? OR b = ?')
    assert.deepEqual(
      lastCall!.bindings,
      ['x', 'x'],
      'each ? must receive its own binding — knex throws otherwise'
    )
  })

  test('mixed reuse: $1 ×3 + $2 ×1 + $3 ×2 + $4 ×1 expands in placement order', async ({
    assert,
  }) => {
    // This is the exact shape of the quest scoring CTE that triggered
    // the 2026-05-18 prod outage. Pinning the expected expansion makes
    // sure any future change to the translation logic doesn't reorder
    // bindings (which would silently bind cap to the wrong column,
    // producing wrong-but-not-erroring results).
    await query('WHERE $1 AND ANY($3) AND $1 AND $1 AND ANY($3) AND $2 AND id = $4', [
      'eventSlug',
      5,
      ['venue'],
      '+573001234567',
    ])

    assert.deepEqual(
      lastCall!.bindings,
      [
        'eventSlug', // first $1
        ['venue'], // first $3
        'eventSlug', // second $1
        'eventSlug', // third $1
        ['venue'], // second $3
        5, // $2
        '+573001234567', // $4
      ],
      'bindings must expand in placement order, with reuses duplicated'
    )
    assert.equal(
      (lastCall!.sql.match(/\?/g) ?? []).length,
      lastCall!.bindings.length,
      '? count and bindings length must match — knex contract'
    )
  })

  test('reuse of high-index $N stays mapped to the correct 1-indexed binding', async ({
    assert,
  }) => {
    // Off-by-one regression guard. $N is 1-indexed; params is 0-indexed.
    // A future "simplification" that drops the `- 1` would silently bind
    // every $N to the wrong value here.
    await query('SELECT $3, $3, $1', ['a', 'b', 'c'])

    assert.deepEqual(lastCall!.bindings, ['c', 'c', 'a'])
  })
})
