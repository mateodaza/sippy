/**
 * Pimlico Sponsorship Webhook Controller (Gas → AA).
 *
 * Internet-reachable and it authorizes paymaster spend, so it is authenticated
 * FIRST — every request is verified with `@pimlico/webhook` over the RAW body before
 * ANY DB work. Verification is PER-POLICY: Pimlico signs each sponsorship policy's
 * webhook with that policy's OWN secret, so the verifier selects the secret from the
 * payload's `sponsorshipPolicyId` (free-send id → PIMLICO_WEBHOOK_SECRET, setup id →
 * PIMLICO_SETUP_WEBHOOK_SECRET) and checks ONLY that one — never blind-try-both, which
 * would let a leaked free-send secret authenticate setup payloads (and vice-versa).
 * Unsigned / tampered / wrong-secret / unknown-policy requests are rejected up front.
 *
 * LANE DISPATCH (B1.1c). Two lanes share one webhook:
 *   • free_send — spender pays a user's USDC transfer (slice 1).
 *   • setup     — sponsored cold deploy+approve onboarding (Track B / slice 2).
 * Dispatch is by DECODE (the op shape is ground truth; the policy id is
 * attacker-supplied): the op is either `[spend, transfer]` (free_send) or
 * `[approve]` (setup) — mutually exclusive by call count/targets/selectors — and
 * the matched lane's policy id is then a SECOND gate (an attacker can't get a
 * setup op sponsored under the free-send policy, or vice-versa). Both decodes are
 * strict (exact calls, target == SPM, no trailing calls, no ETH value).
 *
 * Authorization is the DB row, never the decode. After decode + the lane's
 * row-free sanity + policy + registered-user, we require a matching active
 * `gas_aa_prepared_user_ops` row by the full key (chain + entryPoint + sender +
 * sender_nonce + calls_hash + decoded_user + cap_bucket + init_code_hash for setup
 * + not-expired). `calls_hash` binds the exact spend/approve struct (incl.
 * allowance); `init_code_hash` binds the exact createAccount([userEOA, SPM], 0)
 * deploy. No row ⇒ `{ sponsor: false }`, even if the calldata looks valid.
 *
 * `sponsorship.finalized` — SPONSORSHIP-finalized (Pimlico committed to paying),
 * NOT a mined receipt: no tx hash. It NEVER marks a row `landed` (landing is the
 * submitter's waitForUserOperationReceipt) and makes no sponsorship decision — it
 * only stamps `sponsorship_finalized_at` on the matched row for observability.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { keccak256, type Hex } from 'viem'
// Import the built ESM entry directly — the package ships no usable types at the
// root specifier (see types/pimlico_webhook.d.ts). Node resolves this subpath.
import { pimlicoWebhookVerifier } from '@pimlico/webhook/_esm/index.js'
import { query } from '#services/db'
import { getUsdcAddress, SIPPY_SPENDER_ADDRESS } from '#config/network'
import { ENTRY_POINT_V06, SPEND_PERMISSION_MANAGER, getChainId } from '#services/gas_aa/config'
import { decodeFreeSendOp, decodeSetupOp, capBucketForAccount } from '#services/gas_aa/decode'
import { findActiveMatch, stampSponsorshipFinalized, type MatchKey } from '#services/gas_aa/ledger'

type Verifier = (headers: any, payload: string) => any

// Verifier is injectable so tests can exercise the post-auth DB-binding logic
// with a passthrough, while the auth-rejection tests use the real verifier.
let verifierOverride: Verifier | null = null
export function __setWebhookVerifierForTest(v: Verifier | null): void {
  verifierOverride = v
}

// Both lane policies are injectable so policy-binding tests are deterministic
// without depending on the gitignored .env.test. undefined = use env.
let freeSendPolicyOverride: string | undefined
let setupPolicyOverride: string | undefined
export function __setConfiguredPolicyForTest(v: string | null): void {
  freeSendPolicyOverride = v === null ? undefined : v
}
export function __setSetupPolicyForTest(v: string | null): void {
  setupPolicyOverride = v === null ? undefined : v
}
function freeSendPolicyId(): string {
  return freeSendPolicyOverride !== undefined
    ? freeSendPolicyOverride
    : env.get('PIMLICO_SPONSORSHIP_POLICY_ID', '')
}
function setupPolicyId(): string {
  if (setupPolicyOverride !== undefined) return setupPolicyOverride
  // getSetupSponsorshipPolicyId throws when unset; treat unset as "" (lenient bind,
  // mirroring free-send) so a not-yet-configured setup lane fails on the row, not here.
  return env.get('PIMLICO_SETUP_SPONSORSHIP_POLICY_ID', '')
}

// The per-policy webhook secrets are injectable for the same reason as the policy ids —
// the per-policy isolation tests drive the REAL verify() without the gitignored .env.test.
// undefined = use env.
let freeSendSecretOverride: string | undefined
let setupSecretOverride: string | undefined
export function __setWebhookSecretsForTest(
  v: { freeSend?: string | null; setup?: string | null } | null
): void {
  if (v === null) {
    freeSendSecretOverride = undefined
    setupSecretOverride = undefined
    return
  }
  if ('freeSend' in v) freeSendSecretOverride = v.freeSend === null ? undefined : v.freeSend
  if ('setup' in v) setupSecretOverride = v.setup === null ? undefined : v.setup
}
function freeSendSecret(): string {
  return freeSendSecretOverride !== undefined
    ? freeSendSecretOverride
    : env.get('PIMLICO_WEBHOOK_SECRET', '')
}
function setupSecret(): string {
  return setupSecretOverride !== undefined
    ? setupSecretOverride
    : env.get('PIMLICO_SETUP_WEBHOOK_SECRET', '')
}

/** Map the payload's sponsorship policy id to its OWN webhook secret. null ⇒ reject. */
function secretForPolicy(policyId: string): string | null {
  if (!policyId) return null
  if (policyId === freeSendPolicyId()) return freeSendSecret() || null
  if (policyId === setupPolicyId()) return setupSecret() || null
  return null // unknown / unconfigured policy id
}

function verify(headers: any, payload: string): any {
  if (verifierOverride) return verifierOverride(headers, payload)
  // Parse the raw body ONLY to choose which per-policy secret to check. The
  // pimlicoWebhookVerifier call below is the actual authentication gate — an attacker can
  // claim any policy id but can't forge a signature for a secret they don't hold.
  let policyId = ''
  try {
    policyId = String(extractObject(JSON.parse(payload))?.sponsorshipPolicyId ?? '')
  } catch {
    throw new Error('malformed webhook body')
  }
  const secret = secretForPolicy(policyId)
  if (!secret) throw new Error('unknown or unconfigured sponsorship policy id')
  return pimlicoWebhookVerifier(secret)(headers, payload) // wrong secret for this policy ⇒ throws ⇒ 401
}

/** Pimlico nests the payload under `data.object`; tolerate flatter shapes too. */
function extractObject(event: any): any {
  return event?.data?.object ?? event?.data ?? event ?? {}
}

// ── Lane abstraction ──────────────────────────────────────────────────────────
// Each lane: its configured policy id, a strict decode + row-free sanity (returns
// the bound fields or a reason), and any extra match-key fields. free_send is the
// slice-1 logic lifted verbatim; setup is new. The table shape keeps them from
// drifting. EVERY address compare lowercases BOTH sides (a checksummed
// phone_registry.wallet_address vs a possibly-lowercased op sender must still match).

interface LaneBind {
  account: string // permission.account (the user) — for isRegisteredUser + decoded_user
  callsHash: string
  initCodeHash?: string | null // setup only
}
interface Lane {
  name: 'free_send' | 'setup'
  policyId(): string
  /**
   * Fail closed when this lane's policy id is UNSET? The setup lane requires it: an
   * unset setup policy would let a (row-authorized) setup op ride the free-send
   * Pimlico policy — draining that budget and breaking per-lane accounting/caps. So
   * setup rejects → legacy fallback. free_send keeps its slice-1 leniency (its policy
   * is configured in prod; changing the live money path is out of scope).
   */
  policyRequired: boolean
  /** null = not this lane's shape (try the next). { reason } = this lane, rejected. */
  decode(userOp: any): LaneBind | { reason: string } | null
}

const FREE_SEND_LANE: Lane = {
  name: 'free_send',
  policyId: freeSendPolicyId,
  policyRequired: false, // slice-1 leniency preserved (policy configured in prod)
  decode(userOp) {
    const decoded = decodeFreeSendOp(userOp.callData, {
      spendManager: SPEND_PERMISSION_MANAGER,
      usdcAddress: getUsdcAddress(),
    })
    if (!decoded) return null // not the [spend, transfer] shape
    const sender = String(userOp.sender).toLowerCase()
    const configuredSpender = (SIPPY_SPENDER_ADDRESS || '').toLowerCase()
    // Enforce only when SIPPY_SPENDER_ADDRESS is a real address — a placeholder
    // self-disables this early check; the DB row binding stays the authority.
    if (/^0x[0-9a-f]{40}$/.test(configuredSpender) && sender !== configuredSpender) {
      return { reason: 'sender is not the Sippy spender' }
    }
    if (decoded.spender.toLowerCase() !== sender) return { reason: 'permission.spender != sender' }
    if (decoded.token.toLowerCase() !== getUsdcAddress().toLowerCase()) {
      return { reason: 'token is not USDC' }
    }
    if (decoded.spendAmount !== decoded.transferAmount) {
      return { reason: 'spend/transfer amount mismatch' }
    }
    return { account: decoded.account, callsHash: decoded.callsHash }
  },
}

const SETUP_LANE: Lane = {
  name: 'setup',
  policyId: setupPolicyId,
  policyRequired: true, // fail closed if the setup policy is unset → legacy fallback
  decode(userOp) {
    // Strict shape: EXACTLY one approve(SpendPermission) to the SPM, no extra calls,
    // value == 0 (all enforced inside decodeSetupOp).
    const decoded = decodeSetupOp(userOp.callData, { spendManager: SPEND_PERMISSION_MANAGER })
    if (!decoded) return null // not the single-[approve] shape (or had value / extra calls)
    const sender = String(userOp.sender).toLowerCase()
    // The op sender IS the account being granted the permission (cold deploy+approve).
    if (decoded.account.toLowerCase() !== sender) return { reason: 'permission.account != sender' }
    const configuredSpender = (SIPPY_SPENDER_ADDRESS || '').toLowerCase()
    if (
      /^0x[0-9a-f]{40}$/.test(configuredSpender) &&
      decoded.spender.toLowerCase() !== configuredSpender
    ) {
      return { reason: 'permission.spender is not the Sippy spender' }
    }
    if (decoded.token.toLowerCase() !== getUsdcAddress().toLowerCase()) {
      return { reason: 'token is not USDC' }
    }
    // The cold op MUST deploy (initCode present); its exact bytes are bound by
    // init_code_hash in the row match below.
    if (!userOp.initCode || userOp.initCode === '0x') return { reason: 'setup op has no initCode' }
    return {
      account: decoded.account,
      callsHash: decoded.callsHash,
      initCodeHash: keccak256(userOp.initCode as Hex),
    }
  },
}

const LANES: Lane[] = [FREE_SEND_LANE, SETUP_LANE]

/** Resolve the lane by SHAPE (which strict decode matches), then run its sanity. */
function resolveLane(
  userOp: any
): { lane: Lane; bind: LaneBind } | { lane: Lane; reason: string } | { reason: string } {
  for (const lane of LANES) {
    const r = lane.decode(userOp)
    if (r === null) continue // not this lane's shape — try the next
    if ('reason' in r) return { lane, reason: r.reason } // this lane, rejected — do NOT fall through
    return { lane, bind: r }
  }
  return { reason: 'not a sponsorable op (no lane matched)' }
}

export default class WebhookPimlicoController {
  async handle({ request, response }: HttpContext) {
    // P1 — authenticate over the RAW received bytes, before any DB work.
    const rawBody = request.raw() || ''
    let event: any
    try {
      event = verify(request.headers(), rawBody)
    } catch {
      logger.warn('pimlico webhook: signature verification failed')
      return response.status(401).json({ sponsor: false, error: 'invalid signature' })
    }

    const type = event?.type ?? event?.eventType
    if (type === 'user_operation.sponsorship.requested') {
      return this.handleRequested(event, response)
    }
    if (type === 'user_operation.sponsorship.finalized') {
      return this.handleFinalized(event, response)
    }
    // The dashboard "test webhook" ping — acknowledge, don't error.
    if (type === 'sponsorshipPolicy.webhook') {
      return response.json({ ok: true })
    }
    logger.warn('pimlico webhook: unknown event type %s', String(type))
    return response.status(400).json({ sponsor: false, error: 'unknown event type' })
  }

  /**
   * Authorize ONE exact prepared op. Returns `{ sponsor: true }` only when an
   * active, not-expired, fully-matching row exists; otherwise `{ sponsor: false }`.
   */
  private async handleRequested(event: any, response: HttpContext['response']) {
    const object = extractObject(event)
    const userOp = object.userOperation ?? object.userOp
    const chainId = Number(object.chainId ?? getChainId())
    const entryPoint = String(object.entryPoint ?? ENTRY_POINT_V06)

    if (!userOp?.callData || !userOp?.sender || userOp?.nonce === undefined) {
      return response.json({ sponsor: false, reason: 'malformed user operation' })
    }
    if (chainId !== getChainId()) return response.json({ sponsor: false, reason: 'wrong chain' })
    if (entryPoint.toLowerCase() !== ENTRY_POINT_V06.toLowerCase()) {
      return response.json({ sponsor: false, reason: 'wrong entryPoint' })
    }

    // Lane by decode (shape = ground truth), then the lane's policy (2nd gate).
    const resolved = resolveLane(userOp)
    if (!('lane' in resolved)) return response.json({ sponsor: false, reason: resolved.reason })
    if ('reason' in resolved) return response.json({ sponsor: false, reason: resolved.reason })
    const { lane, bind } = resolved

    const policyReason = policyMismatch(object, lane.policyId(), lane.policyRequired)
    if (policyReason) return response.json({ sponsor: false, reason: policyReason })

    // permission.account must be a registered Sippy user (lower()-both DB check).
    if (!(await isRegisteredUser(bind.account))) {
      return response.json({ sponsor: false, reason: 'permission.account is not registered' })
    }

    // DB binding — the authority. sender_nonce disambiguates repeated sends;
    // init_code_hash (setup) binds the exact deploy.
    const row = await findActiveMatch(matchKey(chainId, entryPoint, userOp, bind))
    if (!row) {
      logger.warn(
        'pimlico webhook: no matching prepared op (lane=%s sender=%s nonce=%s) — refusing',
        lane.name,
        String(userOp.sender).toLowerCase(),
        BigInt(userOp.nonce).toString()
      )
      return response.json({ sponsor: false, reason: 'no matching authorized op' })
    }

    logger.info('pimlico webhook: sponsoring prepared op %s (lane %s)', row.id, lane.name)
    return response.json({ sponsor: true })
  }

  /**
   * Sponsorship-finalized (NOT mined): never lands a row, makes no sponsorship
   * decision. Same lane dispatch, then stamp metadata on the matched row. No match
   * ⇒ no-op.
   */
  private async handleFinalized(event: any, response: HttpContext['response']) {
    const object = extractObject(event)
    const userOp = object.userOperation ?? object.userOp
    const chainId = Number(object.chainId ?? getChainId())
    const entryPoint = String(object.entryPoint ?? ENTRY_POINT_V06)

    if (!userOp?.callData || !userOp?.sender || userOp?.nonce === undefined) {
      return response.json({ ok: true, reconciled: false, reason: 'malformed user operation' })
    }
    const resolved = resolveLane(userOp)
    if (!('lane' in resolved))
      return response.json({ ok: true, reconciled: false, reason: resolved.reason })
    if ('reason' in resolved)
      return response.json({ ok: true, reconciled: false, reason: resolved.reason })
    const { lane, bind } = resolved

    const policyReason = policyMismatch(object, lane.policyId(), lane.policyRequired)
    if (policyReason) return response.json({ ok: true, reconciled: false, reason: policyReason })

    const stampedId = await stampSponsorshipFinalized(matchKey(chainId, entryPoint, userOp, bind))
    if (!stampedId) {
      logger.warn('pimlico webhook: finalized with no matching row — no-op')
      return response.json({ ok: true, reconciled: false, reason: 'no matching row' })
    }
    // Status is NOT changed here — landed is owned by waitForUserOperationReceipt.
    return response.json({ ok: true, reconciled: true })
  }
}

/** The full match key for a lane. `initCodeHash` is undefined for free_send (its
 *  rows have NULL init_code_hash → IS NOT DISTINCT FROM null matches). */
function matchKey(chainId: number, entryPoint: string, userOp: any, bind: LaneBind): MatchKey {
  return {
    chainId,
    entryPoint,
    sender: String(userOp.sender),
    senderNonce: BigInt(userOp.nonce).toString(),
    callsHash: bind.callsHash,
    decodedUser: bind.account,
    capBucket: capBucketForAccount(bind.account),
    initCodeHash: bind.initCodeHash,
  }
}

/**
 * Sponsorship-policy binding. When the lane's policy id is configured, the request
 * must carry exactly that id — fail closed on a missing OR mismatched id. When it is
 * UNSET, a `policyRequired` lane (setup) still fails closed — otherwise its op would
 * ride another lane's Pimlico policy (budget/accounting leak); a lenient lane
 * (free_send) allows it. Returns a rejection reason, or null.
 */
function policyMismatch(object: any, configured: string, policyRequired: boolean): string | null {
  if (!configured) return policyRequired ? 'sponsorship policy not configured' : null
  const incoming = object?.sponsorshipPolicyId ? String(object.sponsorshipPolicyId) : ''
  return incoming === configured ? null : 'unknown or missing sponsorship policy'
}

/**
 * A decoded permission.account is a Sippy user iff it's a registered wallet.
 * phone_registry.wallet_address is the authoritative registered-user set. lower()
 * BOTH sides — the column is checksummed, the op sender may arrive lowercased.
 */
async function isRegisteredUser(address: string): Promise<boolean> {
  const res = await query(`SELECT 1 FROM phone_registry WHERE LOWER(wallet_address) = $1 LIMIT 1`, [
    address.toLowerCase(),
  ])
  return res.rows.length > 0
}
