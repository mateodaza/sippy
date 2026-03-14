/**
 * Live LLM Tests — Hits Groq API directly
 *
 * Run with: npx tsx tests/unit/llm_live.spec.ts
 *
 * Reads GROQ_API_KEY from .env (not .env.test). Tests all three models:
 * - Llama 4 Scout (primary classifier)
 * - llama-3.1-8b-instant (normalizer)
 * - Qwen3-32b (fallback classifier)
 *
 * Uses ~15 API calls per run.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Groq from 'groq-sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')

// Read GROQ_API_KEY from .env (production key, not test key)
function loadApiKey(): string {
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(/^GROQ_API_KEY=(.+)$/m)
    if (!match) throw new Error('GROQ_API_KEY not found in .env')
    return match[1].trim()
  } catch (e) {
    console.error('Could not read .env file:', (e as Error).message)
    process.exit(1)
  }
}

const apiKey = loadApiKey()
const client = new Groq({ apiKey })

// ============================================================================
// Test runner
// ============================================================================

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(`${name}: ${msg}`)
    console.log(`  ❌ ${name}`)
    console.log(`     ${msg}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ============================================================================
// Prompts (mirrored from llm.service.ts)
// ============================================================================

const SYSTEM_PROMPT = `You are Sippy, a chill WhatsApp money assistant for Latin America.

Your job: parse the user's message into a structured command AND reply naturally when needed.

Available commands: balance, start, history, settings, about, help, unknown.
NOTE: "send" is NOT a valid command for you. Send commands are handled separately.

ABOUT SIPPY (use these facts — never guess):
- Send dollars to any phone number, right from WhatsApp
- Zero fees between Sippy users
- Transfers arrive in seconds
- Works in English, Spanish, and Portuguese
- Money stays in digital dollars, always worth $1

HOW TO SUGGEST ACTIONS (always in the user's language):
- Check balance → just say "saldo" (or "balance")
- Send money → say "enviar 5 a +57..."
- See history → "historial" (or "history")

Respond as JSON with this exact shape:
{
  "command": "balance" | "start" | "history" | "settings" | "about" | "help" | "unknown",
  "confidence": 0.0–1.0,
  "detectedLanguage": "en" | "es" | "pt",
  "message": "short natural reply"
}

Rules:
- Keep message to 1-2 sentences, casual, like texting a friend
- If unsure, use "unknown" with low confidence
- Never mention commands or technical terms to the user
- Answer in the user's language`

const NORMALIZER_PROMPT = `You normalize casual WhatsApp messages into a standard send command format.

Your ONLY job: rewrite their message into this exact format:
  enviar <amount> a <phone>

Rules:
- Extract the amount (number) and recipient (phone number or name)
- Output ONLY the normalized command, nothing else
- If you can't figure out the amount or recipient, output exactly: UNCLEAR
- Never add information that wasn't in the original message

Examples:
  "pasale 10 lucas al 3116613414" → "enviar 10 a 3116613414"
  "quiero mandarle plata a mi hermano" → UNCLEAR`

// ============================================================================
// Tests
// ============================================================================

async function run() {
  console.log('\n🔌 Groq API Live Tests\n')
  console.log(`   Primary: meta-llama/llama-4-scout-17b-16e-instruct`)
  console.log(`   Normalizer: llama-3.1-8b-instant`)
  console.log(`   Fallback: qwen/qwen3-32b`)
  console.log()

  // ------------------------------------------------------------------
  console.log('── Pre-flight ──')
  // ------------------------------------------------------------------

  await test('Groq API reachable with Llama 4 Scout', async () => {
    const res = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'say "ok"' }],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 10,
    })
    const text = res.choices[0]?.message?.content || ''
    assert(text.length > 0, 'empty response from Scout')
  })

  await test('Groq API reachable with llama-3.1-8b-instant', async () => {
    const res = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'say "ok"' }],
      model: 'llama-3.1-8b-instant',
      max_tokens: 10,
    })
    assert((res.choices[0]?.message?.content || '').length > 0, 'empty response from 8B')
  })

  await test('Groq API reachable with qwen/qwen3-32b', async () => {
    const res = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'say "ok"' }],
      model: 'qwen/qwen3-32b',
      max_tokens: 10,
    })
    assert((res.choices[0]?.message?.content || '').length > 0, 'empty response from Qwen')
  })

  // ------------------------------------------------------------------
  console.log('\n── Classifier (Llama 4 Scout) ──')
  // ------------------------------------------------------------------

  const classifierTests = [
    { input: 'how much money do I have?', expect: 'balance' },
    { input: 'cuánto tengo en mi cuenta?', expect: 'balance' },
    { input: 'show me my recent transactions', expect: 'history' },
    { input: 'qué es sippy? para qué sirve?', expect: 'about' },
    { input: 'necesito que me ayudes', expect: 'help' },
    { input: 'quiero empezar a usar sippy', expect: 'start' },
  ]

  for (const t of classifierTests) {
    await test(`"${t.input}" → ${t.expect}`, async () => {
      const res = await client.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: t.input },
        ],
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      })

      const raw = res.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(raw)
      assert(
        parsed.command === t.expect,
        `Expected "${t.expect}" but got "${parsed.command}" (confidence: ${parsed.confidence})\nFull response: ${raw}`
      )
    })
  }

  // ------------------------------------------------------------------
  console.log('\n── Normalizer (8B) ──')
  // ------------------------------------------------------------------

  async function normalize(text: string): Promise<string | null> {
    const res = await client.chat.completions.create({
      messages: [
        { role: 'system', content: NORMALIZER_PROMPT },
        { role: 'user', content: text },
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 60,
    })
    const result = res.choices[0]?.message?.content?.trim()
    if (!result || result === 'UNCLEAR' || result.length > 100) return null
    return result
  }

  await test('"pasale 10 lucas al 3116613414" → normalized send', async () => {
    const result = await normalize('pasale 10 lucas al 3116613414')
    assert(result !== null, 'normalizer returned null/UNCLEAR')
    assert(result!.includes('10'), `amount 10 missing: "${result}"`)
    assert(result!.includes('3116613414'), `phone missing: "${result}"`)
  })

  await test('"manda 50 barras al 3001234567" → normalized send', async () => {
    const result = await normalize('manda 50 barras al 3001234567')
    assert(result !== null, 'normalizer returned null/UNCLEAR')
    assert(result!.includes('50'), `amount 50 missing: "${result}"`)
    assert(result!.includes('3001234567'), `phone missing: "${result}"`)
  })

  await test('"I\'m drunk, manda 3 barras al 3116613414" → normalized', async () => {
    const result = await normalize("I'm drunk, manda 3 barras al 3116613414")
    assert(result !== null, 'normalizer returned null/UNCLEAR')
    assert(result!.includes('3'), `amount 3 missing: "${result}"`)
    assert(result!.includes('3116613414'), `phone missing: "${result}"`)
  })

  await test('"quiero mandarle plata a mi hermano" → UNCLEAR', async () => {
    const result = await normalize('quiero mandarle plata a mi hermano')
    assert(result === null, `Expected UNCLEAR, got: "${result}"`)
  })

  await test('"send 100 to my friend" → UNCLEAR or placeholder (no real phone)', async () => {
    const result = await normalize('send 100 to my friend')
    // Normalizer may return null (UNCLEAR) or a placeholder like "<phone number>"
    // Either way, the anti-injection check in the parser would reject it
    // because the placeholder doesn't exist in the original text
    if (result !== null) {
      // If it returned something, it should NOT contain a real phone number
      const hasRealPhone = /\d{7,}/.test(result)
      assert(!hasRealPhone, `Normalizer fabricated a real phone number: "${result}"`)
    }
  })

  // ------------------------------------------------------------------
  console.log('\n── Fallback Classifier (Qwen3-32b) ──')
  // ------------------------------------------------------------------

  await test('Qwen classifies "cuánto tengo?" → balance', async () => {
    const res = await client.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'cuánto tengo?' },
      ],
      model: 'qwen/qwen3-32b',
      temperature: 0.2,
      max_tokens: 512,
    })

    let raw = res.choices[0]?.message?.content || '{}'
    // Qwen wraps reasoning in <think>...</think> — strip it
    // Also handle incomplete think blocks (no closing tag)
    raw = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
    // Strip ```json blocks
    raw = raw.replace(/```json\s*/g, '').replace(/```/g, '').trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    assert(jsonMatch !== null, `No JSON found in Qwen response (after stripping think): ${raw.slice(0, 200)}`)
    const parsed = JSON.parse(jsonMatch![0])
    assert(parsed.command === 'balance', `Expected "balance" but Qwen returned "${parsed.command}"\n${raw.slice(0, 200)}`)
  })

  // ------------------------------------------------------------------
  console.log('\n── Response Personality ──')
  // ------------------------------------------------------------------

  const RESPONSE_PROMPT = `You are Sippy, a chill WhatsApp money assistant.
Reply to the user's message naturally. Keep it to 1-2 sentences max.
Be warm but brief — like a friend texting back. Use the user's language.
Never mention "commands" or technical terms.`

  await test('greeting response is natural and short (ES)', async () => {
    const res = await client.chat.completions.create({
      messages: [
        { role: 'system', content: RESPONSE_PROMPT },
        { role: 'user', content: 'hola! como estas?' },
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.7,
      max_tokens: 150,
    })
    const text = res.choices[0]?.message?.content || ''
    assert(text.length > 5, `response too short: "${text}"`)
    assert(text.length < 300, `response too long (${text.length} chars): "${text}"`)
    assert(!text.includes('Command'), 'should not mention "Command"')
  })

  await test('social reply is short (ES)', async () => {
    const res = await client.chat.completions.create({
      messages: [
        { role: 'system', content: RESPONSE_PROMPT },
        { role: 'user', content: 'gracias por todo!' },
      ],
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.7,
      max_tokens: 150,
    })
    const text = res.choices[0]?.message?.content || ''
    assert(text.length < 200, `social reply too long (${text.length} chars): "${text}"`)
  })

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`)

  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) {
      console.log(`  - ${f}`)
    }
  }

  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
