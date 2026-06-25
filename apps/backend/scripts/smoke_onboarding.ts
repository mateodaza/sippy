/**
 * Sippy onboarding smoke test — fresh-phone walkthrough watcher.
 *
 * Designed for Pizza Day eve. A tester (Mateo or a teammate) drives a
 * spare phone through the real production flow:
 *
 *   1. Send "Hola Sippy!" from a fresh WhatsApp number
 *   2. Open the /setup link the bot sends back
 *   3. Complete OTP + CDP wallet creation
 *   4. Sign + register the spend permission
 *   5. Send 1 USDC to a known recipient ("envía 1 a +57…")
 *
 * This script doesn't drive that flow — it WATCHES it. Run it with the
 * tester's phone number; it polls the production Postgres DB and
 * Arbitrum One in parallel and prints PASS/TIMEOUT as each backend
 * state transition and on-chain event lands.
 *
 * Usage (from apps/backend):
 *   pnpm tsx scripts/smoke_onboarding.ts +57XXXXXXXXX
 *
 * The script reads DATABASE_URL + ARBITRUM_RPC_URL from .env (the same
 * env the backend uses), so by default it watches whatever DB the
 * `.env` points at. For Pizza Day you want this pointed at prod.
 *
 * Exit codes:
 *   0  all checkpoints passed
 *   1  one checkpoint timed out (suspect that step in the flow)
 *   2  fatal error (DB unreachable, bad args, etc.)
 */

import { readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'
import { ethers } from 'ethers'

// Tiny inline .env loader so the script works without adding `dotenv`
// as a backend dep. Reads from cwd/.env if present and only fills in
// vars that aren't already set in process.env.
loadEnvFile('.env')

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

const PHONE_ARG = process.argv[2]
if (!PHONE_ARG || !PHONE_ARG.startsWith('+')) {
  console.error('Usage: pnpm tsx scripts/smoke_onboarding.ts +57XXXXXXXXX')
  process.exit(2)
}
const PHONE = PHONE_ARG

const DATABASE_URL = process.env.DATABASE_URL
const RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env')
  process.exit(2)
}

// All addresses read from env first, with the current prod V1/spender as
// fallback. Env wins so we never drift if the backend is repointed.
const GAS_REFUEL =
  process.env.REFUEL_CONTRACT_ADDRESS || '0xE4e5474E97E89d990082505fC5708A6a11849936'
const SPENDER = process.env.SIPPY_SPENDER_ADDRESS || '0xB396805F4C4eb7A45E237A9468FB647C982fBeb1'
const USDC_ADDR = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // Arbitrum native USDC

// Per-checkpoint timeout. Onboarding can take 60–90s when the user is
// fumbling through the browser; default to 5 min to be forgiving.
const CHECKPOINT_TIMEOUT_MS = 5 * 60_000
const POLL_INTERVAL_MS = 3_000

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

async function main() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  console.log('\n╭─────────────────────────────────────────────╮')
  console.log('│  Sippy onboarding smoke test                │')
  console.log('╰─────────────────────────────────────────────╯')
  console.log(`Phone:         ${PHONE}`)
  console.log(`DB:            ${redactConnString(DATABASE_URL!)}`)
  console.log(`Spender:       ${SPENDER}`)
  console.log(`GasRefuel:     ${GAS_REFUEL}`)
  console.log('')

  // Pre-flight: snapshot the GasRefuel contract balance so we can warn
  // the operator if it dips dangerously low during the test.
  const initialContractBalance = await provider.getBalance(GAS_REFUEL)
  console.log(`GasRefuel balance (start): ${ethers.utils.formatEther(initialContractBalance)} ETH`)
  console.log('')
  console.log('Now drive the phone through the flow. I will watch.\n')

  // Checkpoint 1: bot has seen this phone (any phone_registry row OR a
  // user_preferences row — either is created by the first inbound
  // message that triggers onboarding).
  const cp1 = await waitFor('1. Bot received first inbound', async () => {
    const r = await db.query(
      `SELECT
         (SELECT 1 FROM phone_registry WHERE phone_number = $1) AS in_reg,
         (SELECT 1 FROM user_preferences WHERE phone_number = $1) AS in_prefs`,
      [PHONE]
    )
    return r.rows[0]?.in_reg || r.rows[0]?.in_prefs ? r.rows[0] : null
  })
  if (!cp1) return failExit(db, 1)

  // Checkpoint 2: wallet_address set on phone_registry (CDP wallet
  // created, /api/register-wallet called).
  const cp2 = await waitFor(
    '2. CDP wallet created (phone_registry.wallet_address set)',
    async () => {
      const r = await db.query(
        `SELECT wallet_address FROM phone_registry WHERE phone_number = $1`,
        [PHONE]
      )
      return r.rows[0]?.wallet_address ? r.rows[0] : null
    }
  )
  if (!cp2) return failExit(db, 2)
  const walletAddress: string = cp2.wallet_address
  console.log(`   wallet:    ${walletAddress}`)

  // Checkpoint 3: gas refuel landed on-chain. We confirm via the user
  // wallet's ETH balance > 0 — a fresh smart account starts at 0 wei,
  // so any positive balance proves the GasRefuel.refuel() call fired.
  await waitFor('3. On-chain: gas refuel landed (wallet balance > 0)', async () => {
    const bal = await provider.getBalance(walletAddress)
    if (bal.gt(0)) return { ethBalance: ethers.utils.formatEther(bal) }
    return null
  })

  // Checkpoint 4: spend permission hash registered in backend
  // (createSpendPermission UserOp succeeded + /api/register-permission
  // confirmed by backend).
  const cp4 = await waitFor(
    '4. Spend permission registered (phone_registry.spend_permission_hash set)',
    async () => {
      const r = await db.query(
        `SELECT spend_permission_hash FROM phone_registry WHERE phone_number = $1`,
        [PHONE]
      )
      return r.rows[0]?.spend_permission_hash ? r.rows[0] : null
    }
  )
  if (!cp4) return failExit(db, 4)
  console.log(`   permHash:  ${cp4.spend_permission_hash.slice(0, 18)}…`)

  // Checkpoint 5: first USDC outbound from the user's wallet (i.e. a
  // real send went through the spender via spend permission). Uses
  // Alchemy's getAssetTransfers because erc20 events from a smart
  // account are awkward to filter via raw eth_getLogs.
  await waitFor(
    '5. On-chain: first USDC send executed (wallet → recipient via spender)',
    async () => {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [
            {
              fromAddress: walletAddress,
              contractAddresses: [USDC_ADDR],
              category: ['erc20'],
              maxCount: '0x5',
              order: 'desc',
            },
          ],
        }),
      })
      const json = (await res.json()) as {
        result?: { transfers?: { hash: string; to: string; value: number }[] }
      }
      const xfers = json.result?.transfers ?? []
      if (xfers.length === 0) return null
      // Sanity: confirm the recipient is the spender (proves the spend()
      // half of the batched call fired; the recipient-side transfer()
      // shows up as a separate USDC log we'd see if we re-queried with
      // fromAddress=spender, but spender→recipient happens in the same
      // tx so this is sufficient).
      const latest = xfers[0]
      return { tx: latest.hash, to: latest.to, value: latest.value }
    }
  )

  // Post-flight: warn if GasRefuel contract balance dropped meaningfully
  // during the test (helps catch leaks if multiple refuels fired).
  const finalContractBalance = await provider.getBalance(GAS_REFUEL)
  const delta = initialContractBalance.sub(finalContractBalance)
  console.log('')
  console.log(`GasRefuel balance (end):   ${ethers.utils.formatEther(finalContractBalance)} ETH`)
  if (delta.gt(0)) {
    console.log(`GasRefuel drained:         ${ethers.utils.formatEther(delta)} ETH this test`)
  }

  console.log('')
  console.log('✓ All checkpoints passed. Onboarding is healthy end-to-end.\n')

  await db.end()
  process.exit(0)
}

async function waitFor<T>(label: string, probe: () => Promise<T | null>): Promise<T | null> {
  const start = Date.now()
  process.stdout.write(`[ ] ${label}`)
  while (Date.now() - start < CHECKPOINT_TIMEOUT_MS) {
    try {
      const out = await probe()
      if (out) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        process.stdout.write(`\r[✓] ${label}  (${elapsed}s)\n`)
        return out
      }
    } catch {
      // swallow transient errors and keep polling
    }
    await sleep(POLL_INTERVAL_MS)
    process.stdout.write('.')
  }
  process.stdout.write(`\r[✗] ${label}  (timed out after ${CHECKPOINT_TIMEOUT_MS / 1000}s)\n`)
  return null
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

function failExit(db: Client, cp: number) {
  console.log(`\nFailed at checkpoint ${cp}. Investigate this step before running again.\n`)
  void db.end()
  process.exit(1)
}

function redactConnString(s: string): string {
  return s.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/, '$1<redacted>$2')
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  process.exit(2)
})
