import logger from '@adonisjs/core/services/logger'
import {
  getUserWallet,
  getUserBalance,
  isSessionValid,
  updateLastActivity,
  getSecurityLimitStatus,
} from '#services/cdp_wallet.service'
import {
  getEmbeddedWallet,
  getEmbeddedBalance,
  getRemainingAllowance,
} from '#services/embedded_wallet.service'
import { sendTextMessage } from '#services/whatsapp.service'
import {
  type Lang,
  formatBalanceMessage,
  formatNoWalletMessage,
  formatSessionExpiredMessage,
  formatLowTransferBalanceMessage,
  formatBalanceErrorMessage,
  formatSpendingLimitBalance,
  formatCompleteSetupMessage,
  formatDailySecurityLimitBalance,
} from '#utils/messages'
import { toUserErrorMessage } from '#utils/errors'
import { getRefuelService } from '#services/refuel.service'

export function appendSecurityLimitSuffix(
  limitStatus: { remaining: number; effectiveLimit: number },
  lang: Lang
): string {
  const remaining = limitStatus.remaining.toFixed(2)
  const total = limitStatus.effectiveLimit.toFixed(2)
  return `\n\n${formatDailySecurityLimitBalance(remaining, total, lang)}`
}

export async function handleBalanceCommand(
  phoneNumber: string,
  lang: Lang,
  localRate: number | null,
  localCurrency: string | null
): Promise<void> {
  logger.info(`BALANCE command from ${phoneNumber}`)

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber)

    if (embeddedWallet) {
      await handleEmbeddedBalance(phoneNumber, embeddedWallet, lang, localRate, localCurrency)
      return
    }

    // Fall back to legacy server wallet flow
    const userWallet = await getUserWallet(phoneNumber)
    if (!userWallet) {
      await sendTextMessage(phoneNumber, formatNoWalletMessage(lang), lang)
      return
    }

    if (!(await isSessionValid(phoneNumber))) {
      await sendTextMessage(phoneNumber, formatSessionExpiredMessage(lang), lang)
      return
    }

    await updateLastActivity(phoneNumber)

    logger.info(`Fetching balance for ${phoneNumber}...`)
    const balance = await getUserBalance(phoneNumber)

    let ethBalance: string | undefined
    try {
      const refuelService = getRefuelService()
      if (refuelService.isAvailable()) {
        ethBalance = await refuelService.getUserBalance(userWallet.walletAddress)
        logger.info(`ETH balance: ${ethBalance} ETH`)
      }
    } catch (error) {
      logger.warn('Failed to get ETH balance: %o', error)
    }

    let message = formatBalanceMessage(
      {
        balance,
        wallet: userWallet.walletAddress,
        ethBalance,
        phoneNumber,
        localRate,
        localCurrency,
      },
      lang
    )

    if (ethBalance && parseFloat(ethBalance) < 0.00001) {
      message += `\n\n${formatLowTransferBalanceMessage(lang)}`
    }

    const limitStatus = await getSecurityLimitStatus(phoneNumber)
    message += appendSecurityLimitSuffix(limitStatus, lang)

    await sendTextMessage(phoneNumber, message, lang)

    logger.info(`Balance sent to ${phoneNumber}: ${balance} USD`)
  } catch (error) {
    logger.error(`Failed to get balance for ${phoneNumber}: %o`, error)

    const errorMessage = toUserErrorMessage(error, lang)
    await sendTextMessage(phoneNumber, formatBalanceErrorMessage(errorMessage, lang), lang)
  }
}

async function handleEmbeddedBalance(
  phoneNumber: string,
  wallet: {
    phoneNumber: string
    walletAddress: string
    spendPermissionHash: string | null
    dailyLimit: number | null
  },
  lang: Lang,
  localRate: number | null,
  localCurrency: string | null
): Promise<void> {
  logger.info(`Fetching embedded wallet balance for ${phoneNumber}...`)

  const balance = await getEmbeddedBalance(phoneNumber)

  let message = formatBalanceMessage(
    {
      balance,
      wallet: wallet.walletAddress,
      phoneNumber,
      localRate,
      localCurrency,
    },
    lang
  )

  if (wallet.spendPermissionHash) {
    const allowanceInfo = await getRemainingAllowance(phoneNumber)
    if (allowanceInfo) {
      const remaining = allowanceInfo.remaining.toFixed(2)
      const total = allowanceInfo.allowance.toFixed(2)
      const hoursUntilReset = Math.ceil(
        (allowanceInfo.periodEndsAt - Date.now()) / (1000 * 60 * 60)
      )
      message += `\n\n${formatSpendingLimitBalance(remaining, total, hoursUntilReset, lang)}`
    }
  } else {
    message += `\n\n${formatCompleteSetupMessage(phoneNumber, lang)}`
  }

  const limitStatus = await getSecurityLimitStatus(phoneNumber)
  message += appendSecurityLimitSuffix(limitStatus, lang)

  await sendTextMessage(phoneNumber, message, lang)

  logger.info(`Balance sent to ${phoneNumber}: ${balance} USD`)
}
