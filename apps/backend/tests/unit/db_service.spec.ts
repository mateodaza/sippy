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

// ══════════════════════════════════════════════════════════════════════════════
// $N inside SQL COMMENTS — the 2026-05-18 follow-on footgun
// ══════════════════════════════════════════════════════════════════════════════
//
// After fix #1 (placeholder reuse expansion), every `mi quest` reply
// still errored — this time with pg `42P18: could not determine data
// type of parameter $3`. Root cause: the scoring CTE documented its
// bindings with `-- e.slug = $1` comments, and the blanket `$N` regex
// matched the comment text too. Knex renumbered all 8 ?'s sequentially,
// pg stripped the comment, and the bindings/placeholder set went
// out of sync at the position that used to hold the comment.
//
// The translator must skip `$N` inside `--` and `/* */` comments. These
// tests pin both forms.

test.group('db.query | $N translation | comment skip', (group) => {
  group.each.setup(installCapture)
  group.each.teardown(restore)

  test('$N inside a -- comment is NOT bound or translated', async ({ assert }) => {
    await query('-- the $1 binding\nSELECT $1', ['x'])

    // The real $1 (after the comment) gets translated to ? and bound.
    // The $1 in the comment text stays as-is and gets no binding.
    assert.deepEqual(lastCall!.bindings, ['x'], 'only the real $1 produces a binding')
    assert.include(lastCall!.sql, '$1', 'comment text passes through unchanged (still contains $1)')
    assert.include(lastCall!.sql, 'SELECT ?', 'real $1 outside the comment translates to ?')
  })

  test('$N inside a /* */ block comment is NOT bound or translated', async ({ assert }) => {
    await query('/* sets $2 for the WHERE */ SELECT $1 WHERE x = $2', ['a', 'b'])

    // Only the two real $N references produce bindings. The $2 inside
    // the block comment stays in the comment text and is ignored.
    assert.deepEqual(lastCall!.bindings, ['a', 'b'])
  })

  test('mixed real + comment $N counts only the real ones (the prod CTE shape)', async ({
    assert,
  }) => {
    // Simulates the exact scoring.service.ts pattern: a SQL comment
    // documenting `e.slug = $1` between two real placeholder branches.
    // Pre-fix this would have caused pg to error with 42P18 because the
    // comment's $N was treated as a placeholder, pg stripped it during
    // parsing, and the parameter list developed a hole.
    const sql = `
      SELECT *
      FROM t
      WHERE a = $1
        AND ANY($2::text[])
      -- the $1 join keeps both branches anchored to the same event
      UNION
      SELECT * FROM u WHERE b = $1 AND c = $2
    `
    await query(sql, ['eventSlug', ['venue']])

    // 4 real $ references → 4 bindings (with reuse expansion):
    //   $1 (real), $2 (real), $1 (real, post-comment), $2 (real, post-comment)
    assert.lengthOf(
      lastCall!.bindings,
      4,
      'comment $1 must NOT be counted; only the 4 real references produce bindings'
    )
    assert.deepEqual(lastCall!.bindings, ['eventSlug', ['venue'], 'eventSlug', ['venue']])
  })
})
