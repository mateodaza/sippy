import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Create the user_contacts table for the address book feature.
 * Uses raw SQL with IF NOT EXISTS so it's safe to run against production.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE IF NOT EXISTS user_contacts (
          id SERIAL PRIMARY KEY,
          owner_phone TEXT NOT NULL,
          alias TEXT NOT NULL,
          alias_display TEXT NOT NULL,
          target_phone TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'command',
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(owner_phone, alias)
        )
      `)
      await db.rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_user_contacts_owner ON user_contacts(owner_phone)
      `)

      // Hard-enforce 50-contact cap at the DB level via trigger.
      // This is the only reliable way to prevent races from overshooting.
      await db.rawQuery(`
        CREATE OR REPLACE FUNCTION enforce_contact_limit() RETURNS TRIGGER AS $$
        BEGIN
          -- LOCK the owner's rows to serialize concurrent inserts.
          -- Without this, two concurrent inserts under READ COMMITTED can both
          -- see count=49 and both succeed, overshooting the cap.
          PERFORM 1 FROM user_contacts WHERE owner_phone = NEW.owner_phone FOR UPDATE;
          IF (SELECT COUNT(*) FROM user_contacts WHERE owner_phone = NEW.owner_phone) >= 50 THEN
            RAISE EXCEPTION 'contact_limit_exceeded';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `)
      await db.rawQuery(`
        DROP TRIGGER IF EXISTS trg_contact_limit ON user_contacts
      `)
      await db.rawQuery(`
        CREATE TRIGGER trg_contact_limit
        BEFORE INSERT ON user_contacts
        FOR EACH ROW EXECUTE FUNCTION enforce_contact_limit()
      `)
    })
  }

  async down() {
    this.schema.dropTableIfExists('user_contacts')
  }
}
