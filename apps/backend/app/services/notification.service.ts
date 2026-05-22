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
  /**
   * General event announcement. A two-variable template where the body is
   * freeform per send — same Meta-approved wrapper ("Welcome to … / Enjoy
   * the event.") reused for many use cases: USDC drops, schedule updates,
   * prize announcements, post-event recaps.
   *
   * The caller (Sippy code) owns the middle. Meta approves the wrapper
   * once per language and we plug values in at runtime, so we don't have
   * to submit a new template every time we add a new announcement type.
   *
   * Submit in Meta Business Manager → WhatsApp → Message Templates:
   *   Name: event_announcement
   *   Category: Utility
   *   Languages: en, es, pt_BR
   *   Variables: {{1}} = event name / source (e.g. "Pizza Day Cartagena 2026")
   *              {{2}} = body content (free text, multiline, may include URLs;
   *                      ≤1024 chars per WhatsApp's per-variable limit)
   *   Body (en):
   *     "🎉 Welcome to {{1}}!
   *
   *     {{2}}
   *
   *     Enjoy the event."
   *   Body (es):
   *     "🎉 ¡Bienvenido a {{1}}!
   *
   *     {{2}}
   *
   *     Disfruta el evento."
   *   Body (pt_BR):
   *     "🎉 Bem-vindo ao {{1}}!
   *
   *     {{2}}
   *
   *     Aproveite o evento."
   *
   * Sample body content for the Pizza Day operator-drop case (built by
   * `formatOperatorDropBody` in this file — keep formatters next to the
   * template so the structure is auditable in one place):
   *   "You just received 4 USDC in your Sippy wallet. Type *balance* anytime to check. Claim your POAP: https://poap.xyz/claim/abc123. If POAP asks for a wallet address, paste 0x1a2b…."
   *
   * Hard constraint: the body parameter is ONE single line. WhatsApp's
   * Cloud API rejects template body parameters containing newlines,
   * tabs, or >4 consecutive spaces at send-time. The static wrapper
   * supplies the visual paragraph breaks (around {{2}}); the variable
   * itself stays one paragraph. This is why the prior multi-line draft
   * silently failed for every send (Meta returned 132000 → orchestrator
   * fell back to the legacy two-message flow).
   *
   * No buttons — URLs render as clickable text in WhatsApp. Approval is
   * typically <24h for Utility templates because the wrapper is short,
   * branded, and tied to a real event the user attended.
   *
   * Risk note: Meta occasionally flags "open body" templates as too
   * broad. If event_announcement is rejected, the fallback is to submit
   * the prior structured version (4 vars: event + amount + URL + wallet
   * — see git history before commit X for the spec).
   *
   * Wiring: this template is NOT yet live. Once Meta approves it, swap
   * the paired calls in operator_send_controller.ts
   * (`notifyPaymentReceived` + `sendPoapInviteIfPending`) for a single
   * orchestrator that:
   *   1. Reserves a POAP code via `claimPendingPoapInvite`.
   *   2. If reservation succeeds → call `notifyEventAnnouncement` with a
   *      body built by `formatOperatorDropBody`. On template failure,
   *      release the reservation and fall back to the old two-message
   *      flow.
   *   3. If no POAP pool / reservation fails for non-template reasons →
   *      keep firing `notifyPaymentReceived` only (the existing behavior
   *      for non-POAP events stays unchanged).
   */
  eventAnnouncement: 'event_announcement',
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
 * General event announcement: sends the `event_announcement` template with
 * a Meta-approved wrapper ("Welcome to … / Enjoy the event.") and a
 * freeform body the caller controls. Same template covers many use cases —
 * USDC drops, schedule updates, prize results, post-event follow-ups.
 *
 * Template: event_announcement (see TEMPLATES doc for the wrapper text).
 * Variables: {{1}} = event name / source, {{2}} = body content.
 *
 * Body content notes:
 *   - Up to ~1024 characters per WhatsApp's per-variable limit. Anything
 *     longer should be split across multiple sends.
 *   - Multiline is fine; newlines render as line breaks in WhatsApp.
 *   - URLs render as clickable text.
 *   - The caller is responsible for language consistency between {{1}}
 *     and {{2}} — Meta approves the wrapper per language but the body
 *     variable carries whatever the caller puts in it. Use the lang
 *     param + `formatOperatorDropBody`-style helpers below to stay
 *     consistent.
 *
 * Returns `true` when Meta accepted the send (200 + message_id), `false`
 * otherwise. Callers treat a `false` return as "template not yet
 * approved → fall back to the prior message flow". Same return semantics
 * as `notifyPoapClaimInvite` so an orchestrator can use either uniformly.
 *
 * Best-effort: logs errors but never throws.
 */
export async function notifyEventAnnouncement(opts: {
  recipientPhone: string
  eventName: string
  body: string
  lang: string
}): Promise<boolean> {
  const { recipientPhone, eventName, body, lang } = opts
  const templateLang = TEMPLATE_LANG_MAP[lang] || 'en'

  try {
    const result = await sendTemplateMessage(
      recipientPhone,
      TEMPLATES.eventAnnouncement,
      templateLang,
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: eventName },
            { type: 'text', text: body },
          ],
        },
      ]
    )
    if (result) {
      logger.info(
        `Event announcement sent to ${maskPhone(recipientPhone)} (event=${eventName}, body=${body.length}ch)`
      )
      return true
    }
    logger.warn(
      `Event announcement template failed for ${maskPhone(recipientPhone)} — template may not be approved yet`
    )
    return false
  } catch (error) {
    logger.error('Failed to send event announcement to %s: %o', maskPhone(recipientPhone), error)
    return false
  }
}

/**
 * Format the announcement body for the operator-drop case: "you got X
 * USDC + here's your POAP link + paste your wallet if asked". Lives next
 * to `notifyEventAnnouncement` so the template variable {{2}} structure
 * is documented in one place.
 *
 * IMPORTANT — single line, no `\n`, no tabs, no >4 consecutive spaces.
 * WhatsApp Cloud API rejects template body parameters containing those
 * characters at send-time (separate from template approval). The
 * surrounding static wrapper ("🎉 ¡Bienvenido a … / Disfruta el evento.")
 * supplies the visual paragraph breaks; the variable is one paragraph.
 * Compare `notifyPaymentReceived` / `notifyPoapClaimInvite` — both use
 * single-line variables, which is why they work.
 *
 * Mirror this shape for future announcement types (schedule update,
 * prize result, etc.) — keep the formatter close to the template helper
 * so reviewers can audit the template-variable surface in one read.
 */
export function formatOperatorDropBody(opts: {
  amount: string
  asset: string
  poapClaimUrl: string | null
  sippyWalletAddress: string
  lang: string
}): string {
  const { amount, asset, poapClaimUrl, sippyWalletAddress, lang } = opts
  const amountWithAsset = `${amount} ${asset.toUpperCase()}`
  if (lang === 'pt' || lang === 'pt_BR') {
    const head = `Você acabou de receber ${amountWithAsset} na sua carteira Sippy. Digite *saldo* a qualquer momento para ver.`
    if (!poapClaimUrl) return head
    return `${head} Resgate seu POAP: ${poapClaimUrl}. Se o POAP pedir um endereço de carteira, cole ${sippyWalletAddress}.`
  }
  if (lang === 'es') {
    const head = `Acabas de recibir ${amountWithAsset} en tu billetera Sippy. Escribe *saldo* cuando quieras para revisar.`
    if (!poapClaimUrl) return head
    return `${head} Reclama tu POAP: ${poapClaimUrl}. Si POAP te pide una dirección, pega ${sippyWalletAddress}.`
  }
  const head = `You just received ${amountWithAsset} in your Sippy wallet. Type *balance* anytime to check.`
  if (!poapClaimUrl) return head
  return `${head} Claim your POAP: ${poapClaimUrl}. If POAP asks for a wallet address, paste ${sippyWalletAddress}.`
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
