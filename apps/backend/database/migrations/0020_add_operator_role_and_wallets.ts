import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Operator role infrastructure for event-scoped USDC sends.
 *
 *  event_operator_wallets — one row per event. Stores the CDP smart-account
 *    handle (address + deterministic name) used as the event's USDC float.
 *    PK on event_slug enforces 1:1 (one operator login controls one wallet
 *    per event). `cdp_account_name` is the recovery key: as long as we
 *    preserve this string, CDP can re-hydrate the same wallet forever via
 *    `getOrCreateSmartAccount({ name })`. POLICY: never DELETE rows here —
 *    flip `active=false` instead. Drain endpoint relies on the row remaining
 *    to recover the wallet handle.
 *
 *  operator_sends — append-only audit log of every send attempt. status
 *    transitions: pending → submitted → confirmed | failed. tx_hash is null
 *    on rows that failed before submission.
 *
 * Spec: OPERATOR_FLOW_PLAN.md.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // event_operator_wallets — one operator wallet per event.
      // PK on event_slug enforces the 1:1 invariant (single shared operator
      // login per event, controlled physically).
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS event_operator_wallets (
          event_slug        TEXT PRIMARY KEY REFERENCES events(slug) ON DELETE CASCADE,
          operator_user_id  INTEGER NOT NULL REFERENCES admin_users(id),

          wallet_address    TEXT NOT NULL,
          cdp_account_name  TEXT NOT NULL UNIQUE,
          cdp_owner_name    TEXT NOT NULL,

          active            BOOLEAN NOT NULL DEFAULT TRUE,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_event_operator_wallets_op
         ON event_operator_wallets(operator_user_id)`
      )

      // Hard invariant: one operator can have at most ONE active event
      // assignment at a time. Without this index, `getOperatorWalletForUser`'s
      // ORDER BY updated_at DESC LIMIT 1 would silently mask older assignments
      // and the operator could lose access to an earlier event. Service-layer
      // also enforces this in provisionOperatorWallet, but the DB is the
      // ultimate source of truth — races between two admins assigning the
      // same operator simultaneously are caught here.
      await db.rawQuery(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_event_operator_wallets_active_op
         ON event_operator_wallets(operator_user_id)
         WHERE active = TRUE`
      )

      // operator_sends — audit log. Indexed for the two read patterns:
      // (1) "show recent sends for this event/operator" (dashboard, caps),
      // (2) "has this attendee received anything?" (attendees table join).
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS operator_sends (
          id            BIGSERIAL PRIMARY KEY,
          operator_id   INTEGER NOT NULL REFERENCES admin_users(id),
          event_slug    TEXT NOT NULL REFERENCES events(slug),

          from_address  TEXT NOT NULL,
          to_phone      TEXT NOT NULL REFERENCES user_preferences(phone_number),
          to_address    TEXT NOT NULL,

          amount_usdc   NUMERIC(18,6) NOT NULL,
          tx_hash       TEXT,
          status        TEXT NOT NULL CHECK (status IN ('pending','submitted','confirmed','failed')),
          error_reason  TEXT,

          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)

      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_operator_sends_event_time
         ON operator_sends(event_slug, created_at DESC)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_operator_sends_to_phone
         ON operator_sends(to_phone)`
      )
      await db.rawQuery(
        `CREATE INDEX IF NOT EXISTS idx_operator_sends_operator_time
         ON operator_sends(operator_id, created_at DESC)`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery('DROP TABLE IF EXISTS operator_sends')
      await db.rawQuery('DROP TABLE IF EXISTS event_operator_wallets')
    })
  }
}
