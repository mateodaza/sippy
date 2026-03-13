/**
 * WebhookController
 *
 * Ported from Express server.ts: GET /webhook/whatsapp and POST /webhook/whatsapp
 *
 * The GET endpoint handles Meta webhook verification.
 * The POST endpoint receives incoming WhatsApp messages, responds 200 immediately,
 * then processes the message asynchronously (Meta requirement).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import type { WebhookPayload, ParsedCommand, PendingTransaction } from '#types/index'
import '#types/container'
import type { Lang } from '#utils/messages'
import { parseMessage } from '#utils/message_parser'
import { sendTextMessage, markAsRead } from '#services/whatsapp.service'
import { getUserLanguage, setUserLanguage, getConversationContext, appendConversationMessage } from '#services/db'
import { detectLanguage, PERSIST_THRESHOLD } from '#utils/language'
import {
  formatHelpMessage,
  formatAboutMessage,
  formatInvalidSendFormat,
  formatHistoryMessage,
  formatSettingsMessage,
  formatRateLimitedMessage,
  formatUnknownCommandMessage,
  formatLanguageSetMessage,
  formatCommandErrorMessage,
  formatGreetingMessage,
  formatSocialReplyMessage,
  formatTextOnlyMessage,
  formatPrivacySetMessage,
  formatTransferCancelled,
  formatNoPendingTransfer,
  formatSelfSendMessage,
  formatConcurrentSendMessage,
  formatAmountError,
  formatInvalidPhoneNumberMessage,
  formatConfirmationPromptWithWarning,
  formatAccountSuspendedMessage,
  formatMaintenanceMessage,
} from '#utils/messages'

import UserPreference from '#models/user_preference'
import { handleStartCommand } from '#commands/start_command'
import { handleBalanceCommand } from '#commands/balance_command'
import { handleSendCommand } from '#commands/send_command'
import { generateResponse } from '#services/llm.service'
import { exchangeRateService } from '#services/exchange_rate_service'
import { canonicalizePhone } from '#utils/phone'
import sentryService from '#services/sentry_service'
import { isPaused } from '#controllers/admin/moderation_controller'

// Exported so tests can seed/inspect state directly
export const pendingTransactions = new Map<string, PendingTransaction>()
export const activeSends = new Set<string>()

const CONFIRM_THRESHOLD_DEFAULT = 5
const ACTIVE_SEND_TIMEOUT_MS = 60_000  // safety valve — clears stuck sends
const PENDING_TX_TTL_MS = 2 * 60 * 1000  // 2 minutes

// GC interval — removes entries that were never confirmed/cancelled.
// Correctness is NOT reliant on this interval; expiry is enforced lazily
// on access in the confirm handler.
// .unref() allows process to exit naturally without the interval keeping
// the event loop alive. Pattern matches exchange_rate_service.ts:80-86.
const _pendingTxCleanupInterval = setInterval(() => {
  try {
    const now = Date.now()
    for (const [phone, tx] of pendingTransactions.entries()) {
      if (now - tx.timestamp > PENDING_TX_TTL_MS) {
        pendingTransactions.delete(phone)
      }
    }
  } catch (err) {
    console.error('pendingTx cleanup error:', err)
  }
}, 30_000)
_pendingTxCleanupInterval.unref()

function clearPendingIfUnrelated(
  from: string,
  command: ParsedCommand,
  pendingTxs: Map<string, PendingTransaction>
): void {
  if (command.command !== 'confirm' && command.command !== 'cancel') {
    if (pendingTxs.has(from)) {
      pendingTxs.delete(from)
      logger.info('Pending tx cancelled due to new command from %s', from)
    }
  }
}

/**
 * Returns the phone key to use for updateOrCreate on user_preferences.
 * If a bare-digit row already exists (pre-SH-003), returns bare digits to
 * avoid creating a duplicate row.
 * Remove after SH-003 backfill is confirmed complete.
 */
async function resolveWebhookUserPrefKey(phoneNumber: string): Promise<string> {
  if (phoneNumber.startsWith('+')) {
    const existing = await UserPreference.findBy('phoneNumber', phoneNumber.slice(1))
    if (existing) return phoneNumber.slice(1)
  }
  return phoneNumber
}

export interface RateContext {
  senderRate: number | null
  senderCurrency: string | null
  recipientRate: number | null
  recipientCurrency: string | null
}

/**
 * Resolve exchange rates from the service for a sender and optional recipient.
 *
 * Uses getLocalRate (async) so that on first boot this correctly awaits the
 * initial fetch before returning — avoiding USD-only display on the first
 * message after server restart. When the cache is already warm, getLocalRate
 * resolves via an in-memory Map.get with no I/O.
 *
 * Never throws: all errors are caught and return all-nulls (graceful USD fallback).
 *
 * Exported for direct unit testing without going through processWebhook.
 */
export async function fetchRateContext(
  fromPhone: string,
  recipientPhone?: string
): Promise<RateContext> {
  let senderRate: number | null = null
  let senderCurrency: string | null = null
  let recipientRate: number | null = null
  let recipientCurrency: string | null = null

  try {
    senderCurrency = exchangeRateService.getCurrencyForPhone(fromPhone)
    if (senderCurrency) {
      senderRate = await exchangeRateService.getLocalRate(senderCurrency)
    }
    if (recipientPhone) {
      recipientCurrency = exchangeRateService.getCurrencyForPhone(recipientPhone)
      if (recipientCurrency) {
        recipientRate = await exchangeRateService.getLocalRate(recipientCurrency)
      }
    }
  } catch {
    // Non-blocking: unexpected error → fall back to USD-only
  }

  return { senderRate, senderCurrency, recipientRate, recipientCurrency }
}

/**
 * Route a parsed command to the appropriate handler, threading a pre-fetched
 * rate context into balance and send handlers.
 *
 * Exported as a module-level function so that tests can inject fake balance/send
 * handlers to verify the exact rate values passed without mocking external services.
 *
 * `balanceHandler` and `sendHandler` default to the real imports and are only
 * overridden in tests.
 */
export async function routeCommand(
  phoneNumber: string,
  command: ParsedCommand,
  lang: Lang,
  rateCtx: RateContext,
  context: import('#services/db').ContextMessage[] = [],
  balanceHandler: typeof handleBalanceCommand = handleBalanceCommand,
  sendHandler: typeof handleSendCommand = handleSendCommand,
  generateResponseFn: typeof generateResponse = generateResponse,
  sendMessageFn: typeof sendTextMessage = sendTextMessage,
  pendingTxs: Map<string, PendingTransaction> = pendingTransactions,
  activeSendsSet: Set<string> = activeSends,
  activeSendTimeoutMs: number = ACTIVE_SEND_TIMEOUT_MS
): Promise<void> {
  try {
    switch (command.command) {
      case 'start':
        await handleStartCommand(phoneNumber, lang)
        break

      case 'help':
        await sendMessageFn(phoneNumber, formatHelpMessage(lang), lang)
        break

      case 'about':
        await sendMessageFn(phoneNumber, formatAboutMessage(lang), lang)
        break

      case 'balance':
        await balanceHandler(phoneNumber, lang, rateCtx.senderRate, rateCtx.senderCurrency)
        break

      case 'send': {
        // NEW: amount validation error — specific message, bail early
        if (command.amountError) {
          await sendMessageFn(phoneNumber, formatAmountError(command.amountError, lang), lang)
          return
        }

        // NEW: phone canonicalization failed — specific message, bail early
        if (command.recipientError === 'INVALID_PHONE') {
          await sendMessageFn(phoneNumber, formatInvalidPhoneNumberMessage(lang), lang)
          return
        }

        // Self-send check — before any processing (fail fast)
        const canonicalRecipient = command.recipient ? canonicalizePhone(command.recipient) : null
        if (canonicalRecipient && canonicalRecipient === phoneNumber) {
          await sendMessageFn(phoneNumber, formatSelfSendMessage(lang), lang)
          return
        }
        if (command.amount && command.recipient) {
          const threshold = env.get('CONFIRM_THRESHOLD') ?? CONFIRM_THRESHOLD_DEFAULT
          if (command.amount <= threshold) {
            // At or below threshold — concurrent guard + execute immediately
            if (activeSendsSet.has(phoneNumber)) {
              await sendMessageFn(phoneNumber, formatConcurrentSendMessage(lang), lang)
              return
            }
            activeSendsSet.add(phoneNumber)
            const safetyTimer = setTimeout(() => activeSendsSet.delete(phoneNumber), activeSendTimeoutMs)
            try {
              await sendHandler(
                phoneNumber,
                command.amount,
                command.recipient,
                lang,
                rateCtx.senderRate,
                rateCtx.senderCurrency,
                rateCtx.recipientRate,
                rateCtx.recipientCurrency
              )
            } finally {
              clearTimeout(safetyTimer)
              activeSendsSet.delete(phoneNumber)
            }
          } else {
            // Above threshold — store pending, ask for confirmation
            // New send overwrites any existing pending tx (one per user)
            pendingTxs.set(phoneNumber, {
              amount: command.amount,
              recipient: command.recipient,
              timestamp: Date.now(),
              lang,
            })
            await sendMessageFn(
              phoneNumber,
              formatConfirmationPromptWithWarning(
                command.amount,
                command.recipient,
                command.isLargeAmount ?? false,
                lang
              ),
              lang
            )
          }
        } else {
          await sendMessageFn(phoneNumber, formatInvalidSendFormat(lang), lang)
        }
        break
      }

      case 'confirm': {
        const pending = pendingTxs.get(phoneNumber)
        // Lazy expiry check — guarantees 2-minute cutoff regardless of GC interval timing
        if (!pending || Date.now() - pending.timestamp > PENDING_TX_TTL_MS) {
          if (pending) pendingTxs.delete(phoneNumber)  // clean up expired entry
          await sendMessageFn(phoneNumber, formatNoPendingTransfer(lang), lang)
        } else {
          // Guard 2: concurrent-send check — BEFORE consuming pending tx
          // If in-flight, reject and leave pending tx intact for retry
          if (activeSendsSet.has(phoneNumber)) {
            await sendMessageFn(phoneNumber, formatConcurrentSendMessage(lang), lang)
            return
          }
          // Atomic consume: delete BEFORE awaiting sendHandler.
          // A second concurrent confirm will find no entry and get "No pending transfer."
          // No rollback on failure: if sendHandler returns false or throws after the
          // transfer succeeded (e.g. a notification failed), re-inserting the pending tx
          // would allow a second YES to double-execute the transfer.
          // The send paths guarantee they return true on a successful transfer regardless
          // of notification outcome, so false/throw here means the transfer did not occur.
          // The outer try/catch handles any throw and sends formatCommandErrorMessage.
          pendingTxs.delete(phoneNumber)
          activeSendsSet.add(phoneNumber)
          const safetyTimer = setTimeout(() => activeSendsSet.delete(phoneNumber), activeSendTimeoutMs)
          try {
            await sendHandler(
              phoneNumber, pending.amount, pending.recipient, pending.lang,
              rateCtx.senderRate, rateCtx.senderCurrency,
              rateCtx.recipientRate, rateCtx.recipientCurrency
            )
          } finally {
            clearTimeout(safetyTimer)
            activeSendsSet.delete(phoneNumber)
          }
        }
        break
      }

      case 'cancel':
        pendingTxs.delete(phoneNumber)
        await sendMessageFn(phoneNumber, formatTransferCancelled(lang), lang)
        break

      case 'history':
        await sendMessageFn(phoneNumber, formatHistoryMessage(phoneNumber, lang), lang)
        break

      case 'settings':
        await sendMessageFn(phoneNumber, formatSettingsMessage(phoneNumber, lang), lang)
        break

      case 'greeting': {
        const text = command.originalText ?? ''
        const reply = text ? await generateResponseFn(text, lang, context) : null
        await sendMessageFn(phoneNumber, reply ?? formatGreetingMessage(lang), lang)
        break
      }

      case 'social': {
        const text = command.originalText ?? ''
        const reply = text ? await generateResponseFn(text, lang, context) : null
        await sendMessageFn(phoneNumber, reply ?? formatSocialReplyMessage(lang), lang)
        break
      }

      case 'language': {
        const langNames: Record<string, string> = {
          en: 'English',
          es: 'Español',
          pt: 'Português',
        }
        const langName =
          langNames[command.detectedLanguage || ''] || command.detectedLanguage || ''
        await sendMessageFn(phoneNumber, formatLanguageSetMessage(langName, lang), lang)
        break
      }

      case 'privacy': {
        const visible = command.privacyAction === 'on'
        const prefKey = await resolveWebhookUserPrefKey(phoneNumber)
        await UserPreference.updateOrCreate(
          { phoneNumber: prefKey },
          { phoneVisible: visible }
        )
        await sendMessageFn(phoneNumber, formatPrivacySetMessage(command.privacyAction!, lang), lang)
        break
      }

      case 'unknown':
        if (command.helpfulMessage) {
          await sendMessageFn(phoneNumber, command.helpfulMessage, lang)
        } else {
          const rateLimitNote =
            command.llmStatus === 'rate-limited' ? `\n${formatRateLimitedMessage(lang)}\n\n` : ''
          await sendMessageFn(
            phoneNumber,
            formatUnknownCommandMessage(command.originalText || '', lang) +
              (rateLimitNote ? `\n${rateLimitNote}` : ''),
            lang
          )
        }
        break

      default:
        logger.warn('Unhandled command: %s', command.command)
    }
  } catch (error) {
    logger.error('Error handling command: %o', error)
    sentryService.captureException(error, { phone: phoneNumber })
    await sendMessageFn(phoneNumber, formatCommandErrorMessage(lang), lang)
  }
}

/**
 * Fetch rate context for the given phone numbers, then route the command.
 *
 * This function is exported (with injectable handlers) so that AC1 tests can
 * verify the full fetch→route pipeline: phone number → getLocalRate → handler
 * args — without going through the HTTP stack or the private processWebhook.
 *
 * processWebhook does NOT call dispatchCommand directly; it calls
 * fetchRateContext + handleCommand separately so that the rate fetch visibly
 * occurs before handleCommand in the processWebhook body. dispatchCommand
 * mirrors that logic for testing purposes.
 *
 * If dispatchCommand were to hardcode nulls instead of calling fetchRateContext,
 * the AC1 tests would fail because the injected handler would receive null
 * instead of the seeded cache value.
 */
export async function dispatchCommand(
  from: string,
  command: ParsedCommand,
  lang: Lang,
  context: import('#services/db').ContextMessage[] = [],
  balanceHandler: typeof handleBalanceCommand = handleBalanceCommand,
  sendHandler: typeof handleSendCommand = handleSendCommand,
  pendingTxs: Map<string, PendingTransaction> = pendingTransactions,
  activeSendsSet: Set<string> = activeSends
): Promise<void> {
  // Cancel stale pending tx if user sends an unrelated command
  clearPendingIfUnrelated(from, command, pendingTxs)

  const recipientPhone =
    command.command === 'send' && command.recipient ? command.recipient :
    command.command === 'confirm' ? pendingTxs.get(from)?.recipient :
    undefined
  const rateCtx = await fetchRateContext(from, recipientPhone)
  await routeCommand(from, command, lang, rateCtx, context, balanceHandler, sendHandler,
    generateResponse, sendTextMessage, pendingTxs, activeSendsSet)
}

export default class WebhookController {
  /**
   * GET /webhook/whatsapp
   *
   * Meta webhook verification endpoint.
   * If mode is 'subscribe' and token matches WHATSAPP_VERIFY_TOKEN, returns the
   * challenge string with 200. Otherwise responds 403.
   */
  async verify({ request, response }: HttpContext) {
    const mode = request.qs()['hub.mode']
    const token = request.qs()['hub.verify_token']
    const challenge = request.qs()['hub.challenge']

    const verifyToken = env.get('WHATSAPP_VERIFY_TOKEN')

    logger.info('Webhook verification request — mode: %s, challenge present: %s', mode, !!challenge)

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('Webhook verified successfully by Meta')
      return response.status(200).send(challenge)
    }

    logger.warn('Webhook verification failed — received token does not match')
    return response.status(403).send('')
  }

  /**
   * POST /webhook/whatsapp
   *
   * Incoming WhatsApp messages. Responds 200 immediately per Meta's requirement,
   * then kicks off async processing. Errors during processing are logged but
   * never bubble up (the 200 is already sent).
   */
  async handle({ request, response }: HttpContext) {
    const body = request.body() as WebhookPayload

    // Verify X-Hub-Signature-256 when app secret is configured
    const appSecret = env.get('WHATSAPP_APP_SECRET')
    if (appSecret) {
      const rawBody = request.raw()
      if (!rawBody) {
        logger.error('Webhook rejected: request.raw() returned null — rawBody may not be configured in bodyparser')
        return response.status(500).send('')
      }
      const signature = request.header('x-hub-signature-256')
      if (!signature || !this.verifySignature(rawBody, appSecret, signature)) {
        logger.warn('Webhook signature verification failed')
        return response.status(401).send('')
      }
    }

    logger.info('Webhook event received')

    // Respond 200 immediately — Meta requires this
    response.status(200).send('')

    // Process asynchronously after response
    this.processWebhook(body).catch((err) => logger.error('Webhook processing error: %o', err))
  }

  /**
   * Verify Meta's X-Hub-Signature-256 header against the raw request body.
   * Uses the original bytes from the wire (via request.raw()) so the HMAC
   * matches regardless of JSON key ordering or whitespace differences.
   * Uses constant-time comparison to prevent timing attacks.
   */
  private verifySignature(
    rawBody: string,
    secret: string,
    headerSignature: string
  ): boolean {
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

    if (expected.length !== headerSignature.length) return false

    return timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature))
  }

  /**
   * Full message processing pipeline.
   *
   * Ported from Express POST /webhook/whatsapp handler (server.ts lines 160-318).
   * Delegates to already-ported services for parsing, language, and WhatsApp I/O.
   */
  private async processWebhook(payload: WebhookPayload): Promise<void> {
    const entry = payload.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    if (!messages || messages.length === 0) {
      logger.info('No messages in webhook payload')
      return
    }

    const message = messages[0]
    const rawFrom = message.from
    const from = canonicalizePhone(rawFrom)
    if (!from) {
      logger.warn('Invalid sender phone, dropping')
      return
    }
    const messageId = message.id

    // ── Extract text from text, button reply, or list reply ────────────
    let text = ''
    if (message.text?.body) {
      text = message.text.body
    } else if (message.interactive?.button_reply?.title) {
      text = message.interactive.button_reply.title
      logger.info('Button clicked: "%s" (id: %s)', text, message.interactive.button_reply.id)
    } else if (message.interactive?.list_reply?.title) {
      text = message.interactive.list_reply.title
      logger.info('List item selected: "%s" (id: %s)', text, message.interactive.list_reply.id)
    }

    // ── Deduplication ──────────────────────────────────────────────────
    const rateLimitService = await app.container.make('rateLimitService')

    if (rateLimitService.isDuplicate(messageId)) {
      logger.info('Duplicate message %s, skipping', messageId)
      return
    }

    // ── Spam protection ────────────────────────────────────────────────
    if (rateLimitService.isSpamming(from)) {
      logger.warn('Spam detected from %s, ignoring', from)
      // Mark as processed so Meta doesn't retry spam
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Global pause check ──────────────────────────────────────────
    if (isPaused) {
      const pauseLang = (await getUserLanguage(from)) || 'en'
      await sendTextMessage(from, formatMaintenanceMessage(pauseLang), pauseLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Blocked user check ────────────────────────────────────────────
    const blockedPref = await UserPreference.findBy('phoneNumber', from)
    if (blockedPref?.blocked) {
      const blockedLang: Lang = (blockedPref.preferredLanguage as Lang) || (await getUserLanguage(from)) || 'en'
      await sendTextMessage(from, formatAccountSuspendedMessage(blockedLang), blockedLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    logger.info('Message from %s: "%s"', from, text)

    // Mark as read (non-blocking, best-effort)
    await markAsRead(messageId)

    // ── Non-text messages (image, audio, sticker, video, location) ────
    if (!text && message.type && message.type !== 'text' && message.type !== 'interactive') {
      logger.info('Non-text message (%s) from %s', message.type, from)
      const mediaLang = (await getUserLanguage(from)) || 'en'
      await sendTextMessage(from, formatTextOnlyMessage(mediaLang), mediaLang)
      rateLimitService.markProcessed(messageId)
      return
    }

    // ── Fetch conversation context (non-financial follow-ups) ──────────
    const context = await getConversationContext(from)

    // ── Parse command ──────────────────────────────────────────────────
    const command = await parseMessage(text, { messageId, phoneNumber: from }, context)
    logger.info('Command parsed: %o', command)

    // ── Store context for eligible intents (fire-and-forget, before handler) ──
    // Written early to reduce race window if a second message arrives quickly.
    // Only non-financial intents — never store send attempts or unknown messages.
    const CONTEXT_INTENTS = new Set(['greeting', 'social', 'help', 'about', 'history', 'settings', 'language', 'start'])
    if (CONTEXT_INTENTS.has(command.command)) {
      appendConversationMessage(from, text)
    }

    // Log LLM status for observability
    if (command.llmStatus) {
      logger.info('LLM status: %s', command.llmStatus)
    }

    // ── Language detection + persistence ──────────────────────────────
    let userLang = await getUserLanguage(from)

    // Explicit language command always wins
    if (command.command === 'language' && command.detectedLanguage) {
      const lang = command.detectedLanguage as 'en' | 'es' | 'pt'
      await setUserLanguage(from, lang)
      userLang = lang
    } else {
      // Auto-detect from message text (regex-based)
      const detection = detectLanguage(text)

      // LLM detection (higher quality for natural language)
      const llmLang =
        command.detectedLanguage && command.detectedLanguage !== 'ambiguous'
          ? (command.detectedLanguage as 'en' | 'es' | 'pt')
          : null

      // Best signal: LLM (when available) > regex (when high confidence)
      const detectedLang =
        llmLang || (detection && detection.confidence >= PERSIST_THRESHOLD ? detection.lang : null)

      if (detectedLang) {
        // Update persisted preference if different — language follows the user
        if (detectedLang !== userLang) {
          await setUserLanguage(from, detectedLang)
        }
        userLang = detectedLang
      } else if (!userLang && detection) {
        // Low confidence, no persisted preference — use for this message only
        userLang = detection.lang
      }
    }

    // Cancel stale pending tx if user sends an unrelated command
    clearPendingIfUnrelated(from, command, pendingTransactions)

    // ── Fetch exchange rates before handleCommand ──────────────────────
    let recipientPhone: string | undefined
    if (command.command === 'send' && command.recipient) {
      recipientPhone = command.recipient
    } else if (command.command === 'confirm') {
      recipientPhone = pendingTransactions.get(from)?.recipient
    }
    const rateCtx = await fetchRateContext(from, recipientPhone)

    // ── Route to command handler ──────────────────────────────────────
    const lang: Lang = userLang || 'en'
    await this.handleCommand(from, command, lang, rateCtx, context)

    // Only mark as processed after successful handling — allows Meta retry on failure
    rateLimitService.markProcessed(messageId)
    logger.info('Message %s processed successfully', messageId)
  }

  /**
   * Route a parsed command to the appropriate handler.
   *
   * Rate context is resolved by processWebhook before this call and forwarded
   * to the routing layer so balance and send handlers receive pre-fetched rates.
   */
  private async handleCommand(
    phoneNumber: string,
    command: ParsedCommand,
    lang: Lang,
    rateCtx: RateContext,
    context: import('#services/db').ContextMessage[] = []
  ): Promise<void> {
    await routeCommand(phoneNumber, command, lang, rateCtx, context)
  }
}
