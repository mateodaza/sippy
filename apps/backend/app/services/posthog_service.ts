/**
 * PostHog Service
 *
 * Lightweight wrapper around posthog-node for server-side analytics
 * and exception tracking. PII (phone numbers, wallet addresses) is
 * redacted before being sent.
 */

import { PostHog } from 'posthog-node'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

const POSTHOG_API_KEY = env.get('POSTHOG_API_KEY')
const POSTHOG_HOST = env.get('POSTHOG_HOST') || 'https://us.i.posthog.com'

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (client) return client
  if (!POSTHOG_API_KEY) {
    logger.warn('PostHog: POSTHOG_API_KEY not set — analytics disabled')
    return null
  }
  client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST })
  return client
}

/**
 * Mask phone numbers: keep country prefix + last 2 digits
 * e.g. "+573001234567" → "+57*******67"
 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '***'
  const prefix = phone.startsWith('+') ? phone.slice(0, 3) : ''
  const last2 = phone.slice(-2)
  return `${prefix}${'*'.repeat(phone.length - prefix.length - 2)}${last2}`
}

/**
 * Truncate wallet addresses: first 6 + last 4
 * e.g. "0xAbCdEf1234567890..." → "0xAbCd...7890"
 */
function maskWallet(addr: string): string {
  if (addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/**
 * Redact PII from properties before sending to PostHog
 */
function redactPII(props: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string') {
      redacted[key] = value
      continue
    }
    if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('from') || key.toLowerCase().includes('to')) {
      redacted[key] = value.match(/^\+?\d{7,}$/) ? maskPhone(value) : value
    } else if (key.toLowerCase().includes('wallet') || key.toLowerCase().includes('address')) {
      redacted[key] = value.startsWith('0x') ? maskWallet(value) : value
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

/**
 * Capture an event
 */
export function capture(distinctId: string, event: string, properties?: Record<string, unknown>) {
  const ph = getClient()
  if (!ph) return
  ph.capture({
    distinctId: distinctId.match(/^\+?\d{7,}$/) ? maskPhone(distinctId) : distinctId,
    event,
    properties: properties ? redactPII(properties) : undefined,
  })
}

/**
 * Capture an exception
 */
export function captureException(
  error: unknown,
  distinctId?: string,
  properties?: Record<string, unknown>
) {
  const ph = getClient()
  if (!ph) return

  const id = distinctId
    ? distinctId.match(/^\+?\d{7,}$/) ? maskPhone(distinctId) : distinctId
    : 'system'

  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  ph.capture({
    distinctId: id,
    event: '$exception',
    properties: {
      $exception_message: errorMessage,
      $exception_stack_trace_raw: errorStack,
      ...(properties ? redactPII(properties) : {}),
    },
  })
}

/**
 * Flush pending events — call on graceful shutdown
 */
export async function shutdown() {
  if (client) {
    await client.shutdown()
    client = null
  }
}
