/**
 * Sippy 24h traffic + funnel audit — read-only.
 *
 * Operational summary of the last 24 hours across the surfaces that
 * matter for Pizza Day eve: onboarding funnel, refuels, sends, QR scans.
 * Output is meant to be eyeballed for anomalies, not exported. Phone
 * numbers are masked (last 4 digits only) in any per-row output.
 *
 * Read-only — runs SELECT-only queries against:
 *   user_preferences, phone_registry, qr_scans, qr_links,
 *   onchain.refuel_event, onchain.transfer, web_send_log
 *
 * Usage (from apps/backend):
 *   pnpm tsx scripts/audit_24h.ts
 *
 * Exit code:
 *   0  no anomalies flagged
 *   1  one or more sections flagged a yellow warning
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

const DATABASE_URL = process.env.DATABASE_URL
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
  cyan: (s: string) => (C ? `\x1b[36m${s}\x1b[0m` : s),
}

// Mask a phone like +573024078662 → +57***8662 (preserve country + last 4)
function mask(phone: string | null | undefined): string {
  if (!phone) return '?'
  const m = phone.match(/^(\+\d{1,3})(\d+)(\d{4})$/)
  return m ? `${m[1]}***${m[3]}` : phone.replace(/\d(?=\d{4})/g, '*')
}

let anyFlag = false
function flag(msg: string) {
  anyFlag = true
  console.log(`  ${c.yellow('⚠')} ${msg}`)
}
function ok(msg: string) {
  console.log(`  ${c.green('✓')} ${msg}`)
}
function info(msg: string) {
  console.log(`  ${c.dim('·')} ${c.dim(msg)}`)
}
function section(title: string) {
  console.log('')
  console.log(c.bold(c.cyan(title)))
}

async function main() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  console.log('')
  console.log(c.bold('Sippy 24h audit (read-only)'))
  console.log(
    c.dim(`  window: last 24h (epoch-seconds-based for phone_registry, timestamptz elsewhere)`)
  )

  // ─── Onboarding funnel ─────────────────────────────────────────
  section('1. Onboarding funnel (last 24h)')

  const cutoffSec = Math.floor(Date.now() / 1000) - 24 * 3600

  // phone_registry.created_at is BIGINT epoch seconds for recent rows but
  // a few legacy rows stored ms. Normalize inline so the "last 24h" filter
  // doesn't pull ancient ms-format rows into the funnel.
  const normalized = `(CASE WHEN created_at > 10000000000 THEN created_at / 1000 ELSE created_at END)`

  const funnel = await db.query<{
    active_phones: number
    wallets_created: number
    permissions_set: number
    stuck_wallets: number
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM user_preferences WHERE updated_at >= NOW() - INTERVAL '24 hours') AS active_phones,
       (SELECT COUNT(*)::int FROM phone_registry WHERE ${normalized} >= $1) AS wallets_created,
       (SELECT COUNT(*)::int FROM phone_registry WHERE ${normalized} >= $1 AND spend_permission_hash IS NOT NULL) AS permissions_set,
       (SELECT COUNT(*)::int FROM phone_registry WHERE ${normalized} >= $1 AND spend_permission_hash IS NULL) AS stuck_wallets`,
    [cutoffSec]
  )
  const f = funnel.rows[0]
  const completion =
    f.wallets_created > 0 ? Math.round((f.permissions_set / f.wallets_created) * 100) : null

  info(`active phones (user_preferences updated in 24h): ${f.active_phones}`)
  info(`wallets created: ${f.wallets_created}`)
  info(`permissions registered: ${f.permissions_set}`)
  if (f.wallets_created === 0) {
    info(`completion rate: n/a (no wallets created in window)`)
  } else if (completion! >= 80) {
    ok(`completion rate: ${completion}% (${f.permissions_set}/${f.wallets_created})`)
  } else {
    flag(
      `completion rate: ${completion}% (${f.permissions_set}/${f.wallets_created}) — investigate stuck wallets below`
    )
  }

  if (f.stuck_wallets > 0) {
    // List the stuck candidates (masked). Older than 5 min = more
    // suspicious — the createSpendPermission UserOp normally lands within
    // 30s, so anyone with wallet but no permission >5min is worth a look.
    // Some legacy rows store created_at as ms instead of seconds; normalize
    // in JS rather than SQL to dodge bigint overflow when both units mix.
    const stuck = await db.query<{
      phone_number: string
      wallet_address: string
      created_at: string
    }>(
      `SELECT phone_number, wallet_address, created_at::text AS created_at
       FROM phone_registry
       WHERE ${normalized} >= $1 AND spend_permission_hash IS NULL
       ORDER BY created_at DESC`,
      [cutoffSec]
    )
    if (stuck.rows.length > 0) {
      flag(`${stuck.rows.length} wallet(s) with no spend permission set in window:`)
      const nowSec = Math.floor(Date.now() / 1000)
      for (const r of stuck.rows.slice(0, 10)) {
        // Normalize: if value looks like ms (>1e12), divide by 1000.
        const raw = Number(r.created_at)
        const createdSec = raw > 1e12 ? Math.floor(raw / 1000) : raw
        const ageMin = Math.floor((nowSec - createdSec) / 60)
        const ageTag = ageMin > 5 ? c.red(`${ageMin}m`) : c.dim(`${ageMin}m`)
        console.log(
          `      ${mask(r.phone_number)}  ${r.wallet_address.slice(0, 10)}…  age=${ageTag}`
        )
      }
      if (stuck.rows.length > 10) console.log(`      … and ${stuck.rows.length - 10} more`)
    }
  } else {
    ok(`no stuck wallets`)
  }

  // ─── Refuels ───────────────────────────────────────────────────
  section('2. Gas refuels (on-chain, last 24h)')

  const refuels = await db.query<{
    total: number
    unique_users: number
    total_eth: string
    avg_eth: string
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(DISTINCT "user")::int AS unique_users,
       COALESCE(SUM(amount), 0)::text AS total_eth,
       COALESCE(AVG(amount), 0)::text AS avg_eth
     FROM onchain.refuel_event
     WHERE timestamp >= $1`,
    [cutoffSec]
  )
  const rf = refuels.rows[0]
  // amounts come back as numeric strings of wei; convert to ETH
  const ethFromWeiStr = (s: string) => Number(s) / 1e18
  const totalEth = ethFromWeiStr(rf.total_eth)
  const avgEth = ethFromWeiStr(rf.avg_eth)
  info(`refuels fired: ${rf.total}`)
  info(`unique recipients: ${rf.unique_users}`)
  info(`total ETH drained: ${totalEth.toFixed(6)} ETH`)
  if (rf.total > 0) {
    info(
      `avg drip: ${avgEth.toFixed(8)} ETH ${avgEth === 0.00005 ? c.green('(matches current refuelAmount)') : c.yellow('(differs from current refuelAmount 0.00005)')}`
    )
  }

  // ─── Sends ─────────────────────────────────────────────────────
  section('3. USDC sends (last 24h)')

  // web_send_log = backend-side record of every attempt (some without tx_hash if they errored)
  const sendsAttempt = await db.query<{ attempted: number; with_tx: number }>(
    `SELECT
       COUNT(*)::int AS attempted,
       COUNT(tx_hash)::int AS with_tx
     FROM web_send_log
     WHERE created_at >= NOW() - INTERVAL '24 hours'`
  )
  const sa = sendsAttempt.rows[0]
  info(`backend send attempts (web_send_log): ${sa.attempted}`)
  if (sa.attempted > 0) {
    const successPct = Math.round((sa.with_tx / sa.attempted) * 100)
    if (successPct >= 90)
      ok(`completion: ${successPct}% (${sa.with_tx}/${sa.attempted} got tx_hash)`)
    else
      flag(
        `completion: ${successPct}% (${sa.with_tx}/${sa.attempted}) — investigate web_send_log rows with NULL tx_hash`
      )
  } else {
    info(`completion: n/a (no attempts in window)`)
  }

  // onchain.transfer = indexer-confirmed transfers
  const sendsOnchain = await db.query<{ total: number; unique_senders: number }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(DISTINCT "from")::int AS unique_senders
     FROM onchain.transfer
     WHERE timestamp >= $1`,
    [cutoffSec]
  )
  const so = sendsOnchain.rows[0]
  info(`on-chain transfers (onchain.transfer): ${so.total}`)
  info(`unique sender addresses: ${so.unique_senders}`)

  if (sa.with_tx > 0 && so.total > 0) {
    const ratio = (so.total / sa.with_tx).toFixed(2)
    info(`on-chain ÷ backend ratio: ${ratio} (>1 = indexer sees txs the bot didn't initiate; OK)`)
  }

  // ─── QR scans ──────────────────────────────────────────────────
  section('4. QR scans (last 24h)')

  const scans = await db.query<{ outcome: string; n: number }>(
    `SELECT outcome, COUNT(*)::int AS n
     FROM qr_scans
     WHERE scanned_at >= NOW() - INTERVAL '24 hours'
     GROUP BY outcome
     ORDER BY n DESC`
  )
  if (scans.rows.length === 0) {
    info(`no scans in window (expected pre-event)`)
  } else {
    for (const r of scans.rows) {
      info(`outcome=${r.outcome.padEnd(20)} ${r.n}`)
    }
    const totalScans = scans.rows.reduce((s, r) => s + r.n, 0)
    info(`total scans: ${totalScans}`)
  }

  // QR scans broken down by kind via join to qr_links
  const scansByKind = await db.query<{ kind: string; n: number }>(
    `SELECT ql.kind, COUNT(*)::int AS n
     FROM qr_scans qs
     JOIN qr_links ql ON ql.short_id = qs.short_id
     WHERE qs.scanned_at >= NOW() - INTERVAL '24 hours'
     GROUP BY ql.kind
     ORDER BY n DESC`
  )
  if (scansByKind.rows.length > 0) {
    info(`by kind: ${scansByKind.rows.map((r) => `${r.kind}=${r.n}`).join(', ')}`)
  }

  // ─── Pay-QR conversion (scan → transfer within 10 min) ────────
  section('5. Pay-QR conversion (last 24h, scan → transfer within 10m)')

  const conv = await db.query<{
    pay_scans: number
    resolved: number
  }>(
    `WITH pay_scans AS (
       SELECT qs.id, qs.scanned_at, qs.resolved_to_phone_number, qs.outcome
       FROM qr_scans qs
       JOIN qr_links ql ON ql.short_id = qs.short_id
       WHERE ql.kind = 'pay'
         AND qs.scanned_at >= NOW() - INTERVAL '24 hours'
     )
     SELECT
       COUNT(*)::int AS pay_scans,
       COUNT(*) FILTER (WHERE outcome = 'redirected')::int AS resolved
     FROM pay_scans`
  )
  const cv = conv.rows[0]
  info(`pay-QR scans: ${cv.pay_scans}`)
  if (cv.pay_scans > 0) {
    const resolvedPct = Math.round((cv.resolved / cv.pay_scans) * 100)
    if (resolvedPct >= 80) ok(`scan → redirect: ${resolvedPct}% (${cv.resolved}/${cv.pay_scans})`)
    else
      flag(
        `scan → redirect: ${resolvedPct}% (${cv.resolved}/${cv.pay_scans}) — investigate non-redirected outcomes`
      )
  } else {
    info(`(no scans yet — pre-event)`)
  }
  info(
    c.dim(
      `note: scan→transfer-within-Xm correlation requires joining wallet_address; skipped to keep audit read-only-fast`
    )
  )

  await db.end()

  // ─── Final summary ─────────────────────────────────────────────
  console.log('')
  if (anyFlag) {
    console.log(c.yellow(c.bold('Anomalies flagged. Review the ⚠ lines above before tomorrow.')))
    process.exit(1)
  } else {
    console.log(c.green(c.bold('No anomalies. Recent traffic looks healthy.')))
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('Audit fatal:', err)
  process.exit(2)
})
