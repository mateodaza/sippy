/**
 * Colurs HTTP Service
 *
 * Shared HTTP helpers for all Colurs service modules.
 * Two authentication patterns:
 *   1. Operator auth (colursGet / colursPost) — uses colursHeaders() from colurs_auth.service
 *   2. User-token auth (userGet / userPost)   — uses x-api-key + optional Bearer token
 *
 * logColursError() logs only field names from error responses (never values)
 * because Colurs validation responses can echo submitted PII back in values.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { colursHeaders } from '#services/colurs_auth.service'

// ── Shared config ───────────────────────────────────────────────────────────

export function baseUrl(): string {
  return env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
}

export function apiKey(): string {
  return env.get('COLURS_API_KEY', '')
}

// ── Error logging ───────────────────────────────────────────────────────────

/**
 * Logs a Colurs error without including field values in the output.
 * Only top-level field names are logged so controllers can safely log `{ err }`
 * without PII appearing in logs. The `message` and `code_transaction` fields
 * are technical error reasons Colurs returns — non-PII — and are logged
 * verbatim to aid debugging.
 */
export function logColursError(path: string, status: number, body: string): void {
  let errorKeys: string | undefined
  let message: string | undefined
  let codeTransaction: string | undefined
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    errorKeys = Object.keys(parsed).join(', ')
    if (typeof parsed.message === 'string') message = parsed.message
    if (typeof parsed.code_transaction === 'string') codeTransaction = parsed.code_transaction
  } catch {
    /* non-JSON body — omit */
  }
  logger.warn({ path, status, errorKeys, message, codeTransaction }, 'colurs_http: request failed')
}

// ── Operator-auth helpers ───────────────────────────────────────────────────

export async function colursGet<T>(path: string): Promise<T> {
  const headers = await colursHeaders()
  const res = await fetch(`${baseUrl()}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    logColursError(path, res.status, text)
    throw new Error(`Colurs GET ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function colursPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers = await colursHeaders()
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    logColursError(path, res.status, text)
    throw new Error(`Colurs POST ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ── User-token auth helpers ─────────────────────────────────────────────────

export async function userPost<T>(
  path: string,
  body: Record<string, unknown>,
  userToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey(),
  }
  if (userToken) headers['Authorization'] = `Bearer ${userToken}`

  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    // Log only error field names (not values) — values may echo PII (phone, document, email).
    // Body is excluded from the thrown Error so controllers can safely log { err }.
    logColursError(path, res.status, text)
    throw new Error(`Colurs ${path} failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

export async function userGet<T>(path: string, userToken: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      'x-api-key': apiKey(),
      'Authorization': `Bearer ${userToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    logColursError(path, res.status, text)
    throw new Error(`Colurs GET ${path} failed (${res.status})`)
  }

  return res.json() as Promise<T>
}
