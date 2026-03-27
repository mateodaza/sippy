/**
 * Invite Service
 *
 * Handles the invite-a-friend flow: creating pending invites,
 * enforcing daily limits, and notifying both parties when the
 * invited user joins Sippy.
 */

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { query as _query, getUserLanguage as _getUserLanguage } from '#services/db'
import { getLanguageForPhone } from '#utils/phone'

const INVITE_WHITELIST = new Set(
  (env.get('VELOCITY_WHITELIST', '') as string)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
)
import {
  notifyInviteRecipient as _notifyInviteRecipient,
  notifyInviteCompleted as _notifyInviteCompleted,
} from '#services/notification.service'

// Dependency injection for testing (follows __setCdpClientForTest pattern)
let deps = {
  query: _query,
  getUserLanguage: _getUserLanguage,
  notifyInviteRecipient: _notifyInviteRecipient,
  notifyInviteCompleted: _notifyInviteCompleted,
}

export function __setDepsForTest(overrides: Partial<typeof deps>) {
  deps = { ...deps, ...overrides }
}

export function __resetDeps() {
  deps = {
    query: _query,
    getUserLanguage: _getUserLanguage,
    notifyInviteRecipient: _notifyInviteRecipient,
    notifyInviteCompleted: _notifyInviteCompleted,
  }
}

/**
 * Create a pending invite from sender to recipient.
 *
 * Enforces a 10-invite-per-24h daily limit per sender.
 * Uses a partial unique index to prevent duplicate pending invites
 * for the same sender/recipient pair.
 *
 * Returns a result object indicating the outcome.
 */
export async function createInvite(
  senderPhone: string,
  recipientPhone: string,
  _amount: number,
  lang: string
): Promise<{
  success?: true
  delivered?: boolean
  alreadyInvited?: boolean
  dailyLimitReached?: boolean
}> {
  try {
    // 1. Expire stale invites for this sender
    await deps.query(
      `UPDATE pending_invites SET status = 'expired'
       WHERE sender_phone = $1 AND status = 'pending' AND expires_at < $2`,
      [senderPhone, Date.now()]
    )

    // 2. Count sender invites in last 24h (whitelisted senders skip this check)
    if (!INVITE_WHITELIST.has(senderPhone)) {
      const countResult = await deps.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM pending_invites
         WHERE sender_phone = $1 AND created_at > $2`,
        [senderPhone, Date.now() - 24 * 60 * 60 * 1000]
      )
      if (Number.parseInt(countResult.rows[0]?.count ?? '0', 10) >= 10) {
        return { dailyLimitReached: true }
      }
    }

    // 3. Atomic INSERT with conflict guard on partial unique index
    const now = Date.now()
    const insertResult = await deps.query<{ id: number }>(
      `INSERT INTO pending_invites (sender_phone, recipient_phone, status, created_at, expires_at)
       VALUES ($1, $2, 'pending', $3, $4)
       ON CONFLICT (sender_phone, recipient_phone) WHERE status = 'pending'
       DO NOTHING
       RETURNING id`,
      [senderPhone, recipientPhone, now, now + 7 * 24 * 60 * 60 * 1000]
    )
    if (insertResult.rows.length === 0) {
      return { alreadyInvited: true }
    }

    // 4. Notify the recipient
    const delivered = await deps.notifyInviteRecipient({ recipientPhone, lang })

    return { success: true, delivered }
  } catch (error) {
    logger.error('createInvite failed for %s -> %s: %o', senderPhone, recipientPhone, error)
    throw error
  }
}

// Rows stuck in 'notifying' longer than this are considered abandoned (process crash, etc.)
// and will be reclaimed by the next checkAndNotifySender call or retryPendingNotifications.
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

// Retry interval for pending invite notifications (10 minutes)
const RETRY_INTERVAL_MS = 10 * 60 * 1000

/**
 * Check if a newly-joined user has pending invites, complete them,
 * and notify each sender that their friend joined.
 *
 * Called during the onboarding flow when a new user finishes setup.
 * Best-effort — never throws.
 *
 * Uses a claim-based pattern to prevent duplicate notifications:
 *   1. Atomically claim rows by setting status = 'notifying' + claimed_at
 *   2. Send notifications for each claimed row
 *   3. Mark completed on success, revert to 'pending' on failure
 *
 * Stale claims (stuck in 'notifying' > 5 min from a crashed process)
 * are automatically reclaimed by the next caller.
 */
export async function checkAndNotifySender(recipientPhone: string): Promise<void> {
  try {
    const now = Date.now()

    // 1. Atomically claim pending invites for this recipient.
    //    Also reclaims rows stuck in 'notifying' past the timeout (crashed process recovery).
    const claimed = await deps.query<{ id: number; sender_phone: string }>(
      `UPDATE pending_invites SET status = 'notifying', claimed_at = $3
       WHERE recipient_phone = $1 AND expires_at > $2
         AND (status = 'pending' OR (status = 'notifying' AND claimed_at < $4))
       RETURNING id, sender_phone`,
      [recipientPhone, now, now, now - CLAIM_TIMEOUT_MS]
    )

    // 2. For each claimed invite: notify sender, then mark completed or revert
    for (const row of claimed.rows) {
      try {
        const lang =
          (await deps.getUserLanguage(row.sender_phone)) ?? getLanguageForPhone(row.sender_phone)
        await deps.notifyInviteCompleted({
          senderPhone: row.sender_phone,
          recipientPhone,
          lang,
        })
        // Notification succeeded — mark completed
        await deps.query(
          `UPDATE pending_invites SET status = 'completed', notified_at = $1 WHERE id = $2`,
          [Date.now(), row.id]
        )
      } catch (err) {
        logger.error(
          'Failed to notify sender %s about invite completion: %o',
          row.sender_phone,
          err
        )
        // Revert to 'pending' so a future retry can pick it up
        try {
          await deps.query(
            `UPDATE pending_invites SET status = 'pending', claimed_at = NULL WHERE id = $1 AND status = 'notifying'`,
            [row.id]
          )
        } catch (revertErr) {
          logger.error('Failed to revert invite %d to pending: %o', row.id, revertErr)
        }
      }
    }
  } catch (error) {
    logger.error('checkAndNotifySender failed for %s: %o', recipientPhone, error)
  }
}

/**
 * Retry pending invite notifications where the recipient already registered.
 *
 * Finds pending/stale-notifying invites whose recipient_phone exists in
 * phone_registry (i.e. the recipient completed registerWallet but the
 * notification failed due to a transient WhatsApp outage, process crash, etc.).
 *
 * Runs periodically via InviteProvider. Best-effort — never throws.
 */
export async function retryPendingNotifications(): Promise<void> {
  try {
    const now = Date.now()

    // Find distinct recipient phones that have pending invites AND a wallet.
    // JOIN matches both canonical E.164 (+573001234567) and legacy bare-digit
    // (573001234567) rows in phone_registry (pre-SH-003 compatibility).
    const result = await deps.query<{ recipient_phone: string }>(
      `SELECT DISTINCT pi.recipient_phone
       FROM pending_invites pi
       INNER JOIN phone_registry pr
         ON pr.phone_number = pi.recipient_phone
         OR pr.phone_number = LTRIM(pi.recipient_phone, '+')
       WHERE pi.expires_at > $1
         AND (pi.status = 'pending' OR (pi.status = 'notifying' AND pi.claimed_at < $2))`,
      [now, now - CLAIM_TIMEOUT_MS]
    )

    for (const row of result.rows) {
      await checkAndNotifySender(row.recipient_phone)
    }
  } catch (error) {
    logger.error('retryPendingNotifications failed: %o', error)
  }
}

// ── Timer management (called by InviteProvider) ──────────────────────────────

let retryTimer: ReturnType<typeof setInterval> | null = null

export function startRetryTimer(): void {
  if (retryTimer) return
  retryTimer = setInterval(() => {
    retryPendingNotifications().catch((err) => {
      logger?.error('Invite retry timer error: %o', err)
    })
  }, RETRY_INTERVAL_MS)
  retryTimer.unref()
  logger?.info('InviteService: retry timer started (every %dms)', RETRY_INTERVAL_MS)
}

export function stopRetryTimer(): void {
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
    logger?.info('InviteService: retry timer stopped')
  }
}
