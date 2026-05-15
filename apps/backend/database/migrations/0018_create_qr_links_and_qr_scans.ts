import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * QR primitive v1.
 *
 * qr_links — durable metadata for every QR (pay/event/referral kinds).
 *            Owner identity anchored on user_preferences.phone_number.
 *            Event-kind QRs reference events.slug (UNIQUE NOT NULL there).
 *
 * qr_scans — append-only scan event log. NO FK on short_id so we can log
 *            failed lookups (not_found, invalid_version) for abuse signal.
 *            resolved_to_phone_number anchored on user_preferences when
 *            a scan ultimately leads to an onboarded user (written by the
 *            WhatsApp bot at link time).
 *
 * Spec: QR_SYSTEM_SPEC.md
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS qr_links (
          short_id            TEXT PRIMARY KEY,
          owner_phone_number  TEXT NOT NULL REFERENCES user_preferences(phone_number) ON DELETE CASCADE,
          kind                TEXT NOT NULL CHECK (kind IN ('pay', 'event', 'referral')),

          event_slug          TEXT REFERENCES events(slug) ON DELETE SET NULL,
          source_tag          TEXT,

          display_name        TEXT,

          scan_count          INTEGER NOT NULL DEFAULT 0,
          last_scanned_at     TIMESTAMPTZ,

          status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
          revoked_at          TIMESTAMPTZ,
          revoked_reason      TEXT,

          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

          CHECK (
            (kind = 'event' AND event_slug IS NOT NULL)
            OR (kind IN ('pay', 'referral') AND event_slug IS NULL)
          )
        )
      `)

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_qr_links_owner ON qr_links(owner_phone_number)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_qr_links_event ON qr_links(event_slug) WHERE event_slug IS NOT NULL`
      )

      // qr_scans is append-only. No FK on short_id so we can log scans against
      // unknown / never-existed short_ids (outcomes 'not_found', 'invalid_version').
      // Trade-off: lose referential integrity for valid short_ids in exchange for
      // being able to record abuse signal. Acceptable here because qr_scans is
      // append-only and short_id is a lookup key, not a relationship.
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS qr_scans (
          id                        BIGSERIAL PRIMARY KEY,
          short_id                  TEXT NOT NULL,
          scanned_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

          user_agent                TEXT,
          ip_hash                   TEXT,
          referer                   TEXT,
          device_class              TEXT CHECK (device_class IN ('mobile', 'desktop', 'unknown')),

          resolved_to_phone_number  TEXT REFERENCES user_preferences(phone_number) ON DELETE SET NULL,
          resolved_at               TIMESTAMPTZ,

          outcome                   TEXT NOT NULL CHECK (outcome IN (
                                      'redirected',
                                      'revoked',
                                      'not_found',
                                      'rate_limited',
                                      'invalid_version'
                                    ))
        )
      `)

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_qr_scans_short_id_time ON qr_scans(short_id, scanned_at DESC)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_qr_scans_outcome ON qr_scans(outcome) WHERE outcome != 'redirected'`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_qr_scans_resolved_phone ON qr_scans(resolved_to_phone_number) WHERE resolved_to_phone_number IS NOT NULL`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      // qr_scans first (matches up() creation order in reverse).
      await db.rawQuery('DROP TABLE IF EXISTS qr_scans')
      await db.rawQuery('DROP TABLE IF EXISTS qr_links')
    })
  }
}
