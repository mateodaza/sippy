/**
 * Sentry PII redaction utilities.
 *
 * Shared between sentry.client.config.ts, sentry.server.config.ts,
 * sentry.edge.config.ts, and unit tests.
 *
 * Phone numbers: keep country prefix (1–3 digits) + last 2 digits
 *   e.g. +12345678901 → +1***01
 * Wallet addresses: first 6 + last 4 hex chars
 *   e.g. 0xabcdef1234567890abcdef1234567890abcdef12 → 0xabcdef...ef12
 */

import type { Breadcrumb } from '@sentry/nextjs'

export function redactBreadcrumbData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      let v = value
      v = v.replace(/\+\d{7,}/g, (m) => {
        const digits = m.slice(1)
        const prefixLen = Math.min(3, digits.length - 2)
        return `+${digits.slice(0, prefixLen)}***${digits.slice(-2)}`
      })
      v = v.replace(/0x[0-9a-fA-F]{40}/g, (m) => `${m.slice(0, 8)}...${m.slice(-4)}`)
      result[key] = v
    } else {
      result[key] = value
    }
  }
  return result
}

export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = redactBreadcrumbData(breadcrumb.data as Record<string, unknown>)
  }
  return breadcrumb
}
