/**
 * Pay-QR receive-path smoke — Pizza Day eve.
 *
 * Picks ONE active pay-QR from prod, verifies its owner has a wallet,
 * then hits the real backend scan endpoint (`POST /api/qr/scan/:shortId`)
 * and asserts the response is well-formed for the WhatsApp deep-link
 * landing the payer would get.
 *
 * Read-only on DB. Has ONE side effect: the scan endpoint writes a
 * single row into `qr_scans` (this is the production scan path; there
 * is no dry-run mode). Output flags this clearly so the audit script's
 * scan count doesn't get confused tomorrow.
 *
 * Validation:
 *   - QR row resolves and has status='active'
 *   - owner has a phone_registry row with wallet_address set
 *   - backend returns 200 with outcome='redirected'
 *   - waUrl is on wa.me with the bot number we expect
 *   - waUrl message text contains the bracketed shortId verbatim
 *   - displayLabel surfaces (INFO if null — not blocking)
 *
 * Usage (from apps/backend):
 *   pnpm tsx scripts/pay_qr_smoke.ts
 *
 * Exit:
 *   0  all assertions pass
 *   1  any assertion failed (release-blocking)
 */

import { readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'

loadEnvFile('.env')

function loadEnvFile(p: string) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const BACKEND_URL = process.env.PREFLIGHT_BACKEND_URL || 'https://backend.sippy.lat'
const DATABASE_URL = process.env.DATABASE_URL
const EXPECTED_BOT_NUMBER = process.env.WHATSAPP_BOT_NUMBER || process.env.SIPPY_WHATSAPP_NUMBER

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(2)
}

const C = process.stdout.isTTY
const c = {
  bold: (s: string) => (C ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (C ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (C ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (C ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (C ? `\x1b[31m${s}\x1b[0m` : s),
}

function mask(phone: string | null | undefined): string {
  if (!phone) return '?'
  const m = phone.match(/^(\+\d{1,3})(\d+)(\d{4})$/)
  return m ? `${m[1]}***${m[3]}` : phone
}

let failed = false
function ok(label: string, detail: string) {
  console.log(`  ${c.green('PASS')}  ${label} ${c.dim(detail)}`)
}
function fail(label: string, detail: string) {
  failed = true
  console.log(`  ${c.red('FAIL')}  ${label} ${c.dim(detail)}`)
}
function info(label: string, detail: string) {
  console.log(`  ${c.yellow('INFO')}  ${label} ${c.dim(detail)}`)
}

async function main() {
  console.log('')
  console.log(c.bold('Pay-QR receive-path smoke'))
  console.log(c.dim(`  backend: ${BACKEND_URL}`))
  console.log(
    c.yellow(
      `  NOTE: this run will create +1 row in qr_scans (real scan path, no dry-run available)`
    )
  )
  console.log('')

  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  // 1. Pick one active pay-QR. Prefer one that already has an owner so
  //    we can also validate the wallet linkage. Order by created_at DESC
  //    so we test the most recent (most likely to be the one printed for
  //    the event).
  const qrRes = await db.query<{
    short_id: string
    owner_phone_number: string | null
    created_at: string
  }>(
    `SELECT short_id, owner_phone_number, created_at::text
     FROM qr_links
     WHERE kind = 'pay' AND status = 'active'
       AND owner_phone_number IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
  if (qrRes.rows.length === 0) {
    fail(
      '1. pick active pay-QR with owner',
      'no rows in qr_links matching kind=pay/status=active/owner-set'
    )
    await db.end()
    process.exit(1)
  }
  const qr = qrRes.rows[0]
  ok('1. picked active pay-QR', `short_id=${qr.short_id} owner=${mask(qr.owner_phone_number)}`)

  // 2. Verify owner has a wallet in phone_registry.
  const ownerRes = await db.query<{
    wallet_address: string | null
    spend_permission_hash: string | null
  }>(`SELECT wallet_address, spend_permission_hash FROM phone_registry WHERE phone_number = $1`, [
    qr.owner_phone_number,
  ])
  if (ownerRes.rows.length === 0) {
    fail('2. owner exists in phone_registry', 'no row found')
  } else if (!ownerRes.rows[0].wallet_address) {
    fail('2. owner has wallet_address', 'wallet_address is null')
  } else {
    const owner = ownerRes.rows[0]
    ok(
      '2. owner wallet check',
      `wallet=${owner.wallet_address.slice(0, 10)}… perm=${owner.spend_permission_hash ? 'set' : 'null'}`
    )
  }

  // 3. Hit the real scan endpoint with a Node-flavored user agent. This
  //    is the production code path the /q/<shortId> page invokes, so it
  //    will write a qr_scans row.
  const scanReq = {
    deviceClass: 'desktop' as const,
    userAgent: 'sippy-prerelease-smoke/1.0',
    referer: null,
  }
  let scan: {
    outcome: string
    shortId: string
    kind: string | null
    waUrl: string
    displayLabel: string | null
  } | null = null
  try {
    const res = await fetch(`${BACKEND_URL}/api/qr/scan/${encodeURIComponent(qr.short_id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanReq),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      fail('3. backend /api/qr/scan responds 2xx', `HTTP ${res.status}`)
    } else {
      scan = await res.json()
      ok('3. backend /api/qr/scan responds 2xx', `HTTP ${res.status}`)
    }
  } catch (err) {
    fail('3. backend /api/qr/scan responds', err instanceof Error ? err.message : String(err))
  }

  if (!scan) {
    await db.end()
    process.exit(1)
  }

  // 4. Outcome must be 'redirected' (anything else means the receive path
  //    is broken or the QR has been revoked since we picked it).
  if (scan.outcome === 'redirected') {
    ok('4. scan outcome', `outcome=${scan.outcome}`)
  } else {
    fail('4. scan outcome', `expected 'redirected', got '${scan.outcome}'`)
  }

  // 5. waUrl shape.
  const waUrl = scan.waUrl ?? ''
  const isWaMe = waUrl.startsWith('https://wa.me/')
  if (!isWaMe) {
    fail('5. waUrl is wa.me link', `got '${waUrl.slice(0, 60)}…'`)
  } else {
    ok('5. waUrl is wa.me link', waUrl.slice(0, 70) + (waUrl.length > 70 ? '…' : ''))
  }

  // 6. Bot number in the URL matches what we expect (when known). The bot
  //    number in env may not be loaded locally; only check if available.
  if (EXPECTED_BOT_NUMBER) {
    const matchesBot = waUrl.includes(`/wa.me/${EXPECTED_BOT_NUMBER}`)
    if (matchesBot) {
      ok('6. waUrl points at expected bot number', `+${EXPECTED_BOT_NUMBER}`)
    } else {
      fail('6. waUrl points at expected bot number', `expected +${EXPECTED_BOT_NUMBER} in URL`)
    }
  } else {
    info('6. waUrl bot-number check', 'WHATSAPP_BOT_NUMBER not in local env — skipped')
  }

  // 7. Bracket token preserved: the encoded URL should contain the
  //    shortId wrapped in URL-encoded brackets (%5B...%5D). The bot's
  //    parser keys off this exact shape — drift would silently break the
  //    pay flow without erroring.
  const expectedBracket = `%5B${scan.shortId}%5D`
  if (waUrl.includes(expectedBracket)) {
    ok('7. bracket token preserved in waUrl', expectedBracket)
  } else {
    fail(
      '7. bracket token preserved in waUrl',
      `expected '${expectedBracket}' in waUrl — bot parser will not match`
    )
  }

  // 8. displayLabel — informational only. Some QRs are intentionally
  //    anonymous; this is non-blocking.
  if (scan.displayLabel) {
    ok('8. displayLabel surfaces (desktop fallback shows owner name)', `'${scan.displayLabel}'`)
  } else {
    info(
      '8. displayLabel',
      'null — desktop fallback will render generic "Abre Sippy para continuar" copy'
    )
  }

  // 9. kind echoed back as 'pay'.
  if (scan.kind === 'pay') {
    ok('9. response kind', `'pay'`)
  } else {
    fail('9. response kind', `expected 'pay', got '${scan.kind}'`)
  }

  await db.end()

  console.log('')
  if (failed) {
    console.log(c.red(c.bold('Pay-QR smoke FAILED — investigate above.')))
    process.exit(1)
  }
  console.log(c.green(c.bold('Pay-QR receive path is healthy.')))
  console.log(
    c.dim(
      `(Side-effect: 1 row added to qr_scans for short_id=${qr.short_id}. Subtract 1 when comparing audit_24h scan counts to organic traffic.)`
    )
  )
  process.exit(0)
}

main().catch((err) => {
  console.error('Smoke fatal:', err)
  process.exit(2)
})
