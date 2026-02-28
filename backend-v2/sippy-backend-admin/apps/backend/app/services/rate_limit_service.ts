/**
 * RateLimitService
 *
 * Consolidates all in-memory rate-limiting and deduplication maps into a single
 * singleton. Registered as a container binding via RateLimitProvider so every
 * consumer shares the same instance.
 *
 * Maps:
 *  1. processedMessages — message deduplication (2-min TTL)
 *  2. userMessageCount  — per-user spam protection (10 msg/min)
 *  3. ipResolveThrottle  — IP rate limit for /resolve-phone (10 req/min)
 *  4. userResolveThrottle — per-user phone-resolution throttle (20/hr)
 */

import type { Logger } from '@adonisjs/core/logger'

// ── Constants ──────────────────────────────────────────────────────────────────

const MESSAGE_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
const SPAM_WINDOW = 60 * 1000 // 1 minute
const SPAM_THRESHOLD = 10 // max messages per window

const IP_RESOLVE_LIMIT = 10 // requests per window
const IP_RESOLVE_WINDOW = 60 * 1000 // 1 minute

const USER_RESOLVE_LIMIT = 20 // lookups per window
const USER_RESOLVE_WINDOW = 60 * 60 * 1000 // 1 hour

// ── Types ──────────────────────────────────────────────────────────────────────

interface CountBucket {
  count: number
  resetTime: number
}

interface ThrottleBucket {
  count: number
  resetAt: number
}

// ── Service ────────────────────────────────────────────────────────────────────

export default class RateLimitService {
  private logger?: Logger

  /**
   * Map 1: Message deduplication
   * messageId → timestamp when it was first seen
   */
  private processedMessages: Map<string, number> = new Map()

  /**
   * Map 2: User spam protection
   * phoneNumber → { count, resetTime }
   */
  private userMessageCount: Map<string, CountBucket> = new Map()

  /**
   * Map 3: IP rate limiter for /resolve-phone
   * IP → { count, resetAt }
   */
  private ipResolveThrottle: Map<string, ThrottleBucket> = new Map()

  /**
   * Map 4: Per-user phone resolution throttle
   * phoneNumber → { count, resetAt }
   */
  private userResolveThrottle: Map<string, ThrottleBucket> = new Map()

  /** Interval handles so we can stop them on shutdown */
  private cleanupTimers: ReturnType<typeof setInterval>[] = []

  /**
   * Inject logger after construction (provider calls this at boot time
   * when the AdonisJS logger service is available).
   */
  setLogger(log: Logger): void {
    this.logger = log
  }

  // ── Map 1: Message Deduplication ───────────────────────────────────────────

  /**
   * Returns `true` if the message has already been processed (duplicate).
   * Does NOT mark the message — call markProcessed() after successful handling.
   * This matches Express behavior: only mark after success so Meta can retry on failure.
   */
  isDuplicate(messageId: string): boolean {
    return this.processedMessages.has(messageId)
  }

  /**
   * Marks a message as processed. Call this AFTER successful handling
   * (or when deliberately blocking spam). Allows Meta retries on failure.
   */
  markProcessed(messageId: string): void {
    this.processedMessages.set(messageId, Date.now())
  }

  // ── Map 2: User Spam Protection ────────────────────────────────────────────

  /**
   * Returns `true` if the user has exceeded the spam threshold (10 msg/min).
   * Resets the counter when the window expires.
   */
  isSpamming(phoneNumber: string): boolean {
    const now = Date.now()
    const entry = this.userMessageCount.get(phoneNumber)

    if (!entry || now > entry.resetTime) {
      this.userMessageCount.set(phoneNumber, { count: 1, resetTime: now + SPAM_WINDOW })
      return false
    }

    entry.count++
    if (entry.count > SPAM_THRESHOLD) {
      return true
    }

    return false
  }

  // ── Map 3: IP Rate Limiter ─────────────────────────────────────────────────

  /**
   * Checks whether an IP has exceeded the resolve-phone rate limit.
   * Returns `{ allowed: false, retryAfter }` (seconds) when the limit is hit.
   */
  checkIpResolveThrottle(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now()
    const entry = this.ipResolveThrottle.get(ip)

    if (!entry || now > entry.resetAt) {
      this.ipResolveThrottle.set(ip, { count: 1, resetAt: now + IP_RESOLVE_WINDOW })
      return { allowed: true }
    }

    entry.count++
    if (entry.count > IP_RESOLVE_LIMIT) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      return { allowed: false, retryAfter }
    }

    return { allowed: true }
  }

  // ── Map 4: Per-User Phone Resolution Throttle ──────────────────────────────

  /**
   * Returns `false` if the user has exceeded 20 phone lookups per hour.
   * Resets when the window expires.
   */
  checkUserResolveThrottle(phoneNumber: string): boolean {
    const now = Date.now()
    const entry = this.userResolveThrottle.get(phoneNumber)

    if (!entry || now > entry.resetAt) {
      this.userResolveThrottle.set(phoneNumber, {
        count: 1,
        resetAt: now + USER_RESOLVE_WINDOW,
      })
      return true
    }

    entry.count++
    if (entry.count > USER_RESOLVE_LIMIT) {
      return false
    }

    return true
  }

  // ── Cleanup Timers ─────────────────────────────────────────────────────────

  /**
   * Start periodic cleanup of expired entries across all maps.
   * Called automatically by the provider after boot.
   */
  startCleanupTimers(): void {
    // Messages + spam: every 60 seconds
    const msgTimer = setInterval(() => {
      const now = Date.now()
      let msgCleaned = 0
      let spamCleaned = 0

      for (const [id, timestamp] of this.processedMessages) {
        if (now - timestamp > MESSAGE_CACHE_TTL) {
          this.processedMessages.delete(id)
          msgCleaned++
        }
      }

      for (const [phone, entry] of this.userMessageCount) {
        if (now > entry.resetTime) {
          this.userMessageCount.delete(phone)
          spamCleaned++
        }
      }

      if (msgCleaned > 0 || spamCleaned > 0) {
        this.logger?.debug(
          `RateLimitService cleanup: ${msgCleaned} messages, ${spamCleaned} spam entries`
        )
      }
    }, 60_000)

    // IP + user resolve throttles: every 5 minutes
    const resolveTimer = setInterval(() => {
      const now = Date.now()
      let ipCleaned = 0
      let userCleaned = 0

      for (const [ip, entry] of this.ipResolveThrottle) {
        if (entry.resetAt < now) {
          this.ipResolveThrottle.delete(ip)
          ipCleaned++
        }
      }

      for (const [phone, entry] of this.userResolveThrottle) {
        if (entry.resetAt < now) {
          this.userResolveThrottle.delete(phone)
          userCleaned++
        }
      }

      if (ipCleaned > 0 || userCleaned > 0) {
        this.logger?.debug(
          `RateLimitService cleanup: ${ipCleaned} IP entries, ${userCleaned} user-resolve entries`
        )
      }
    }, 5 * 60_000)

    this.cleanupTimers.push(msgTimer, resolveTimer)
    this.logger?.info('RateLimitService: cleanup timers started')
  }

  /**
   * Stop all cleanup intervals. Called on graceful shutdown.
   */
  stopCleanupTimers(): void {
    for (const timer of this.cleanupTimers) {
      clearInterval(timer)
    }
    this.cleanupTimers = []
    this.logger?.info('RateLimitService: cleanup timers stopped')
  }
}
