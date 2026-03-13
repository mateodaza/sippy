/**
 * Start Command Handler
 *
 * Handles the "start" command from WhatsApp users.
 * Checks for embedded wallet (new self-custodial), then legacy server wallet,
 * then sends setup link for new users.
 */

import logger from '@adonisjs/core/services/logger'
import { getUserWallet, updateLastActivity } from '#services/cdp_wallet.service'
import { getEmbeddedWallet } from '#services/embedded_wallet.service'
import { sendTextMessage } from '#services/whatsapp.service'
import {
  type Lang,
  formatWelcomeMessage,
  formatWalletNotFullySetupMessage,
  formatNewUserSetupMessage,
  formatGenericErrorMessage,
} from '#utils/messages'
import { toUserErrorMessage } from '#utils/errors'

export async function handleStartCommand(phoneNumber: string, lang: Lang = 'en'): Promise<void> {
  logger.info(`START command from ${phoneNumber}`)

  try {
    // Check for embedded wallet first (new self-custodial system)
    const embeddedWallet = await getEmbeddedWallet(phoneNumber)

    if (embeddedWallet) {
      await updateLastActivity(phoneNumber)

      if (embeddedWallet.spendPermissionHash) {
        const message = formatWelcomeMessage(
          {
            wallet: embeddedWallet.walletAddress,
            isNew: false,
          },
          lang
        )
        await sendTextMessage(phoneNumber, message, lang)
      } else {
        await sendTextMessage(
          phoneNumber,
          formatWalletNotFullySetupMessage(phoneNumber, lang),
          lang
        )
      }
      return
    }

    // Check for legacy server wallet (old custodial system)
    const legacyWallet = await getUserWallet(phoneNumber)

    if (legacyWallet) {
      await updateLastActivity(phoneNumber)

      const message = formatWelcomeMessage(
        {
          wallet: legacyWallet.walletAddress,
          isNew: false,
        },
        lang
      )
      await sendTextMessage(phoneNumber, message, lang)
      return
    }

    // New user - send setup link for embedded wallet
    await sendTextMessage(phoneNumber, formatNewUserSetupMessage(phoneNumber, lang), lang)

    logger.info(`Setup link sent to ${phoneNumber}`)
  } catch (error) {
    logger.error(`Failed to handle start command: %o`, error)

    const errorMessage = toUserErrorMessage(error, lang)
    await sendTextMessage(phoneNumber, formatGenericErrorMessage(errorMessage, lang), lang)
  }
}
