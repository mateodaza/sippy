/**
 * Pimlico Sponsorship Webhook Controller (Gas → AA, Phase 2 slice 1).
 *
 * Internet-reachable and it authorizes paymaster spend, so it is authenticated
 * FIRST — every request is verified with `@pimlico/webhook` over the RAW body
 * (PIMLICO_WEBHOOK_SECRET) before ANY DB work. Unsigned / tampered / wrong-secret
 * requests are rejected up front.
 *
 * Payload shape (per Pimlico docs): the event carries `data.object.{userOperation,
 * entryPoint, chainId, sponsorshipPolicyId, apiKey}`.
 *
 * `sponsorship.requested` — authorization is the DB row, never the decode. We
 * decode the batched `SpendPermissionManager.spend + USDC.transfer`, run
 * independent sanity (spender, token, registered account, policy id), then
 * require a matching active `gas_aa_prepared_user_ops` row by the full key
 * (chain + entryPoint + sender + sender_nonce + calls_hash + decoded_user +
 * cap_bucket + not-expired). No row ⇒ `{ sponsor: false }`, even if the calldata
 * looks valid.
 *
 * `sponsorship.finalized` — this is SPONSORSHIP-finalized (Pimlico committed to
 * paying), NOT a mined receipt: the payload has no tx hash. So it NEVER marks a
 * row `landed` — landing is driven solely by the submitter's
 * waitForUserOperationReceipt. We only stamp `sponsorship_finalized_at` metadata
 * on the matched row for reconciliation/observability.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
// Import the built ESM entry directly — the package ships no usable types at the
// root specifier (see types/pimlico_webhook.d.ts). Node resolves this subpath.
import { pimlicoWebhookVerifier } from '@pimlico/webhook/_esm/index.js'
import { query } from '#services/db'
import { getUsdcAddress, SIPPY_SPENDER_ADDRESS } from '#config/network'
import { ENTRY_POINT_V06, SPEND_PERMISSION_MANAGER, getChainId } from '#services/gas_aa/config'
import {
  decodeFreeSendOp,
  capBucketForAccount,
  type DecodedFreeSend,
} from '#services/gas_aa/decode'
import { findActiveMatch, stampSponsorshipFinalized, type MatchKey } from '#services/gas_aa/ledger'

type Verifier = (headers: any, payload: string) => any

// Verifier is injectable so tests can exercise the post-auth DB-binding logic
// with a passthrough, while the auth-rejection tests use the real verifier.
let verifierOverride: Verifier | null = null
export function __setWebhookVerifierForTest(v: Verifier | null): void {
  verifierOverride = v
}

// The configured sponsorship policy is injectable so policy-binding tests are
// deterministic without depending on the gitignored .env.test. null = use env.
let configuredPolicyOverride: string | undefined
export function __setConfiguredPolicyForTest(v: string | null): void {
  configuredPolicyOverride = v === null ? undefined : v
}
function configuredPolicyId(): string {
  return configuredPolicyOverride !== undefined
    ? configuredPolicyOverride
    : env.get('PIMLICO_SPONSORSHIP_POLICY_ID', '')
}

function verify(headers: any, payload: string): any {
  if (verifierOverride) return verifierOverride(headers, payload)
  const secret = env.get('PIMLICO_WEBHOOK_SECRET', '')
  if (!secret) throw new Error('PIMLICO_WEBHOOK_SECRET not set')
  return pimlicoWebhookVerifier(secret)(headers, payload)
}

/** Pimlico nests the payload under `data.object`; tolerate flatter shapes too. */
function extractObject(event: any): any {
  return event?.data?.object ?? event?.data ?? event ?? {}
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
    // Must be our chain + EntryPoint.
    if (chainId !== getChainId()) {
      return response.json({ sponsor: false, reason: 'wrong chain' })
    }
    if (entryPoint.toLowerCase() !== ENTRY_POINT_V06.toLowerCase()) {
      return response.json({ sponsor: false, reason: 'wrong entryPoint' })
    }
    // Bind to OUR sponsorship policy. When PIMLICO_SPONSORSHIP_POLICY_ID is
    // configured, the request MUST carry exactly that id — fail closed on a
    // missing or mismatched id (only lenient when we have nothing to bind to).
    const policyReason = policyMismatch(object)
    if (policyReason) {
      return response.json({ sponsor: false, reason: policyReason })
    }

    const decoded = this.decodeAndSanityCheck(userOp)
    if ('reason' in decoded) {
      return response.json({ sponsor: false, reason: decoded.reason })
    }
    // permission.account must be a registered Sippy user (DB check; finalized
    // skips this since a matched row was already authorized against a real user).
    if (!(await isRegisteredUser(decoded.account))) {
      return response.json({ sponsor: false, reason: 'permission.account is not registered' })
    }

    // DB binding — the authority. sender_nonce disambiguates repeated sends.
    const row = await findActiveMatch(this.matchKey(chainId, entryPoint, userOp, decoded))
    if (!row) {
      logger.warn(
        'pimlico webhook: no matching prepared op (sender=%s nonce=%s) — refusing sponsorship',
        String(userOp.sender).toLowerCase(),
        BigInt(userOp.nonce).toString()
      )
      return response.json({ sponsor: false, reason: 'no matching authorized op' })
    }

    logger.info('pimlico webhook: sponsoring prepared op %s', row.id)
    return response.json({ sponsor: true })
  }

  /**
   * Sponsorship-finalized (NOT mined): never lands a row. Stamp metadata on the
   * matched row for reconciliation. No match ⇒ no-op.
   */
  private async handleFinalized(event: any, response: HttpContext['response']) {
    const object = extractObject(event)
    const userOp = object.userOperation ?? object.userOp
    const chainId = Number(object.chainId ?? getChainId())
    const entryPoint = String(object.entryPoint ?? ENTRY_POINT_V06)

    if (!userOp?.callData || !userOp?.sender || userOp?.nonce === undefined) {
      return response.json({ ok: true, reconciled: false, reason: 'malformed user operation' })
    }
    const policyReason = policyMismatch(object)
    if (policyReason) {
      return response.json({ ok: true, reconciled: false, reason: policyReason })
    }
    const decoded = this.decodeAndSanityCheck(userOp)
    if ('reason' in decoded) {
      return response.json({ ok: true, reconciled: false, reason: decoded.reason })
    }
    const stampedId = await stampSponsorshipFinalized(
      this.matchKey(chainId, entryPoint, userOp, decoded)
    )
    if (!stampedId) {
      logger.warn('pimlico webhook: finalized with no matching row — no-op')
      return response.json({ ok: true, reconciled: false, reason: 'no matching row' })
    }
    // Status is NOT changed here — landed is owned by waitForUserOperationReceipt.
    return response.json({ ok: true, reconciled: true })
  }

  /**
   * Decode + run the independent (row-free) sanity checks shared by both event
   * types. Returns the decode on success, or `{ reason }` on rejection.
   */
  private decodeAndSanityCheck(userOp: any): DecodedFreeSend | { reason: string } {
    const decoded = decodeFreeSendOp(userOp.callData, {
      spendManager: SPEND_PERMISSION_MANAGER,
      usdcAddress: getUsdcAddress(),
    })
    if (!decoded) return { reason: 'not a free-send op' }

    const sender = String(userOp.sender).toLowerCase()
    const configuredSpender = (SIPPY_SPENDER_ADDRESS || '').toLowerCase()
    // Enforce only when SIPPY_SPENDER_ADDRESS is a real address — a placeholder
    // self-disables this early check; the DB row binding (sender must equal the
    // authorized row's sender) stays the authority regardless.
    if (/^0x[0-9a-f]{40}$/.test(configuredSpender) && sender !== configuredSpender) {
      return { reason: 'sender is not the Sippy spender' }
    }
    if (decoded.spender.toLowerCase() !== sender) {
      return { reason: 'permission.spender != sender' }
    }
    if (decoded.token.toLowerCase() !== getUsdcAddress().toLowerCase()) {
      return { reason: 'token is not USDC' }
    }
    if (decoded.spendAmount !== decoded.transferAmount) {
      return { reason: 'spend/transfer amount mismatch' }
    }
    return decoded
  }

  private matchKey(
    chainId: number,
    entryPoint: string,
    userOp: any,
    decoded: DecodedFreeSend
  ): MatchKey {
    return {
      chainId,
      entryPoint,
      sender: String(userOp.sender),
      senderNonce: BigInt(userOp.nonce).toString(),
      callsHash: decoded.callsHash,
      decodedUser: decoded.account,
      capBucket: capBucketForAccount(decoded.account),
    }
  }
}

/**
 * Sponsorship-policy binding. When PIMLICO_SPONSORSHIP_POLICY_ID is configured,
 * the request must carry exactly that id — fail closed on a missing OR mismatched
 * id. Lenient only when nothing is configured to bind against. Returns a
 * rejection reason, or null to allow.
 */
function policyMismatch(object: any): string | null {
  const configured = configuredPolicyId()
  if (!configured) return null
  const incoming = object?.sponsorshipPolicyId ? String(object.sponsorshipPolicyId) : ''
  return incoming === configured ? null : 'unknown or missing sponsorship policy'
}

/**
 * A decoded permission.account is a Sippy user iff it's a registered wallet.
 * phone_registry.wallet_address is the authoritative registered-user set (the
 * user's embedded CDP wallet).
 */
async function isRegisteredUser(address: string): Promise<boolean> {
  const res = await query(`SELECT 1 FROM phone_registry WHERE LOWER(wallet_address) = $1 LIMIT 1`, [
    address.toLowerCase(),
  ])
  return res.rows.length > 0
}
