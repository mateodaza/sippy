/**
 * Bracket-Token Handler
 *
 * Extracts a short-id from `[ABC23XYZ]` markers in inbound WhatsApp messages
 * and dispatches against the `qr_links` table. Runs BEFORE the LLM/intent
 * parser so QR-attribution metadata never enters the LLM prompt — the short-id
 * is routing context, not natural-language intent.
 *
 * Origin: users land in WhatsApp via `wa.me/?text=Hola Sippy! [ABC23XYZ]`
 * after scanning an event QR. The bracketed code is the only signal we have
 * to tie the message back to the qr_links row that minted the QR.
 *
 * Spec: QR_SYSTEM_SPEC.md → "Locked decisions #3" + PIZZA_DAY_PLAN.md (P0).
 */

import logger from '@adonisjs/core/services/logger'
import { getQrLinkForScan, resolveQrScan, type QrLinkForScan } from '#services/qr_link.service'
import { linkUserToEvent, getActiveEventBySlug } from '#services/event.service'
import { findUserPrefByPhone } from '#utils/user_pref_lookup'
import { canonicalizePhone, maskPhone } from '#utils/phone'
import {
  formatEventWelcomeReturning,
  formatEventWelcomeNewUser,
  formatQrInactiveMessage,
  formatQrLookupTransientErrorMessage,
  formatPayAskForAmount,
  formatSelfPayMessage,
  type Lang,
} from '#utils/messages'

// ── Pattern ─────────────────────────────────────────────────────────────────

/**
 * Matches Crockford-style short-ids (8 chars, no 0/1/I/L/O) inside brackets.
 * Mirrors `SHORT_ID_PATTERN` in qr_scan_controller.ts so a token we'd reject
 * as `invalid_version` at /q/<shortId> is also rejected here — same alphabet,
 * same length, same rules.
 *
 * Anchored with brackets only; the token can appear anywhere in the message
 * (`Hola Sippy! [ABC23XYZ]` or `[ABC23XYZ] balance`). First match wins so
 * a malformed second token can't override the first.
 */
const BRACKET_TOKEN_PATTERN = /\[([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})\]/

// ── Extraction ──────────────────────────────────────────────────────────────

export interface ExtractedToken {
  /** Short-id from the first valid bracket pair, or null if none found. */
  shortId: string | null
  /**
   * Original text with the matched bracket (including the brackets) stripped
   * and any leading/trailing whitespace collapsed. When `shortId` is null,
   * `stripped === text` verbatim.
   */
  stripped: string
}

/**
 * Pull the first `[ABC23XYZ]` token out of the message text. The token itself
 * is removed from the returned `stripped` so downstream parsing/LLM never see
 * it — keeps the routing metadata out of the natural-language pipeline.
 *
 * Pure function — does not touch the DB or send messages. Safe to call on
 * every inbound message without side effects.
 */
export function extractBracketToken(text: string): ExtractedToken {
  if (!text) return { shortId: null, stripped: text }

  const match = text.match(BRACKET_TOKEN_PATTERN)
  if (!match) return { shortId: null, stripped: text }

  const [full, shortId] = match
  // Collapse runs of whitespace left behind by the strip so a message like
  // "Hola   [ABC23XYZ]   balance" becomes "Hola balance", not "Hola    balance".
  const stripped = text.replace(full, ' ').replace(/\s+/g, ' ').trim()

  return { shortId, stripped }
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export type BracketDispatchOutcome =
  /** Short-id had no matching row in qr_links. Caller should fall through to
   *  normal parsing on the stripped text. */
  | 'not_found'
  /** Short-id is revoked (or its event expired). Reply sent. */
  | 'revoked'
  /** Short-id is a `referral` QR — not handled yet. Fall through. */
  | 'unsupported_kind'
  /** User is already linked or just got linked. Reply sent to user. */
  | 'event_linked'
  /** User is not onboarded — caller should send the setup link reply. */
  | 'event_needs_onboarding'
  /** Pay-QR scan — sender prompted for amount, recipient phone returned in
   *  `payRecipient` so the caller can stash a partial-send context. */
  | 'pay_prompt_for_amount'
  /** Pay-QR scan where sender === owner. Reply sent, no further action. */
  | 'pay_self_send'

export interface BracketDispatchResult {
  outcome: BracketDispatchOutcome
  /**
   * The text we want to send back to the user. Null when the caller should
   * continue normal parsing instead of replying. Populated for `event_linked`,
   * `event_needs_onboarding`, `revoked`, `pay_prompt_for_amount`, `pay_self_send`.
   */
  reply: string | null
  /** Surfaced for logging/observability. */
  shortId: string
  eventSlug: string | null
  sourceTag: string | null
  /**
   * Populated for `pay_prompt_for_amount` — the recipient's canonical phone
   * (the pay-QR owner). The caller writes a partial-send entry keyed on the
   * sender so the next inbound message is interpreted as the amount for
   * this recipient.
   */
  payRecipient?: string | null
  /** Populated for `pay_prompt_for_amount` — display name from qr_links. */
  payDisplayName?: string | null
}

/**
 * Look up `shortId` and dispatch by `kind`. For event-kind QRs:
 *
 *  - If the user is already in `user_preferences` (onboarded): idempotently
 *    link them to the event with step='returning' and reply with a welcome.
 *    Idempotency lives in `linkUserToEvent` (ON CONFLICT DO NOTHING preserves
 *    first-contact attribution).
 *
 *  - If the user is NOT onboarded: do NOT call linkUserToEvent (the FK to
 *    user_preferences would fail). Instead, reply with a `/setup` link that
 *    carries `?event=<slug>&source=<tag>` so the web flow can link them on
 *    completion. The web /setup page reads those URL params.
 *
 *  - For pay kinds: prompt the payer for an amount (or reply with a self-pay
 *    no-op when sender === owner). Returns `pay_prompt_for_amount` plus
 *    the recipient + display name so the caller can stash a pay-QR-tagged
 *    partial-send for the follow-up amount message.
 *
 *  - For referral kinds: not handled yet. Returns `unsupported_kind` so the
 *    caller falls through to normal parsing.
 *
 * Records the scan against `qr_scans` (best-effort — logging failures don't
 * block the user-facing reply). When the lookup hits, the scan is tagged with
 * `resolved_to_phone_number` so analytics can close the loop between the
 * original /q/<id> hit and the WhatsApp reply.
 */
export async function dispatchBracketToken(args: {
  shortId: string
  phoneNumber: string
  lang: Lang
}): Promise<BracketDispatchResult> {
  const { shortId, phoneNumber, lang } = args

  let link: QrLinkForScan | null = null
  try {
    link = await getQrLinkForScan(shortId)
  } catch (err) {
    // Reply with a soft "try again" so the user knows their scan was
    // received but couldn't be processed. The previous behavior fell
    // through to the LLM on the stripped text, which means a payment
    // attempt (`[xxx] 50`) became a bare "50" message the LLM couldn't
    // route — silent dead-end at a register.
    logger.error(
      { shortId, phone: maskPhone(phoneNumber), err },
      'bracket.dispatch: getQrLinkForScan threw — surfacing transient-error reply'
    )
    return {
      outcome: 'not_found',
      reply: formatQrLookupTransientErrorMessage(lang),
      shortId,
      eventSlug: null,
      sourceTag: null,
    }
  }

  // Resolve the prior /q/ scan row to this phone. We do this for ALL dispatch
  // outcomes (not_found, revoked, unsupported_kind, event_linked) — the user
  // hit /q/<id> in the browser before landing here, so qr_scan_controller
  // already INSERTed a row with the right outcome and a null phone. We just
  // UPDATE it with the phone we just learned. No INSERT here — that would
  // double-count scans and inflate qr_links.scan_count. If the user typed the
  // bracket manually (no prior /q/ hit), resolveQrScan returns {updated:false}
  // and we silently move on; attributing a non-existent scan would lie.

  if (!link) {
    await resolveQrScan({ shortId, phoneNumber })
    logger.info(`bracket.dispatch: shortId=${shortId} not_found phone=${maskPhone(phoneNumber)}`)
    return { outcome: 'not_found', reply: null, shortId, eventSlug: null, sourceTag: null }
  }

  if (link.status === 'revoked') {
    await resolveQrScan({ shortId, phoneNumber })
    logger.info(`bracket.dispatch: shortId=${shortId} revoked phone=${maskPhone(phoneNumber)}`)
    // Reply so the user knows the QR is dead — otherwise the stripped text
    // falls through to the LLM as a bare greeting and they get a generic
    // "didn't understand" with no actionable signal.
    return {
      outcome: 'revoked',
      reply: formatQrInactiveMessage(lang),
      shortId,
      eventSlug: link.eventSlug,
      sourceTag: link.sourceTag,
    }
  }

  // Pay-QR scan — sender is the payer, owner is the recipient. Pay-QRs
  // are universal: any user mints one for receiving payments (a business
  // uses a business name; an individual uses their own). Return payRecipient
  // + payDisplayName so the webhook caller can stash a partial-send
  // marked payQrScan=true; downstream the send flow uses that flag to
  // force the confirmation prompt + use the friendly display name in
  // the confirm copy.
  if (link.kind === 'pay') {
    await resolveQrScan({ shortId, phoneNumber })

    // Canonicalize both sides. Owner may be stored bare-digit in a legacy
    // row; the sender always arrives canonical E.164 from the WhatsApp
    // webhook. Raw equality would let a self-scan slip through.
    const ownerCanonical = canonicalizePhone(link.ownerPhoneNumber)
    const senderCanonical = canonicalizePhone(phoneNumber)

    // Data-integrity guard: if the owner phone won't canonicalize, the
    // qr_links row is corrupt — we can't trust the self-send check, and
    // letting the flow proceed would let a malformed-row attacker bypass
    // the guard. Treat as a dead QR: surface the inactive message and stop.
    if (!ownerCanonical) {
      logger.error(
        { shortId, ownerRaw: link.ownerPhoneNumber },
        'bracket.dispatch: pay-QR owner phone failed canonicalization — treating as inactive'
      )
      return {
        outcome: 'revoked',
        reply: formatQrInactiveMessage(lang),
        shortId,
        eventSlug: null,
        sourceTag: link.sourceTag,
      }
    }

    if (senderCanonical && ownerCanonical === senderCanonical) {
      logger.info(
        `bracket.dispatch: shortId=${shortId} pay_self_send phone=${maskPhone(phoneNumber)}`
      )
      return {
        outcome: 'pay_self_send',
        reply: formatSelfPayMessage(lang),
        shortId,
        eventSlug: null,
        sourceTag: link.sourceTag,
      }
    }

    const displayName = link.displayName ?? maskPhone(link.ownerPhoneNumber)
    logger.info(
      `bracket.dispatch: shortId=${shortId} pay_prompt recipient=${maskPhone(link.ownerPhoneNumber)} ` +
        `payer=${maskPhone(phoneNumber)}`
    )
    return {
      outcome: 'pay_prompt_for_amount',
      reply: formatPayAskForAmount(displayName, lang),
      shortId,
      eventSlug: null,
      sourceTag: link.sourceTag,
      payRecipient: link.ownerPhoneNumber,
      payDisplayName: displayName,
    }
  }

  // Other non-event kinds (referral) — not handled yet. Resolve the prior
  // scan, fall through to normal parsing so existing handlers can take over.
  if (link.kind !== 'event' || !link.eventSlug) {
    await resolveQrScan({ shortId, phoneNumber })
    logger.info(
      `bracket.dispatch: shortId=${shortId} kind=${link.kind} unsupported_kind ` +
        `phone=${maskPhone(phoneNumber)}`
    )
    return {
      outcome: 'unsupported_kind',
      reply: null,
      shortId,
      eventSlug: link.eventSlug,
      sourceTag: link.sourceTag,
    }
  }

  // Event-kind path. Resolve the prior scan first so a later crash doesn't
  // lose the attribution loop-close.
  await resolveQrScan({ shortId, phoneNumber })

  // Sanity-check the event row still exists (admin could have revoked it
  // mid-event, or the event's endsAt window has passed). Treat the same as
  // a revoked QR — reply so the user knows, don't silently fall through to
  // the LLM with an empty stripped message.
  const event = await getActiveEventBySlug(link.eventSlug)
  if (!event) {
    logger.warn(
      `bracket.dispatch: shortId=${shortId} event=${link.eventSlug} inactive — replying as revoked`
    )
    return {
      outcome: 'revoked',
      reply: formatQrInactiveMessage(lang),
      shortId,
      eventSlug: link.eventSlug,
      sourceTag: link.sourceTag,
    }
  }

  const pref = await findUserPrefByPhone(phoneNumber)
  if (!pref) {
    // New user — defer the link until /setup completes. The setup flow itself
    // calls linkUserToEvent on done step, so we just need to make sure the
    // URL params survive the WhatsApp → web hop.
    const reply = formatEventWelcomeNewUser(
      phoneNumber,
      event.name,
      event.slug,
      link.sourceTag,
      lang
    )
    logger.info(
      `bracket.dispatch: shortId=${shortId} event=${event.slug} ` +
        `source=${link.sourceTag ?? '-'} new_user phone=${maskPhone(phoneNumber)}`
    )
    return {
      outcome: 'event_needs_onboarding',
      reply,
      shortId,
      eventSlug: event.slug,
      sourceTag: link.sourceTag,
    }
  }

  // Onboarded user. linkUserToEvent is idempotent: ON CONFLICT DO NOTHING
  // preserves first-contact source so re-scanning a different assistant's QR
  // doesn't rewrite attribution. Step is 'returning' because they already had
  // a wallet before this scan.
  //
  // Intentionally NOT wrapped in try/catch: if the link write fails, the
  // welcome reply would lie ("you're checked in" while the row was never
  // written), the attendee shows missing on the operator dashboard, and the
  // POAP flow keyed on user_event_links never fires. Let the throw bubble
  // up to the outer bracket handler in webhook_controller — the user gets
  // a generic error message and Meta delivers it via the unrouted-error
  // fallback, and on retry the idempotent insert succeeds.
  await linkUserToEvent(phoneNumber, event.slug, 'returning', link.sourceTag ?? null)

  const reply = formatEventWelcomeReturning(event.name, link.sourceTag, lang)
  logger.info(
    `bracket.dispatch: shortId=${shortId} event=${event.slug} ` +
      `source=${link.sourceTag ?? '-'} event_linked phone=${maskPhone(phoneNumber)}`
  )
  return {
    outcome: 'event_linked',
    reply,
    shortId,
    eventSlug: event.slug,
    sourceTag: link.sourceTag,
  }
}
