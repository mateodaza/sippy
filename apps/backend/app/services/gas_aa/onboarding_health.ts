/**
 * Gas → AA — onboarding-health monitor (daily, read-only).
 *
 * Mirrors the gas_aa reconciler's scheduled-job + structured-log alert pattern
 * (providers/scheduler_provider.ts; alerts are `logger.error({ alert: '…' }, msg)` lines
 * the team already watches). One job, two parts.
 *
 * Part A (always) — rolling 7-day onboarding success rate from phone_registry. Alerts
 * when the rate < 0.90 with reg_7d >= 5 (suppress low-volume noise; no divide on reg=0);
 * emits a weekly summary (Mondays) even when healthy so the number stays visible.
 *
 * Part B (only when GAS_AA_ONBOARD_ENABLED — sponsored onboards) — per newly-completed
 * onboard in the last ~48h, audit the on-chain shape: sponsored (Pimlico paymaster, not
 * self-paid), no GasRefuel drip, exactly one well-formed grant. While the flag is OFF
 * every onboard is legacy by design (self-paid + dripped), so Part B would false-alarm —
 * hence the gate. The integrity audit catches a *silently-wrong* onboard (done in the DB
 * but the sponsored path misbehaved: legacy fallback, re-drip, double-grant).
 *
 * Read-only — SELECT + RPC reads only, never a write. Deps are injectable so the metric
 * and audit logic are unit-testable without a live chain or DB.
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { createPublicClient, http, parseAbiItem, decodeEventLog, parseUnits, type Hex } from 'viem'
import { query } from '#services/db'
import { getRpcUrl, NETWORK, USDC_ADDRESSES, SIPPY_SPENDER_ADDRESS } from '#config/network'
import {
  ENTRY_POINT_V06,
  SPEND_PERMISSION_MANAGER,
  PIMLICO_PAYMASTER,
  getViemChain,
} from '#services/gas_aa/config'
import { isGasAaOnboardEnabled } from '#services/gas_aa/flag'

export const SUCCESS_THRESHOLD = 0.9
export const MIN_VOLUME = 5
export const AUDIT_WINDOW_MS = 48 * 60 * 60 * 1000
const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const SUMMARY_DOW = 1 // Monday (UTC) — the weekly-summary day

const lc = (s: string | null | undefined) => (s ?? '').toLowerCase()
const pct = (r: number | null) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`)

// ── shapes ───────────────────────────────────────────────────────────────────
export interface OnboardCounts {
  reg7d: number
  done7d: number
}
export interface NewlyDoneOnboard {
  account: string // phone_registry.wallet_address (checksummed)
  dailyLimit: number | null // the registered limit = the expected on-chain allowance
  setupTxHash: string | null // gas_aa landed setup row meta.tx_hash (null ⇒ no sponsored op)
  userEoa: string | null // gas_aa setup row user_eoa (the owner the browser signed with)
}
export interface GrantStruct {
  account: string
  spender: string
  token: string
  allowance: bigint
}
export interface OnChainAudit {
  paymaster: string | null // the setup op's UserOperationEvent.paymaster (from the setup tx)
  grant: GrantStruct | null // the account's SpendPermissionApproved struct in the setup tx
  // Bounded-window count of SpendPermissionApproved for this account+spender+token — the
  // duplicate-GRANT detector. Counting grants (not UserOps) means a normal post-onboard
  // send/settings op never false-alarms; only a real second grant does.
  grantCount: number
}
export interface EoaState {
  balanceWei: bigint
  nonce: number
}
export type IntegrityCheck =
  | 'missing_setup_row'
  | 'self_paid'
  | 'gas_refuel_drip'
  | 'owner_eoa_funded'
  | 'duplicate_or_malformed_grant'
  | 'grant_fields_mismatch'
export interface IntegrityMiss {
  account: string
  check: IntegrityCheck
  detail: Record<string, unknown>
}

// ── Part A: pure metric + threshold ──────────────────────────────────────────
export interface HealthEval {
  rate: number | null
  stuck: number
  alert: boolean
}
export function evaluateHealth(c: OnboardCounts): HealthEval {
  const { reg7d, done7d } = c
  if (reg7d === 0) return { rate: null, stuck: 0, alert: false } // no volume → no divide, no alarm
  const rate = done7d / reg7d
  const stuck = reg7d - done7d
  const alert = reg7d >= MIN_VOLUME && rate < SUCCESS_THRESHOLD
  return { rate, stuck, alert }
}

// ── Part B: pure per-onboard integrity audit ─────────────────────────────────
export function auditOnboard(
  o: NewlyDoneOnboard,
  chain: OnChainAudit | null,
  eoa: EoaState | null,
  hasRefuel: boolean
): IntegrityMiss[] {
  const misses: IntegrityMiss[] = []
  const miss = (check: IntegrityCheck, detail: Record<string, unknown> = {}) =>
    misses.push({ account: o.account, check, detail })

  // No landed setup row while sponsored onboarding is on ⇒ the sponsored path didn't run
  // (legacy fallback / self-paid). The absence IS the signal; nothing on-chain to audit.
  if (!o.setupTxHash || !chain) {
    miss('missing_setup_row')
    return misses
  }

  // 1. Sponsored, not self-paid — paymaster must be Pimlico's, not 0x0.
  if (lc(chain.paymaster) === ZERO_ADDR || lc(chain.paymaster) !== lc(PIMLICO_PAYMASTER)) {
    miss('self_paid', { paymaster: chain.paymaster })
  }

  // 2. No GasRefuel drip — no refuel_event for the account, and the owner EOA never funded
  //    or transacted (balance 0, nonce 0). Owner-EOA sub-check only when the EOA is known.
  if (hasRefuel) miss('gas_refuel_drip')
  if (o.userEoa && eoa && (eoa.balanceWei > 0n || eoa.nonce > 0)) {
    miss('owner_eoa_funded', { balanceWei: eoa.balanceWei.toString(), nonce: eoa.nonce })
  }

  // 3. Exactly one well-formed grant for the account — `grantCount` is the bounded-window
  //    SpendPermissionApproved count (account+spender+token), so a duplicate GRANT (not a
  //    normal send) is what trips this; `grant` is the setup-tx struct we field-check.
  const g = chain.grant
  if (chain.grantCount !== 1 || g === null) {
    miss('duplicate_or_malformed_grant', { grantCount: chain.grantCount, hasGrant: g !== null })
  } else {
    const expected = o.dailyLimit !== null ? parseUnits(String(o.dailyLimit), 6) : null
    if (
      lc(g.account) !== lc(o.account) ||
      lc(g.spender) !== lc(SIPPY_SPENDER_ADDRESS) ||
      lc(g.token) !== lc(USDC_ADDRESSES[NETWORK]) ||
      (expected !== null && g.allowance !== expected)
    ) {
      miss('grant_fields_mismatch', {
        spender: g.spender,
        token: g.token,
        allowance: g.allowance.toString(),
        expectedAllowance: expected?.toString() ?? null,
      })
    }
  }
  return misses
}

// ── injectable deps ──────────────────────────────────────────────────────────
export interface OnboardingHealthDeps {
  countOnboards7d(): Promise<OnboardCounts>
  flagOn(): boolean
  /** Epoch-ms; sponsored onboarding's go-live cutoff. Onboards completed before it (legacy
   *  era) are NOT integrity-audited, even if still inside the 48h window. 0 = unset. */
  monitorStartMs(): number
  /** Onboards whose permission was recorded AT or AFTER `cutoffMs` (absolute epoch-ms). */
  listNewlyDone(cutoffMs: number): Promise<NewlyDoneOnboard[]>
  auditOnChain(account: string, setupTxHash: string): Promise<OnChainAudit>
  getEoaState(eoa: string): Promise<EoaState>
  hasRefuelEvent(account: string): Promise<boolean>
}

let deps: OnboardingHealthDeps = makeDefaultDeps()
export function __setOnboardingHealthDepsForTest(p: Partial<OnboardingHealthDeps>): void {
  deps = { ...deps, ...p }
}
export function __resetOnboardingHealthDeps(): void {
  deps = makeDefaultDeps()
}

export interface OnboardingHealthResult {
  reg7d: number
  done7d: number
  rate: number | null
  stuck: number
  audited: number
  misses: IntegrityMiss[]
}

/**
 * One daily pass. `now` is injected for the weekly-summary weekday gate (testable).
 */
export async function runOnboardingHealthOnce(
  now: Date = new Date(),
  d: OnboardingHealthDeps = deps
): Promise<OnboardingHealthResult> {
  // Part A — always.
  const counts = await d.countOnboards7d()
  const h = evaluateHealth(counts)
  const base = { rate: h.rate, reg_7d: counts.reg7d, done_7d: counts.done7d, stuck_7d: h.stuck }
  if (h.alert) {
    logger.error(
      { alert: 'gas-aa-onboarding-health', ...base, threshold: SUCCESS_THRESHOLD },
      `onboarding success ${pct(h.rate)} over 7d (${h.stuck} stuck of ${counts.reg7d}) — below ${pct(SUCCESS_THRESHOLD)}`
    )
  }
  if (now.getUTCDay() === SUMMARY_DOW) {
    logger.info(
      { summary: 'gas-aa-onboarding-health', ...base },
      `weekly onboarding health: ${pct(h.rate)} (${h.stuck} stuck of ${counts.reg7d})`
    )
  }

  // Part B — only for sponsored onboards (flag on); else every onboard is legacy by design.
  const allMisses: IntegrityMiss[] = []
  let audited = 0
  if (d.flagOn()) {
    // Audit window, floored at the monitor start so legacy-era onboards (completed before
    // the flag went live but still within 48h) aren't classified as sponsored failures.
    const cutoff = Math.max(now.getTime() - AUDIT_WINDOW_MS, d.monitorStartMs())
    const newly = await d.listNewlyDone(cutoff)
    audited = newly.length
    for (const o of newly) {
      let chain: OnChainAudit | null = null
      let eoa: EoaState | null = null
      let refuel = false
      try {
        if (o.setupTxHash) chain = await d.auditOnChain(o.account, o.setupTxHash)
        refuel = await d.hasRefuelEvent(o.account)
        if (o.userEoa) eoa = await d.getEoaState(o.userEoa)
      } catch (e) {
        // A transient RPC/DB read error shouldn't page — the next daily run retries.
        logger.warn(
          `gas_aa onboarding-health: audit read failed for ${o.account}: ${e instanceof Error ? e.message : e}`
        )
        continue
      }
      const misses = auditOnboard(o, chain, eoa, refuel)
      for (const m of misses) {
        logger.error(
          { alert: 'gas-aa-onboarding-integrity', account: m.account, check: m.check, ...m.detail },
          `onboard ${m.account} failed integrity: ${m.check}`
        )
      }
      allMisses.push(...misses)
    }
  }

  return {
    reg7d: counts.reg7d,
    done7d: counts.done7d,
    rate: h.rate,
    stuck: h.stuck,
    audited,
    misses: allMisses,
  }
}

// ── real dependency implementations ──────────────────────────────────────────
let publicClient: ReturnType<typeof createPublicClient> | null = null
function getPub() {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: getViemChain(), transport: http(getRpcUrl()) })
  }
  return publicClient
}

const USEROP_EVENT = parseAbiItem(
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
)
const APPROVED_EVENT = parseAbiItem(
  'event SpendPermissionApproved(bytes32 indexed hash, (address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData) spendPermission)'
)

async function realCountOnboards7d(): Promise<OnboardCounts> {
  // created_at is epoch MILLISECONDS → to_timestamp(created_at/1000).
  const res = await query(
    `SELECT
       count(*) FILTER (WHERE to_timestamp(created_at/1000) > now() - interval '7 days') AS reg_7d,
       count(*) FILTER (WHERE to_timestamp(created_at/1000) > now() - interval '7 days'
                        AND spend_permission_hash IS NOT NULL) AS done_7d
     FROM phone_registry`
  )
  return { reg7d: Number(res.rows[0].reg_7d), done7d: Number(res.rows[0].done_7d) }
}

async function realListNewlyDone(cutoffMs: number): Promise<NewlyDoneOnboard[]> {
  // Onboards whose permission was recorded at/after the cutoff. The setup op is joined via a
  // LATERAL that takes the MOST-RECENT landed setup row for the wallet AND only one landed
  // within the window — so a stale older sponsored row can't mask a later legacy fallback,
  // and multiple landed rows can't fan the onboard into duplicates. lower() both sides on
  // the address join (registry checksummed, sender lowercased).
  const res = await query(
    `SELECT pr.wallet_address, pr.daily_limit, op.user_eoa, op.tx_hash
       FROM phone_registry pr
       LEFT JOIN LATERAL (
         SELECT o.user_eoa, o.meta->>'tx_hash' AS tx_hash
           FROM gas_aa_prepared_user_ops o
          WHERE o.lane = 'setup' AND o.status = 'landed'
            AND LOWER(o.sender) = LOWER(pr.wallet_address)
            AND o.updated_at > to_timestamp($1::bigint / 1000.0)
          ORDER BY o.updated_at DESC
          LIMIT 1
       ) op ON true
      WHERE pr.spend_permission_hash IS NOT NULL
        AND pr.permission_created_at > $1`,
    [cutoffMs]
  )
  return res.rows.map((r: any) => ({
    account: r.wallet_address,
    dailyLimit: r.daily_limit !== null ? Number(r.daily_limit) : null,
    setupTxHash: r.tx_hash ?? null,
    userEoa: r.user_eoa ?? null,
  }))
}

async function realAuditOnChain(account: string, setupTxHash: string): Promise<OnChainAudit> {
  const pub = getPub()
  const receipt = await pub.getTransactionReceipt({ hash: setupTxHash as Hex })
  let paymaster: string | null = null
  let grant: GrantStruct | null = null
  for (const log of receipt.logs) {
    const addr = log.address.toLowerCase()
    if (addr === ENTRY_POINT_V06.toLowerCase()) {
      try {
        const ev = decodeEventLog({ abi: [USEROP_EVENT], data: log.data, topics: log.topics })
        if (ev.eventName === 'UserOperationEvent' && lc(ev.args.sender) === lc(account)) {
          paymaster = ev.args.paymaster
        }
      } catch {
        /* not a UserOperationEvent log */
      }
    } else if (addr === SPEND_PERMISSION_MANAGER.toLowerCase()) {
      try {
        const ev = decodeEventLog({ abi: [APPROVED_EVENT], data: log.data, topics: log.topics })
        if (
          ev.eventName === 'SpendPermissionApproved' &&
          lc(ev.args.spendPermission.account) === lc(account)
        ) {
          const p = ev.args.spendPermission
          grant = { account: p.account, spender: p.spender, token: p.token, allowance: p.allowance }
        }
      } catch {
        /* not a SpendPermissionApproved log */
      }
    }
  }
  const grantCount = await countGrantsForAccount(account, receipt.blockNumber)
  return { paymaster, grant, grantCount }
}

/**
 * Count SpendPermissionApproved for this account+spender+token in a tight window around the
 * setup block — the duplicate-GRANT detector. A regression double-grant (sponsored op +
 * legacy createSpendPermission) lands in the same onboarding session, so a few hours of
 * blocks bounds it; counting GRANTS (not UserOps) means a normal post-onboard send/settings
 * op never inflates the count. The account isn't indexed on the event, so we scan the
 * window and filter by the decoded struct.
 */
async function countGrantsForAccount(account: string, aroundBlock: bigint): Promise<number> {
  const pub = getPub()
  const span = 7200n * 4n // ~2h of Arbitrum blocks (~4/s)
  const from = aroundBlock > span ? aroundBlock - span : 0n
  // Cap toBlock at head — a just-landed onboard's block + span overshoots the chain tip,
  // which stricter RPCs reject. A fresh onboard's grants are all at/just-after `aroundBlock`.
  const latest = await pub.getBlockNumber()
  const upper = aroundBlock + span
  const to = upper < latest ? upper : latest
  const spender = SIPPY_SPENDER_ADDRESS
  const token = USDC_ADDRESSES[NETWORK]
  const logs = await pub.getLogs({
    address: SPEND_PERMISSION_MANAGER as Hex,
    event: APPROVED_EVENT,
    fromBlock: from,
    toBlock: to,
  })
  return logs.filter((l: any) => {
    const p = l.args?.spendPermission
    return (
      p &&
      lc(p.account) === lc(account) &&
      lc(p.spender) === lc(spender) &&
      lc(p.token) === lc(token)
    )
  }).length
}

async function realGetEoaState(eoa: string): Promise<EoaState> {
  const pub = getPub()
  const [balanceWei, nonce] = await Promise.all([
    pub.getBalance({ address: eoa as Hex }),
    pub.getTransactionCount({ address: eoa as Hex }),
  ])
  return { balanceWei, nonce }
}

async function realHasRefuelEvent(account: string): Promise<boolean> {
  // refuel_event."user" is the lowercased Refueled-event address = the smart account.
  const res = await query(
    `SELECT 1 FROM onchain.refuel_event WHERE LOWER("user") = LOWER($1) LIMIT 1`,
    [account]
  )
  return res.rows.length > 0
}

function realMonitorStartMs(): number {
  // The epoch-ms sponsored onboarding went live — set when GAS_AA_ONBOARD_ENABLED is flipped,
  // so the integrity audit ignores legacy-era onboards still inside the 48h window. Unset → 0.
  const n = Number(env.get('GAS_AA_ONBOARD_MONITOR_START_MS', '0'))
  return Number.isFinite(n) ? n : 0
}

function makeDefaultDeps(): OnboardingHealthDeps {
  return {
    countOnboards7d: realCountOnboards7d,
    flagOn: isGasAaOnboardEnabled,
    monitorStartMs: realMonitorStartMs,
    listNewlyDone: realListNewlyDone,
    auditOnChain: realAuditOnChain,
    getEoaState: realGetEoaState,
    hasRefuelEvent: realHasRefuelEvent,
  }
}
