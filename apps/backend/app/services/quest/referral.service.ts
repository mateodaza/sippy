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

import { randomBytes } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import { query } from '#services/db'
import { canonicalizePhone, maskPhone } from '#utils/phone'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'

// ── Quest namespace ─────────────────────────────────────────────────────

/**
 * Sippy Quest is a GLOBAL mechanic, not event-scoped. A user has ONE
 * referral code for life (not one per event). The `referral_codes` table
 * still carries `event_slug` for historical reasons + future per-event
 * campaigns (e.g. a seasonal limited-edition code), but the default
 * namespace for the user-facing share link is this sentinel.
 *
 * Naming rationale: `event_slug` is misleading — for the global code,
 * there's no event. Treat the column as a "campaign namespace" and the
 * 'global' value as the always-on campaign. Renaming the column is a
 * post-Pizza-Day cleanup.
 *
 * Drift guard: any new call site that constructs a referral code MUST
 * use this constant (or be a deliberate per-event campaign opt-in). Do
 * not hardcode 'global' inline — that would defeat the rename later.
 */
export const GLOBAL_REFERRAL_CAMPAIGN = 'global'

// ── Code generation ─────────────────────────────────────────────────────

// Crockford-style base32 alphabet, NO ambiguous glyphs (0/1/I/L/O dropped).
// Matches the alphabet used by QR short-ids so the visual/UX feel is
// consistent across all Sippy-issued codes (see qr_short_id.service.ts).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 6
// 31^6 ≈ 887M code space. Birthday-collision approximation: with N
// active codes, expected first-collision count is ~sqrt(π * 887M / 2)
// ≈ 37K codes — so at our likely scale (hundreds → low thousands) the
// per-generation collision odds are negligible, but NOT astronomically
// small. DB retry-on-PK-collision below handles whichever ones do hit.
const MAX_GENERATION_RETRIES = 5

/**
 * Generate a single referral code using cryptographic randomness with
 * byte-mask rejection sampling. Mirrors `generateShortId` in
 * qr_short_id.service.ts — same alphabet, same sampling discipline, same
 * unbiased distribution. No `Math.random()`: referral codes drive Quest
 * prize entries, so the same crypto-random standard as QR short-ids
 * applies even though they aren't auth secrets.
 *
 * Per-byte acceptance rate: 31/32 (mask gives [0, 31], 31 is rejected).
 * Almost always finishes the inner loop in one pass.
 */
function generateCode(): string {
  let result = ''
  while (result.length < CODE_LENGTH) {
    const buf = randomBytes(CODE_LENGTH * 2)
    for (let i = 0; i < buf.length && result.length < CODE_LENGTH; i++) {
      const idx = buf[i] & 31
      if (idx < CODE_ALPHABET.length) {
        result += CODE_ALPHABET[idx]
      }
      // else: rejected slot — discard byte and continue.
    }
  }
  return result
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
 * Get or generate the user's Sippy Quest referral code. One code per
 * USER, lifetime — the Quest is global, not per-event (see
 * GLOBAL_REFERRAL_CAMPAIGN). The optional `eventSlug` parameter exists
 * only for future per-event campaign opt-ins; the default is the global
 * namespace and that's what `mi codigo` and `mi quest` return.
 *
 * Safe to call on every `mi codigo` request and on onboarding completion;
 * a write race between the two would resolve via the UNIQUE constraint
 * (phone_number, event_slug) and yield the existing row on retry.
 *
 * Two-tier phone handling (per SH-003 legacy-row compat):
 *   1. Canonicalize input to validate + reject garbage at entry.
 *   2. Resolve to the FK-safe form via `resolveUserPrefKey` — returns
 *      bare digits when a bare row exists in `user_preferences`,
 *      canonical E.164 otherwise. This is what goes into the SQL so the
 *      FK to `user_preferences(phone_number)` always resolves.
 *
 * Without step 2, an `ensureReferralCode('+57...')` against a prod row
 * stored as bare digits would fail with an FK violation. Remove the
 * resolveUserPrefKey indirection only after the SH-003 backfill is
 * confirmed (same condition that gates the helper itself).
 *
 * @throws when phone fails to canonicalize, or after too many collisions.
 */
export async function ensureReferralCode(
  phoneNumber: string,
  eventSlug: string = GLOBAL_REFERRAL_CAMPAIGN
): Promise<ReferralCodeRow> {
  const canon = canonicalizePhone(phoneNumber)
  if (!canon) {
    throw new Error(`ensureReferralCode: invalid phone ${maskPhone(phoneNumber)}`)
  }
  phoneNumber = await resolveUserPrefKey(canon)

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
 * `attributionEventSlug` is the event this attribution should be tagged
 * under — typically the currently-active event at the moment the
 * referee texted [REF-XXX]. The CODE'S namespace (`codeRow.eventSlug`,
 * usually 'global' under the post-2026-05-18 GLOBAL_REFERRAL_CAMPAIGN
 * design) is intentionally NOT used here: codes are global, attributions
 * record the event where the referee landed. The scoring CTE filters by
 * attribution event_slug for the prize-draw scope, so a wrong tag here
 * would hide otherwise-valid referrals.
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
  attributionEventSlug: string
}): Promise<CaptureOutcome> {
  // Canonicalize the referee phone — webhook callers pass `from` from
  // WhatsApp payloads (E.164 with `+`). canonical is used for the
  // self-ref COMPARISON (immune to bare-vs-E.164 drift).
  const canonReferee = canonicalizePhone(args.refereePhone)
  if (!canonReferee) {
    logger.warn(
      { phone: maskPhone(args.refereePhone) },
      'quest.referral: capture — invalid referee phone, no-op'
    )
    return { kind: 'unknown_code' }
  }

  const codeRow = await lookupReferralCode(args.code)
  if (!codeRow) {
    logger.info({ code: args.code }, 'quest.referral: capture — unknown_code')
    return { kind: 'unknown_code' }
  }

  // Two-tier resolution:
  //   • canonical form (`canon*`) for COMPARISON (self-ref, dedup logging)
  //   • FK-safe form (`fkKey*` via resolveUserPrefKey) for SQL writes
  //
  // Without the second tier, an `INSERT … VALUES (referee, referrer, …)`
  // with canonical E.164 against a legacy `user_preferences` row stored
  // as bare digits would fail with an FK violation. Remove this
  // indirection only after the SH-003 backfill is confirmed (same
  // condition that gates `resolveUserPrefKey` itself).
  const canonReferrer = canonicalizePhone(codeRow.phoneNumber) ?? codeRow.phoneNumber
  if (canonReferrer === canonReferee) {
    logger.info(
      { code: args.code, phone: maskPhone(canonReferee) },
      'quest.referral: capture — self_referral blocked'
    )
    return { kind: 'self_referral' }
  }

  const fkKeyReferee = await resolveUserPrefKey(canonReferee)
  // codeRow.phoneNumber IS the FK key by construction (ensureReferralCode
  // wrote it that way). Use it directly for writes — don't re-resolve.
  const fkKeyReferrer = codeRow.phoneNumber

  // Already attributed? PK protects us either way; checking first lets
  // us return a distinct outcome for log clarity. Look up by FK key so
  // a row written by a prior format-variant code path still matches.
  const existing = await query<{ referrer_phone: string }>(
    `SELECT referrer_phone FROM referral_attributions WHERE referee_phone = $1 LIMIT 1`,
    [fkKeyReferee]
  )
  if (existing.rows.length > 0) {
    logger.info(
      { referee: maskPhone(canonReferee) },
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
      [fkKeyReferee, fkKeyReferrer, codeRow.code, args.attributionEventSlug]
    )
    logger.info(
      {
        referee: maskPhone(canonReferee),
        referrer: maskPhone(canonReferrer),
        code: codeRow.code,
        attributionEventSlug: args.attributionEventSlug,
      },
      'quest.referral: attributed'
    )
    return {
      kind: 'attributed',
      referrerPhone: canonReferrer,
      eventSlug: args.attributionEventSlug,
    }
  }

  // Not onboarded yet — durable pending row. Overwrites on conflict so
  // a fresh scan from the same phone updates to the latest code. Uses
  // the FK key form to stay consistent with what the drain step will
  // look for once onboarding completes (drain also resolves to FK).
  await query(
    `INSERT INTO pending_referrals (phone_number, referral_code, event_slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE
       SET referral_code = EXCLUDED.referral_code,
           event_slug = EXCLUDED.event_slug,
           captured_at = now()`,
    [fkKeyReferee, codeRow.code, args.attributionEventSlug]
  )
  logger.info(
    {
      referee: maskPhone(canonReferee),
      referrer: maskPhone(canonReferrer),
      code: codeRow.code,
      attributionEventSlug: args.attributionEventSlug,
    },
    'quest.referral: pending (referee not onboarded yet)'
  )
  return {
    kind: 'pending',
    referrerPhone: canonReferrer,
    eventSlug: args.attributionEventSlug,
  }
}

// ── drainPendingReferral ────────────────────────────────────────────────

/**
 * Called when a referee transitions from "pending" to "real Sippy user"
 * — currently from /setup completion and (as a best-effort fallback)
 * from `linkUserToEvent` on genuine attendance writes. Converts any
 * pending referral row for this phone into a real attribution row and
 * deletes the pending row. Single SQL `WITH` cascade so the
 * read-decide-write happens atomically; no separate transaction needed.
 *
 * Attribution event slug: the **pending row's own** `event_slug`. The
 * pending row captured the intent — "this referee came through
 * referrer X for campaign Y" — at the moment of the inbound
 * [REF-XXX] text. Drain preserves that intent verbatim. Callers don't
 * pass an attribution slug because doing so would couple every
 * downstream caller (setup, linkUserToEvent, future paths) to whichever
 * campaign happens to be active at drain time — exactly the coupling we
 * removed when going global.
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
  // Two-tier resolution (same rule as captureReferral): canonicalize to
  // reject garbage, then resolve to the FK-safe form via
  // resolveUserPrefKey. The DELETE keys on phone_number which was
  // stored as the FK key at capture time; the INSERT references
  // user_preferences via FK. Both must match the actual row form.
  const canon = canonicalizePhone(refereePhone)
  if (!canon) return null
  const fkKey = await resolveUserPrefKey(canon)

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
    [fkKey]
  )
  if (drained.rows.length === 0) return null
  const row = drained.rows[0]
  logger.info(
    {
      referee: maskPhone(fkKey),
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
