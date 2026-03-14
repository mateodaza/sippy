/**
 * Notification Service
 *
 * Centralized helpers for sending WhatsApp notifications to recipients.
 * Uses template messages (HSM) so notifications work outside the 24-hour
 * session window — critical for "you received money" messages where
 * the recipient may not have messaged the bot recently.
 *
 * Template name/locale mapping and variable formatting live here,
 * keeping send_command.ts and notify_controller.ts focused on business logic.
 */

import logger from '@adonisjs/core/services/logger'
import { sendTemplateMessage } from '#services/whatsapp.service'

// Map app language codes to WhatsApp template language codes
const TEMPLATE_LANG_MAP: Record<string, string> = {
  en: 'en',
  es: 'es',
  pt: 'pt_BR',
}

/**
 * Template names registered in Meta Business Manager.
 * These must be pre-approved before they can be sent.
 */
const TEMPLATES = {
  paymentReceived: 'payment_received',
  fundReceived: 'fund_received',
} as const

/**
 * Notify a recipient that they received a payment via WhatsApp template message.
 *
 * Template: payment_received
 * Variables: {{1}} = amount + asset (e.g., "10.00 USDC"), {{2}} = sender masked phone
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyPaymentReceived(opts: {
  recipientPhone: string
  amount: string
  asset: string
  senderPhone: string
  txHash: string
  lang: string
}): Promise<void> {
  const { recipientPhone, amount, asset, senderPhone, txHash, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  // Mask sender phone for privacy: +573001234567 → +57***4567
  const masked = senderPhone.length > 4
    ? `${senderPhone.slice(0, 3)}***${senderPhone.slice(-4)}`
    : senderPhone

  const amountWithAsset = `${amount} ${asset.toUpperCase()}`

  try {
    const result = await sendTemplateMessage(
      recipientPhone,
      TEMPLATES.paymentReceived,
      templateLang,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: amountWithAsset },
            { type: 'text', text: masked },
          ],
        },
      ]
    )
    if (result) {
      logger.info(`Payment notification sent to ${recipientPhone} (${amountWithAsset}, tx: ${txHash})`)
    } else {
      logger.warn(`Payment notification failed for ${recipientPhone} — template may not be approved yet`)
    }
  } catch (error) {
    logger.error('Failed to send payment notification to %s: %o', recipientPhone, error)
  }
}

/**
 * Notify a recipient that they received a fund deposit via WhatsApp template message.
 *
 * Template: fund_received
 * Variables: {{1}} = amount (e.g., "25.00"), {{2}} = asset type (e.g., "USDC")
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyFundReceived(opts: {
  recipientPhone: string
  amount: string
  type: 'eth' | 'usdc'
  txHash: string
  lang: string
}): Promise<void> {
  const { recipientPhone, amount, type, txHash, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'
  const assetLabel = type.toUpperCase()

  try {
    const result = await sendTemplateMessage(
      recipientPhone,
      TEMPLATES.fundReceived,
      templateLang,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: amount },
            { type: 'text', text: assetLabel },
          ],
        },
      ]
    )
    if (result) {
      logger.info(`Fund notification sent to ${recipientPhone} (${amount} ${assetLabel}, tx: ${txHash})`)
    } else {
      logger.warn(`Fund notification failed for ${recipientPhone} — template may not be approved yet`)
    }
  } catch (error) {
    logger.error('Failed to send fund notification to %s: %o', recipientPhone, error)
  }
}
