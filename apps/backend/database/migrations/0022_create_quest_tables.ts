import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Sippy Quest — Pizza Day inauguration.
 *
 * Three tables, each with one clear job:
 *
 * 1. referral_codes        — per-user invite codes. One code per phone,
 *                            generated on-demand or at onboarding. Codes
 *                            are 6-char base32 (no ambiguous glyphs), the
 *                            unique constraint + retry-on-collision lives
 *                            in the generator (no DB-side enforcement of
 *                            "one per user" beyond the PK).
 *
 * 2. referral_attributions — write-once mapping of referee → referrer.
 *                            Created on onboarding completion when a
 *                            referral context exists. `referee_phone` is
 *                            the PK because a person can only be referred
 *                            ONCE; subsequent invite-token plays for the
 *                            same referee are no-ops.
 *
 * 3. pending_referrals     — durable holding area for users who scan a
 *                            [REF-XXXXXX] before they finish onboarding.
 *                            Without this table, attribution lives in
 *                            memory during the onboarding window and is
 *                            lost on restart. On onboarding completion
 *                            the event service drains the row into
 *                            referral_attributions in a single tx and
 *                            deletes the pending entry.
 *
 * NOT enforced in schema (lives in app + query):
 *   - Self-referral block (referrer ≠ referee) — app guard
 *   - Vendor/exchange exclusion for Task 1 — query-time filter
 *   - Event-attendance eligibility for draw — query-time filter
 *   - Max entries per user — query-time cap (env: QUEST_MAX_ENTRIES_PER_USER)
 *
 * This split keeps the schema permissive (writes succeed even when
 * eligibility is uncertain) and lets the draw query derive winners
 * at the latest possible moment, after all attendance is known.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // ── referral_codes ────────────────────────────────────────────────
      // PK is the code itself — short, looked up frequently by code.
      // phone_number is unique (one code per user, lifetime).
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS referral_codes (
          code           TEXT PRIMARY KEY,
          phone_number   TEXT NOT NULL REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
          event_slug     TEXT NOT NULL,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
      // One ACTIVE code per (user, event). A user can hold multiple codes
      // across different events (e.g. weekly campaigns post-Pizza-Day),
      // but only one per event. Using (phone, event) instead of phone
      // alone lets the same user have a code for each future weekly
      // challenge without us re-issuing or invalidating their pizza-day
      // code. Pizza Day MVP only ever has one event in flight.
      await db.rawQuery(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_phone_event
          ON referral_codes(phone_number, event_slug)
      `)

      // ── referral_attributions ─────────────────────────────────────────
      // referee_phone is PK — a person can only EVER be referred ONCE.
      // This is lifetime write-once attribution, not per-event: if you
      // were referred to Pizza Day by Alice, you cannot later be
      // re-attributed to Bob for a different campaign. event_slug here
      // records WHICH event the original attribution happened under, not
      // a re-attribution dimension. If post-event we want per-campaign
      // re-attribution, schema change required (composite PK).
      //
      // Foreign key to user_preferences via referrer/referee phones.
      // Event-attendance + vendor/exchange exclusion are enforced at
      // query time (the draw eligibility check joins on user_event_links)
      // — not in the schema, so attribution can be written before the
      // event-link row exists (referrer hasn't checked in yet at the
      // venue — covered in design notes).
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS referral_attributions (
          referee_phone   TEXT PRIMARY KEY REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
          referrer_phone  TEXT NOT NULL REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
          referral_code   TEXT NOT NULL REFERENCES referral_codes(code) ON DELETE RESTRICT,
          event_slug      TEXT NOT NULL,
          attributed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (referee_phone != referrer_phone)
        )
      `)
      await db.rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer
          ON referral_attributions(referrer_phone, event_slug)
      `)

      // ── pending_referrals ─────────────────────────────────────────────
      // Captured when [REF-XXX] arrives BEFORE the user finishes onboarding.
      // Drained on onboarding-complete by the event service. PK on phone
      // means a re-scan overwrites the earlier pending (last-scan wins).
      // No FK on phone — the user might not yet exist in user_preferences
      // at capture time, and we don't want to lose the attribution intent.
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS pending_referrals (
          phone_number    TEXT PRIMARY KEY,
          referral_code   TEXT NOT NULL REFERENCES referral_codes(code) ON DELETE CASCADE,
          event_slug      TEXT NOT NULL,
          captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`DROP TABLE IF EXISTS pending_referrals`)
      await db.rawQuery(`DROP TABLE IF EXISTS referral_attributions`)
      await db.rawQuery(`DROP TABLE IF EXISTS referral_codes`)
    })
  }
}
