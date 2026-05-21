/**
 * Sippy production preflight — Pizza Day eve release check.
 *
 * READ-ONLY. Does not mutate any prod state. Probes ~12 critical
 * surfaces and prints PASS / FAIL with a one-line detail per check.
 * Exit code:
 *   0  all checks pass
 *   1  at least one check failed (release-blocking)
 *
 * Surfaces covered:
 *   - backend health endpoint
 *   - prod DB reachable + latest migration
 *   - GasRefuel V1: balance, paused, minBalance/refuelAmount/cooldown
 *   - invariant: GAS_MIN_BALANCE_ETH ≤ refuelAmount ≤ minBalance
 *   - spender wallet ETH balance
 *   - Arbitrum RPC reachable + latest block freshness
 *   - active venue event QR exists for pizza-day-ctg-2026
 *   - at least one active pay QR resolves
 *   - WhatsApp Cloud API env vars present
 *   - FRONTEND_URL env present
 *   - SMART_MODE kill switch state (informational, not pass/fail)
 *
 * Usage (from apps/backend):
 *   pnpm tsx scripts/preflight.ts
 *
 * Override the production backend URL if you want to probe staging:
 *   BACKEND_URL=https://staging-backend.sippy.lat pnpm tsx scripts/preflight.ts
 */

import { readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'
import { ethers } from 'ethers'

// ─── env loader (no dotenv dep needed) ─────────────────────────────
loadEnvFile('.env')

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
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

// ─── config ────────────────────────────────────────────────────────
// Prod URLs are the defaults so the script reads prod state even when
// run from a dev .env (where FRONTEND_URL/BACKEND_URL may point at
// localhost). Override via PREFLIGHT_BACKEND_URL / PREFLIGHT_FRONTEND_URL
// to point at staging.
const BACKEND_URL = process.env.PREFLIGHT_BACKEND_URL || 'https://backend.sippy.lat'
const FRONTEND_URL = process.env.PREFLIGHT_FRONTEND_URL || 'https://www.sippy.lat'
const DATABASE_URL = process.env.DATABASE_URL
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
const GAS_REFUEL =
  process.env.REFUEL_CONTRACT_ADDRESS || '0xE4e5474E97E89d990082505fC5708A6a11849936'
const SPENDER = process.env.SIPPY_SPENDER_ADDRESS || '0xB396805F4C4eb7A45E237A9468FB647C982fBeb1'
const EVENT_SLUG = 'pizza-day-ctg-2026'

// Backend's hardcoded gas-readiness threshold. Must stay in sync with
// packages/shared/src/constants.ts. The invariant check below assumes
// this value, so update both if the constant ever changes.
const BACKEND_GAS_MIN = 0.00005

const PROD_BLOCK_STALE_S = 30 // alarm if latest block is older than this

// ─── output helpers ────────────────────────────────────────────────
const COLOR = process.stdout.isTTY
const c = {
  green: (s: string) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
}

type Result = { name: string; ok: boolean; detail: string; info?: boolean }
const results: Result[] = []

async function check(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string; info?: boolean }>
) {
  process.stdout.write(`  ${name} ... `)
  try {
    const r = await fn()
    results.push({ name, ...r })
    const tag = r.info ? c.yellow('INFO') : r.ok ? c.green('PASS') : c.red('FAIL')
    console.log(`${tag}  ${c.dim(r.detail)}`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, detail })
    console.log(`${c.red('FAIL')}  ${c.dim(detail)}`)
  }
}

// ─── checks ────────────────────────────────────────────────────────
async function main() {
  console.log('')
  console.log(c.bold('Sippy production preflight'))
  console.log(c.dim(`  backend: ${BACKEND_URL}`))
  console.log(c.dim(`  frontend: ${FRONTEND_URL}`))
  console.log(c.dim(`  rpc: ${redactRpc(RPC_URL)}`))
  console.log(c.dim(`  refuel: ${GAS_REFUEL}`))
  console.log(c.dim(`  spender: ${SPENDER}`))
  console.log('')

  // 1. backend health endpoint
  await check('1.  backend /api/health responds', async () => {
    const t0 = Date.now()
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })
    const dt = Date.now() - t0
    return {
      ok: res.ok,
      detail: `HTTP ${res.status} in ${dt}ms`,
    }
  })

  // 2. DB reachable + 3. latest migration
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await check('2.  DB reachable', async () => {
    if (!DATABASE_URL) return { ok: false, detail: 'DATABASE_URL not set' }
    await db.connect()
    const r = await db.query('SELECT 1 AS up')
    return { ok: r.rows[0]?.up === 1, detail: redactConnString(DATABASE_URL) }
  })

  await check('3.  latest migration applied', async () => {
    const r = await db.query('SELECT name, batch FROM adonis_schema ORDER BY id DESC LIMIT 1')
    const row = r.rows[0]
    return {
      ok: !!row?.name,
      detail: row ? `${row.name} (batch ${row.batch})` : 'no migrations found',
    }
  })

  // 4-7. on-chain V1 state (single batched RPC call)
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const v1 = new ethers.Contract(
    GAS_REFUEL,
    [
      'function minBalance() view returns (uint256)',
      'function refuelAmount() view returns (uint256)',
      'function refuelCooldown() view returns (uint256)',
      'function paused() view returns (bool)',
      'function contractBalance() view returns (uint256)',
    ],
    provider
  )

  let v1State = {
    balance: 0,
    minBalance: 0,
    refuelAmount: 0,
    cooldown: 0,
    paused: true,
  }

  await check('4.  GasRefuel V1 reachable + state', async () => {
    const [bal, minB, refuelA, cool, paused] = await Promise.all([
      v1.contractBalance(),
      v1.minBalance(),
      v1.refuelAmount(),
      v1.refuelCooldown(),
      v1.paused(),
    ])
    v1State = {
      balance: Number(ethers.utils.formatEther(bal)),
      minBalance: Number(ethers.utils.formatEther(minB)),
      refuelAmount: Number(ethers.utils.formatEther(refuelA)),
      cooldown: cool.toNumber(),
      paused,
    }
    return {
      ok: !paused,
      detail: `balance=${v1State.balance.toFixed(6)} ETH, paused=${paused}, cooldown=${v1State.cooldown}s`,
    }
  })

  await check('5.  GasRefuel invariant: BACKEND_MIN ≤ refuelAmount ≤ minBalance', async () => {
    const okLow = BACKEND_GAS_MIN <= v1State.refuelAmount
    const okHi = v1State.refuelAmount <= v1State.minBalance
    return {
      ok: okLow && okHi,
      detail: `${BACKEND_GAS_MIN} ≤ ${v1State.refuelAmount} ≤ ${v1State.minBalance}`,
    }
  })

  await check('6.  GasRefuel capacity: ≥ 200 drips for event', async () => {
    const capacity =
      v1State.refuelAmount > 0 ? Math.floor(v1State.balance / v1State.refuelAmount) : 0
    return {
      ok: capacity >= 200,
      detail: `${capacity} drips at ${v1State.refuelAmount} ETH each`,
    }
  })

  await check('7.  spender wallet ETH balance', async () => {
    const bal = await provider.getBalance(SPENDER)
    const eth = Number(ethers.utils.formatEther(bal))
    // ~$0.001 per UserOp = ~0.0000005 ETH/op. 0.002 ETH covers ~4,000 ops.
    return {
      ok: eth >= 0.002,
      detail: `${eth.toFixed(6)} ETH (~${Math.floor(eth / 0.0000005).toLocaleString()} UserOps)`,
    }
  })

  // 8. Arbitrum RPC fresh
  await check('8.  Arbitrum RPC latest block is fresh', async () => {
    const block = await provider.getBlock('latest')
    const ageS = Math.floor(Date.now() / 1000) - block.timestamp
    return {
      ok: ageS <= PROD_BLOCK_STALE_S,
      detail: `block ${block.number}, age ${ageS}s`,
    }
  })

  // 9. active venue event QR for pizza-day-ctg-2026
  await check("9.  active event QR exists (kind=event, source_tag='venue')", async () => {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n FROM qr_links
       WHERE kind = 'event' AND status = 'active'
         AND event_slug = $1 AND source_tag = 'venue'`,
      [EVENT_SLUG]
    )
    const n = r.rows[0]?.n ?? 0
    return { ok: n >= 1, detail: `${n} active venue QR(s) for ${EVENT_SLUG}` }
  })

  // 10. at least one active pay QR
  await check('10. at least one active pay QR exists', async () => {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n FROM qr_links WHERE kind = 'pay' AND status = 'active'`
    )
    const n = r.rows[0]?.n ?? 0
    return { ok: n >= 1, detail: `${n} active pay QR(s) prod-wide` }
  })

  // 11. WhatsApp env present (required vars only)
  await check('11. WhatsApp Cloud API env vars present', async () => {
    const required = [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
    ]
    const missing = required.filter((k) => !process.env[k])
    return {
      ok: missing.length === 0,
      detail: missing.length === 0 ? `all 4 required vars set` : `missing: ${missing.join(', ')}`,
    }
  })

  // 12. FRONTEND_URL + reachable
  await check('12. FRONTEND_URL reachable', async () => {
    const target = FRONTEND_URL
    const res = await fetch(target, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })
    return { ok: res.ok, detail: `${target} → HTTP ${res.status}` }
  })

  // INFO: kill switch state (not pass/fail — just visible)
  await check('--  SMART_MODE_ENABLED (kill switch state)', async () => {
    const v = process.env.SMART_MODE_ENABLED
    return {
      ok: true,
      info: true,
      detail: v === undefined ? 'unset (= disabled)' : `'${v}'`,
    }
  })

  await db.end()

  // ─── summary ───────────────────────────────────────────────────
  console.log('')
  const blocking = results.filter((r) => !r.info && !r.ok)
  const passed = results.filter((r) => !r.info && r.ok)
  const info = results.filter((r) => r.info)
  console.log(
    c.bold(
      `Summary: ${c.green(`${passed.length} pass`)}, ${
        blocking.length > 0 ? c.red(`${blocking.length} fail`) : '0 fail'
      }, ${info.length} info`
    )
  )
  if (blocking.length > 0) {
    console.log('')
    console.log(c.red(c.bold('Release-blocking:')))
    for (const r of blocking) console.log(c.red(`  - ${r.name}: ${r.detail}`))
    process.exit(1)
  }
  console.log(c.green('All checks green. Cleared for tomorrow.'))
  process.exit(0)
}

function redactConnString(s: string): string {
  return s.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/, '$1<redacted>$2')
}

function redactRpc(s: string): string {
  // Alchemy / Infura keys are the last path segment after /v2/ or similar.
  return s.replace(/\/v2\/[A-Za-z0-9_-]+/, '/v2/<redacted>')
}

main().catch((err) => {
  console.error('Preflight fatal:', err)
  process.exit(2)
})
