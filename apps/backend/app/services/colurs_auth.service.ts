/**
 * Colurs Auth Service
 *
 * Manages the Colurs API JWT lifecycle:
 *   - Logs in with username/password on first call
 *   - Reads `exp` from the JWT payload directly (no JWT library)
 *   - Proactively refreshes the access token 2 minutes before expiry
 *   - Falls back to full re-login if refresh fails
 *   - Serialises concurrent callers behind one in-flight refresh promise
 *     so we never fire duplicate login/refresh requests under load
 *
 * Token lifetimes (per Colurs docs):
 *   access token  — 15 minutes (JWT, exp readable from payload)
 *   refresh token — 10,000 days (opaque, stays constant until revoked)
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

// ── Config ──────────────────────────────────────────────────────────────────

function baseUrl(): string {
  return env.get('COLURS_BASE_URL', 'https://sandbox.colurs.com')
}

function isConfigured(): boolean {
  return !!(env.get('COLURS_API_KEY') && env.get('COLURS_USERNAME') && env.get('COLURS_PASSWORD'))
}

// ── In-memory token state ────────────────────────────────────────────────────

let accessToken: string | null = null
let refreshToken: string | null = null
// Unix ms at which the access token should be proactively refreshed (exp - 2 min)
let refreshAt = 0

// Serialises concurrent refresh/login calls
let inflightPromise: Promise<string> | null = null

// ── JWT helpers ──────────────────────────────────────────────────────────────

/**
 * Reads the `exp` Unix-seconds claim from a JWT without verifying the signature.
 * Colurs tokens are HS256 — we trust the server; we only need the expiry time.
 */
function readExp(jwt: string): number {
  try {
    const payload = jwt.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.exp === 'number' ? json.exp : 0
  } catch {
    return 0
  }
}

/** Store a new access token and compute when to next refresh (exp - 2 min). */
function storeAccessToken(token: string): void {
  accessToken = token
  const expMs = readExp(token) * 1000
  refreshAt = expMs - 2 * 60 * 1000 // 2-minute proactive buffer
}

// ── Core auth calls ──────────────────────────────────────────────────────────

async function login(): Promise<string> {
  const url = `${baseUrl()}/token/`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.get('COLURS_API_KEY', ''),
    },
    body: JSON.stringify({
      username: env.get('COLURS_USERNAME', ''),
      password: env.get('COLURS_PASSWORD', ''),
      platform: 'API',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    let errorKeys: string | undefined
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      errorKeys = Object.keys(parsed).join(', ')
    } catch {
      /* non-JSON body — omit */
    }
    logger.warn({ status: res.status, errorKeys }, 'colurs_auth: login failed')
    throw new Error(`Colurs login failed (${res.status})`)
  }

  const data = (await res.json()) as { access: string; refresh: string }
  refreshToken = data.refresh
  storeAccessToken(data.access)
  logger.info('colurs_auth: logged in, token expires ~15min')
  return data.access
}

async function doRefresh(): Promise<string> {
  if (!refreshToken) {
    logger.warn('colurs_auth: no refresh token, falling back to login')
    return login()
  }

  const url = `${baseUrl()}/token/refresh/`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.get('COLURS_API_KEY', ''),
    },
    body: JSON.stringify({ refresh: refreshToken }),
  })

  if (!res.ok) {
    logger.warn(`colurs_auth: refresh failed (${res.status}), falling back to login`)
    return login()
  }

  const data = (await res.json()) as { access: string }
  storeAccessToken(data.access)
  logger.info('colurs_auth: access token refreshed')
  return data.access
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a valid Colurs access token.
 * Refreshes proactively if within 2 minutes of expiry.
 * All concurrent callers wait on a single shared promise.
 */
export async function getAccessToken(): Promise<string> {
  if (!isConfigured()) {
    throw new Error('Colurs credentials not configured (COLURS_API_KEY / USERNAME / PASSWORD)')
  }

  // Token is still fresh — return immediately
  if (accessToken && Date.now() < refreshAt) {
    return accessToken
  }

  // Refresh (or login) is already in flight — piggyback on it
  if (inflightPromise) {
    return inflightPromise
  }

  // Start a refresh/login, clear the promise slot when done
  inflightPromise = doRefresh().finally(() => {
    inflightPromise = null
  })

  return inflightPromise
}

/**
 * Returns the standard headers required on every Colurs API request.
 */
export async function colursHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return {
    'Authorization': `Bearer ${token}`,
    'x-api-key': env.get('COLURS_API_KEY', ''),
    'Content-Type': 'application/json',
  }
}
