const STORAGE_KEY = 'sippy_jwt'

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body && body.error) return body.error
  } catch {
    // ignore parse errors
  }
  return response.statusText || String(response.status)
}

export type OtpChannel = 'sms' | 'whatsapp'

export async function sendOtp(phone: string, channel: OtpChannel = 'sms'): Promise<void> {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, channel }),
  })
  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }
}

export async function verifyOtp(phone: string, code: string): Promise<string> {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  })
  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }
  const body = await response.json()
  return body.token
}

export function storeToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    // base64url → base64
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) {
      base64 += '='
    }
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return true
    return Date.now() / 1000 >= payload.exp
  } catch {
    return true
  }
}

export function getFreshToken(): string | null {
  const token = getStoredToken()
  if (token === null) return null
  if (isTokenExpired(token)) return null
  return token
}

export async function sendEmailLogin(email: string): Promise<void> {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const response = await fetch(`${BACKEND_URL}/api/auth/send-email-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }
}

export async function verifyEmailLogin(email: string, code: string): Promise<string> {
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
  const response = await fetch(`${BACKEND_URL}/api/auth/verify-email-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!response.ok) {
    const message = await extractErrorMessage(response)
    throw new Error(message)
  }
  const body = await response.json()
  return body.token
}

export function getTokenSecondsRemaining(token: string): number {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return 0
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) {
      base64 += '='
    }
    const payload = JSON.parse(atob(base64))
    if (typeof payload.exp !== 'number') return 0
    return Math.max(0, payload.exp - Date.now() / 1000)
  } catch {
    return 0
  }
}
