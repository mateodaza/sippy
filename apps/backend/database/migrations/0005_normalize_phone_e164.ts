import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // Step 0a — Pre-flight: collision audit for phone_registry
      const phoneRegistryCollisions = await db.rawQuery(`
        SELECT phone_number
        FROM phone_registry
        WHERE phone_number NOT LIKE '+%'
          AND ('+' || phone_number) IN (SELECT phone_number FROM phone_registry)
      `)
      if (phoneRegistryCollisions.rows.length > 0) {
        const collidingNumbers = phoneRegistryCollisions.rows
          .map((r: { phone_number: string }) => r.phone_number)
          .join(', ')
        throw new Error(
          `Migration aborted: phone_registry contains ${phoneRegistryCollisions.rows.length} row(s) that would collide ` +
            `during normalization (both bare and prefixed forms exist for the same logical number). ` +
            `Resolve manually before re-running.\nColliding rows: ${collidingNumbers}`
        )
      }

      // Step 0b — Pre-flight: collision audit for user_preferences
      const userPreferencesCollisions = await db.rawQuery(`
        SELECT phone_number
        FROM user_preferences
        WHERE phone_number NOT LIKE '+%'
          AND ('+' || phone_number) IN (SELECT phone_number FROM user_preferences)
      `)
      if (userPreferencesCollisions.rows.length > 0) {
        const collidingNumbers = userPreferencesCollisions.rows
          .map((r: { phone_number: string }) => r.phone_number)
          .join(', ')
        throw new Error(
          `Migration aborted: user_preferences contains ${userPreferencesCollisions.rows.length} row(s) that would collide ` +
            `during normalization (both bare and prefixed forms exist for the same logical number). ` +
            `Resolve manually before re-running.\nColliding rows: ${collidingNumbers}`
        )
      }

      // Step 0c — Pre-flight: E.164 validity audit for phone_registry
      // Checks both already-prefixed rows and bare rows (simulating the prefix) against the constraint regex.
      const phoneRegistryInvalid = await db.rawQuery(`
        SELECT phone_number
        FROM phone_registry
        WHERE
          (phone_number LIKE '+%' AND phone_number !~ '^\\+[1-9]\\d{6,14}$')
          OR
          (phone_number NOT LIKE '+%' AND ('+' || phone_number) !~ '^\\+[1-9]\\d{6,14}$')
      `)
      if (phoneRegistryInvalid.rows.length > 0) {
        const invalidNumbers = phoneRegistryInvalid.rows
          .map((r: { phone_number: string }) => r.phone_number)
          .join(', ')
        throw new Error(
          `Migration aborted: phone_registry contains ${phoneRegistryInvalid.rows.length} row(s) that would fail ` +
            `the E.164 CHECK constraint after normalization (malformed length, non-digits, or leading-zero country code). ` +
            `Resolve manually before re-running.\nInvalid rows: ${invalidNumbers}`
        )
      }

      // Step 0d — Pre-flight: E.164 validity audit for user_preferences
      const userPreferencesInvalid = await db.rawQuery(`
        SELECT phone_number
        FROM user_preferences
        WHERE
          (phone_number LIKE '+%' AND phone_number !~ '^\\+[1-9]\\d{6,14}$')
          OR
          (phone_number NOT LIKE '+%' AND ('+' || phone_number) !~ '^\\+[1-9]\\d{6,14}$')
      `)
      if (userPreferencesInvalid.rows.length > 0) {
        const invalidNumbers = userPreferencesInvalid.rows
          .map((r: { phone_number: string }) => r.phone_number)
          .join(', ')
        throw new Error(
          `Migration aborted: user_preferences contains ${userPreferencesInvalid.rows.length} row(s) that would fail ` +
            `the E.164 CHECK constraint after normalization (malformed length, non-digits, or leading-zero country code). ` +
            `Resolve manually before re-running.\nInvalid rows: ${invalidNumbers}`
        )
      }

      // Step 1 — UPDATE phone_registry: add + prefix to bare numbers
      await db.rawQuery(`
        UPDATE phone_registry
        SET phone_number = '+' || phone_number
        WHERE phone_number NOT LIKE '+%'
      `)

      // Step 2a — UPDATE user_preferences: add + prefix to bare numbers
      await db.rawQuery(`
        UPDATE user_preferences
        SET phone_number = '+' || phone_number
        WHERE phone_number NOT LIKE '+%'
      `)

      // Step 2b — Post-normalization join coherence audit
      const orphans = await db.rawQuery(`
        SELECT up.phone_number
        FROM user_preferences up
        LEFT JOIN phone_registry pr ON up.phone_number = pr.phone_number
        WHERE pr.phone_number IS NULL
      `)
      if (orphans.rows.length === 0) {
        console.log(
          '[SH-003] Join coherence: OK — all user_preferences rows have a matching phone_registry entry.'
        )
      } else {
        console.warn(
          `[SH-003] Warning: ${orphans.rows.length} user_preferences row(s) have no matching phone_registry entry after normalization. ` +
            `These are pre-existing orphans, not introduced by this migration.`
        )
      }

      // Step 3 — ADD CHECK constraint on phone_registry.phone_number
      await db.rawQuery(`
        ALTER TABLE phone_registry
        ADD CONSTRAINT chk_phone_registry_e164
        CHECK (phone_number ~ '^\\+[1-9]\\d{6,14}$')
      `)

      // Step 4 — ADD CHECK constraint on user_preferences.phone_number
      await db.rawQuery(`
        ALTER TABLE user_preferences
        ADD CONSTRAINT chk_user_preferences_e164
        CHECK (phone_number ~ '^\\+[1-9]\\d{6,14}$')
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      // Drop CHECK constraint on phone_registry
      await db.rawQuery(`
        ALTER TABLE phone_registry
        DROP CONSTRAINT IF EXISTS chk_phone_registry_e164
      `)

      // Drop CHECK constraint on user_preferences
      await db.rawQuery(`
        ALTER TABLE user_preferences
        DROP CONSTRAINT IF EXISTS chk_user_preferences_e164
      `)

      // NOTE: The + prefix is intentionally NOT stripped from phone_number data.
      // up() only adds + to bare numbers (WHERE phone_number NOT LIKE '+%'), but
      // rows that were already canonical (e.g. +573001234567) are left untouched.
      // After up() runs, all rows have + and are indistinguishable — stripping +
      // from every prefixed row would corrupt those pre-existing canonical rows.
      // The constraints are dropped; the data remains in normalized E.164 format.
    })
  }
}
