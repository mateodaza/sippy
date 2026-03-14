/**
 * NotifyController
 *
 * Sends WhatsApp notifications to users about fund deposits.
 * Ported from Express POST /notify-fund.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { timingSafeEqual } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { getUserLanguage } from '#services/db'
import { getUserWallet } from '#services/cdp_wallet.service'
import { notifyFundReceived } from '#services/notification.service'
import { canonicalizePhone } from '#utils/phone'

export default class NotifyController {
  /**
   * POST /notify-fund
   *
   * Body: { phone: string, type: 'eth' | 'usdc', amount: string, txHash: string }
   *
   * Sends a WhatsApp notification to the user about a fund deposit.
   */
  async fund({ request, response }: HttpContext) {
    try {
      // Verify dedicated notify secret to prevent unauthenticated notification spam
      const notifySecret = env.get('NOTIFY_SECRET', '')
      if (!notifySecret) {
        logger.error('NOTIFY_SECRET is not configured — rejecting notify request')
        return response.status(503).json({ error: 'Notification endpoint not configured' })
      }
      const secret = request.header('x-notify-secret')
      if (
        !secret ||
        secret.length !== notifySecret.length ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(notifySecret))
      ) {
        return response.status(401).json({ error: 'Unauthorized' })
      }

      const { phone, type, amount, txHash } = request.body()

      if (!phone || !type || !amount || !txHash) {
        return response.status(400).json({
          error: 'Missing required fields',
          message: 'phone, type, amount, and txHash are required',
        })
      }

      if (typeof amount !== 'string' || typeof txHash !== 'string') {
        return response.status(400).json({ error: 'Invalid field types' })
      }

      if (type !== 'eth' && type !== 'usdc') {
        return response.status(400).json({
          error: 'Invalid type',
          message: 'type must be "eth" or "usdc"',
        })
      }

      const canonicalPhone = canonicalizePhone(phone)
      if (!canonicalPhone) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      logger.info(`Sending Fund notification to ${canonicalPhone}: ${amount} ${type.toUpperCase()}`)

      // Verify wallet exists (user must have started via WhatsApp first)
      const wallet = await getUserWallet(canonicalPhone)
      if (!wallet) {
        return response.status(404).json({
          error: 'Wallet not found',
          message: `Phone number ${canonicalPhone} hasn't started using Sippy yet.`,
        })
      }

      // Send WhatsApp template notification (works outside 24h session window)
      const fundLang = (await getUserLanguage(canonicalPhone)) || 'en'
      await notifyFundReceived({
        recipientPhone: canonicalPhone,
        amount,
        type,
        txHash,
        lang: fundLang,
      })

      logger.info(`Notification sent to ${canonicalPhone}`)

      return response.json({
        success: true,
        phone: canonicalPhone,
        type,
        amount,
      })
    } catch (error) {
      logger.error('Error sending Fund notification: %o', error)
      return response.status(500).json({
        error: 'Failed to send notification',
      })
    }
  }
}
