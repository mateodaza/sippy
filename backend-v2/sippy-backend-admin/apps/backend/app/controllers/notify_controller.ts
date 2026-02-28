/**
 * NotifyController
 *
 * Sends WhatsApp notifications to users about fund deposits.
 * Ported from Express POST /notify-fund.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { getUserLanguage } from '#services/db'
import { getUserWallet } from '#services/cdp_wallet.service'
import { sendTextMessage } from '#services/whatsapp.service'
import { formatFundETHReceivedMessage, formatFundUSDReceivedMessage } from '#utils/messages'

export default class NotifyController {
  /**
   * POST /notify-fund
   *
   * Body: { phone: string, type: 'eth' | 'usdc' | 'pyusd', amount: string, txHash: string }
   *
   * Sends a WhatsApp notification to the user about a fund deposit.
   */
  async fund({ request, response }: HttpContext) {
    try {
      const { phone, type, amount, txHash } = request.body()

      if (!phone || !type || !amount || !txHash) {
        return response.status(400).json({
          error: 'Missing required fields',
          message: 'phone, type, amount, and txHash are required',
        })
      }

      if (type !== 'eth' && type !== 'usdc' && type !== 'pyusd') {
        return response.status(400).json({
          error: 'Invalid type',
          message: 'type must be either "eth" or "usdc"',
        })
      }

      // Clean phone number (remove + and spaces)
      const cleanPhone = phone.replace(/[^\d]/g, '')

      logger.info(`Sending Fund notification to +${cleanPhone}: ${amount} ${type.toUpperCase()}`)

      // Verify wallet exists (user must have started via WhatsApp first)
      const wallet = await getUserWallet(cleanPhone)
      if (!wallet) {
        return response.status(404).json({
          error: 'Wallet not found',
          message: `Phone number +${cleanPhone} hasn't started using Sippy yet.`,
        })
      }

      // Format message in recipient's language
      const fundLang = (await getUserLanguage(cleanPhone)) || 'en'
      const message =
        type === 'eth'
          ? formatFundETHReceivedMessage({ amount, txHash }, fundLang)
          : formatFundUSDReceivedMessage({ amount, txHash }, fundLang)

      // Send WhatsApp notification
      await sendTextMessage(cleanPhone, message, fundLang)

      logger.info(`Notification sent to +${cleanPhone}`)

      return response.json({
        success: true,
        phone: `+${cleanPhone}`,
        type,
        amount,
      })
    } catch (error) {
      logger.error('Error sending Fund notification: %o', error)
      return response.status(500).json({
        error: 'Failed to send notification',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
