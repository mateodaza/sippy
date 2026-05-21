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
  getOperatorWalletForEvent,
  getOperatorWalletBalance,
  getOperatorSpendInLastHour,
  submitUsdcSend,
  waitForOperatorSend,
  type EventOperatorWalletRow,
} from '#services/operator_wallet.service'
import { getUserWallet } from '#services/cdp_wallet.service'
import { findUserPrefByPhone, resolveUserPrefKey } from '#utils/user_pref_lookup'
import { canonicalizePhone, maskPhone } from '#utils/phone'
import { type Lang } from '#utils/messages'
import {
  notifyPaymentReceived,
  notifyEventAnnouncement,
  formatOperatorDropBody,
} from '#services/notification.service'
import { claimPendingPoapInvite, releasePoapInvite } from '#services/event.service'
import { getAdminLang } from '#utils/admin_lang'
import { adminErrors } from '#utils/admin_messages'
import { isSuperAdmin } from '#utils/super_admin'
import type AdminUser from '#models/user'

/**
 * Resolve the wallet the request should operate against.
 *
 * Default path: the caller is an operator with an assigned wallet — load
 * THEIR wallet, ignore any `eventSlug` hint.
 *
 * Superadmin override: when the caller is `admin@sippy.lat` AND an explicit
 * `eventSlug` was provided, load the wallet for that event instead. This is
 * the only way an account without an operator assignment can act on a
 * per-event wallet (e.g. for a pre-event smoke send). Regular operators
 * never get to override — their hint is silently dropped, so they can't
 * accidentally drive funds out of a wallet they're not assigned to.
 *
 * All caps and audit columns downstream key off `wallet.operatorUserId`
 * so the wallet identity (not the caller's identity) drives counters.
 * Audit clarity for superadmin-initiated sends is intentionally deferred
 * to a future `initiated_by_user_id` column.
 */
async function resolveActiveWallet(
  user: AdminUser,
  eventHint: string | null
): Promise<{ wallet: EventOperatorWalletRow | null; override: boolean }> {
  if (eventHint && isSuperAdmin(user.email)) {
    const wallet = await getOperatorWalletForEvent(eventHint)
    return { wallet, override: true }
  }
  const wallet = await getOperatorWalletForUser(user.id)
  return { wallet, override: false }
}
import { sendPoapInviteIfPending } from '#services/poap_invite.service'

const DEFAULT_MAX_PER_TX = 100
const DEFAULT_MAX_PER_HOUR = 500
// Default ceiling for the operator's amount dropdown. The page hard-codes
// the base options [0.5, 1, 2, 3, 4, 5]; setting EVENT_LIMIT_USABLE_AIRDROP
// to a higher integer extends the menu by 1-USDC steps up to that ceiling
// (e.g. 8 → adds 6, 7, 8). Values <= 5 are ignored so the default menu is
// always preserved.
const DEFAULT_DROPDOWN_MAX_USDC = 5

/**
 * NaN-safe env-var → number. `Number('not-a-number')` returns NaN, and
 * `amount > NaN` is false — so a typo'd env (`OPERATOR_MAX_PER_TX_USDC=abc`)
 * would silently disable the cap. Reject any non-finite or non-positive
 * value and fall back to the default.
 */
function parseCapEnv(envName: string, dflt: number): number {
  const raw = env.get(envName)
  if (raw === undefined || raw === null || raw === '') return dflt
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : dflt
}

function getCaps(): { perTx: number; perHour: number; dropdownMaxUsdc: number } {
  // EVENT_LIMIT_USABLE_AIRDROP only widens the menu — never narrows it. If
  // someone sets it to 2 by mistake the operator still gets the default
  // $0.50–$5 options. Whole numbers only; we floor to the nearest int
  // because the menu extends in 1-USDC increments.
  const rawDropdownMax = parseCapEnv('EVENT_LIMIT_USABLE_AIRDROP', DEFAULT_DROPDOWN_MAX_USDC)
  const dropdownMaxUsdc = Math.max(DEFAULT_DROPDOWN_MAX_USDC, Math.floor(rawDropdownMax))
  return {
    perTx: parseCapEnv('OPERATOR_MAX_PER_TX_USDC', DEFAULT_MAX_PER_TX),
    perHour: parseCapEnv('OPERATOR_MAX_PER_HOUR_USDC', DEFAULT_MAX_PER_HOUR),
    dropdownMaxUsdc,
  }
}

const sendBodyValidator = vine.compile(
  vine.object({
    recipientPhone: vine.string().trim().minLength(7).maxLength(20),
    amountUsdc: vine.number().positive(),
    /**
     * Optional superadmin event override. Ignored unless the caller is the
     * superadmin. Lets admin@sippy.lat send through a per-event wallet they
     * aren't formally assigned to (pre-event smoke runs, etc.).
     */
    eventSlug: vine.string().trim().minLength(1).maxLength(120).optional(),
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
    /** USDC balance. `null` when the on-chain read failed — UI renders "—". */
    balanceUsdc: number | null
    balanceError: string | null
    active: boolean
  } | null
  caps: {
    perTxUsdc: number
    perHourUsdc: number
    spentLastHourUsdc: number
    /** Largest USDC amount the operator can pick from the dropdown. Driven
     * by EVENT_LIMIT_USABLE_AIRDROP env (≥5, ints only). Defaults to 5. */
    dropdownMaxUsdc: number
  }
  recentSends: RecentSend[]
  /** When ?to=<phone> is provided, pre-fill the form. */
  prefillRecipientPhone: string | null
  /**
   * Superadmin override metadata: the page renders a banner and forwards
   * `eventSlug` on POST so the controller resolves the same wallet. Null
   * for ordinary operator sessions.
   */
  superadminOverride: { eventSlug: string } | null
  /**
   * Populated for the superadmin only when they land on /admin/operator/send
   * with no `?event=` override (so the page would otherwise be blank). Lets
   * them pick a wallet to act through. Null for everyone else.
   */
  superadminWalletPicker: Array<{
    eventSlug: string
    eventName: string | null
    walletAddress: string
    operatorEmail: string | null
    operatorFullName: string | null
  }> | null
  flash: { error?: string; success?: string } | null
}

/**
 * Send the post-confirm receipt to the recipient on WhatsApp via the
 * pre-approved `payment_received` HSM template — works OUTSIDE the 24h
 * customer-service window (critical for operator sends where the
 * attendee may not have messaged Sippy recently).
 *
 * The template's {{2}} variable is "sender" — for operator sends we use
 * `senderDisplay` (the unmasked event name) so the message reads as
 * "Recibiste $X de Pizza Day Cartagena 2026" instead of the phone-style
 * mask "Piz***2026" that notifyPaymentReceived would otherwise apply.
 *
 * Fully isolated from the request lifecycle: must NEVER throw upwards
 * because the on-chain send already succeeded and the operator's UI
 * must not see a 500 over a notification failure.
 */
async function notifyRecipientOfPayment(args: {
  recipientPhone: string
  amountUsdc: number
  eventName: string
  eventSlug: string
  sendId: number | string
  txHash: string
}): Promise<void> {
  try {
    const pref = await findUserPrefByPhone(args.recipientPhone)
    const lang: Lang = (pref?.preferredLanguage as Lang | undefined) ?? 'es'
    await notifyPaymentReceived({
      recipientPhone: args.recipientPhone,
      amount: args.amountUsdc.toFixed(2),
      asset: 'USDC',
      // senderPhone is unused when senderDisplay is set; left here for
      // type compat with the helper signature.
      senderPhone: '',
      senderDisplay: args.eventName,
      txHash: args.txHash,
      lang,
    })
    logger.info(
      `operator_send.notified send_id=${args.sendId} to=${maskPhone(args.recipientPhone)} lang=${lang}`
    )
  } catch (err) {
    logger.warn(
      {
        send_id: args.sendId,
        recipient: maskPhone(args.recipientPhone),
        err,
      },
      'operator_send.notify-failed (on-chain send still succeeded)'
    )
  }
}

/**
 * Fire-and-forget POAP claim-link DM to the operator's recipient. Runs
 * alongside `notifyRecipientOfPayment`: the receipt message ("you got
 * $X USDC") and the POAP message ("claim your POAP here") are paired,
 * both target the recipient, both isolated from the request lifecycle.
 *
 * Lang resolution mirrors notifyRecipientOfPayment so the two messages
 * arrive in the same language. The helper itself (sendPoapInviteIfPending)
 * does NOT throw — eligibility, pool state and failures are handled
 * downstream in poap_invite.service.
 */
async function notifyRecipientPoap(
  recipientPhone: string,
  sippyWalletAddress: string
): Promise<void> {
  try {
    const pref = await findUserPrefByPhone(recipientPhone)
    const lang: Lang = (pref?.preferredLanguage as Lang | undefined) ?? 'es'
    await sendPoapInviteIfPending(recipientPhone, lang, sippyWalletAddress)
  } catch (err) {
    logger.warn(
      { recipient: maskPhone(recipientPhone), err },
      'operator_send.poap-notify-failed (on-chain send still succeeded)'
    )
  }
}

/**
 * Combined orchestrator that replaces the two-message flow when Meta has
 * approved the `event_announcement` template for the recipient's language.
 *
 * Flow:
 *   1. Resolve recipient lang. If EN/ES (template approved), attempt the
 *      combined path; else go straight to the two-message fallback.
 *   2. Atomically reserve a POAP code via `claimPendingPoapInvite`. If a
 *      code is reserved, build the body with `formatOperatorDropBody`
 *      (payment receipt + POAP claim link) and send via
 *      `notifyEventAnnouncement`. Success → return; one message delivered.
 *   3. On template failure (Meta rejects, rate-limits, returns false),
 *      release the POAP reservation and fall through to the two-message
 *      flow so the user still gets payment_received + a fresh POAP DM.
 *   4. If no POAP is available ('none', 'contended', 'pool_exhausted'),
 *      skip the combined attempt and use the legacy flow — payment
 *      notification only, plus the pool-exhausted text message if
 *      relevant. Same end-state as before this template existed.
 *
 * Best-effort: never throws — operator UI must not see a 500 over a
 * notification failure.
 *
 * Audit: logs each branch so post-event reconciliation can count which
 * recipients got the combined vs split flow.
 */
async function notifyOperatorDrop(args: {
  recipientPhone: string
  amountUsdc: number
  eventName: string
  eventSlug: string
  sendId: number | string
  txHash: string
  sippyWalletAddress: string
}): Promise<void> {
  let lang: Lang = 'es'
  try {
    const pref = await findUserPrefByPhone(args.recipientPhone)
    lang = (pref?.preferredLanguage as Lang | undefined) ?? 'es'
  } catch {
    // Lang lookup failure → keep default 'es' and continue. The send is
    // already on-chain, the notification path must not block.
  }

  // event_announcement is approved for EN and ES only (as of May 2026).
  // PT recipients keep getting the two-message flow until the PT version
  // is approved.
  const templateApproved = lang === 'en' || lang === 'es'

  if (templateApproved) {
    try {
      const outcome = await claimPendingPoapInvite(args.recipientPhone)
      if (outcome.kind === 'reserved') {
        const body = formatOperatorDropBody({
          amount: args.amountUsdc.toFixed(2),
          asset: 'USDC',
          poapClaimUrl: outcome.reservation.poapClaimUrl,
          sippyWalletAddress: args.sippyWalletAddress,
          lang,
        })
        const sent = await notifyEventAnnouncement({
          recipientPhone: args.recipientPhone,
          eventName: outcome.reservation.eventName,
          body,
          lang,
        })
        if (sent) {
          logger.info(
            `operator_send.combined-sent send_id=${args.sendId} to=${maskPhone(args.recipientPhone)} lang=${lang} event=${outcome.reservation.eventSlug}`
          )
          return
        }
        // Template send failed AFTER the POAP was reserved. Release the
        // reservation so the fallback flow can claim a fresh code from
        // the pool and send poap_claim_invite normally. Without this
        // release, the user would lose their POAP entirely.
        logger.warn(
          `operator_send.combined-failed send_id=${args.sendId} — releasing POAP reservation and falling back to two-message flow`
        )
        await releasePoapInvite({
          phoneNumber: args.recipientPhone,
          eventSlug: outcome.reservation.eventSlug,
        }).catch((relErr) => {
          logger.error(
            { send_id: args.sendId, err: relErr },
            'operator_send.combined-release-failed (POAP may be permanently lost for this user)'
          )
        })
      }
      // 'none' / 'contended' / 'pool_exhausted': nothing to combine.
      // Drop through to the two-message flow — payment_received fires,
      // and sendPoapInviteIfPending handles the pool-exhausted text
      // message + contended/none no-op identically to before.
    } catch (err) {
      logger.warn(
        { send_id: args.sendId, recipient: maskPhone(args.recipientPhone), err },
        'operator_send.combined-orchestrator-error (falling back to two-message flow)'
      )
    }
  }

  // Two-message fallback: identical to the pre-template behavior.
  await notifyRecipientOfPayment({
    recipientPhone: args.recipientPhone,
    amountUsdc: args.amountUsdc,
    eventName: args.eventName,
    eventSlug: args.eventSlug,
    sendId: args.sendId,
    txHash: args.txHash,
  })
  await notifyRecipientPoap(args.recipientPhone, args.sippyWalletAddress)
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

    const eventHint = String(request.input('event', '') ?? '').trim() || null
    const { wallet, override } = await resolveActiveWallet(user, eventHint)
    if (!wallet) {
      // Operator (or admin acting as operator) with no assignment. UI
      // surfaces this clearly — the form is disabled, send is blocked.
      //
      // For the superadmin specifically, fetch the active operator-wallet
      // list so the page can render a "pick an event" panel. This makes
      // the SEND sidebar entry a real entry point instead of a dead end.
      const walletPicker = isSuperAdmin(user.email)
        ? await db
            .from('event_operator_wallets as eow')
            .leftJoin('events as e', 'e.slug', 'eow.event_slug')
            .leftJoin('admin_users as au', 'au.id', 'eow.operator_user_id')
            .where('eow.active', true)
            .orderBy('e.starts_at', 'desc')
            .select(
              'eow.event_slug as event_slug',
              'e.name as event_name',
              'eow.wallet_address as wallet_address',
              'au.email as operator_email',
              'au.full_name as operator_full_name'
            )
            .then((rows: any[]) =>
              rows.map((r) => ({
                eventSlug: r.event_slug,
                eventName: r.event_name ?? null,
                walletAddress: r.wallet_address,
                operatorEmail: r.operator_email ?? null,
                operatorFullName: r.operator_full_name ?? null,
              }))
            )
        : null
      const props: ShowSendProps = {
        event: null,
        wallet: null,
        caps: {
          perTxUsdc: caps.perTx,
          perHourUsdc: caps.perHour,
          spentLastHourUsdc: 0,
          dropdownMaxUsdc: caps.dropdownMaxUsdc,
        },
        recentSends: [],
        prefillRecipientPhone: null,
        superadminOverride: null,
        superadminWalletPicker: walletPicker,
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

    // Caps and recent-sends key on the WALLET's operator (wallet.operatorUserId),
    // not the caller. This keeps the hourly cap shared between the assigned
    // operator and a superadmin acting through the same wallet — no cap
    // bypass — and keeps the "Recent sends" list wallet-scoped.
    const [balanceResult, spentLastHourUsdc, recentSends] = await Promise.all([
      getOperatorWalletBalance(wallet.walletAddress),
      getOperatorSpendInLastHour(wallet.operatorUserId),
      loadRecentSends(wallet.operatorUserId, wallet.eventSlug),
    ])

    const prefillRaw = String(request.input('to', '') ?? '').trim()
    const prefill = prefillRaw ? canonicalizePhone(prefillRaw) : null

    const props: ShowSendProps = {
      event: event ? { slug: event.slug, name: event.name } : null,
      wallet: {
        address: wallet.walletAddress,
        // H1: surface RPC failure as null + balanceError so UI can render
        // "—" instead of $0.00. An empty wallet and an RPC outage look
        // identical in $0.00 and could drive the operator to refuse cash.
        balanceUsdc: balanceResult.kind === 'ok' ? balanceResult.value : null,
        balanceError: balanceResult.kind === 'error' ? balanceResult.error : null,
        active: wallet.active,
      },
      caps: {
        perTxUsdc: caps.perTx,
        perHourUsdc: caps.perHour,
        spentLastHourUsdc,
        dropdownMaxUsdc: caps.dropdownMaxUsdc,
      },
      recentSends,
      prefillRecipientPhone: prefill,
      superadminOverride: override ? { eventSlug: wallet.eventSlug } : null,
      // Picker is only meaningful on the "no wallet" branch.
      superadminWalletPicker: null,
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
  async validateRecipient({ auth, params, request, response }: HttpContext) {
    const user = auth.user!
    const eventHint = String(request.input('event', '') ?? '').trim() || null
    const { wallet } = await resolveActiveWallet(user, eventHint)
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
  async send(ctx: HttpContext) {
    const { auth, request, response } = ctx
    const user = auth.user!
    const caps = getCaps()
    // Localize JSON error responses with the operator's admin-UI lang. The
    // frontend renders `body.error` directly into localFlash, so the wire
    // payload itself has to be already-translated.
    const adminLang = getAdminLang(ctx)

    let body: { recipientPhone: string; amountUsdc: number; eventSlug?: string }
    try {
      body = await request.validateUsing(sendBodyValidator)
    } catch (err) {
      return response.badRequest({
        error: adminErrors.invalidRequestBody(adminLang),
        detail: (err as Error).message,
      })
    }

    // Resolve the wallet AFTER body validation so the superadmin hint
    // (body.eventSlug) is available. For ordinary operators the hint is
    // silently dropped inside resolveActiveWallet.
    const { wallet, override } = await resolveActiveWallet(user, body.eventSlug ?? null)
    if (!wallet) {
      return response.badRequest({ error: adminErrors.noEventWallet(adminLang) })
    }
    if (!wallet.active) {
      return response.badRequest({ error: adminErrors.eventWalletRevoked(adminLang) })
    }

    // Everything downstream — caps, advisory lock, audit insert — keys on
    // the wallet's assigned operator, NOT the caller. That keeps superadmin
    // sends counted against the same hourly cap as the operator and makes
    // the lock serialize concurrent superadmin↔operator sends on the same
    // wallet. operator_id stays as the wallet's owner per the audit policy;
    // a future `initiated_by_user_id` column will let us separate them.
    const effectiveOperatorId = wallet.operatorUserId

    const recipientCanonical = canonicalizePhone(body.recipientPhone)
    if (!recipientCanonical) {
      return response.badRequest({ error: adminErrors.invalidRecipientPhone(adminLang) })
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
        error: adminErrors.recipientNotInEvent(adminLang),
      })
    }

    // Recipient must have a wallet to receive to (user_preferences → wallet_address).
    const recipientWallet = await getUserWallet(recipientPrefKey)
    if (!recipientWallet?.walletAddress) {
      return response.badRequest({
        error: adminErrors.recipientWalletNotFound(adminLang),
      })
    }

    // Per-tx cap is purely numeric, no race possible — check eagerly.
    if (body.amountUsdc > caps.perTx) {
      return response.badRequest({
        error: adminErrors.amountExceedsPerTxCap(caps.perTx, adminLang),
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
    // Allow explicit override for legitimate re-sends (e.g. admin confirmed
    // attendee never actually received the first drop). Accept either body
    // field or `?override=true` query string. Defaults to false.
    const rawOverride = request.body()?.override ?? request.input('override', '')
    const overrideDuplicate = rawOverride === true || String(rawOverride).toLowerCase() === 'true'

    let sendRowId: number
    try {
      sendRowId = await db.transaction(async (trx) => {
        // Advisory lock keyed on operator id. pg_advisory_xact_lock blocks
        // until the lock is acquired; same-operator sends queue, others
        // proceed in parallel. Lock auto-released on commit/rollback.
        await trx.rawQuery('SELECT pg_advisory_xact_lock(?)', [effectiveOperatorId])

        // C1 — duplicate-recipient guard. The per-row "sent" rollup on the
        // attendees page is purely cosmetic; two operators (or the same
        // operator across page reloads) could otherwise both pay the same
        // attendee. We MUST check inside this transaction so a concurrent
        // POST also sees the pending reservation. Status filter omits
        // 'failed' — those don't block a retry. The advisory lock is per
        // operator, NOT per recipient, so two different operators could
        // theoretically race here; the unique-recipient invariant is
        // enforced by ordering (whoever wins the lookup wins) and is good
        // enough for the Pizza Day cadence. A row-level lock would be the
        // bullet-proof variant.
        if (!overrideDuplicate) {
          const dup = (await trx
            .from('operator_sends')
            .where({ event_slug: wallet.eventSlug, to_phone: recipientPrefKey })
            .whereIn('status', ['pending', 'submitted', 'confirmed'])
            .select('id', 'amount_usdc', 'status', 'created_at')
            .orderBy('created_at', 'desc')
            .first()) as
            | {
                id: string | number
                amount_usdc: string
                status: string
                created_at: string
              }
            | undefined
          if (dup) {
            const err = new Error(
              adminErrors.duplicateRecipient(
                {
                  amount: String(dup.amount_usdc),
                  eventSlug: wallet.eventSlug,
                  status: dup.status,
                  sendId: dup.id,
                },
                adminLang
              )
            )
            ;(err as any).code = 'DUPLICATE_RECIPIENT'
            ;(err as any).existingSend = dup
            throw err
          }
        }

        const spent = (await trx
          .from('operator_sends')
          .where('operator_id', effectiveOperatorId)
          .whereIn('status', ['pending', 'submitted', 'confirmed'])
          .where('created_at', '>', trx.raw("now() - interval '1 hour'"))
          .sum('amount_usdc as total')
          .first()) as { total: string | number | null } | undefined
        const spentLastHour = Number(spent?.total ?? 0) || 0

        if (spentLastHour + body.amountUsdc > caps.perHour) {
          // Throw to roll back the (empty) transaction; controller catches.
          const err = new Error(
            adminErrors.hourlyCapExceeded(caps.perHour, spentLastHour, body.amountUsdc, adminLang)
          )
          ;(err as any).code = 'HOURLY_CAP_EXCEEDED'
          ;(err as any).spentLastHour = spentLastHour
          throw err
        }

        const inserted = await trx
          .table('operator_sends')
          .insert({
            operator_id: effectiveOperatorId,
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
      if ((err as any)?.code === 'DUPLICATE_RECIPIENT') {
        return response.status(409).send({
          error: (err as Error).message,
          code: 'DUPLICATE_RECIPIENT',
          existingSend: (err as any).existingSend,
        })
      }
      if ((err as any)?.code === 'HOURLY_CAP_EXCEEDED') {
        return response.status(429).send({
          error: (err as Error).message,
          spentLastHour: (err as any).spentLastHour,
          attempted: body.amountUsdc,
        })
      }
      logger.error(
        { operator_id: effectiveOperatorId, caller_user_id: user.id, override, err },
        'operator_send.reserve-failed'
      )
      return response.status(500).send({ error: adminErrors.failedToReserveSendSlot(adminLang) })
    }

    logger.info(
      `operator_send.start op=${effectiveOperatorId} caller=${user.id}${
        override ? ' (superadmin-override)' : ''
      } event=${wallet.eventSlug} send_id=${sendRowId} to=${maskPhone(recipientPrefKey)} amount=${body.amountUsdc}`
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
        { operator_id: effectiveOperatorId, caller_user_id: user.id, send_id: sendRowId, err },
        'operator_send.submit-failed (no userOp broadcast, safe to retry)'
      )
      return response.status(500).send({
        success: false,
        sendId: sendRowId,
        error: adminErrors.submitFailed(errorReason, adminLang),
        detail: errorReason,
      })
    }

    // userOp is broadcast. Persist its hash IMMEDIATELY so a wait failure
    // doesn't lose the audit trail. From this point, status will never go
    // back to 'failed' — only to 'confirmed' on success.
    //
    // H4: throw if userOpHash is missing rather than persisting an empty
    // string. An empty hash would silently break the explorer link and
    // any future reconciliation job that looks up by hash.
    if (!submitted.userOpHash) {
      // CDP SDK contract guarantees this, but defend anyway. We can't
      // recover automatically — userOp may be in flight but we have no
      // way to find it. Force admin intervention.
      logger.error(
        { operator_id: effectiveOperatorId, caller_user_id: user.id, send_id: sendRowId },
        'operator_send: CDP returned no userOpHash after sendUserOperation. Row stuck in pending — manual reconciliation required.'
      )
      return response.status(500).send({
        success: false,
        sendId: sendRowId,
        error: adminErrors.cdpNoUserOpHash(adminLang),
      })
    }

    await db
      .from('operator_sends')
      .where({ id: sendRowId })
      .update({
        status: 'submitted',
        tx_hash: submitted.userOpHash,
        updated_at: db.raw('now()'),
      })

    // ── Wait phase ────────────────────────────────────────────────────────
    //
    // Best-effort confirmation. Failure here does NOT mark the row failed
    // — the userOp is already in flight and will eventually confirm or
    // fail at the EntryPoint, but that's a separate event. Operator gets
    // a "submitted" response with the hash; a future reconciliation job
    // can promote 'submitted' → 'confirmed' once the chain settles.
    //
    // H4: We DON'T blanket-catch everything as "still in flight". The
    // service explicitly throws when the userOp completes with
    // status='failed' (reverted on-chain). In that case we DO want the
    // audit row to surface the failure — but we still cannot mark it
    // 'failed' from the perspective of double-pay safety (the wallet was
    // debited if the revert was AFTER the transfer). Instead, set a
    // distinct intermediate state and let admin reconcile.

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
      logger.info(
        `operator_send.confirmed op=${effectiveOperatorId} caller=${user.id} send_id=${sendRowId} tx=${txHash}`
      )

      // Notify recipient on WhatsApp. Fired AFTER the chain confirms so the
      // message acts as a receipt, not a promise — if we sent on submit and
      // the userOp later reverted, the user would see a false "received"
      // notification. The send is intentionally swallowed: a WhatsApp API
      // hiccup (rate-limit, 5xx) MUST NOT propagate as a 500 to the operator
      // — the money already moved, the audit row is correct, the operator
      // can tell the recipient to type *balance* if the ping is delayed.
      //
      // Event-name lookup is best-effort: if the row is missing or the read
      // fails we fall back to the slug so the user still gets a message.
      const eventRow = await db
        .from('events')
        .where({ slug: wallet.eventSlug })
        .select('name')
        .first()
        .catch(() => null)
      // Notify recipient via the combined orchestrator. For EN/ES it
      // attempts the approved `event_announcement` template (one message
      // covering payment receipt + POAP claim); for PT, or when the
      // template send fails, it falls back to the legacy two-message
      // flow (payment_received + poap_claim_invite). One-shot per
      // attendee+event for the POAP component — subsequent operator
      // sends to the same attendee skip the POAP path inside the
      // orchestrator.
      void notifyOperatorDrop({
        recipientPhone: recipientCanonical,
        amountUsdc: body.amountUsdc,
        eventName: eventRow?.name ?? wallet.eventSlug,
        eventSlug: wallet.eventSlug,
        sendId: sendRowId,
        txHash,
        sippyWalletAddress: recipientWallet.walletAddress,
      })

      return response.ok({
        success: true,
        sendId: sendRowId,
        txHash,
        status: 'confirmed',
      })
    } catch (waitErr) {
      // Three possible cases:
      //  (a) timeout: userOp still pending in bundler — keep 'submitted'
      //  (b) on-chain revert: userOp completed but USDC didn't move —
      //      KEEP 'submitted' (don't release cap budget for retry, since
      //      this typically requires manual investigation)
      //  (c) genuine programmer bug in waitForOperatorSend: TypeError,
      //      out-of-memory, etc.
      //
      // In all three, we keep status='submitted' (NEVER 'failed', that
      // would re-open the cap and enable retry → double-pay) but surface
      // a clearer error to the operator. Admin must reconcile via
      // Arbiscan + manual UPDATE.
      const errClass =
        waitErr instanceof Error && waitErr.message.includes('did not complete on-chain')
          ? 'reverted'
          : 'timeout-or-unknown'
      logger.warn(
        {
          operator_id: effectiveOperatorId,
          caller_user_id: user.id,
          send_id: sendRowId,
          userOpHash: submitted.userOpHash,
          errClass,
          err: waitErr,
        },
        `operator_send.wait-${errClass} (userOp broadcast, requires reconciliation)`
      )
      const isReverted = errClass === 'reverted'
      return response.ok({
        success: !isReverted,
        sendId: sendRowId,
        txHash: submitted.userOpHash,
        status: 'submitted',
        note: isReverted
          ? adminErrors.walletNoteReverted(adminLang)
          : adminErrors.walletNoteTimeout(adminLang),
      })
    }
  }
}
