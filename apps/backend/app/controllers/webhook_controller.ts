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
import type { WebhookPayload, ParsedCommand } from '#types/index'
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
} from '#utils/messages'

import { handleStartCommand } from '#commands/start_command'
import { handleBalanceCommand } from '#commands/balance_command'
import { handleSendCommand } from '#commands/send_command'
import { generateResponse } from '#services/llm.service'

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
    const from = message.from
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
      logger.warn('Spam detected from +%s, ignoring', from)
      // Mark as processed so Meta doesn't retry spam
      rateLimitService.markProcessed(messageId)
      return
    }

    logger.info('Message from +%s: "%s"', from, text)

    // Mark as read (non-blocking, best-effort)
    await markAsRead(messageId)

    // ── Non-text messages (image, audio, sticker, video, location) ────
    if (!text && message.type && message.type !== 'text' && message.type !== 'interactive') {
      logger.info('Non-text message (%s) from +%s', message.type, from)
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

    // ── Route to command handler ──────────────────────────────────────
    const lang: Lang = userLang || 'en'
    await this.handleCommand(from, command, lang, context)

    // Only mark as processed after successful handling — allows Meta retry on failure
    rateLimitService.markProcessed(messageId)
    logger.info('Message %s processed successfully', messageId)
  }

  /**
   * Route a parsed command to the appropriate handler.
   *
   * Ported from Express handleCommand() (server.ts lines 323-403).
   */
  private async handleCommand(
    phoneNumber: string,
    command: ParsedCommand,
    lang: Lang,
    context: import('#services/db').ContextMessage[] = []
  ): Promise<void> {
    try {
      switch (command.command) {
        case 'start':
          await handleStartCommand(phoneNumber, lang)
          break

        case 'help':
          await sendTextMessage(phoneNumber, formatHelpMessage(lang), lang)
          break

        case 'about':
          await sendTextMessage(phoneNumber, formatAboutMessage(lang), lang)
          break

        case 'balance':
          await handleBalanceCommand(phoneNumber, lang)
          break

        case 'send':
          if (command.amount && command.recipient) {
            await handleSendCommand(phoneNumber, command.amount, command.recipient, lang)
          } else {
            await sendTextMessage(phoneNumber, formatInvalidSendFormat(lang), lang)
          }
          break

        case 'history':
          await sendTextMessage(phoneNumber, formatHistoryMessage(phoneNumber, lang), lang)
          break

        case 'settings':
          await sendTextMessage(phoneNumber, formatSettingsMessage(phoneNumber, lang), lang)
          break

        case 'greeting': {
          const text = command.originalText ?? ''
          const reply = text ? await generateResponse(text, lang, context) : null
          await sendTextMessage(phoneNumber, reply ?? formatGreetingMessage(lang), lang)
          break
        }

        case 'social': {
          const text = command.originalText ?? ''
          const reply = text ? await generateResponse(text, lang, context) : null
          await sendTextMessage(phoneNumber, reply ?? formatSocialReplyMessage(lang), lang)
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
          await sendTextMessage(phoneNumber, formatLanguageSetMessage(langName, lang), lang)
          break
        }

        case 'unknown':
          if (command.helpfulMessage) {
            await sendTextMessage(phoneNumber, command.helpfulMessage, lang)
          } else {
            const rateLimitNote =
              command.llmStatus === 'rate-limited' ? `\n${formatRateLimitedMessage(lang)}\n\n` : ''
            await sendTextMessage(
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
      await sendTextMessage(phoneNumber, formatCommandErrorMessage(lang), lang)
    }
  }
}
