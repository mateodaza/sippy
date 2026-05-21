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
import { maskPhone } from '#utils/phone'

// Map app language codes to WhatsApp template language codes
const TEMPLATE_LANG_MAP: Record<string, string> = {
  en: 'en',
  es: 'es',
  pt: 'pt_BR',
}

// Country codes that should receive invite templates in Spanish.
const ES_PREFIXES = [
  '+34', // Spain
  '+52',
  '+53',
  '+54',
  '+56',
  '+57',
  '+58',
  '+51',
  '+591',
  '+593',
  '+595',
  '+598',
  '+502',
  '+503',
  '+504',
  '+505',
  '+506',
  '+507',
  '+509',
]

// Country codes that should receive invite templates in Portuguese.
const PT_PREFIXES = [
  '+55', // Brazil
  '+351', // Portugal
]

/**
 * Pick the WhatsApp template language for an invite based on the recipient's
 * phone prefix. Spanish-speaking → es, Portuguese-speaking → pt_BR, else → en.
 */
function getInviteTemplateLang(phone: string): string {
  for (const prefix of PT_PREFIXES) {
    if (phone.startsWith(prefix)) return 'pt_BR'
  }
  for (const prefix of ES_PREFIXES) {
    if (phone.startsWith(prefix)) return 'es'
  }
  return 'en'
}

/**
 * Template names registered in Meta Business Manager.
 * These must be pre-approved before they can be sent.
 */
const TEMPLATES = {
  paymentReceived: 'payment_received',
  fundReceived: 'fund_received',
  offrampCompleted: 'offramp_completed',
  friendInvite: 'friend_invite',
  inviteCompleted: 'invite_completed',
  setupCompleted: 'setup_completed',
  /**
   * POAP claim-link DM. Sent to an attendee whose operator-send confirmed
   * on-chain at an event with a pool of mint URLs (e.g. Pizza Day's 300).
   *
   * Includes the user's Sippy wallet address as a copy-paste convenience:
   * POAP's claim page asks for an address to mint to, and many attendees
   * won't have a wallet outside Sippy.
   *
   * Submit in Meta Business Manager → WhatsApp → Message Templates:
   *   Name: poap_claim_invite
   *   Category: Utility (Marketing also works but Utility approves faster)
   *   Languages: en, es, pt_BR
   *   Variables: {{1}} = event name
   *              {{2}} = POAP claim URL
   *              {{3}} = user's Sippy wallet address (0x…)
   *   Body (en):
   *     "🎉 Welcome to {{1}}! Claim your POAP here:
   *     {{2}}
   *
   *     If POAP asks for an address, paste your Sippy wallet:
   *     {{3}}
   *
   *     Or use any other wallet you have."
   *   Body (es):
   *     "🎉 ¡Bienvenido a {{1}}! Reclama tu POAP aquí:
   *     {{2}}
   *
   *     Si POAP te pide una dirección, pega tu billetera Sippy:
   *     {{3}}
   *
   *     O usa cualquier otra billetera que tengas."
   *   Body (pt_BR):
   *     "🎉 Bem-vindo ao {{1}}! Resgate seu POAP aqui:
   *     {{2}}
   *
   *     Se o POAP pedir um endereço, cole sua carteira Sippy:
   *     {{3}}
   *
   *     Ou use qualquer outra carteira que tenha."
   *
   * No buttons needed — POAP URL is in the body. Approval is typically
   * <24h for Utility templates. Free-text fallback fires if the template
   * isn't yet approved (works inside the 24h customer-service window).
   */
  poapClaimInvite: 'poap_claim_invite',
} as const

/**
 * Notify a recipient that they received a payment via WhatsApp template message.
 *
 * Template: payment_received
 * Variables: {{1}} = amount + asset (e.g., "10.00 USDC"),
 *            {{2}} = sender masked phone OR `senderDisplay` (unmasked).
 *
 * `senderDisplay`, when provided, replaces the auto-masked phone in {{2}}.
 * Used by operator sends where {{2}} should read as the event ("Pizza
 * Day Cartagena 2026") rather than a `Piz***2026`-style mask of the
 * event string. For chat-to-chat sends, leave it undefined so the phone
 * gets masked for privacy.
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyPaymentReceived(opts: {
  recipientPhone: string
  amount: string
  asset: string
  senderPhone: string
  /** When set, used verbatim as the template's `from` var (no masking). */
  senderDisplay?: string
  txHash: string
  lang: string
  localRate?: number | null
  localCurrency?: string | null
}): Promise<void> {
  const {
    recipientPhone,
    amount,
    asset,
    senderPhone,
    senderDisplay,
    txHash,
    lang,
    localRate,
    localCurrency,
  } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  // For operator sends, `senderDisplay` overrides the masked-phone behavior
  // so {{2}} can be the event name (or any non-phone identifier). For
  // chat-to-chat sends, fall back to masking `senderPhone`.
  const masked = senderDisplay
    ? senderDisplay
    : senderPhone.length > 4
      ? `${senderPhone.slice(0, 3)}***${senderPhone.slice(-4)}`
      : senderPhone

  // Include local currency equivalent: "0.54 USDC (~2,000 COP)"
  let amountWithAsset = `${amount} ${asset.toUpperCase()}`
  if (localRate && localRate > 0 && localCurrency) {
    const localAmount = Math.round(Number.parseFloat(amount) * localRate)
    const localStr = localAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })
    amountWithAsset += ` (~${localStr} ${localCurrency})`
  }

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
      logger.info(
        `Payment notification sent to ${maskPhone(recipientPhone)} (${amountWithAsset}, tx: ${txHash})`
      )
    } else {
      logger.warn(
        `Payment notification failed for ${maskPhone(recipientPhone)} — template may not be approved yet`
      )
    }
  } catch (error) {
    logger.error('Failed to send payment notification to %s: %o', maskPhone(recipientPhone), error)
  }
}

/**
 * Notify an attendee with their POAP claim link via WhatsApp template message.
 *
 * Template: poap_claim_invite (see TEMPLATES doc for body definition).
 * Variables: {{1}} = event name, {{2}} = unique POAP claim URL,
 *            {{3}} = user's Sippy wallet address (so they can paste it
 *                    into POAP's claim form if they don't have another).
 *
 * Return value semantics: `true` means **Meta accepted the send for
 * processing** (200 response + message_id), NOT confirmed delivery to
 * the user's handset. Post-acceptance failures (template revoked between
 * approval and use, recipient blocked, network blip on Meta's side)
 * arrive asynchronously via the status webhook and are logged in
 * webhook_controller.ts, not surfaced here. `false` means a synchronous
 * rejection — almost always "template not yet approved" or a 4xx like
 * 131047 (re-engagement / 24h window). The caller may try a free-text
 * fallback before deciding whether to release the reserved POAP code.
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyPoapClaimInvite(opts: {
  recipientPhone: string
  eventName: string
  poapClaimUrl: string
  sippyWalletAddress: string
  lang: string
}): Promise<boolean> {
  const { recipientPhone, eventName, poapClaimUrl, sippyWalletAddress, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  try {
    const result = await sendTemplateMessage(
      recipientPhone,
      TEMPLATES.poapClaimInvite,
      templateLang,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: eventName },
            { type: 'text', text: poapClaimUrl },
            { type: 'text', text: sippyWalletAddress },
          ],
        },
      ]
    )
    if (result) {
      logger.info(`POAP invite template sent to ${maskPhone(recipientPhone)} (event=${eventName})`)
      return true
    }
    logger.warn(
      `POAP invite template failed for ${maskPhone(recipientPhone)} — template may not be approved yet`
    )
    return false
  } catch (error) {
    logger.error('Failed to send POAP invite template to %s: %o', maskPhone(recipientPhone), error)
    return false
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
    const result = await sendTemplateMessage(recipientPhone, TEMPLATES.fundReceived, templateLang, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: amount },
          { type: 'text', text: assetLabel },
        ],
      },
    ])
    if (result) {
      logger.info(
        `Fund notification sent to ${maskPhone(recipientPhone)} (${amount} ${assetLabel}, tx: ${txHash})`
      )
    } else {
      logger.warn(
        `Fund notification failed for ${maskPhone(recipientPhone)} — template may not be approved yet`
      )
    }
  } catch (error) {
    logger.error('Failed to send fund notification to %s: %o', maskPhone(recipientPhone), error)
  }
}

/**
 * Notify a recipient that someone invited them to Sippy via WhatsApp template message.
 *
 * Template: friend_invite
 * No body parameters (anonymous invite).
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyInviteRecipient(opts: {
  recipientPhone: string
  lang: string
}): Promise<boolean> {
  const { recipientPhone } = opts
  // Derive language from the recipient's phone prefix (not the sender's).
  // LATAM country codes → es, Brazil → pt, everything else → en.
  const templateLang = getInviteTemplateLang(recipientPhone)

  try {
    const result = await sendTemplateMessage(
      recipientPhone,
      TEMPLATES.friendInvite,
      templateLang,
      []
    )
    if (result) {
      logger.info(`Invite notification sent to ${maskPhone(recipientPhone)}`)
      return true
    } else {
      logger.warn(
        `Invite notification failed for ${maskPhone(recipientPhone)} — template may not be approved yet`
      )
      return false
    }
  } catch (error) {
    logger.error('Failed to send invite notification to %s: %o', maskPhone(recipientPhone), error)
    return false
  }
}

/**
 * Notify a sender that their invited friend has joined Sippy.
 *
 * Template: invite_completed
 * Variables: {{1}} = masked recipient phone
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyInviteCompleted(opts: {
  senderPhone: string
  recipientPhone: string
  lang: string
}): Promise<void> {
  const { senderPhone, recipientPhone, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  // Mask recipient phone for privacy: +573001234567 → +57***4567
  const masked =
    recipientPhone.length > 4
      ? `${recipientPhone.slice(0, 3)}***${recipientPhone.slice(-4)}`
      : recipientPhone

  try {
    const result = await sendTemplateMessage(senderPhone, TEMPLATES.inviteCompleted, templateLang, [
      {
        type: 'body',
        parameters: [{ type: 'text', text: masked }],
      },
    ])
    if (result) {
      logger.info(
        `Invite completed notification sent to ${maskPhone(senderPhone)} (recipient: ${masked})`
      )
    } else {
      logger.warn(
        `Invite completed notification failed for ${maskPhone(senderPhone)} — template may not be approved yet`
      )
    }
  } catch (error) {
    logger.error(
      'Failed to send invite completed notification to %s: %o',
      maskPhone(senderPhone),
      error
    )
  }
}

/**
 * Notify a user that their COP offramp withdrawal has been sent to their bank.
 *
 * Template: offramp_completed
 * Variables: {{1}} = COP amount (e.g. "207,500"), {{2}} = bank display (e.g. "Bancolombia ****1234")
 *
 * Create this template in Meta Business Manager → WhatsApp → Message Templates:
 *   Category: Utility
 *   Body (es): "Tu retiro de {{1}} COP fue enviado a tu cuenta {{2}}. Puede tomar 1-3 días hábiles en aparecer."
 *   Body (en): "Your withdrawal of {{1}} COP was sent to your bank account {{2}}. It may take 1-3 business days to appear."
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyOfframpCompleted(opts: {
  phone: string
  amountCop: string
  bankDisplay: string
  lang: string
}): Promise<void> {
  const { phone, amountCop, bankDisplay, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'es'

  try {
    const result = await sendTemplateMessage(phone, TEMPLATES.offrampCompleted, templateLang, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: amountCop },
          { type: 'text', text: bankDisplay },
        ],
      },
    ])
    if (result) {
      logger.info(
        `Offramp notification sent to ${maskPhone(phone)} (${amountCop} COP → ${bankDisplay})`
      )
    } else {
      logger.warn(
        `Offramp notification failed for ${maskPhone(phone)} — template may not be approved yet`
      )
    }
  } catch (error) {
    logger.error('Failed to send offramp notification to %s: %o', maskPhone(phone), error)
  }
}

/**
 * Notify a user that their wallet setup is complete (return magnet).
 *
 * Pulls user back to WhatsApp after finishing onboarding in the browser.
 * Only call this on first-time setup — caller must check prior state.
 *
 * Template: setup_completed
 * No body parameters.
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifySetupCompleted(opts: { phone: string; lang: string }): Promise<void> {
  const { phone, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  try {
    const result = await sendTemplateMessage(phone, TEMPLATES.setupCompleted, templateLang, [])
    if (result) {
      logger.info(`Setup completed notification sent to ${maskPhone(phone)}`)
    } else {
      logger.warn(
        `Setup completed notification failed for ${maskPhone(phone)} — template may not be approved yet`
      )
    }
  } catch (error) {
    logger.error('Failed to send setup completed notification to %s: %o', maskPhone(phone), error)
  }
}
