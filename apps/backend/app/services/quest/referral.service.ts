/**
 * Sippy Quest — referral service
 *
 * Owns the referral_codes / referral_attributions / pending_referrals
 * tables. Three jobs:
 *
 *   1. Generate or fetch a user's referral code for a given event
 *      (`ensureReferralCode`). Auto-enroll path — called on first
 *      `mi codigo` request and on onboarding completion. Idempotent.
 *
 *   2. Capture a referral attempt from a `[REF-XXXXXX]` bracket token
 *      (`captureReferral`). If the sender is already onboarded, writes
 *      `referral_attributions` directly; if not, writes `pending_referrals`
 *      so the attribution survives any restart during the onboarding
 *      window. Either way, exactly one attribution per referee lifetime
 *      (PK on `referee_phone`).
 *
 *   3. Drain a pending referral into an attribution
 *      (`drainPendingReferral`). Called by the event service on
 *      onboarding completion. Single transaction: write attribution,
 *      delete pending. No-op when nothing pending.
 *
 * All anti-gaming guards (self-referral block, distinct phone) live in
 * this module so the bracket dispatcher and the event service share one
 * source of truth. Vendor/exchange exclusion lives in the Quest scoring
 * query — referrals from those accounts are still recorded, just filtered
 * at draw time.
 */

import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'
import { maskPhone } from '#utils/phone'

// ── Code generation ─────────────────────────────────────────────────────

// Crockford-style base32 alphabet, NO ambiguous glyphs (0/1/I/L/O dropped).
// Matches the alphabet used by QR short-ids so the visual/UX feel is
// consistent across all Sippy-issued codes.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 6
// 31^6 = ~887M space; collision probability with 10K codes is < 1 in 100M.
// Retry-on-collision (UNIQUE constraint on `referral_codes.code` is the PK)
// handles the rare case without app-level effort.
const MAX_GENERATION_RETRIES = 5

function generateCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

// ── Public types ────────────────────────────────────────────────────────

export interface ReferralCodeRow {
  code: string
  phoneNumber: string
  eventSlug: string
}

export type CaptureOutcome =
  /** Attribution written directly — sender was already onboarded. */
  | { kind: 'attributed'; referrerPhone: string; eventSlug: string }
  /** Sender not onboarded yet; pending row written for later drain. */
  | { kind: 'pending'; referrerPhone: string; eventSlug: string }
  /** Code didn't resolve. Caller should ignore silently (the user typed
   *  garbage or a stale code). */
  | { kind: 'unknown_code' }
  /** Sender tried to refer themselves. Anti-gaming guard fires. */
  | { kind: 'self_referral' }
  /** Sender already has an attribution row from an earlier capture.
   *  PK on `referee_phone` makes second writes idempotent no-ops; we
   *  surface that as a distinct outcome so logs are clear. */
  | { kind: 'already_attributed' }

// ── ensureReferralCode ──────────────────────────────────────────────────

/**
 * Get or generate the referral code for (phone, event). One code per
 * (user, event) by unique index — second call returns the existing row.
 * Safe to call on every `mi codigo` request and on onboarding completion;
 * a write race between the two would resolve via the UNIQUE constraint
 * and yield the existing row on retry.
 *
 * @throws when too many collisions in a row (extremely unlikely; logged).
 */
export async function ensureReferralCode(
  phoneNumber: string,
  eventSlug: string
): Promise<ReferralCodeRow> {
  // Fast path: already exists.
  const existing = await query<{
    code: string
    phone_number: string
    event_slug: string
  }>(
    `SELECT code, phone_number, event_slug
     FROM referral_codes
     WHERE phone_number = $1 AND event_slug = $2
     LIMIT 1`,
    [phoneNumber, eventSlug]
  )
  if (existing.rows.length > 0) {
    return {
      code: existing.rows[0].code,
      phoneNumber: existing.rows[0].phone_number,
      eventSlug: existing.rows[0].event_slug,
    }
  }

  // Slow path: generate, retry on collision.
  for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
    const code = generateCode()
    try {
      const inserted = await query<{ code: string; phone_number: string; event_slug: string }>(
        `INSERT INTO referral_codes (code, phone_number, event_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (phone_number, event_slug) DO UPDATE
           SET phone_number = referral_codes.phone_number
         RETURNING code, phone_number, event_slug`,
        [code, phoneNumber, eventSlug]
      )
      if (inserted.rows.length > 0) {
        return {
          code: inserted.rows[0].code,
          phoneNumber: inserted.rows[0].phone_number,
          eventSlug: inserted.rows[0].event_slug,
        }
      }
    } catch (err) {
      // PK collision on `code` — extremely rare with 887M space and small N.
      // Retry; any other DB error rethrows.
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('referral_codes_pkey') && !msg.includes('duplicate key')) {
        throw err
      }
      logger.warn(
        { attempt, phone: maskPhone(phoneNumber) },
        'quest.referral: code collision — retrying'
      )
    }
  }

  // Should never happen with a 31^6 space and retries.
  throw new Error(
    `quest.referral: failed to generate unique code after ${MAX_GENERATION_RETRIES} attempts`
  )
}

// ── lookupReferralCode ──────────────────────────────────────────────────

export async function lookupReferralCode(code: string): Promise<ReferralCodeRow | null> {
  const r = await query<{ code: string; phone_number: string; event_slug: string }>(
    `SELECT code, phone_number, event_slug
     FROM referral_codes
     WHERE code = $1
     LIMIT 1`,
    [code]
  )
  if (r.rows.length === 0) return null
  return {
    code: r.rows[0].code,
    phoneNumber: r.rows[0].phone_number,
    eventSlug: r.rows[0].event_slug,
  }
}

// ── captureReferral ─────────────────────────────────────────────────────

/**
 * Record a referral attempt by code. Decides between immediate
 * attribution (refereee already onboarded) and pending-write (referee
 * still onboarding) based on `refereeOnboarded`.
 *
 * Anti-gaming guards (enforced here, not in schema):
 *   - Self-referral: same phone for referrer + referee → rejected.
 *   - Code unknown: silent no-op (just log).
 *   - Already attributed: no double-write (PK on referee_phone protects
 *     us at DB level too; we check first so the log line is informative).
 *
 * Event-attendance, vendor/exchange exclusion, and entry-cap rules
 * live in the Quest scoring query, NOT here — keeping the write path
 * permissive so attribution survives even if the referrer hasn't checked
 * in yet at the venue.
 */
export async function captureReferral(args: {
  code: string
  refereePhone: string
  refereeOnboarded: boolean
}): Promise<CaptureOutcome> {
  const codeRow = await lookupReferralCode(args.code)
  if (!codeRow) {
    logger.info({ code: args.code }, 'quest.referral: capture — unknown_code')
    return { kind: 'unknown_code' }
  }

  if (codeRow.phoneNumber === args.refereePhone) {
    logger.info(
      { code: args.code, phone: maskPhone(args.refereePhone) },
      'quest.referral: capture — self_referral blocked'
    )
    return { kind: 'self_referral' }
  }

  // Already attributed? PK protects us either way; checking first lets
  // us return a distinct outcome for log clarity.
  const existing = await query<{ referrer_phone: string }>(
    `SELECT referrer_phone FROM referral_attributions WHERE referee_phone = $1 LIMIT 1`,
    [args.refereePhone]
  )
  if (existing.rows.length > 0) {
    logger.info(
      { referee: maskPhone(args.refereePhone) },
      'quest.referral: capture — already_attributed (no-op)'
    )
    return { kind: 'already_attributed' }
  }

  if (args.refereeOnboarded) {
    await query(
      `INSERT INTO referral_attributions
        (referee_phone, referrer_phone, referral_code, event_slug)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (referee_phone) DO NOTHING`,
      [args.refereePhone, codeRow.phoneNumber, codeRow.code, codeRow.eventSlug]
    )
    logger.info(
      {
        referee: maskPhone(args.refereePhone),
        referrer: maskPhone(codeRow.phoneNumber),
        code: codeRow.code,
        eventSlug: codeRow.eventSlug,
      },
      'quest.referral: attributed'
    )
    return {
      kind: 'attributed',
      referrerPhone: codeRow.phoneNumber,
      eventSlug: codeRow.eventSlug,
    }
  }

  // Not onboarded yet — durable pending row. Overwrites on conflict so
  // a fresh scan from the same phone updates to the latest code.
  await query(
    `INSERT INTO pending_referrals (phone_number, referral_code, event_slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE
       SET referral_code = EXCLUDED.referral_code,
           event_slug = EXCLUDED.event_slug,
           captured_at = now()`,
    [args.refereePhone, codeRow.code, codeRow.eventSlug]
  )
  logger.info(
    {
      referee: maskPhone(args.refereePhone),
      referrer: maskPhone(codeRow.phoneNumber),
      code: codeRow.code,
    },
    'quest.referral: pending (referee not onboarded yet)'
  )
  return {
    kind: 'pending',
    referrerPhone: codeRow.phoneNumber,
    eventSlug: codeRow.eventSlug,
  }
}

// ── drainPendingReferral ────────────────────────────────────────────────

/**
 * Called by the event service when a user completes onboarding. If a
 * pending referral row exists for this phone, convert it to an
 * attribution and delete the pending row. Single SQL `WITH` cascade so
 * the read-decide-write happens atomically; no separate transaction
 * needed.
 *
 * Idempotent: if no pending row exists, no-op. If the referee already
 * has an attribution (somehow), the INSERT silently no-ops via the
 * ON CONFLICT clause, and the DELETE still clears the pending row.
 *
 * Returns `null` when nothing was drained, otherwise the attribution row.
 */
export async function drainPendingReferral(refereePhone: string): Promise<{
  referrerPhone: string
  code: string
  eventSlug: string
} | null> {
  const drained = await query<{
    referrer_phone: string
    referral_code: string
    event_slug: string
  }>(
    `WITH p AS (
       DELETE FROM pending_referrals WHERE phone_number = $1
       RETURNING referral_code, event_slug
     ),
     c AS (
       SELECT p.referral_code, p.event_slug, rc.phone_number AS referrer_phone
       FROM p JOIN referral_codes rc ON rc.code = p.referral_code
     ),
     ins AS (
       INSERT INTO referral_attributions
         (referee_phone, referrer_phone, referral_code, event_slug)
       SELECT $1, c.referrer_phone, c.referral_code, c.event_slug
       FROM c
       WHERE c.referrer_phone != $1
       ON CONFLICT (referee_phone) DO NOTHING
       RETURNING referrer_phone, referral_code, event_slug
     )
     SELECT referrer_phone, referral_code, event_slug FROM ins`,
    [refereePhone]
  )
  if (drained.rows.length === 0) return null
  const row = drained.rows[0]
  logger.info(
    {
      referee: maskPhone(refereePhone),
      referrer: maskPhone(row.referrer_phone),
      code: row.referral_code,
      eventSlug: row.event_slug,
    },
    'quest.referral: drained pending → attributed'
  )
  return {
    referrerPhone: row.referrer_phone,
    code: row.referral_code,
    eventSlug: row.event_slug,
  }
}

// ── Test seam ───────────────────────────────────────────────────────────

export const __testing = {
  generateCode,
  CODE_ALPHABET,
  CODE_LENGTH,
}
