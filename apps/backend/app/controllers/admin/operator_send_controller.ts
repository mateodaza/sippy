/**
 * Operator Send Controller — admin pages and endpoints used by event-floor
 * operators to dispatch USDC to attendees in exchange for cash.
 *
 *   GET  /admin/operator/send                — Inertia form + balance + recent sends
 *   GET  /admin/operator/recipient/:phone    — JSON validation pre-send
 *   POST /admin/operator/send                — execute the send (atomic on-chain user op)
 *
 * Auth: `auth({guards:['web']})` + `adminRole({role:'operator'})` — operator
 * or admin. Admin users without an assigned wallet pre-render the page in a
 * read-only/preview state.
 *
 * Caps: per-tx (`OPERATOR_MAX_PER_TX_USDC`, default 100) and rolling 1h
 * (`OPERATOR_MAX_PER_HOUR_USDC`, default 500). Operator can request a raise
 * via env var without redeploy.
 *
 * Idempotency: send isn't idempotent — operator is in physical control,
 * the UI has a two-step confirm + recent-sends list to prevent dup clicks.
 * No replay-key in the body because that would obscure operator audit.
 *
 * Spec: OPERATOR_FLOW_PLAN.md.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import {
  getOperatorWalletForUser,
  getOperatorWalletBalance,
  getOperatorSpendInLastHour,
  submitUsdcSend,
  waitForOperatorSend,
  type EventOperatorWalletRow,
} from '#services/operator_wallet.service'
import { getUserWallet } from '#services/cdp_wallet.service'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { canonicalizePhone, maskPhone } from '#utils/phone'

const DEFAULT_MAX_PER_TX = 100
const DEFAULT_MAX_PER_HOUR = 500

function getCaps(): { perTx: number; perHour: number } {
  return {
    perTx: Number(env.get('OPERATOR_MAX_PER_TX_USDC') ?? DEFAULT_MAX_PER_TX),
    perHour: Number(env.get('OPERATOR_MAX_PER_HOUR_USDC') ?? DEFAULT_MAX_PER_HOUR),
  }
}

const sendBodyValidator = vine.compile(
  vine.object({
    recipientPhone: vine.string().trim().minLength(7).maxLength(20),
    amountUsdc: vine.number().positive(),
  })
)

interface RecentSend {
  id: string
  toPhone: string
  amountUsdc: number
  status: string
  txHash: string | null
  createdAt: string
}

interface ShowSendProps {
  event: { slug: string; name: string } | null
  wallet: {
    address: string
    balanceUsdc: number
    active: boolean
  } | null
  caps: {
    perTxUsdc: number
    perHourUsdc: number
    spentLastHourUsdc: number
  }
  recentSends: RecentSend[]
  /** When ?to=<phone> is provided, pre-fill the form. */
  prefillRecipientPhone: string | null
  flash: { error?: string; success?: string } | null
}

async function loadRecentSends(operatorUserId: number, eventSlug: string): Promise<RecentSend[]> {
  const rows = await db
    .from('operator_sends')
    .where({ operator_id: operatorUserId, event_slug: eventSlug })
    .orderBy('created_at', 'desc')
    .limit(10)
    .select('id', 'to_phone', 'amount_usdc', 'status', 'tx_hash', 'created_at')
  return rows.map((r: any) => ({
    id: String(r.id),
    toPhone: r.to_phone,
    amountUsdc: Number(r.amount_usdc),
    status: r.status,
    txHash: r.tx_hash,
    createdAt: r.created_at,
  }))
}

export default class OperatorSendController {
  /**
   * GET /admin/operator/send — Inertia page.
   *
   * Resolves the operator's assigned wallet (or null for admins not assigned
   * to any event — they get a read-only banner explaining the state).
   * Pre-fills the recipient phone if `?to=` query param is present, used
   * when navigating from the per-attendee Send button on the attendees table.
   */
  async showSend({ auth, request, inertia, session }: HttpContext) {
    const user = auth.user!
    const caps = getCaps()

    const wallet = await getOperatorWalletForUser(user.id)
    if (!wallet) {
      // Operator (or admin acting as operator) with no assignment. UI
      // surfaces this clearly — the form is disabled, send is blocked.
      const props: ShowSendProps = {
        event: null,
        wallet: null,
        caps: { perTxUsdc: caps.perTx, perHourUsdc: caps.perHour, spentLastHourUsdc: 0 },
        recentSends: [],
        prefillRecipientPhone: null,
        flash: (session.flashMessages.all() as ShowSendProps['flash']) ?? null,
      }
      return inertia.render('admin/operator_send', props)
    }

    // Pull event name for header display
    const event = await db
      .from('events')
      .where({ slug: wallet.eventSlug })
      .select('slug', 'name')
      .first()

    const [balanceUsdc, spentLastHourUsdc, recentSends] = await Promise.all([
      getOperatorWalletBalance(wallet.walletAddress),
      getOperatorSpendInLastHour(user.id),
      loadRecentSends(user.id, wallet.eventSlug),
    ])

    const prefillRaw = String(request.input('to', '') ?? '').trim()
    const prefill = prefillRaw ? canonicalizePhone(prefillRaw) : null

    const props: ShowSendProps = {
      event: event ? { slug: event.slug, name: event.name } : null,
      wallet: {
        address: wallet.walletAddress,
        balanceUsdc,
        active: wallet.active,
      },
      caps: {
        perTxUsdc: caps.perTx,
        perHourUsdc: caps.perHour,
        spentLastHourUsdc,
      },
      recentSends,
      prefillRecipientPhone: prefill,
      flash: (session.flashMessages.all() as ShowSendProps['flash']) ?? null,
    }
    return inertia.render('admin/operator_send', props)
  }

  /**
   * GET /admin/operator/recipient/:phone — JSON lookup.
   *
   * Pre-send validation called by the operator UI after they enter a phone.
   * Confirms:
   *   1. Phone canonicalizes
   *   2. User has a wallet (user_preferences row)
   *   3. User is linked to the OPERATOR'S event (user_event_links join)
   *
   * Returns `{ valid, reason?, attendee? }`. The reason strings are stable
   * so the UI can localize / branch on them.
   */
  async validateRecipient({ auth, params, response }: HttpContext) {
    const user = auth.user!
    const wallet = await getOperatorWalletForUser(user.id)
    if (!wallet) {
      return response.badRequest({ valid: false, reason: 'no-assigned-wallet' })
    }

    const phoneRaw = String(params.phone ?? '').trim()
    const phone = canonicalizePhone(phoneRaw)
    if (!phone) {
      return response.ok({ valid: false, reason: 'invalid-phone' })
    }
    const prefKey = await resolveUserPrefKey(phone)

    // Look up the link row + linked_at_step + source. Single query.
    const result = await db
      .from('user_event_links as uel')
      .join('events as e', 'e.id', 'uel.event_id')
      .where('uel.phone_number', prefKey)
      .where('e.slug', wallet.eventSlug)
      .select(
        'uel.linked_at_step',
        'uel.poap_claimed',
        'uel.metadata',
        'uel.created_at as linked_at',
        'e.slug as event_slug',
        'e.name as event_name'
      )
      .first()

    if (!result) {
      return response.ok({ valid: false, reason: 'not-in-event' })
    }

    return response.ok({
      valid: true,
      attendee: {
        phoneNumber: prefKey,
        linkedAtStep: result.linked_at_step,
        source: (result.metadata as any)?.source ?? null,
        poapClaimed: result.poap_claimed,
        linkedAt: result.linked_at,
      },
    })
  }

  /**
   * POST /admin/operator/send — execute the transfer.
   *
   * Flow:
   *   1. Validate body
   *   2. Resolve operator's wallet (must be active)
   *   3. Canonicalize recipient, look up wallet address from user_preferences
   *   4. Verify recipient is linked to operator's event
   *   5. Per-tx + per-hour cap checks
   *   6. INSERT operator_sends (status='pending')
   *   7. Call sendUsdcFromOperatorWallet
   *   8. UPDATE row (status='submitted', tx_hash) or (status='failed', error_reason)
   *   9. Return JSON
   *
   * Note on race: step 6 → 7 is not transactional with the on-chain send
   * (impossible). If the process dies between INSERT and the CDP call, the
   * row stays 'pending' forever. A janitor job can sweep ancient pending
   * rows but isn't critical for the event-day cadence.
   */
  async send({ auth, request, response }: HttpContext) {
    const user = auth.user!
    const caps = getCaps()

    const wallet = await getOperatorWalletForUser(user.id)
    if (!wallet) {
      return response.badRequest({ error: 'No event wallet assigned to this account' })
    }
    if (!wallet.active) {
      return response.badRequest({ error: 'Event wallet is revoked' })
    }

    let body: { recipientPhone: string; amountUsdc: number }
    try {
      body = await request.validateUsing(sendBodyValidator)
    } catch (err) {
      return response.badRequest({ error: 'Invalid request body', detail: (err as Error).message })
    }

    const recipientCanonical = canonicalizePhone(body.recipientPhone)
    if (!recipientCanonical) {
      return response.badRequest({ error: 'Invalid recipient phone' })
    }
    const recipientPrefKey = await resolveUserPrefKey(recipientCanonical)

    // Recipient must be linked to operator's event.
    const linkRow = await db
      .from('user_event_links as uel')
      .join('events as e', 'e.id', 'uel.event_id')
      .where('uel.phone_number', recipientPrefKey)
      .where('e.slug', wallet.eventSlug)
      .select('uel.phone_number')
      .first()
    if (!linkRow) {
      return response.badRequest({
        error: 'Recipient is not registered for this event',
      })
    }

    // Recipient must have a wallet to receive to (user_preferences → wallet_address).
    const recipientWallet = await getUserWallet(recipientPrefKey)
    if (!recipientWallet?.walletAddress) {
      return response.badRequest({
        error: 'Recipient wallet not found (phone_registry row missing)',
      })
    }

    // Per-tx cap is purely numeric, no race possible — check eagerly.
    if (body.amountUsdc > caps.perTx) {
      return response.badRequest({
        error: `Amount exceeds per-transaction cap of $${caps.perTx} USDC`,
      })
    }

    // ── Cap reservation: serialize concurrent sends per operator ─────────
    //
    // The hourly cap is computed against the SUM of operator_sends in the
    // last hour. Two concurrent POSTs would both read the same SUM, both
    // pass the cap, then both INSERT — bypassing the cap by 2× the limit.
    //
    // Solution: wrap the SUM-check + reservation-INSERT in a transaction
    // gated by a per-operator Postgres advisory lock. Concurrent sends
    // from the same operator serialize on the lock; concurrent sends from
    // different operators are unaffected. The lock is released on commit.
    //
    // The INSERT happens INSIDE the transaction with status='pending',
    // so the next concurrent send's SUM will see this reservation and
    // include it in its cap calculation.
    let sendRowId: number
    try {
      sendRowId = await db.transaction(async (trx) => {
        // Advisory lock keyed on operator id. pg_advisory_xact_lock blocks
        // until the lock is acquired; same-operator sends queue, others
        // proceed in parallel. Lock auto-released on commit/rollback.
        await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [user.id])

        const spent = (await trx
          .from('operator_sends')
          .where('operator_id', user.id)
          .whereIn('status', ['pending', 'submitted', 'confirmed'])
          .where('created_at', '>', trx.raw("now() - interval '1 hour'"))
          .sum('amount_usdc as total')
          .first()) as { total: string | number | null } | undefined
        const spentLastHour = Number(spent?.total ?? 0) || 0

        if (spentLastHour + body.amountUsdc > caps.perHour) {
          // Throw to roll back the (empty) transaction; controller catches.
          const err = new Error(
            `Hourly cap of $${caps.perHour} USDC exceeded (spent: ${spentLastHour}, attempted: ${body.amountUsdc})`
          )
          ;(err as any).code = 'HOURLY_CAP_EXCEEDED'
          ;(err as any).spentLastHour = spentLastHour
          throw err
        }

        const inserted = await trx
          .table('operator_sends')
          .insert({
            operator_id: user.id,
            event_slug: wallet.eventSlug,
            from_address: wallet.walletAddress,
            to_phone: recipientPrefKey,
            to_address: recipientWallet.walletAddress,
            amount_usdc: body.amountUsdc,
            status: 'pending',
          })
          .returning('id')
        return (inserted[0] as any).id ?? inserted[0]
      })
    } catch (err) {
      if ((err as any)?.code === 'HOURLY_CAP_EXCEEDED') {
        return response.status(429).send({
          error: (err as Error).message,
          spentLastHour: (err as any).spentLastHour,
          attempted: body.amountUsdc,
        })
      }
      logger.error({ operator_id: user.id, err }, 'operator_send.reserve-failed')
      return response.status(500).send({ error: 'Failed to reserve send slot' })
    }

    logger.info(
      `operator_send.start op=${user.id} event=${wallet.eventSlug} send_id=${sendRowId} to=${maskPhone(recipientPrefKey)} amount=${body.amountUsdc}`
    )

    // ── Submit phase ──────────────────────────────────────────────────────
    //
    // Two-step submit + wait, separated explicitly. The CRITICAL invariant:
    // once submitUsdcSend returns successfully, the userOp IS in the bundler
    // and CANNOT be retried without double-paying. We MUST persist its hash
    // BEFORE attempting any wait — if the wait throws (timeout, RPC blip),
    // the row stays in 'submitted' state with the userOpHash recorded, NOT
    // 'failed'. Operator UI sees "tx in flight, check explorer" and never
    // retries the send.
    //
    // 'failed' status is reserved EXCLUSIVELY for submission failures (CDP
    // API errors, validation errors before broadcast). Those are safely
    // retryable because no userOp ever made it on-chain.

    let submitted: Awaited<ReturnType<typeof submitUsdcSend>>
    try {
      submitted = await submitUsdcSend({
        wallet: wallet as EventOperatorWalletRow,
        toAddress: recipientWallet.walletAddress,
        amountUsdc: body.amountUsdc,
      })
    } catch (err) {
      const errorReason = (err as Error).message?.slice(0, 500) ?? 'submission error'
      await db
        .from('operator_sends')
        .where({ id: sendRowId })
        .update({
          status: 'failed',
          error_reason: errorReason,
          updated_at: db.raw('now()'),
        })
      logger.error(
        { operator_id: user.id, send_id: sendRowId, err },
        'operator_send.submit-failed (no userOp broadcast, safe to retry)'
      )
      return response.status(500).send({
        success: false,
        sendId: sendRowId,
        error: errorReason,
      })
    }

    // userOp is broadcast. Persist its hash IMMEDIATELY so a wait failure
    // doesn't lose the audit trail. From this point, status will never go
    // back to 'failed' — only to 'confirmed' on success.
    await db
      .from('operator_sends')
      .where({ id: sendRowId })
      .update({
        status: 'submitted',
        tx_hash: submitted.userOpHash || null,
        updated_at: db.raw('now()'),
      })

    // ── Wait phase ────────────────────────────────────────────────────────
    //
    // Best-effort confirmation. Failure here does NOT mark the row failed
    // — the userOp is already in flight and will eventually confirm or
    // fail at the EntryPoint, but that's a separate event. Operator gets
    // a "submitted" response with the hash; a future reconciliation job
    // can promote 'submitted' → 'confirmed' once the chain settles.

    try {
      const { txHash } = await waitForOperatorSend({
        smartAccount: submitted.smartAccount,
        userOpResult: submitted.userOpResult,
      })
      await db
        .from('operator_sends')
        .where({ id: sendRowId })
        .update({
          status: 'confirmed',
          tx_hash: txHash,
          updated_at: db.raw('now()'),
        })
      logger.info(`operator_send.confirmed op=${user.id} send_id=${sendRowId} tx=${txHash}`)
      return response.ok({
        success: true,
        sendId: sendRowId,
        txHash,
        status: 'confirmed',
      })
    } catch (waitErr) {
      // userOp IS in flight. Do not mark failed — that would let the
      // operator retry and double-pay. Return success with the userOp
      // hash and a note explaining the deferred confirmation.
      logger.warn(
        {
          operator_id: user.id,
          send_id: sendRowId,
          userOpHash: submitted.userOpHash,
          err: waitErr,
        },
        'operator_send.wait-timeout (userOp broadcast, awaiting on-chain confirmation)'
      )
      return response.ok({
        success: true,
        sendId: sendRowId,
        txHash: submitted.userOpHash,
        status: 'submitted',
        note: 'Transaction submitted but confirmation timed out. Check the userOp hash on the explorer or refresh in a few seconds.',
      })
    }
  }
}
