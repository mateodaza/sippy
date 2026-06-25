import logger from '@adonisjs/core/services/logger'
import { sendTextMessage } from '#services/whatsapp.service'
import { formatPoapClaimInvite, formatPoapPoolExhausted, type Lang } from '#utils/messages'
import { claimPendingPoapInvite, releasePoapInvite } from '#services/event.service'
import { notifyPoapClaimInvite } from '#services/notification.service'
import { capture as posthogCapture } from '#services/posthog_service'
import { maskPhone } from '#utils/phone'

/**
 * Fire-and-forget POAP claim-link DM to the recipient of an operator USDC
 * send. Triggered from `operator_send_controller.send` after the on-chain
 * payment confirms — the POAP is the "welcome to the event" companion to
 * the USDC drop, not a thank-you for an inbound payment.
 *
 * Atomically reserves a code from `poap_codes` (or the legacy shared URL)
 * via `claimPendingPoapInvite`, then sends the WhatsApp message. On send
 * failure, releases both the code AND the `poap_invite_sent_at` stamp so
 * the next operator-send to the same attendee can retry.
 *
 * Best-effort; swallows all errors. The dual-failure path (claim ok →
 * send fail → release fail) is captured as a PostHog event so ops has
 * the morning-after "X attendees never got their POAP" signal.
 */
export async function sendPoapInviteIfPending(
  phoneNumber: string,
  lang: Lang,
  sippyWalletAddress: string
): Promise<void> {
  try {
    const outcome = await claimPendingPoapInvite(phoneNumber)
    if (outcome.kind === 'none') return
    if (outcome.kind === 'contended') {
      // Parallel claim won the SKIP LOCKED race. Rare — would mean the
      // operator pressed Send twice within the same instant. The other
      // call will (or won't) deliver.
      posthogCapture(phoneNumber, 'poap_invite_contended', {})
      return
    }
    if (outcome.kind === 'pool_exhausted') {
      // Pool fully assigned. The link stamp was intentionally NOT set so a
      // restock makes the user eligible again. Tell the attendee the
      // honest news so they don't keep wondering.
      posthogCapture(phoneNumber, 'poap_invite_pool_exhausted', {
        event_slug: outcome.eventSlug,
      })
      try {
        await sendTextMessage(phoneNumber, formatPoapPoolExhausted(outcome.eventName, lang), lang)
        logger.info(
          `poap-invite.pool-exhausted-notified event=${outcome.eventSlug} to=${maskPhone(phoneNumber)}`
        )
      } catch (notifyErr) {
        logger.error(
          { event: outcome.eventSlug, to: maskPhone(phoneNumber), err: notifyErr },
          'poap-invite.pool-exhausted-notify-failed'
        )
      }
      return
    }
    const { reservation } = outcome
    try {
      // Try the pre-approved HSM template first — works outside the 24h
      // customer-service window (the realistic case for operator-sends:
      // attendee onboards at QR booth, may not have replied to Sippy in
      // 24h+). If the template isn't yet approved by Meta, fall back to
      // a free-text message; that path only succeeds inside the 24h
      // window but keeps the feature live until the template lands.
      const templateDelivered = await notifyPoapClaimInvite({
        recipientPhone: phoneNumber,
        eventName: reservation.eventName,
        poapClaimUrl: reservation.poapClaimUrl,
        sippyWalletAddress,
        lang,
      })
      if (!templateDelivered) {
        await sendTextMessage(
          phoneNumber,
          formatPoapClaimInvite(
            {
              poapClaimUrl: reservation.poapClaimUrl,
              eventName: reservation.eventName,
              sippyWalletAddress,
            },
            lang
          ),
          lang
        )
        logger.info(
          `poap-invite.sent-via-freetext event=${reservation.eventSlug} to=${maskPhone(phoneNumber)} (template not approved or returned false)`
        )
      } else {
        logger.info(
          `poap-invite.sent event=${reservation.eventSlug} to=${maskPhone(phoneNumber)} lang=${lang}`
        )
      }
      posthogCapture(phoneNumber, 'poap_invite_sent', {
        event_slug: reservation.eventSlug,
        channel: templateDelivered ? 'template' : 'freetext',
      })
    } catch (sendErr) {
      logger.error(
        { event: reservation.eventSlug, to: maskPhone(phoneNumber), err: sendErr },
        'poap-invite.send-failed (releasing reservation for retry on next operator send)'
      )
      posthogCapture(phoneNumber, 'poap_invite_send_failed', {
        event_slug: reservation.eventSlug,
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      })
      await releasePoapInvite({ phoneNumber, eventSlug: reservation.eventSlug }).catch((relErr) => {
        logger.error(
          {
            event: reservation.eventSlug,
            to: maskPhone(phoneNumber),
            errClass: relErr instanceof Error ? relErr.constructor.name : typeof relErr,
            err: relErr,
          },
          'poap-invite.release-failed (POAP DM is permanently lost for this user)'
        )
        // Dual-failure: claim succeeded → send failed → release failed.
        // User will never get the POAP DM unless ops intervenes. The
        // PostHog event is the only "5 of 200 attendees never got their
        // POAP" signal the next morning.
        posthogCapture(phoneNumber, 'poap_invite_release_failed', {
          event_slug: reservation.eventSlug,
          error: relErr instanceof Error ? relErr.message : String(relErr),
        })
      })
    }
  } catch (err) {
    logger.error({ err }, 'poap-invite.unexpected-error')
  }
}
