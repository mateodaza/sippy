import {
  getUserWallet,
  isSessionValid,
  updateLastActivity,
  sendUSDCToUser,
  getUserBalance,
  checkSecurityLimits,
  DAILY_LIMIT_VERIFIED,
  DAILY_LIMIT_UNVERIFIED,
} from '#services/cdp_wallet.service'
import {
  getEmbeddedWallet,
  getEmbeddedBalance,
  sendToPhoneNumber,
} from '#services/embedded_wallet.service'
import {
  sendTextMessage,
  sendButtonMessage,
} from '#services/whatsapp.service'
import { getRefuelService } from '#services/refuel.service'
import {
  type Lang,
  formatSendProcessingMessage,
  formatSendSuccessMessage,
  formatSendRecipientMessage,
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
  buttonNeedAnythingElse,
  buttonBalance,
  buttonHelp,
} from '#utils/messages'
import { toUserErrorMessage } from '#utils/errors'
import { getUserLanguage } from '#services/db'
import logger from '@adonisjs/core/services/logger'

export async function handleSendCommand(
  fromPhoneNumber: string,
  amount: number,
  toPhoneNumber: string,
  lang: Lang,
  senderRate: number | null,
  senderCurrency: string | null,
  recipientRate: number | null,
  recipientCurrency: string | null
): Promise<void> {
  logger.info(`SEND command: +${fromPhoneNumber} -> +${toPhoneNumber} (${amount} USD)`)

  try {
    if (amount <= 0 || isNaN(amount)) {
      await sendTextMessage(fromPhoneNumber, formatInvalidAmountMessage(lang), lang)
      return
    }

    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(fromPhoneNumber)

    if (embeddedWallet) {
      await handleEmbeddedSend(fromPhoneNumber, toPhoneNumber, amount, embeddedWallet, lang, senderRate, senderCurrency, recipientRate, recipientCurrency)
      return
    }

    // Fall back to legacy server wallet flow
    const senderWallet = await getUserWallet(fromPhoneNumber)
    if (!senderWallet) {
      await sendTextMessage(fromPhoneNumber, formatNoWalletMessage(lang), lang)
      return
    }

    if (!(await isSessionValid(fromPhoneNumber))) {
      await sendTextMessage(fromPhoneNumber, formatSessionExpiredMessage(lang), lang)
      return
    }

    // Check recipient has a wallet (either embedded or legacy)
    const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber)
    const recipientLegacy = await getUserWallet(toPhoneNumber)

    if (!recipientEmbedded && !recipientLegacy) {
      await sendTextMessage(
        fromPhoneNumber,
        formatRecipientNotFoundMessage(toPhoneNumber, lang),
        lang
      )
      return
    }

    const senderBalance = await getUserBalance(fromPhoneNumber)

    if (senderBalance < amount) {
      await sendTextMessage(
        fromPhoneNumber,
        formatInsufficientBalanceMessage(
          { balance: senderBalance, needed: amount, localRate: senderRate, localCurrency: senderCurrency },
          lang
        ),
        lang
      )
      return
    }

    // Check security limits
    const limitsCheck = await checkSecurityLimits(fromPhoneNumber, amount)
    if (!limitsCheck.allowed) {
      const effectiveLimit = limitsCheck.emailVerified ? DAILY_LIMIT_VERIFIED : DAILY_LIMIT_UNVERIFIED
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
      return
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

    const recipientLang = (await getUserLanguage(toPhoneNumber)) || 'en'
    const recipientMessage = formatSendRecipientMessage(
      {
        amount,
        fromPhone: fromPhoneNumber,
        txHash: result.transactionHash,
        localRate: recipientRate,
        localCurrency: recipientCurrency,
      },
      recipientLang
    )

    await sendTextMessage(toPhoneNumber, recipientMessage, recipientLang)

    await sendButtonMessage(
      fromPhoneNumber,
      buttonNeedAnythingElse(lang),
      [{ title: buttonBalance(lang) }, { title: buttonHelp(lang) }],
      lang
    )

    logger.info(`Transfer completed. Hash: ${result.transactionHash}`)
  } catch (error) {
    logger.error('Failed to send USDC: %o', error)

    const errorMessage = toUserErrorMessage(error, lang)
    await sendTextMessage(
      fromPhoneNumber,
      formatTransferFailedMessage(errorMessage, lang),
      lang
    )
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
  recipientCurrency: string | null
): Promise<void> {
  if (!senderWallet.spendPermissionHash) {
    await sendTextMessage(
      fromPhoneNumber,
      formatSetupRequiredMessage(fromPhoneNumber, lang),
      lang
    )
    return
  }

  // Check recipient has a wallet (either embedded or legacy)
  const recipientEmbedded = await getEmbeddedWallet(toPhoneNumber)
  const recipientLegacy = await getUserWallet(toPhoneNumber)

  if (!recipientEmbedded && !recipientLegacy) {
    await sendTextMessage(
      fromPhoneNumber,
      formatRecipientNotFoundMessage(toPhoneNumber, lang),
      lang
    )
    return
  }

  // Check balance
  const senderBalance = await getEmbeddedBalance(fromPhoneNumber)

  if (senderBalance < amount) {
    await sendTextMessage(
      fromPhoneNumber,
      formatInsufficientBalanceMessage(
        { balance: senderBalance, needed: amount, localRate: senderRate, localCurrency: senderCurrency },
        lang
      ),
      lang
    )
    return
  }

  // Check daily limit
  if (senderWallet.dailyLimit && amount > senderWallet.dailyLimit) {
    await sendTextMessage(
      fromPhoneNumber,
      formatDailyLimitExceededMessage(senderWallet.dailyLimit, fromPhoneNumber, lang),
      lang
    )
    return
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
      const daysUntilReset = Math.ceil(
        (result.periodEndsAt - Date.now()) / (1000 * 60 * 60 * 24)
      )
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

  try {
    const recipientLang = (await getUserLanguage(toPhoneNumber)) || 'en'
    const recipientMessage = formatSendRecipientMessage(
      {
        amount,
        fromPhone: fromPhoneNumber,
        txHash: result.transactionHash,
        localRate: recipientRate,
        localCurrency: recipientCurrency,
      },
      recipientLang
    )
    await sendTextMessage(toPhoneNumber, recipientMessage, recipientLang)
  } catch (notifyError) {
    logger.error('Failed to send notification to recipient: %o', notifyError)
  }

  await sendButtonMessage(
    fromPhoneNumber,
    buttonNeedAnythingElse(lang),
    [{ title: buttonBalance(lang) }, { title: buttonHelp(lang) }],
    lang
  )
}
