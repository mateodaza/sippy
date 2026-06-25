import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'

/**
 * Pizza Day POAP pool — loads N unique mint URLs into `poap_codes`.
 *
 * Source: `apps/backend/data/pizza_day_poap_codes.txt` (gitignored). One
 * URL per line; blank lines and lines starting with `#` are ignored. The
 * file path can be overridden via the POAP_CODES_FILE env (useful for
 * staging dry-runs against a different pool).
 *
 * File order is preserved into `poap_codes.id` via `jsonb_array_elements
 * WITH ORDINALITY ORDER BY ord` — the seeder explicitly tells Postgres
 * to materialize the array in element order before INSERT. The SQL spec
 * does NOT guarantee that SERIAL allocation tracks `ORDER BY` from a
 * SELECT, but every Postgres version in practice assigns sequences in
 * the row processing order of a sorted SELECT, so file-line N becomes
 * `poap_codes.id = (lowest existing id for this event) + N`. That's the
 * FIFO contract `claimPendingPoapInvite` relies on (`ORDER BY pc.id
 * LIMIT 1`). For Pizza Day the order is cosmetic — every attendee gets
 * a distinct mint URL — but the pin gives auditability ("code #1 went
 * to phone X at timestamp Y").
 *
 * Idempotent: `ON CONFLICT (claim_url) DO NOTHING` means re-running with
 * the same file is a no-op, and adding new URLs to the file then re-running
 * only inserts the new ones (restock-friendly).
 *
 * Run: `cd apps/backend && node ace db:seed --files=./database/seeders/poap_codes_seeder.ts`
 */
export default class extends BaseSeeder {
  async run() {
    const eventSlug = process.env.POAP_CODES_EVENT_SLUG || 'pizza-day-ctg-2026'
    const filePath =
      process.env.POAP_CODES_FILE || join(app.makePath('data'), 'pizza_day_poap_codes.txt')

    const event = (await db.from('events').where({ slug: eventSlug }).select('id').first()) as
      | { id: string }
      | undefined

    if (!event) {
      throw new Error(
        `poap_codes_seeder: event '${eventSlug}' not found — run pizza_day_seeder first.`
      )
    }

    let raw: string
    try {
      raw = readFileSync(filePath, 'utf8')
    } catch (err) {
      throw new Error(
        `poap_codes_seeder: cannot read ${filePath} — drop the URL list there first. (${(err as Error).message})`
      )
    }

    const urls = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))

    if (urls.length === 0) {
      console.log(`poap_codes_seeder: ${filePath} has no URLs; nothing to insert.`)
      return
    }

    // WITH ORDINALITY exposes the array position so the outer SELECT can
    // sort by it. Without this, jsonb_array_elements is set-returning with
    // unspecified order, and SERIAL allocation could be non-FIFO.
    // ON CONFLICT (claim_url) DO NOTHING dedupes both within this batch
    // (re-runs) and against any existing rows.
    const rows = urls.map((claim_url) => ({ event_id: event.id, claim_url }))
    const result = await db.rawQuery(
      `INSERT INTO poap_codes (event_id, claim_url)
       SELECT (v.j->>'event_id')::uuid, v.j->>'claim_url'
       FROM jsonb_array_elements(?::jsonb) WITH ORDINALITY AS v(j, ord)
       ORDER BY v.ord
       ON CONFLICT (claim_url) DO NOTHING
       RETURNING id`,
      [JSON.stringify(rows)]
    )

    const inserted = result.rows?.length ?? 0
    const skipped = urls.length - inserted
    console.log(
      `poap_codes_seeder: event=${eventSlug} loaded ${urls.length} URLs (${inserted} inserted, ${skipped} duplicate)`
    )
  }
}
