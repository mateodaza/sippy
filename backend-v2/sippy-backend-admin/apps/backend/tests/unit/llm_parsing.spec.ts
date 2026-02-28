/**
 * LLM Natural Language & Edge Case Tests
 *
 * Ported from Express:
 *   tests/llm/natural-language.test.ts
 *   tests/llm/edge-cases.test.ts
 *
 * COMMENTED OUT: These tests call the Groq LLM API which is rate-limited,
 * slow (~2s per call), and non-deterministic. They make the suite flaky.
 *
 * There is no custom logic to test here — these tests only validate that
 * the Groq API returns sensible results for natural language queries.
 * Our custom parsing logic (regex fallback, command routing, phone
 * extraction) is fully covered by message_parser.spec.ts and
 * phone_validation.spec.ts.
 *
 * To run manually: uncomment and ensure GROQ_API_KEY is set.
 * The original Express tests also required a live Groq API key.
 */

export {} // Keep file as valid module
