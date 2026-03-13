/**
 * Sentry PII Redaction Tests
 *
 * Tests the beforeBreadcrumb callback and redactBreadcrumbData helper used by
 * sentry.client.config.ts, sentry.server.config.ts, and sentry.edge.config.ts.
 */

import { describe, it, expect } from 'vitest'
import { redactBreadcrumbData, beforeBreadcrumb } from '../lib/sentry-pii'
import type { Breadcrumb } from '@sentry/nextjs'

describe('redactBreadcrumbData | phone numbers', () => {
  it('masks a phone number keeping country prefix and last 2 digits', () => {
    const result = redactBreadcrumbData({ phone: '+12345678901' })
    expect(result['phone']).toBe('+123***01')
  })

  it('masks phone numbers embedded in strings', () => {
    const result = redactBreadcrumbData({ msg: 'Sending to +12345678901' })
    expect(result['msg']).toContain('+123***01')
    expect(result['msg']).not.toContain('+12345678901')
  })

  it('leaves short numeric strings without + untouched', () => {
    const result = redactBreadcrumbData({ code: '12345' })
    expect(result['code']).toBe('12345')
  })
})

describe('redactBreadcrumbData | wallet addresses', () => {
  it('truncates a 40-hex wallet address to first 6 + last 4', () => {
    const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
    const result = redactBreadcrumbData({ address: addr })
    expect(result['address']).toBe('0xabcdef...ef12')
  })

  it('truncates wallet address embedded in a string', () => {
    const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
    const result = redactBreadcrumbData({ msg: `wallet: ${addr}` })
    expect(result['msg']).toContain('0xabcdef...ef12')
    expect(result['msg']).not.toContain(addr)
  })

  it('leaves short hex strings untouched', () => {
    const result = redactBreadcrumbData({ id: '0xabc123' })
    expect(result['id']).toBe('0xabc123')
  })
})

describe('redactBreadcrumbData | clean data', () => {
  it('passes through plain text unmodified', () => {
    const result = redactBreadcrumbData({ msg: 'Balance: $42.50' })
    expect(result['msg']).toBe('Balance: $42.50')
  })

  it('passes through non-string values unmodified', () => {
    const result = redactBreadcrumbData({ count: 5, flag: false })
    expect(result['count']).toBe(5)
    expect(result['flag']).toBe(false)
  })
})

describe('beforeBreadcrumb', () => {
  it('redacts phone numbers in breadcrumb data', () => {
    const crumb: Breadcrumb = { data: { phone: '+12345678901' } }
    const result = beforeBreadcrumb(crumb)
    expect(result?.data?.['phone']).toBe('+123***01')
  })

  it('truncates wallet addresses in breadcrumb data', () => {
    const addr = '0xabcdef1234567890abcdef1234567890abcdef12'
    const crumb: Breadcrumb = { data: { address: addr } }
    const result = beforeBreadcrumb(crumb)
    expect(result?.data?.['address']).toBe('0xabcdef...ef12')
  })

  it('returns breadcrumb unchanged when data is absent', () => {
    const crumb: Breadcrumb = { message: 'click' }
    const result = beforeBreadcrumb(crumb)
    expect(result).toEqual(crumb)
  })
})
