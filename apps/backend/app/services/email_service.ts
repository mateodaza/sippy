import { Resend } from 'resend'
import crypto from 'node:crypto'

const DEFAULT_FROM = 'noreply@sippy.app'

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_TTL = 10 * 60 * 1000       // 10 min in ms
const SEND_RATE_LIMIT = 3               // max sends per email per 60s
const SEND_RATE_WINDOW = 60 * 1000     // 1 minute
const MAX_VERIFY_ATTEMPTS = 3          // delete entry after 3 wrong guesses
const CLEANUP_INTERVAL = 60 * 1000    // 60s
const MAX_MAP_ENTRIES = 50_000

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailCodeEntry {
  code: string          // 6-digit string
  expiresAt: number     // Date.now() + EMAIL_TTL
  attempts: number      // wrong guess counter
}

interface SendBucket {
  count: number
  resetAt: number
}

type EmailSender = (to: string, subject: string, text: string) => Promise<void>

// ── Localization ──────────────────────────────────────────────────────────────

const EMAIL_SUBJECTS = {
  es: 'Sippy: Tu código de verificación',
  en: 'Sippy: Your verification code',
  pt: 'Sippy: Seu código de verificação',
} as const

const EMAIL_BODIES = {
  es: (code: string) => `Tu código de verificación de Sippy es: ${code}`,
  en: (code: string) => `Your Sippy verification code is: ${code}`,
  pt: (code: string) => `Seu código de verificação del Sippy é: ${code}`,
} as const

// ── Service ───────────────────────────────────────────────────────────────────

class EmailService {
  private emailSender: EmailSender
  private codeStore: Map<string, EmailCodeEntry> = new Map()
  private sendRateLimitMap: Map<string, SendBucket> = new Map()
  private gateTokens = new Map<string, { token: string; expiresAt: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(emailSender?: EmailSender) {
    this.emailSender = emailSender ?? this.defaultEmailSender.bind(this)
  }

  // ── Public: sendEmailCode ───────────────────────────────────────────────────

  async sendEmailCode(
    email: string,
    lang?: string
  ): Promise<{ success: true } | { error: string }> {
    if (this.isSendRateLimited(email)) {
      return { error: 'rate_limited' }
    }

    const code = String(crypto.randomInt(100000, 1000000))

    // Reserve capacity in codeStore before the send attempt (no write yet).
    // If the email already has a slot, no eviction is needed.
    if (!this.codeStore.has(email) && this.codeStore.size >= MAX_MAP_ENTRIES) {
      this.purgeExpiredCodeEntries()
      if (this.codeStore.size >= MAX_MAP_ENTRIES) {
        // All entries unexpired — evict oldest (Map insertion order)
        const oldest = this.codeStore.keys().next().value
        if (oldest !== undefined) this.codeStore.delete(oldest)
      }
    }

    const resolvedLang: 'es' | 'en' | 'pt' =
      lang === 'es' || lang === 'en' || lang === 'pt' ? lang : 'es'

    try {
      await this.emailSender(email, EMAIL_SUBJECTS[resolvedLang], EMAIL_BODIES[resolvedLang](code))
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }

    // Mutate state only after a confirmed successful send
    this.codeStore.set(email, { code, expiresAt: Date.now() + EMAIL_TTL, attempts: 0 })
    this.recordSend(email)
    return { success: true }
  }

  // ── Public: verifyEmailCode ─────────────────────────────────────────────────

  async verifyEmailCode(email: string, code: string): Promise<{ valid: boolean }> {
    const entry = this.codeStore.get(email)
    if (!entry) return { valid: false }

    if (Date.now() > entry.expiresAt) {
      this.codeStore.delete(email)
      return { valid: false }
    }

    if (entry.code === code) {
      this.codeStore.delete(email)
      return { valid: true }
    }

    entry.attempts++
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      this.codeStore.delete(email)
    }

    return { valid: false }
  }

  // ── Public: gate tokens ─────────────────────────────────────────────────────

  /**
   * Generates and stores a short-lived gate token for the given phone.
   * Previous token for the same phone is replaced.
   */
  issueGateToken(phone: string): string {
    const token = crypto.randomBytes(32).toString('hex')
    if (!this.gateTokens.has(phone) && this.gateTokens.size >= MAX_MAP_ENTRIES) {
      this.purgeExpiredGateTokens()
      if (this.gateTokens.size >= MAX_MAP_ENTRIES) {
        const oldest = this.gateTokens.keys().next().value
        if (oldest !== undefined) this.gateTokens.delete(oldest)
      }
    }
    this.gateTokens.set(phone, { token, expiresAt: Date.now() + 5 * 60 * 1000 })
    return token
  }

  /**
   * Validates and consumes the gate token for the given phone.
   * Returns true once; the token is deleted after first use or on expiry.
   */
  consumeGateToken(phone: string, token: string): boolean {
    const entry = this.gateTokens.get(phone)
    if (!entry || entry.token !== token || Date.now() > entry.expiresAt) {
      this.gateTokens.delete(phone)
      return false
    }
    this.gateTokens.delete(phone)
    return true
  }

  // ── Public: cleanup timer ───────────────────────────────────────────────────

  startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup()
      } catch (err) {
        console.error('EmailService cleanup error:', err)
      }
    }, CLEANUP_INTERVAL)
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  // ── Internal: cleanup ───────────────────────────────────────────────────────

  private cleanup(): void {
    this.purgeExpiredCodeEntries()
    const now = Date.now()
    for (const [email, bucket] of this.sendRateLimitMap) {
      if (now > bucket.resetAt) this.sendRateLimitMap.delete(email)
    }
    // Sweep expired gate tokens
    for (const [phone, entry] of this.gateTokens) {
      if (now > entry.expiresAt) this.gateTokens.delete(phone)
    }
  }

  // ── Internal: rate limit ────────────────────────────────────────────────────

  /** Pure read — returns true if the email is currently over its send quota. */
  private isSendRateLimited(email: string): boolean {
    const now = Date.now()
    const bucket = this.sendRateLimitMap.get(email)
    if (!bucket || now > bucket.resetAt) return false
    return bucket.count >= SEND_RATE_LIMIT
  }

  /** Mutating write — called only after a successful send to consume one slot. */
  private recordSend(email: string): void {
    const now = Date.now()
    const bucket = this.sendRateLimitMap.get(email)

    if (!bucket || now > bucket.resetAt) {
      if (this.sendRateLimitMap.size >= MAX_MAP_ENTRIES) {
        for (const [key, b] of this.sendRateLimitMap) {
          if (now > b.resetAt) this.sendRateLimitMap.delete(key)
        }
        if (this.sendRateLimitMap.size >= MAX_MAP_ENTRIES) {
          const oldest = this.sendRateLimitMap.keys().next().value
          if (oldest !== undefined) this.sendRateLimitMap.delete(oldest)
        }
      }
      this.sendRateLimitMap.set(email, { count: 1, resetAt: now + SEND_RATE_WINDOW })
    } else {
      bucket.count++
    }
  }

  // ── Internal: Resend email sender ───────────────────────────────────────────

  private async defaultEmailSender(to: string, subject: string, text: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY env var not configured')

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: DEFAULT_FROM, to, subject, text })
    if (error) throw new Error(error.message)
  }

  // ── Internal: capacity management ──────────────────────────────────────────

  private purgeExpiredCodeEntries(): void {
    const now = Date.now()
    for (const [email, entry] of this.codeStore) {
      if (now > entry.expiresAt) this.codeStore.delete(email)
    }
  }

  private purgeExpiredGateTokens(): void {
    const now = Date.now()
    for (const [phone, entry] of this.gateTokens) {
      if (now > entry.expiresAt) this.gateTokens.delete(phone)
    }
  }
}

export const emailService = new EmailService()
export default EmailService
