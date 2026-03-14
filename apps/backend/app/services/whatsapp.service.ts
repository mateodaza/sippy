/**
 * WhatsApp Service
 *
 * Handles sending messages via Meta WhatsApp Cloud API
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { type WhatsAppAPIResponse, type WhatsAppAPIError } from '#types/index'
import { sanitizeOutboundMessage } from '#utils/sanitize'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0'
const PHONE_NUMBER_ID = env.get('WHATSAPP_PHONE_NUMBER_ID')
const ACCESS_TOKEN = env.get('WHATSAPP_ACCESS_TOKEN')

interface Button {
  id?: string
  title: string
}

/**
 * Send a text message to a WhatsApp number with retry logic
 */
export async function sendTextMessage(
  to: string,
  text: string,
  lang = 'en',
  retries = 2
): Promise<WhatsAppAPIResponse> {
  // Sanitize before sending — final safety net
  const sanitized = sanitizeOutboundMessage(text, lang)
  // Normalize: accept E.164 with or without '+'; always send bare international digits to Meta
  const normalizedTo = to.startsWith('+') ? to.slice(1) : to
  if (sanitized.violations.length > 0) {
    logger.warn(
      `Sanitizer [${sanitized.blocked ? 'BLOCKED' : 'CLEANED'}] to +${normalizedTo}: ${sanitized.violations.join(', ')}`
    )
    if (sanitized.blocked) {
      logger.warn(`  Original length: ${text.length} chars`)
    }
  }
  const body = sanitized.text

  logger.info(`Sending message to +${normalizedTo}: "${body}"`)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'text',
          text: {
            body: body,
          },
        }),
      })

      // Check for 5xx errors before parsing JSON (might return plain text like "Service Unavailable")
      if (response.status >= 500 && attempt < retries) {
        logger.warn(
          `WhatsApp API error (${response.status}), retrying... (${attempt + 1}/${retries})`
        )
        await sleep(500 * (attempt + 1)) // Exponential backoff
        continue
      }

      // Try to parse JSON, handle non-JSON responses
      let data: WhatsAppAPIResponse & WhatsAppAPIError
      try {
        data = (await response.json()) as WhatsAppAPIResponse & WhatsAppAPIError
      } catch (parseError) {
        // Response wasn't valid JSON (e.g., "Service Unavailable" plain text)
        const responseText = await response.text().catch(() => 'Unknown response')
        if (attempt < retries) {
          logger.warn(
            `WhatsApp API returned non-JSON response, retrying... (${attempt + 1}/${retries})`
          )
          await sleep(500 * (attempt + 1))
          continue
        }
        throw new Error(`WhatsApp API error: ${response.status} - ${responseText}`)
      }

      if (!response.ok) {
        // Retry on 5xx errors (should rarely reach here due to check above)
        if (response.status >= 500 && attempt < retries) {
          logger.warn(
            `WhatsApp API error (${response.status}), retrying... (${attempt + 1}/${retries})`
          )
          await sleep(500 * (attempt + 1)) // Exponential backoff
          continue
        }

        logger.error('Failed to send message: %o', data)
        throw new Error(`WhatsApp API error: ${data.error?.message || 'Unknown error'}`)
      }

      logger.info('Message sent successfully!')
      if (data.messages && data.messages.length > 0) {
        logger.info('   Message ID: %s', data.messages[0].id)
      }
      return data
    } catch (error) {
      // Retry on network errors or JSON parse errors
      if (
        attempt < retries &&
        (error instanceof TypeError ||
          error instanceof SyntaxError ||
          (error as any).code === 'ECONNRESET')
      ) {
        logger.warn(`Network error, retrying... (${attempt + 1}/${retries})`)
        await sleep(500 * (attempt + 1))
        continue
      }

      logger.error('Error sending message: %s', (error as Error).message)
      throw error
    }
  }

  logger.error('WhatsApp send failure: all retries exhausted — to: %s', normalizedTo)
  throw new Error('Failed to send message after retries')
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send a message with buttons (interactive message)
 * Best-effort: failures are logged but don't throw
 */
export async function sendButtonMessage(
  to: string,
  bodyText: string,
  buttons: Button[],
  lang = 'en'
): Promise<WhatsAppAPIResponse | null> {
  // Guard: only send if enabled
  if (env.get('WHATSAPP_BUTTONS') !== 'true') {
    return null
  }

  // Sanitize button body text
  const sanitized = sanitizeOutboundMessage(bodyText, lang)
  // Normalize: accept E.164 with or without '+'; always send bare international digits to Meta
  const normalizedTo = to.startsWith('+') ? to.slice(1) : to
  if (sanitized.violations.length > 0) {
    logger.warn(`Sanitizer [button] to +${normalizedTo}: ${sanitized.violations.join(', ')}`)
  }
  const cleanBody = sanitized.text

  logger.info(`Sending button message to +${normalizedTo}`)

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: cleanBody,
          },
          action: {
            buttons: buttons.map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: btn.id || `btn_${idx}`,
                title: btn.title.substring(0, 20), // Max 20 chars
              },
            })),
          },
        },
      }),
    })

    const data = (await response.json()) as WhatsAppAPIResponse & WhatsAppAPIError

    if (!response.ok) {
      logger.warn('Failed to send button message: %s', data.error?.message)
      return null
    }

    logger.info('Button message sent successfully!')
    return data
  } catch (error) {
    logger.warn('Error sending button message: %s', (error as Error).message)
    return null
  }
}

/**
 * Template parameter component for WhatsApp template messages.
 */
interface TemplateComponent {
  type: 'body' | 'header' | 'button'
  parameters: Array<{ type: 'text'; text: string }>
  sub_type?: string
  index?: number
}

/**
 * Send a template message to a WhatsApp number.
 *
 * Template messages (HSM) can be sent outside the 24-hour session window,
 * so they work for proactive notifications like "you received money".
 * The template must be pre-approved in Meta Business Manager.
 *
 * Best-effort: failures are logged but don't throw.
 */
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  components: TemplateComponent[] = []
): Promise<WhatsAppAPIResponse | null> {
  const normalizedTo = to.startsWith('+') ? to.slice(1) : to

  logger.info(`Sending template "${templateName}" (${languageCode}) to +${normalizedTo}`)

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 && { components }),
        },
      }),
    })

    const data = (await response.json()) as WhatsAppAPIResponse & WhatsAppAPIError

    if (!response.ok) {
      logger.warn('Failed to send template message: %s', data.error?.message)
      return null
    }

    logger.info('Template message sent successfully!')
    if (data.messages && data.messages.length > 0) {
      logger.info('   Message ID: %s', data.messages[0].id)
    }
    return data
  } catch (error) {
    logger.warn('Error sending template message: %s', (error as Error).message)
    return null
  }
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId: string): Promise<any> {
  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })

    return await response.json()
  } catch (error) {
    logger.error('Failed to mark message as read: %s', (error as Error).message)
    // Non-critical error, don't throw
    return null
  }
}
