import axios from 'axios'
import crypto from 'node:crypto'
import UserPreference from '#models/user_preference'

// ── Constants ─────────────────────────────────────────────────────────────────

const OTP_TTL = 5 * 60 * 1000 // 5 min in ms
const SEND_RATE_LIMIT = 3 // max sends per phone per minute
const SEND_RATE_WINDOW = 60 * 1000 // 1 minute
const MAX_VERIFY_ATTEMPTS = 5
const CLEANUP_INTERVAL = 60 * 1000 // 60s
const MAX_MAP_ENTRIES = 100_000

// ── Types ─────────────────────────────────────────────────────────────────────

interface OtpEntry {
  code: string // 6-digit zero-padded string
  expiresAt: number // Date.now() + OTP_TTL
  attempts: number // wrong guess counter
}

interface SendBucket {
  count: number
  resetAt: number
}

type SmsSender = (to: string, body: string) => Promise<void>

// ── SMS Templates ─────────────────────────────────────────────────────────────

const SMS_TEMPLATES = {
  es: (code: string) => `Sippy: Tu código es ${code}`,
  en: (code: string) => `Sippy: Your code is ${code}`,
  pt: (code: string) => `Sippy: Seu código é ${code}`,
} as const

// ── Service ───────────────────────────────────────────────────────────────────

class OtpService {
  private smsSender: SmsSender
  private otpStore: Map<string, OtpEntry> = new Map()
  private sendRateLimitMap: Map<string, SendBucket> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(smsSender?: SmsSender) {
    this.smsSender = smsSender ?? this.defaultSmsSender.bind(this)
  }

  // ── Public: sendOtp ─────────────────────────────────────────────────────────

  async sendOtp(
    phone: string,
    lang?: string
  ): Promise<{ success: true } | { error: 'rate_limited'; retryAfter: number }> {
    const rateCheck = this.checkSendRateLimit(phone)
    if (!rateCheck.allowed) {
      return { error: 'rate_limited', retryAfter: rateCheck.retryAfter! }
    }

    const code = String(crypto.randomInt(1_000_000)).padStart(6, '0')

    if (!this.otpStore.has(phone) && this.otpStore.size >= MAX_MAP_ENTRIES) {
      this.purgeExpiredOtpEntries()
      if (this.otpStore.size >= MAX_MAP_ENTRIES) {
        // All entries unexpired — evict oldest (Map insertion order)
        const oldest = this.otpStore.keys().next().value
        if (oldest !== undefined) this.otpStore.delete(oldest)
      }
    }

    const resolvedLang = await this.resolveLanguage(phone, lang)
    const body = SMS_TEMPLATES[resolvedLang](code)

    // Write to store only after the SMS send succeeds. If smsSender throws,
    // no OTP entry is left behind and the rate-limit slot is the only cost.
    await this.smsSender(phone, body)
    this.otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL, attempts: 0 })

    return { success: true }
  }

  // ── Public: verifyOtp ───────────────────────────────────────────────────────

  async verifyOtp(
    phone: string,
    code: string
  ): Promise<{ valid: true } | { valid: false; locked?: boolean }> {
    const entry = this.otpStore.get(phone)
    if (!entry) return { valid: false }

    if (Date.now() > entry.expiresAt) {
      this.otpStore.delete(phone)
      return { valid: false }
    }

    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      return { valid: false, locked: true }
    }

    if (entry.code === code) {
      this.otpStore.delete(phone)
      return { valid: true }
    }

    entry.attempts++
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      return { valid: false, locked: true }
    }

    return { valid: false }
  }

  // ── Public: cleanup timer ───────────────────────────────────────────────────

  startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        const now = Date.now()
        for (const [phone, entry] of this.otpStore) {
          if (now > entry.expiresAt) this.otpStore.delete(phone)
        }
        this.purgeExpiredRateLimitBuckets()
      } catch (err) {
        console.error('OtpService cleanup error:', err) // OtpService can't use AdonisJS logger (class instantiated at module level)
      }
    }, CLEANUP_INTERVAL)
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  // ── Internal: rate limit ────────────────────────────────────────────────────

  private checkSendRateLimit(
    phone: string
  ): { allowed: true } | { allowed: false; retryAfter: number } {
    const now = Date.now()
    const bucket = this.sendRateLimitMap.get(phone)

    if (!bucket || now > bucket.resetAt) {
      if (this.sendRateLimitMap.size >= MAX_MAP_ENTRIES) {
        this.purgeExpiredRateLimitBuckets()
        if (this.sendRateLimitMap.size >= MAX_MAP_ENTRIES) {
          // All buckets unexpired — evict oldest
          const oldest = this.sendRateLimitMap.keys().next().value
          if (oldest !== undefined) this.sendRateLimitMap.delete(oldest)
        }
      }
      this.sendRateLimitMap.set(phone, { count: 1, resetAt: now + SEND_RATE_WINDOW })
      return { allowed: true }
    }

    if (bucket.count >= SEND_RATE_LIMIT) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      return { allowed: false, retryAfter }
    }

    bucket.count++
    return { allowed: true }
  }

  // ── Internal: language resolution ──────────────────────────────────────────

  private async resolveLanguage(phone: string, lang?: string): Promise<'es' | 'en' | 'pt'> {
    if (lang === 'es' || lang === 'en' || lang === 'pt') return lang

    try {
      const pref = await UserPreference.find(phone)
      if (pref?.preferredLanguage === 'es') return 'es'
      if (pref?.preferredLanguage === 'en') return 'en'
      if (pref?.preferredLanguage === 'pt') return 'pt'
    } catch {
      // DB unavailable — fall through to prefix lookup
    }

    if (phone.startsWith('+55')) return 'pt'
    if (phone.startsWith('+1')) return 'en'

    return 'es'
  }

  // ── Internal: Twilio SMS sender ─────────────────────────────────────────────

  private async defaultSmsSender(to: string, body: string): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER

    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio env vars not configured')
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const params = new URLSearchParams({ To: to, From: from, Body: body })

    try {
      await axios.post(url, params.toString(), {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    } catch (err: any) {
      const twilioError = err?.response?.data
      console.error('sendOtp Twilio error:', { to, status: err?.response?.status, twilioError })
      throw err
    }
  }

  // ── Internal: capacity management ──────────────────────────────────────────

  private purgeExpiredOtpEntries(): void {
    const now = Date.now()
    for (const [phone, entry] of this.otpStore) {
      if (now > entry.expiresAt) this.otpStore.delete(phone)
    }
  }

  private purgeExpiredRateLimitBuckets(): void {
    const now = Date.now()
    for (const [phone, bucket] of this.sendRateLimitMap) {
      if (now > bucket.resetAt) this.sendRateLimitMap.delete(phone)
    }
  }
}

export const otpService = new OtpService()
export default OtpService
