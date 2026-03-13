/**
 * Sentry Service
 *
 * Thin wrapper around @sentry/node providing:
 * - init() — initialise Sentry once on startup
 * - captureException() — capture errors with PII-scrubbed context
 * - captureMessage() — capture manual messages with PII-scrubbed context
 *
 * PII is redacted before any data leaves the process:
 * - Phone numbers (+E.164): country prefix + last 2 digits visible
 * - Wallet addresses (0x…): first 6 + last 4 hex chars visible
 */

import env from '#start/env'

let Sentry: any = null

try {
  Sentry = await import('@sentry/node')
} catch {
  // @sentry/node not installed — all methods become no-ops
}

/**
 * Redacts phone numbers and wallet addresses from a flat context object.
 * Exported for unit testing.
 */
export function redactPii(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      let v = value
      // Mask phone numbers: keep country prefix (1–3 digits) + last 2 digits
      // e.g. +12345678901 → +1***01
      v = v.replace(/\+\d{7,}/g, (m) => {
        const digits = m.slice(1)
        const prefixLen = Math.min(3, digits.length - 2)
        return `+${digits.slice(0, prefixLen)}***${digits.slice(-2)}`
      })
      // Truncate wallet addresses: 0x<first6>...<last4>
      // e.g. 0xabcdef1234567890abcdef1234567890abcdef12 → 0xabcdef...ef12
      v = v.replace(/0x[0-9a-fA-F]{40}/g, (m) => `${m.slice(0, 8)}...${m.slice(-4)}`)
      result[key] = v
    } else {
      result[key] = value
    }
  }
  return result
}

function init(): void {
  if (!Sentry) return
  const dsn = env.get('SENTRY_DSN')
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: env.get('SENTRY_ENVIRONMENT') ?? env.get('NODE_ENV'),
    release: env.get('SENTRY_RELEASE'),
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb: any) {
      if (breadcrumb.data) {
        breadcrumb.data = redactPii(breadcrumb.data as Record<string, unknown>)
      }
      return breadcrumb
    },
  })
}

function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!Sentry) return
  const redacted = context ? redactPii(context) : undefined
  Sentry.withScope((scope: any) => {
    if (redacted) scope.setExtras(redacted)
    Sentry.captureException(error)
  })
}

function captureMessage(
  message: string,
  level: string = 'error',
  context?: Record<string, unknown>
): void {
  if (!Sentry) return
  const redacted = context ? redactPii(context) : undefined
  Sentry.withScope((scope: any) => {
    if (redacted) scope.setExtras(redacted)
    Sentry.captureMessage(message, level)
  })
}

const sentryService = { init, captureException, captureMessage }
export default sentryService
