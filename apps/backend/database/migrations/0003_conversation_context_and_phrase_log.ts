import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Adds two things:
 *
 * 1. matched_phrase column on parse_log — stores a scrubbed, normalized
 *    version of the user's message for LLM-success rows only. Used to build
 *    a corpus of phrases the regex layer missed, so we can expand patterns
 *    post-launch. Sensitive tokens (phones, amounts) are replaced before
 *    insert; raw text never lands in the database.
 *
 * 2. conversation_context table — stores the last 2 user messages per phone
 *    number as a JSONB array. Only non-financial intents are written here.
 *    Included as prior messages in the LLM prompt to handle conversational
 *    follow-ups (e.g. "y desde cuándo?" after a balance check).
 */
export default class extends BaseSchema {
  async up() {
    // 1. Add matched_phrase to parse_log (nullable — only populated for llm-success)
    await this.db.rawQuery(`
      ALTER TABLE parse_log
      ADD COLUMN IF NOT EXISTS matched_phrase VARCHAR(300)
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_parse_log_matched_phrase
      ON parse_log (intent, matched_phrase)
      WHERE matched_phrase IS NOT NULL
    `)

    // 2. Conversation context (last 2 user messages per phone)
    await this.db.rawQuery(`
      CREATE TABLE IF NOT EXISTS conversation_context (
        phone_number TEXT PRIMARY KEY,
        messages     JSONB NOT NULL DEFAULT '[]',
        updated_at   TIMESTAMP DEFAULT NOW()
      )
    `)
  }

  async down() {
    // Intentionally empty — never drop production tables
  }
}
