/**
 * My Pay-QR Controller
 *
 * User-facing pay-QR issuance — every authenticated user can mint their
 * own pay-QR with a display name (their personal name, a business name,
 * an alias — whatever they want printed on the sheet).
 *
 * Routes (JWT-authenticated, prefix /api):
 *   GET  /qr/my-pay-link            — fetch existing active pay-QR (if any)
 *   POST /qr/my-pay-link            — create or return existing (idempotent)
 *
 * Issuance IS the contract: anyone who mints a pay-QR can be paid via that
 * QR's bracket-token scan. There's no "is this a merchant" toggle — the
 * displayName tells the payer who they're paying, and the force-confirm
 * step in the bot ensures USDC never moves without an explicit YES.
 *
 * Idempotency: a user with an existing active pay-QR gets that QR back,
 * not a new one. Prevents duplicate-mint on double-submit / refresh /
 * re-entry. DB-level partial unique index would enforce this harder;
 * app-level is fine at current scale.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import env from '#start/env'
import { createQrLink } from '#services/qr_link.service'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { query } from '#services/db'
import { maskPhone } from '#utils/phone'

const MAX_DISPLAY_NAME = 40

function getFrontendBase(): string {
  return (env.get('FRONTEND_URL') || 'https://www.sippy.lat').replace(/\/+$/, '')
}

function buildScanUrl(shortId: string): string {
  return `${getFrontendBase()}/q/${shortId}?v=1`
}

/** Find the active pay-QR for an owner, or null. */
async function findActivePayLink(
  ownerPhoneNumber: string
): Promise<{ shortId: string; displayName: string | null } | null> {
  const r = await query<{ short_id: string; display_name: string | null }>(
    `SELECT short_id, display_name
       FROM qr_links
      WHERE owner_phone_number = $1 AND kind = 'pay' AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerPhoneNumber]
  )
  return r.rows[0] ? { shortId: r.rows[0].short_id, displayName: r.rows[0].display_name } : null
}

/** Ensure a user_preferences row exists for this phone (FK requirement). */
async function ensureUserPref(phoneNumber: string): Promise<void> {
  await query(
    `INSERT INTO user_preferences (phone_number, updated_at)
     VALUES ($1, NOW())
     ON CONFLICT (phone_number) DO NOTHING`,
    [phoneNumber]
  )
}

const createPayLinkValidator = vine.compile(
  vine.object({
    displayName: vine.string().trim().minLength(1).maxLength(MAX_DISPLAY_NAME),
  })
)

interface PayLinkResponse {
  shortId: string
  displayName: string | null
  scanUrl: string
  ownerPhoneMasked: string
}

export default class MyPayQrController {
  /**
   * GET /api/qr/my-pay-link
   *
   * Returns the caller's existing active pay-QR, or 404 if they haven't
   * minted one yet. UI calls this on page load to decide whether to show
   * the create form or the existing QR.
   */
  async show({ response, cdpUser }: HttpContext) {
    const { phoneNumber } = cdpUser!
    const ownerKey = await resolveUserPrefKey(phoneNumber)
    const existing = await findActivePayLink(ownerKey)
    if (!existing) {
      return response.notFound({ error: 'no_active_pay_qr' })
    }
    const payload: PayLinkResponse = {
      shortId: existing.shortId,
      displayName: existing.displayName,
      scanUrl: buildScanUrl(existing.shortId),
      ownerPhoneMasked: maskPhone(phoneNumber),
    }
    return response.ok(payload)
  }

  /**
   * POST /api/qr/my-pay-link
   *
   * Body: { displayName: string (1..40) }
   *
   * Idempotent: if the user already has an active pay-QR, returns that one
   * (the new displayName is intentionally ignored — to rename, the user
   * must revoke the existing QR first; that flow is post-event v2).
   */
  async create({ request, response, cdpUser }: HttpContext) {
    const { phoneNumber } = cdpUser!
    const { displayName } = await request.validateUsing(createPayLinkValidator)

    const ownerKey = await resolveUserPrefKey(phoneNumber)
    // qr_links.owner_phone_number FKs to user_preferences. JWT auth proves
    // the phone is in phone_registry; user_preferences may not yet have a
    // row (cold-start case). Upsert before createQrLink to avoid FK error.
    await ensureUserPref(ownerKey)

    const existing = await findActivePayLink(ownerKey)
    if (existing) {
      const payload: PayLinkResponse = {
        shortId: existing.shortId,
        displayName: existing.displayName,
        scanUrl: buildScanUrl(existing.shortId),
        ownerPhoneMasked: maskPhone(phoneNumber),
      }
      return response.ok(payload)
    }

    try {
      const link = await createQrLink({
        kind: 'pay',
        ownerPhoneNumber: ownerKey,
        displayName,
      })
      const payload: PayLinkResponse = {
        shortId: link.shortId,
        displayName: link.displayName,
        scanUrl: buildScanUrl(link.shortId),
        ownerPhoneMasked: maskPhone(phoneNumber),
      }
      return response.created(payload)
    } catch (err) {
      logger.error(
        { ownerPhone: maskPhone(ownerKey), displayName, err },
        'my-pay-link create failed'
      )
      return response.internalServerError({ error: 'create_failed' })
    }
  }
}
