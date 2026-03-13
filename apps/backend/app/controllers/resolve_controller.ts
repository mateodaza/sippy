/**
 * ResolveController
 *
 * Phone-to-wallet and wallet-to-phone resolution endpoints.
 * Ported from Express GET /resolve-phone and GET /resolve-address.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query } from '#services/db'
import { getUserWallet } from '#services/cdp_wallet.service'
import { canonicalizePhone } from '#utils/phone'

export default class ResolveController {
  /**
   * GET /resolve-phone?phone=+573001234567
   *
   * Resolves a phone number to a wallet address.
   * IP throttle middleware is applied at the route level.
   */
  async byPhone({ request, response }: HttpContext) {
    try {
      const phone = request.input('phone') as string | undefined

      if (!phone) {
        return response.status(400).json({
          error: 'Phone number is required',
        })
      }

      const canonicalPhone = canonicalizePhone(phone)
      if (!canonicalPhone) {
        return response.status(400).json({ error: 'Invalid phone number' })
      }

      logger.info(`Resolving phone number: ${canonicalPhone}`)

      // Try to get existing wallet
      const wallet = await getUserWallet(canonicalPhone)

      // If wallet doesn't exist, return error - user must start via WhatsApp first
      if (!wallet) {
        logger.info(`Wallet not found for ${canonicalPhone}`)

        // Get Sippy WhatsApp number from env
        const sippyWhatsAppNumber = env.get('SIPPY_WHATSAPP_NUMBER')
        const whatsappLink = sippyWhatsAppNumber
          ? `https://wa.me/${sippyWhatsAppNumber}?text=start`
          : undefined

        return response.status(404).json({
          error: 'Wallet not found',
          message: `This phone number hasn't started using Sippy yet. They need to send "start" to Sippy on WhatsApp first.`,
          phone: canonicalPhone,
          ...(whatsappLink && { whatsappLink }),
        })
      }

      logger.info(`Wallet found: ${wallet.walletAddress}`)

      return response.json({
        address: wallet.walletAddress,
        phone: canonicalPhone,
        isNew: !wallet.lastActivity || wallet.lastActivity === wallet.createdAt,
      })
    } catch (error) {
      logger.error('Error resolving phone: %o', error)
      return response.status(500).json({
        error: 'Failed to resolve phone number',
      })
    }
  }

  /**
   * GET /resolve-address?address=0x5Aa5B05d77C45E00C023ff90a7dB2c9FBD9bcde4
   *
   * Reverse lookup: wallet address to phone number.
   */
  async byAddress({ request, response }: HttpContext) {
    try {
      const address = request.input('address') as string | undefined

      if (!address) {
        return response.status(400).json({
          error: 'Wallet address is required',
        })
      }

      logger.info(`Reverse lookup for address: ${address}`)

      // Query database for phone number by wallet address
      const result = await query<{
        phone_number: string
        wallet_address: string
      }>(
        'SELECT phone_number, wallet_address FROM phone_registry WHERE LOWER(wallet_address) = LOWER($1)',
        [address]
      )

      if (result.rows.length === 0) {
        logger.info(`No phone number found for address: ${address}`)
        return response.json({
          address,
          phone: null,
        })
      }

      const storedPhone = result.rows[0].phone_number
      const phone = storedPhone.startsWith('+') ? storedPhone : `+${storedPhone}`
      logger.info(`Found phone: ${phone}`)

      return response.json({
        address,
        phone,
      })
    } catch (error) {
      logger.error('Error resolving address: %o', error)
      return response.status(500).json({
        error: 'Failed to resolve address',
      })
    }
  }
}
