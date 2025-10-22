/**
 * WhatsApp Service
 *
 * Handles sending messages via Meta WhatsApp Cloud API
 */

import 'dotenv/config';
import { WhatsAppAPIResponse, WhatsAppAPIError } from '../types/index.js';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

interface Button {
  id?: string;
  title: string;
}

/**
 * Send a text message to a WhatsApp number with retry logic
 */
export async function sendTextMessage(
  to: string,
  text: string,
  retries = 2
): Promise<WhatsAppAPIResponse> {
  console.log(`\n📤 Sending message to +${to}:`);
  console.log(`   "${text}"`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: {
              body: text,
            },
          }),
        }
      );

      const data = (await response.json()) as WhatsAppAPIResponse &
        WhatsAppAPIError;

      if (!response.ok) {
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < retries) {
          console.warn(
            `⚠️  WhatsApp API error (${response.status}), retrying... (${
              attempt + 1
            }/${retries})`
          );
          await sleep(500 * (attempt + 1)); // Exponential backoff
          continue;
        }

        console.error('❌ Failed to send message:', data);
        throw new Error(
          `WhatsApp API error: ${data.error?.message || 'Unknown error'}`
        );
      }

      console.log('✅ Message sent successfully!');
      if (data.messages && data.messages.length > 0) {
        console.log('   Message ID:', data.messages[0].id);
      }
      return data;
    } catch (error) {
      // Retry on network errors
      if (
        attempt < retries &&
        (error instanceof TypeError || (error as any).code === 'ECONNRESET')
      ) {
        console.warn(
          `⚠️  Network error, retrying... (${attempt + 1}/${retries})`
        );
        await sleep(500 * (attempt + 1));
        continue;
      }

      console.error('❌ Error sending message:', (error as Error).message);
      throw error;
    }
  }

  throw new Error('Failed to send message after retries');
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message with buttons (interactive message)
 * Best-effort: failures are logged but don't throw
 */
export async function sendButtonMessage(
  to: string,
  bodyText: string,
  buttons: Button[]
): Promise<WhatsAppAPIResponse | null> {
  // Guard: only send if enabled
  if (process.env.WHATSAPP_BUTTONS !== 'true') {
    return null;
  }

  console.log(`\n📤 Sending button message to +${to}:`);

  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: bodyText,
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
      }
    );

    const data = (await response.json()) as WhatsAppAPIResponse &
      WhatsAppAPIError;

    if (!response.ok) {
      console.warn('⚠️  Failed to send button message:', data.error?.message);
      return null;
    }

    console.log('✅ Button message sent successfully!');
    return data;
  } catch (error) {
    console.warn('⚠️  Error sending button message:', (error as Error).message);
    return null;
  }
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId: string): Promise<any> {
  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      }
    );

    return await response.json();
  } catch (error) {
    console.error(
      '⚠️  Failed to mark message as read:',
      (error as Error).message
    );
    // Non-critical error, don't throw
    return null;
  }
}
