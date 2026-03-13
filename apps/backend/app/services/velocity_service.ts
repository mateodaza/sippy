/**
 * VelocityService
 *
 * Enforces per-user transaction velocity limits using rolling windows:
 *  1. Max sends per 10-minute window
 *  2. Max USD sent per 1-hour window
 *  3. Max unique new recipients per 1-hour window
 *
 * Data structures use arrays of timestamped events rather than fixed buckets,
 * so windows are truly rolling — no anchor-time resets.
 */

import type { Logger } from '@adonisjs/core/logger'
import type { Lang } from '#utils/messages'

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SENDS = Number(process.env.VELOCITY_MAX_SENDS_PER_10MIN ?? 5)
const MAX_USD = Number(process.env.VELOCITY_MAX_USD_PER_HOUR ?? 500)
const MAX_NEW_RECIPIENTS = Number(process.env.VELOCITY_MAX_NEW_RECIPIENTS_PER_HOUR ?? 3)
const MAX_MAP_ENTRIES = Number(process.env.MAX_MAP_ENTRIES ?? 100_000)

const SEND_WINDOW = 10 * 60 * 1000 // 10 minutes
const USD_WINDOW = 60 * 60 * 1000 // 1 hour
const RECIPIENT_WINDOW = 60 * 60 * 1000 // 1 hour

const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

// ── Trilingual limit strings ───────────────────────────────────────────────────

const VELOCITY_MESSAGES: Record<'send_rate' | 'usd_limit' | 'new_recipient', Record<Lang, string>> =
  {
    send_rate: {
      en: 'Too many sends. Please wait a few minutes.',
      es: 'Demasiados envios. Por favor espera unos minutos.',
      pt: 'Muitos envios. Por favor aguarde alguns minutos.',
    },
    usd_limit: {
      en: 'Hourly send limit reached. Please try again later.',
      es: 'Limite de envio por hora alcanzado. Intenta mas tarde.',
      pt: 'Limite de envio por hora atingido. Tente mais tarde.',
    },
    new_recipient: {
      en: 'Too many new recipients this hour. Please try again later.',
      es: 'Demasiados destinatarios nuevos esta hora. Intenta mas tarde.',
      pt: 'Muitos destinatarios novos nesta hora. Tente mais tarde.',
    },
  }

// ── Service ────────────────────────────────────────────────────────────────────

export default class VelocityService {
  private logger?: Logger

  /**
   * Map 1: per-user send timestamps in rolling 10-min window
   * phone → number[]  (each entry is a clock() value of a completed send)
   */
  private sendTimestamps: Map<string, number[]> = new Map()

  /**
   * Map 2: per-user USD events in rolling 1-hour window
   * phone → { timestamp: number; amount: number }[]
   */
  private usdEvents: Map<string, { timestamp: number; amount: number }[]> = new Map()

  /**
   * Map 3: per-user recipient events in rolling 1-hour window
   * phone → { timestamp: number; recipient: string }[]
   * Deduplication (unique recipients) happens at check-time via Set.
   */
  private recipientEvents: Map<string, { timestamp: number; recipient: string }[]> = new Map()

  /** Interval handles so we can stop them on shutdown */
  private cleanupTimers: ReturnType<typeof setInterval>[] = []

  constructor(private clock: () => number = Date.now) {}

  /**
   * Inject logger after construction.
   */
  setLogger(log: Logger): void {
    this.logger = log
  }

  /**
   * Check all velocity rules for a user attempting to send.
   * Does NOT record the send — call recordSend() after a successful send.
   *
   * @param senderPhone    canonicalized E.164 phone
   * @param recipientPhone canonicalized E.164 phone
   * @param amountUsd      send amount in USD
   * @param lang           language for the reason string (default: 'en')
   * @returns { allowed: boolean, reason?: string }
   */
  check(
    senderPhone: string,
    recipientPhone: string,
    amountUsd: number,
    lang: Lang = 'en'
  ): { allowed: boolean; reason?: string } {
    const now = this.clock()

    // Rule 1: Send rate (rolling 10-min window)
    const sends = (this.sendTimestamps.get(senderPhone) ?? []).filter(
      (t) => t >= now - SEND_WINDOW
    )
    if (sends.length >= MAX_SENDS) {
      return { allowed: false, reason: VELOCITY_MESSAGES.send_rate[lang] }
    }

    // Rule 2: USD total (rolling 1-hour window)
    const usdEntries = (this.usdEvents.get(senderPhone) ?? []).filter(
      (e) => e.timestamp >= now - USD_WINDOW
    )
    const usdSum = usdEntries.reduce((acc, e) => acc + e.amount, 0)
    if (usdSum + amountUsd > MAX_USD) {
      return { allowed: false, reason: VELOCITY_MESSAGES.usd_limit[lang] }
    }

    // Rule 3: New recipients (rolling 1-hour window)
    const recipientEntries = (this.recipientEvents.get(senderPhone) ?? []).filter(
      (e) => e.timestamp >= now - RECIPIENT_WINDOW
    )
    const uniqueRecipients = new Set(recipientEntries.map((e) => e.recipient))
    if (!uniqueRecipients.has(recipientPhone) && uniqueRecipients.size >= MAX_NEW_RECIPIENTS) {
      return { allowed: false, reason: VELOCITY_MESSAGES.new_recipient[lang] }
    }

    return { allowed: true }
  }

  /**
   * Record a completed send. Call AFTER success to avoid counting failed sends.
   *
   * Always records — never silently drops — to prevent velocity bypass under
   * capacity pressure. If any map is at or over MAX_MAP_ENTRIES before the
   * insert, an on-demand cleanup sweep runs first to evict expired entries
   * and keep the maps within the configured hard cap.
   */
  recordSend(senderPhone: string, recipientPhone: string, amountUsd: number): void {
    const now = this.clock()

    // Pre-insert capacity guard: evict expired entries before adding new ones so
    // the maps cannot grow past MAX_MAP_ENTRIES under sustained abuse traffic.
    if (
      this.sendTimestamps.size >= MAX_MAP_ENTRIES ||
      this.usdEvents.size >= MAX_MAP_ENTRIES ||
      this.recipientEvents.size >= MAX_MAP_ENTRIES
    ) {
      this.logger?.warn('VelocityService: map near hard cap, running on-demand cleanup')
      this.runCleanup()
    }

    const prunedSends = (this.sendTimestamps.get(senderPhone) ?? []).filter(
      (t) => t >= now - SEND_WINDOW
    )
    prunedSends.push(now)
    this.sendTimestamps.set(senderPhone, prunedSends)

    const prunedUsd = (this.usdEvents.get(senderPhone) ?? []).filter(
      (e) => e.timestamp >= now - USD_WINDOW
    )
    prunedUsd.push({ timestamp: now, amount: amountUsd })
    this.usdEvents.set(senderPhone, prunedUsd)

    const prunedRecipients = (this.recipientEvents.get(senderPhone) ?? []).filter(
      (e) => e.timestamp >= now - RECIPIENT_WINDOW
    )
    prunedRecipients.push({ timestamp: now, recipient: recipientPhone })
    this.recipientEvents.set(senderPhone, prunedRecipients)
  }

  /**
   * Start periodic cleanup of expired entries across all maps.
   */
  startCleanupTimers(): void {
    const timer = setInterval(() => {
      this.runCleanup()
    }, CLEANUP_INTERVAL)

    this.cleanupTimers.push(timer)
    this.logger?.info('VelocityService: cleanup timers started')
  }

  /**
   * Stop all cleanup intervals. Called on graceful shutdown.
   */
  stopCleanupTimers(): void {
    for (const timer of this.cleanupTimers) {
      clearInterval(timer)
    }
    this.cleanupTimers = []
    this.logger?.info('VelocityService: cleanup timers stopped')
  }

  /**
   * Clear all maps. Useful in tests.
   */
  reset(): void {
    this.sendTimestamps.clear()
    this.usdEvents.clear()
    this.recipientEvents.clear()
  }

  // ── On-demand / periodic cleanup ───────────────────────────────────────────

  private runCleanup(): void {
    const now = this.clock()
    let cleaned = 0

    for (const [phone, timestamps] of this.sendTimestamps) {
      const filtered = timestamps.filter((t) => t >= now - SEND_WINDOW)
      if (filtered.length === 0) {
        this.sendTimestamps.delete(phone)
      } else {
        this.sendTimestamps.set(phone, filtered)
      }
      cleaned++
    }

    for (const [phone, events] of this.usdEvents) {
      const filtered = events.filter((e) => e.timestamp >= now - USD_WINDOW)
      if (filtered.length === 0) {
        this.usdEvents.delete(phone)
      } else {
        this.usdEvents.set(phone, filtered)
      }
    }

    for (const [phone, events] of this.recipientEvents) {
      const filtered = events.filter((e) => e.timestamp >= now - RECIPIENT_WINDOW)
      if (filtered.length === 0) {
        this.recipientEvents.delete(phone)
      } else {
        this.recipientEvents.set(phone, filtered)
      }
    }

    if (cleaned > 0) {
      this.logger?.debug(`VelocityService cleanup: swept ${cleaned} send entries`)
    }
  }
}
