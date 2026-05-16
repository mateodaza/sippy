/**
 * Admin Pay Sheets Controller
 *
 * Generates printable vendor pay-QR sheets for street-vendor / merchant use.
 * Attendees scan the printed QR, WhatsApp opens with `[<short-id>]`, the bot
 * resolves to the vendor via the bracket-token dispatcher (kind='pay') and
 * prompts the payer for an amount with merchant framing.
 *
 * Routes:
 *   GET  /admin/pay-sheets        — list active pay-QRs + creation form
 *   POST /admin/pay-sheets        — create a new pay-QR
 *
 * Auth: protected by the admin group's `auth({ guards: ['web'] })`. Creation
 * is gated by `adminRole({ role: 'admin' })` so viewer accounts can't mint
 * vendor QRs.
 *
 * Pay-QRs are NOT event-bound — they exist independently of any event slug.
 * Issuance IS the merchant declaration: anyone with a user_preferences row
 * can be issued a pay-QR. For Pizza Day, ops only generates them for the
 * known vendor phones; nobody else gets one.
 */

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { createQrLink, listActivePayLinks } from '#services/qr_link.service'
import { resolveUserPrefKey } from '#utils/user_pref_lookup'
import { query } from '#services/db'
import { maskPhone } from '#utils/phone'

const MAX_DISPLAY_NAME = 40

async function ownerExists(phoneNumber: string): Promise<boolean> {
  const r = await query<{ exists: number }>(
    'SELECT 1 AS exists FROM user_preferences WHERE phone_number = $1 LIMIT 1',
    [phoneNumber]
  )
  return r.rows.length > 0
}

/**
 * Return the existing active pay-QR for an owner, or null if none exists.
 * Used to make `create` idempotent — a double-submit or re-entry shouldn't
 * mint a second printable QR for the same merchant.
 */
async function findActivePayLinkForOwner(
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

function getFrontendBase(): string {
  return (env.get('FRONTEND_URL') || 'https://www.sippy.lat').replace(/\/+$/, '')
}

function buildScanUrl(shortId: string): string {
  return `${getFrontendBase()}/q/${shortId}?v=1`
}

interface PayLinkProp {
  shortId: string
  displayName: string | null
  scanUrl: string
  /** Masked owner phone (e.g. +57********67) — ops needs this to tell sheets
   *  apart when two vendors share a similar display name. Always masked so the
   *  payload doesn't expose raw E.164 to viewer-role admins. */
  ownerPhoneMasked: string
}

interface ShowProps {
  payLinks: PayLinkProp[]
  scanUrlBase: string
  scanUrlIsFallback: boolean
  flash: { error?: string; created?: string } | null
}

export default class PaySheetsController {
  /**
   * GET /admin/pay-sheets
   *
   * Renders all active pay-QRs across all owners + an inline form to create
   * a new one. Print button on the page renders one printable sheet per QR.
   */
  async show({ inertia, session }: HttpContext) {
    const links = await listActivePayLinks()

    const props: ShowProps = {
      payLinks: links.map((l) => ({
        shortId: l.shortId,
        displayName: l.displayName,
        scanUrl: buildScanUrl(l.shortId),
        ownerPhoneMasked: maskPhone(l.ownerPhoneNumber),
      })),
      scanUrlBase: getFrontendBase(),
      scanUrlIsFallback: !env.get('FRONTEND_URL'),
      flash: (session.flashMessages.all() as ShowProps['flash']) ?? null,
    }

    return inertia.render('admin/pay_sheets', props)
  }

  /**
   * POST /admin/pay-sheets
   *
   * Body:
   *   {
   *     ownerPhoneNumber: string  // must exist in user_preferences
   *     displayName: string       // e.g. "Carolina's Pizza"
   *   }
   *
   * Validates everything before insert — on any error, flashes and redirects
   * back. Successful create flashes the new short-id + redirects so the page
   * renders the new printable sheet.
   */
  async create({ request, response, session }: HttpContext) {
    const body = request.body() as {
      ownerPhoneNumber?: unknown
      displayName?: unknown
    }

    const ownerRaw = typeof body.ownerPhoneNumber === 'string' ? body.ownerPhoneNumber.trim() : ''
    if (!ownerRaw) {
      session.flash('error', 'Owner phone number is required')
      return response.redirect('/admin/pay-sheets')
    }

    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    if (!displayName) {
      session.flash('error', 'Display name is required (e.g. "Carolina\'s Pizza")')
      return response.redirect('/admin/pay-sheets')
    }
    if (displayName.length > MAX_DISPLAY_NAME) {
      session.flash('error', `Display name too long (max ${MAX_DISPLAY_NAME} chars)`)
      return response.redirect('/admin/pay-sheets')
    }

    const ownerKey = await resolveUserPrefKey(ownerRaw)
    if (!(await ownerExists(ownerKey))) {
      session.flash(
        'error',
        `Owner phone ${ownerRaw} not found in user_preferences. Onboard the account first, then retry.`
      )
      return response.redirect('/admin/pay-sheets')
    }

    // Idempotent: if this owner already has an active pay-QR, surface it
    // instead of minting a second one. Double-submits, refreshes, and ops
    // re-entering the form for the same vendor all collapse to the same
    // printable sheet. A DB unique index would enforce this harder; for now
    // an app-level pre-check is enough at Pizza Day scale.
    const existing = await findActivePayLinkForOwner(ownerKey)
    if (existing) {
      session.flash('created', existing.shortId)
      return response.redirect('/admin/pay-sheets')
    }

    try {
      const link = await createQrLink({
        kind: 'pay',
        ownerPhoneNumber: ownerKey,
        displayName,
      })
      session.flash('created', link.shortId)
      return response.redirect('/admin/pay-sheets')
    } catch (err) {
      logger.error({ ownerPhone: ownerKey, displayName, err }, 'pay_sheets.create failed')
      session.flash('error', 'Failed to create pay-QR. Check server logs for details.')
      return response.redirect('/admin/pay-sheets')
    }
  }
}
