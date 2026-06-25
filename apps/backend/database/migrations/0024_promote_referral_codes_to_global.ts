import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Sippy Quest — promote existing per-event referral codes to the
 * 'global' campaign namespace.
 *
 * Context (2026-05-18 design alignment): the Sippy Quest is a GLOBAL
 * mechanic, not event-scoped. A user has ONE referral code for life —
 * the same code carries them across Pizza Day, future weekly tasks,
 * and any later campaign. The `referral_codes.event_slug` column is
 * being repurposed as a "campaign namespace" rather than the actual
 * event identity; new code generation always uses the constant
 * GLOBAL_REFERRAL_CAMPAIGN = 'global'.
 *
 * Pre-this-migration: all existing codes were minted under
 * event_slug='pizza-day-ctg-2026' (the only running event). The user-
 * facing share links (sippy.lat/r/<code>) already work because the
 * bracket dispatcher looks codes up by code value, not by namespace —
 * but the next `mi codigo` call after the code generation refactor
 * would SELECT WHERE event_slug='global' and miss the existing row,
 * minting a brand-new code per user. That would break the share links
 * Mateo and early testers have already distributed.
 *
 * Fix: promote each existing non-global code to event_slug='global',
 * preserving the code VALUE so distributed share links keep resolving.
 * Idempotent: re-running this migration after later non-global
 * campaigns ship would only touch rows without an existing global
 * counterpart (the WHERE NOT EXISTS clause).
 *
 * Scope assumption (Pizza Day MVP): at most ONE non-global code per
 * user today. If a user has multiple non-global codes from different
 * campaigns at migration time, the first one (oldest by created_at)
 * wins promotion; the rest stay event-tagged as historical rows. They
 * don't break anything — the new lookup path only ever asks for
 * event_slug='global'.
 *
 * Data preserved: `referral_attributions` rows are NOT touched. Their
 * `event_slug` continues to record the event each attribution actually
 * landed under (e.g., 'pizza-day-ctg-2026'), which is what the scoring
 * CTE filters on at draw time.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Step 1: For users with NO global code, promote their oldest
      // non-global code to 'global'. Distinct on phone_number guarantees
      // at most one row per phone gets the bump even when the user has
      // multiple historical codes.
      await db.rawQuery(`
        UPDATE referral_codes
        SET event_slug = 'global'
        WHERE event_slug != 'global'
          AND code IN (
            SELECT DISTINCT ON (phone_number) code
            FROM referral_codes rc1
            WHERE event_slug != 'global'
              AND NOT EXISTS (
                SELECT 1 FROM referral_codes rc2
                WHERE rc2.phone_number = rc1.phone_number
                  AND rc2.event_slug = 'global'
              )
            ORDER BY phone_number, created_at ASC
          )
      `)
    })
  }

  async down() {
    // Intentional no-op. Reverting 'global' → 'pizza-day-ctg-2026' is
    // lossy (we don't know which rows were originally that slug vs
    // freshly minted as 'global'), and the previous state was a defect
    // by the new design anyway. Down passes through so a rollback of
    // later migrations doesn't have to re-think the namespace.
    this.defer(async (_db) => {
      // no-op
    })
  }
}
