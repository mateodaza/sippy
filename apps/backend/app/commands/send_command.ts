import {
  getUserWallet,
  isSessionValid,
  updateLastActivity,
  sendUSDCToUser,
  getUserBalance,
  checkSecurityLimits,
  DAILY_LIMIT_VERIFIED,
  DAILY_LIMIT_UNVERIFIED,
  CdpTimeoutError,
} from '#services/cdp_wallet.service'
import {
  getEmbeddedWallet,
  getEmbeddedBalance,
  sendToPhoneNumber,
} from '#services/embedded_wallet.service'
import { sendTextMessage, sendButtonMessage } from '#services/whatsapp.service'
import { getRefuelService } from '#services/refuel.service'
import {
  type Lang,
  formatSendProcessingMessage,
  formatSendSuccessMessage,
  formatInsufficientBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
  formatRecipientNotFoundMessage,
  formatInvalidAmountMessage,
  formatTransactionBlockedMessage,
  formatTransferFailedMessage,
  formatSetupRequiredMessage,
  formatDailyLimitExceededMessage,
  formatTieredDailyLimitExceededMessage,
  formatSpendingLimitInfo,
  formatPoapClaimInvite,
  formatPoapPoolExhausted,
  buttonNeedAnythingElse,
  buttonBalance,
  buttonHelp,
} from '#utils/messages'
import { claimPendingPoapInvite, releasePoapInvite } from '#services/event.service'
import { capture as posthogCapture } from '#services/posthog_service'
import { toUserErrorMessage } from '#utils/errors'
import { getUserLanguage } from '#services/db'
import logger from '@adonisjs/core/services/logger'
import { velocityService } from '#services/velocity_service'
import { notifyPaymentReceived } from '#services/notification.service'
import { getLanguageForPhone, maskPhone } from '#utils/phone'
import { createInvite } from '#services/invite.service'
import {
  formatInviteSentToSender,
  formatInviteDeliveryFailed,
  formatInviteAlreadyPending,
  formatInviteDailyLimitReached,
} from '#utils/messages'

/**
 * Fire-and-forget POAP claim-link DM after a successful payment. Atomically
 * reserves the invite (claimPendingPoapInvite stamps poap_invite_sent_at in
 * the same UPDATE so two parallel sends can't double-send), and releases
 * the reservation if the WhatsApp send itself errors so a retry on the
 * user's next payment still has a chance to deliver.
 *
 * Best-effort; swallows all errors. User-visible silent loss is possible if
 * claim succeeds → send fails → release fails (the rare dual-failure path),
 * so both the send-fail and release-fail branches log at error level so an
 * operator sweeping logs can find the affected phone.
 */
async function sendPoapInviteIfPending(phoneNumber: string, lang: Lang): Promise<void> {
  try {
    const outcome = await claimPendingPoapInvite(phoneNumber)
    if (outcome.kind === 'none') return
    if (outcome.kind === 'contended') {
      // Parallel claim won the SKIP LOCKED race. The other caller will (or
      // won't) deliver — we have nothing to do, but emit a PostHog event so
      // ops can see the rate of double-payment within the same instant.
      posthogCapture(phoneNumber, 'poap_invite_contended', {})
      return
    }
    if (outcome.kind === 'pool_exhausted') {
      // Pool fully assigned. The link stamp was intentionally NOT set so
      // a restock makes the user eligible again. Tell the attendee the
      // honest news so they don't keep wondering — they paid USDC and
      // deserve closure on the POAP.
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
      await sendTextMessage(
        phoneNumber,
        formatPoapClaimInvite(
          { poapClaimUrl: reservation.poapClaimUrl, eventName: reservation.eventName },
          lang
        ),
        lang
      )
      logger.info(
        `poap-invite.sent event=${reservation.eventSlug} to=${maskPhone(phoneNumber)} lang=${lang}`
      )
      posthogCapture(phoneNumber, 'poap_invite_sent', { event_slug: reservation.eventSlug })
    } catch (sendErr) {
      logger.error(
        { event: reservation.eventSlug, to: maskPhone(phoneNumber), err: sendErr },
        'poap-invite.send-failed (releasing reservation for retry on next payment)'
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

export async function handleSendCommand(
  fromPhoneNumber: string,
  amount: number,
  toPhoneNumber: string,
  lang: Lang,
  senderRate: number | null,
  senderCurrency: string | null,
  recipientRate: number | null,
  recipientCurrency: string | null,
  /** True when the user reached this send by scanning a Pay QR. Gates
   * post-transfer side-effects that should only fire for QR-initiated
   * payments (e.g. event-POAP claim-link DM). */
  fromQrScan: boolean = false
): Promise<boolean> {
  logger.info(
    `SEND command: ${maskPhone(fromPhoneNumber)} -> ${maskPhone(toPhoneNumber)} (${amount} USD)`
  )

  let transferCompleted = false
  try {
    if (amount <= 0 || Number.isNaN(amount)) {
      await sendTextMessage(fromPhoneNumber, formatInvalidAmountMessage(lang), lang)
      return false
    }

    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(fromPhoneNumber)

    if (embeddedWallet) {
      return await handleEmbeddedSend(
        fromPhoneNumber,
        toPhoneNumber,
        amount,
        embeddedWallet,
        lang,
        senderRate,
        senderCurrency,
        recipientRate,
        recipientCurrency,
        fromQrScan
      )
    }

    // Fall back to legacy server wallet flow
    const senderWallet = await getUserWallet(fromPhoneNumber)
    if (!senderWallet) {
      await sendTextMessage(fromPhoneNumber, formatNoWalletMessage(lang), lang)
      return false
    }

    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(fromPhoneNumber, formatSessionExpiredMessage(lang), lang)
      return false
    }

    // Check recipient has a wallet (either embedded or legacy)
    const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber)
    const recipientLegacy = await getUserWallet(toPhoneNumber)
    const recipientMissing = !recipientEmbedded && !recipientLegacy

    const senderBalance = await getUserBalance(fromPhoneNumber)

    if (senderBalance < amount) {
      await sendTextMessage(
        fromPhoneNumber,
        formatInsufficientBalanceMessage(
          {
            balance: senderBalance,
            needed: amount,
            localRate: senderRate,
            localCurrency: senderCurrency,
          },
          lang
        ),
        lang
      )
      return false
    }

    // Check security limits
    const limitsCheck = await checkSecurityLimits(fromPhoneNumber, amount)
    if (!limitsCheck.allowed) {
      const effectiveLimit = limitsCheck.emailVerified
        ? DAILY_LIMIT_VERIFIED
        : DAILY_LIMIT_UNVERIFIED
      const blockedMsg =
        limitsCheck.limitType === 'daily'
          ? formatTieredDailyLimitExceededMessage(
              effectiveLimit,
              fromPhoneNumber,
              lang,
              limitsCheck.emailVerified ?? false
            )
          : formatTransactionBlockedMessage(limitsCheck.reason || '', lang)
      await sendTextMessage(fromPhoneNumber, blockedMsg, lang)
      return false
    }

    const velocityCheck = velocityService.check(fromPhoneNumber, toPhoneNumber, amount, lang)
    if (!velocityCheck.allowed) {
      await sendTextMessage(fromPhoneNumber, velocityCheck.reason!, lang)
      return false
    }

    // Recipient not on Sippy — invite them (only after sender validation passes)
    if (recipientMissing) {
      try {
        const inviteResult = await createInvite(fromPhoneNumber, toPhoneNumber, amount, lang)
        if (inviteResult.dailyLimitReached) {
          await sendTextMessage(fromPhoneNumber, formatInviteDailyLimitReached(lang), lang)
        } else if (inviteResult.alreadyInvited) {
          await sendTextMessage(
            fromPhoneNumber,
            formatInviteAlreadyPending(toPhoneNumber, lang),
            lang
          )
        } else if (inviteResult.delivered) {
          await sendTextMessage(
            fromPhoneNumber,
            formatInviteSentToSender(toPhoneNumber, lang),
            lang
          )
        } else {
          await sendTextMessage(
            fromPhoneNumber,
            formatInviteDeliveryFailed(toPhoneNumber, lang),
            lang
          )
        }
      } catch {
        await sendTextMessage(
          fromPhoneNumber,
          formatRecipientNotFoundMessage(toPhoneNumber, lang),
          lang
        )
      }
      return false
    }

    const updateResult = await updateLastActivity(fromPhoneNumber)
    if (!updateResult) {
      logger.error('Failed to update last activity')
    }

    await sendTextMessage(
      fromPhoneNumber,
      formatSendProcessingMessage(
        { amount, toPhone: toPhoneNumber, localRate: senderRate, localCurrency: senderCurrency },
        lang
      ),
      lang
    )

    let refuelTxHash = ''
    try {
      const refuelService = getRefuelService()

      if (refuelService.isAvailable()) {
        logger.info(`Checking if refuel is needed for ${senderWallet.walletAddress}`)
        const refuelResult = await refuelService.checkAndRefuel(senderWallet.walletAddress)

        if (refuelResult.success) {
          refuelTxHash = refuelResult.txHash || ''
          logger.info('Gas auto-refueled via smart contract')
          logger.info(`Refuel TX: ${refuelTxHash}`)
        } else {
          logger.info(`No refuel needed: ${refuelResult.error}`)
        }
      } else {
        logger.info('Refuel service not configured')
      }
    } catch (refuelError) {
      logger.error('Refuel check failed: %o', refuelError)
    }

    logger.info('Executing transfer...')
    const result = await sendUSDCToUser(fromPhoneNumber, toPhoneNumber, amount)
    transferCompleted = true // Transfer on-chain; notification failures must not return false
    velocityService.recordSend(fromPhoneNumber, toPhoneNumber, amount)

    const successMessage = formatSendSuccessMessage(
      {
        amount,
        toPhone: toPhoneNumber,
        txHash: result.transactionHash,
        gasCovered: !!refuelTxHash,
        localRate: senderRate,
        localCurrency: senderCurrency,
      },
      lang
    )

    await sendTextMessage(fromPhoneNumber, successMessage, lang)

    // POAP claim-link DM. Best-effort, isolated from the rest of the
    // post-transfer flow: only fires for pay-QR-initiated payments to a
    // user linked to an active event with a POAP URL that hasn't already
    // been pinged. Chat-typed sends never trigger this — scanning a QR is
    // the "I'm at this event" signal.
    if (fromQrScan) void sendPoapInviteIfPending(fromPhoneNumber, lang)

    // Notify recipient via template message (works outside 24h session window)
    const recipientLang =
      (await getUserLanguage(toPhoneNumber)) || getLanguageForPhone(toPhoneNumber)
    await notifyPaymentReceived({
      recipientPhone: toPhoneNumber,
      amount: amount.toFixed(2),
      asset: 'USDC',
      senderPhone: fromPhoneNumber,
      txHash: result.transactionHash,
      lang: recipientLang,
      localRate: recipientRate,
      localCurrency: recipientCurrency,
    })

    await sendButtonMessage(
      fromPhoneNumber,
      buttonNeedAnythingElse(lang),
      [{ title: buttonBalance(lang) }, { title: buttonHelp(lang) }],
      lang
    )

    logger.info(`Transfer completed. Hash: ${result.transactionHash}`)
    return true
  } catch (error) {
    if (transferCompleted) {
      // Transfer succeeded but a post-transfer notification failed — non-critical.
      // Return true so the confirm handler does not treat this as a failed transfer.
      logger.error('Post-transfer notification failed: %o', error)
      return true
    }

    if (error instanceof CdpTimeoutError) {
      // Timeout does NOT mean the transaction failed — it may still complete on-chain.
      // Tell the user the outcome is unknown so they check balance before retrying.
      logger.error('CDP transaction timeout (outcome unknown): %o', error)
      const msg = {
        en: 'The transfer is taking longer than expected. Please check your balance before trying again — the transfer may still complete.',
        es: 'La transferencia esta tardando mas de lo esperado. Revisa tu saldo antes de intentar de nuevo — la transferencia podria completarse.',
        pt: 'A transferencia esta demorando mais do que o esperado. Verifique seu saldo antes de tentar novamente — a transferencia pode ser concluida.',
      }
      await sendTextMessage(fromPhoneNumber, msg[lang] || msg.en, lang)
      return false
    }

    logger.error('Failed to send USDC: %o', error)

    const errorMessage = toUserErrorMessage(error, lang)
    await sendTextMessage(fromPhoneNumber, formatTransferFailedMessage(errorMessage, lang), lang)
    return false
  }
}

async function handleEmbeddedSend(
  fromPhoneNumber: string,
  toPhoneNumber: string,
  amount: number,
  senderWallet: {
    phoneNumber: string
    walletAddress: string
    spendPermissionHash: string | null
    dailyLimit: number | null
  },
  lang: Lang,
  senderRate: number | null,
  senderCurrency: string | null,
  recipientRate: number | null,
  recipientCurrency: string | null,
  fromQrScan: boolean = false
): Promise<boolean> {
  if (!senderWallet.spendPermissionHash) {
    await sendTextMessage(fromPhoneNumber, formatSetupRequiredMessage(fromPhoneNumber, lang), lang)
    return false
  }

  // Check recipient has a wallet (either embedded or legacy)
  const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber)
  const recipientLegacy = await getUserWallet(toPhoneNumber)
  const recipientMissing = !recipientEmbedded && !recipientLegacy

  // Check balance
  const senderBalance = await getEmbeddedBalance(fromPhoneNumber)

  if (senderBalance < amount) {
    await sendTextMessage(
      fromPhoneNumber,
      formatInsufficientBalanceMessage(
        {
          balance: senderBalance,
          needed: amount,
          localRate: senderRate,
          localCurrency: senderCurrency,
        },
        lang
      ),
      lang
    )
    return false
  }

  // Check daily limit
  if (senderWallet.dailyLimit && amount > senderWallet.dailyLimit) {
    await sendTextMessage(
      fromPhoneNumber,
      formatDailyLimitExceededMessage(senderWallet.dailyLimit, fromPhoneNumber, lang),
      lang
    )
    return false
  }

  const velocityCheck = velocityService.check(fromPhoneNumber, toPhoneNumber, amount, lang)
  if (!velocityCheck.allowed) {
    await sendTextMessage(fromPhoneNumber, velocityCheck.reason!, lang)
    return false
  }

  // Recipient not on Sippy — invite them (only after sender validation passes)
  if (recipientMissing) {
    try {
      const inviteResult = await createInvite(fromPhoneNumber, toPhoneNumber, amount, lang)
      if (inviteResult.dailyLimitReached) {
        await sendTextMessage(fromPhoneNumber, formatInviteDailyLimitReached(lang), lang)
      } else if (inviteResult.alreadyInvited) {
        await sendTextMessage(
          fromPhoneNumber,
          formatInviteAlreadyPending(toPhoneNumber, lang),
          lang
        )
      } else if (inviteResult.delivered) {
        await sendTextMessage(fromPhoneNumber, formatInviteSentToSender(toPhoneNumber, lang), lang)
      } else {
        await sendTextMessage(
          fromPhoneNumber,
          formatInviteDeliveryFailed(toPhoneNumber, lang),
          lang
        )
      }
    } catch {
      await sendTextMessage(
        fromPhoneNumber,
        formatRecipientNotFoundMessage(toPhoneNumber, lang),
        lang
      )
    }
    return false
  }

  await sendTextMessage(
    fromPhoneNumber,
    formatSendProcessingMessage(
      { amount, toPhone: toPhoneNumber, localRate: senderRate, localCurrency: senderCurrency },
      lang
    ),
    lang
  )

  logger.info('Executing embedded wallet transfer via spend permission...')

  const result = await sendToPhoneNumber(fromPhoneNumber, toPhoneNumber, amount)
  // Transfer on-chain; post-transfer failures must not return false

  try {
    velocityService.recordSend(fromPhoneNumber, toPhoneNumber, amount)

    logger.info(`Embedded transfer completed. Hash: ${result.transactionHash}`)

    let successMessage = formatSendSuccessMessage(
      {
        amount,
        toPhone: toPhoneNumber,
        txHash: result.transactionHash,
        gasCovered: true,
        localRate: senderRate,
        localCurrency: senderCurrency,
      },
      lang
    )

    if (result.remainingAllowance !== undefined) {
      const remaining = result.remainingAllowance.toFixed(2)
      let resetInfo = ''
      if (result.periodEndsAt) {
        const daysUntilReset = Math.ceil((result.periodEndsAt - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntilReset <= 1) {
          resetInfo =
            lang === 'en'
              ? ' (resets tomorrow)'
              : lang === 'es'
                ? ' (se renueva manana)'
                : ' (renova amanha)'
        } else {
          resetInfo =
            lang === 'en'
              ? ` (resets in ${daysUntilReset} days)`
              : lang === 'es'
                ? ` (se renueva en ${daysUntilReset} dias)`
                : ` (renova em ${daysUntilReset} dias)`
        }
      }
      successMessage += `\n\n${formatSpendingLimitInfo(remaining, resetInfo, lang)}`
    }

    // Send notifications - errors here are non-critical since transfer succeeded
    try {
      await sendTextMessage(fromPhoneNumber, successMessage, lang)
    } catch (notifyError) {
      logger.error('Failed to send success notification to sender: %o', notifyError)
    }

    // POAP claim-link DM. Best-effort, isolated from the rest of the
    // post-transfer flow: only fires for pay-QR-initiated payments to a
    // user linked to an active event with a POAP URL that hasn't already
    // been pinged. Chat-typed sends never trigger this — scanning a QR is
    // the "I'm at this event" signal.
    if (fromQrScan) void sendPoapInviteIfPending(fromPhoneNumber, lang)

    // Notify recipient via template message (works outside 24h session window)
    try {
      const recipientLang =
        (await getUserLanguage(toPhoneNumber)) || getLanguageForPhone(toPhoneNumber)
      await notifyPaymentReceived({
        recipientPhone: toPhoneNumber,
        amount: amount.toFixed(2),
        asset: 'USDC',
        senderPhone: fromPhoneNumber,
        txHash: result.transactionHash,
        lang: recipientLang,
        localRate: recipientRate,
        localCurrency: recipientCurrency,
      })
    } catch (notifyError) {
      logger.error('Failed to send notification to recipient: %o', notifyError)
    }

    try {
      await sendButtonMessage(
        fromPhoneNumber,
        buttonNeedAnythingElse(lang),
        [{ title: buttonBalance(lang) }, { title: buttonHelp(lang) }],
        lang
      )
    } catch (notifyError) {
      logger.error('Failed to send button message: %o', notifyError)
    }
  } catch (postTransferError) {
    logger.error(
      'Post-transfer operation failed (transfer already completed): %o',
      postTransferError
    )
  }

  return true
}
