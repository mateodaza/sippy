import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  sendOtp,
  verifyOtp,
  storeToken,
  getStoredToken,
  clearToken,
  isTokenExpired,
  getFreshToken,
} from './auth'

// Helper: build a minimal JWT with the given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${header}.${body}.fakesig`
}

function makeFetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : status === 401 ? 'Unauthorized' : status === 422 ? 'Unprocessable Entity' : 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

describe('sendOtp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves on 200 success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, { success: true })))
    await expect(sendOtp('+15550001234')).resolves.toBeUndefined()
  })

  it('throws with backend error message on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(429, { error: 'Rate limit exceeded' })))
    await expect(sendOtp('+15550001234')).rejects.toThrow('Rate limit exceeded')
  })

  it('throws on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    await expect(sendOtp('+15550001234')).rejects.toThrow('Network error')
  })

  it('posts to send-otp endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeFetchResponse(200, { success: true }))
    vi.stubGlobal('fetch', mockFetch)
    await sendOtp('+15550001234')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/send-otp'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('verifyOtp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JWT string on 200', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(200, { token, expiresIn: 3600 })))
    await expect(verifyOtp('+15550001234', '123456')).resolves.toBe(token)
  })

  it('throws on 401 with error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(401, { error: 'Invalid OTP' })))
    await expect(verifyOtp('+15550001234', '000000')).rejects.toThrow('Invalid OTP')
  })

  it('throws on 422', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(422, {})))
    await expect(verifyOtp('+15550001234', 'bad')).rejects.toThrow()
  })

  it('posts to verify-otp endpoint', async () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    const mockFetch = vi.fn().mockResolvedValue(makeFetchResponse(200, { token }))
    vi.stubGlobal('fetch', mockFetch)
    await verifyOtp('+15550001234', '123456')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/verify-otp'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('storeToken / getStoredToken / clearToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('storeToken sets sippy_jwt in localStorage', () => {
    storeToken('my-token')
    expect(localStorage.getItem('sippy_jwt')).toBe('my-token')
  })

  it('getStoredToken returns stored value', () => {
    localStorage.setItem('sippy_jwt', 'my-token')
    expect(getStoredToken()).toBe('my-token')
  })

  it('getStoredToken returns null when nothing stored', () => {
    expect(getStoredToken()).toBeNull()
  })

  it('clearToken removes sippy_jwt', () => {
    storeToken('my-token')
    clearToken()
    expect(localStorage.getItem('sippy_jwt')).toBeNull()
  })

  it('clearToken is idempotent (no error if not set)', () => {
    expect(() => clearToken()).not.toThrow()
    expect(() => clearToken()).not.toThrow()
  })
})

describe('isTokenExpired', () => {
  it('returns false for token with exp 1 hour from now', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    expect(isTokenExpired(token)).toBe(false)
  })

  it('returns true for token with exp 1 hour in the past', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('returns true for malformed JWT (not 3 segments)', () => {
    expect(isTokenExpired('not.a.jwt.extra')).toBe(true)
    expect(isTokenExpired('only-one')).toBe(true)
  })

  it('returns true for token with no exp field', () => {
    const token = makeJwt({ sub: 'user123' })
    expect(isTokenExpired(token)).toBe(true)
  })

  it('correctly handles base64url chars (- and _) and padding', () => {
    // Craft a payload that produces - and _ in base64url
    // We just verify that a valid future token parses correctly
    const payload = { exp: Math.floor(Date.now() / 1000) + 7200, sub: '>>??<<' }
    const token = makeJwt(payload)
    // makeJwt produces base64url, isTokenExpired must decode it back
    expect(isTokenExpired(token)).toBe(false)
  })

  it('returns true on completely invalid token', () => {
    expect(isTokenExpired('!!!.!!!.!!!')).toBe(true)
  })
})

describe('getFreshToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing stored', () => {
    expect(getFreshToken()).toBeNull()
  })

  it('returns null when stored token is expired', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })
    storeToken(token)
    expect(getFreshToken()).toBeNull()
  })

  it('returns token string when stored token is valid', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 })
    storeToken(token)
    expect(getFreshToken()).toBe(token)
  })
})
