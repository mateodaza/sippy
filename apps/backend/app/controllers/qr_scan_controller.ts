/**
 * QR Scan Controller
 *
 * Single endpoint:
 *   POST /api/qr/scan/:shortId  (public, per-short-id throttled)
 *
 * Called by the `/q/:shortId` server page in apps/web after a QR is scanned.
 * Looks up the short-id, logs the scan event, and returns enough information
 * for the frontend to either redirect the user into WhatsApp or render a
 * desktop fallback page.
 *
 * The endpoint is intentionally read-light + write-light: one SELECT, one or
 * two INSERTs (scan log + optional counter bump). No business logic beyond
 * outcome classification — that lives in the WhatsApp bot, which the user
 * lands in via wa.me regardless of outcome.
 *
 * Throttle: per-short-id (100/min) via `rate_limit_service.checkQrScanThrottle`.
 * Lives inside this controller (not as middleware) so that `rate_limited`
 * outcome is observable in `qr_scans`. The throttle is in-memory and therefore
 * per-replica — single-replica is the current Railway assumption; revisit
 * when scaling out.
 *
 * Spec: QR_SYSTEM_SPEC.md.
 */

import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import '#types/container'
import {
  getQrLinkForScan,
  logQrScan,
  type DeviceClass,
  type QrKind,
  type QrScanOutcome,
} from '#services/qr_link.service'

const SHORT_ID_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/

const VALID_DEVICE_CLASSES: ReadonlySet<DeviceClass> = new Set(['mobile', 'desktop', 'unknown'])

interface ScanResponse {
  outcome: QrScanOutcome
  shortId: string
  kind: QrKind | null
  /** Pre-built wa.me URL the frontend should redirect to on mobile / link to on desktop. */
  waUrl: string
  /** Owner display name when applicable (event name for event kind, owner name for pay/referral). */
  displayLabel: string | null
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function pickDeviceClass(raw: unknown): DeviceClass {
  if (typeof raw === 'string' && VALID_DEVICE_CLASSES.has(raw as DeviceClass)) {
    return raw as DeviceClass
  }
  return 'unknown'
}

/**
 * Build the wa.me URL the user should land in. Always points at the Sippy
 * WhatsApp number; the prefilled text varies by outcome:
 *
 *  - redirected / revoked / rate_limited: include the bracketed code so the
 *    bot can dispatch based on the qr_links row (kind, status, payload) or
 *    surface an appropriate response.
 *  - not_found / invalid_version: omit the code (it's meaningless or unparseable),
 *    just open with a greeting so the user can ask for help.
 *
 * Falls back to the raw `wa.me` host if `SIPPY_WHATSAPP_NUMBER` is unset, so
 * we never serve a broken redirect in dev/staging.
 */
function buildWaUrl(outcome: QrScanOutcome, shortId: string): string {
  const number = (env.get('SIPPY_WHATSAPP_NUMBER') || '').replace(/[^\d]/g, '')
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/'

  const includeCode =
    outcome === 'redirected' || outcome === 'revoked' || outcome === 'rate_limited'
  const text = includeCode ? `Hola Sippy! [${shortId}]` : 'Hola Sippy!'

  return `${base}?text=${encodeURIComponent(text)}`
}

export default class QrScanController {
  /**
   * POST /api/qr/scan/:shortId
   *
   * Body (all optional, all sanitized):
   *   {
   *     deviceClass?: 'mobile' | 'desktop' | 'unknown'
   *     userAgent?: string
   *     referer?: string
   *     ipHash?: string  // pre-hashed by the caller (apps/web), never raw IP
   *   }
   *
   * Returns 200 in all cases — the outcome field tells the frontend what
   * happened. We never 404 a not-found short-id because the user-facing
   * affordance is "open WhatsApp anyway and let Sippy handle it."
   */
  async scan(ctx: HttpContext) {
    const { request, response, params } = ctx
    const shortIdRaw = String(params.shortId ?? '').toUpperCase()

    const body = request.body() as {
      deviceClass?: unknown
      userAgent?: unknown
      referer?: unknown
      ipHash?: unknown
    }

    const deviceClass = pickDeviceClass(body.deviceClass)
    const userAgent = clampString(body.userAgent, 500)
    const referer = clampString(body.referer, 500)
    const ipHash = clampString(body.ipHash, 128)

    // Reject obviously malformed short-ids (wrong length, wrong alphabet)
    // without touching the DB. Log as `invalid_version` since the URL almost
    // certainly came from a manipulated/old printed QR.
    if (!SHORT_ID_PATTERN.test(shortIdRaw)) {
      await logQrScan({
        shortId: shortIdRaw,
        outcome: 'invalid_version',
        deviceClass,
        userAgent,
        referer,
        ipHash,
      })
      const payload: ScanResponse = {
        outcome: 'invalid_version',
        shortId: shortIdRaw,
        kind: null,
        waUrl: buildWaUrl('invalid_version', shortIdRaw),
        displayLabel: null,
      }
      return response.ok(payload)
    }

    // Per-shortId rate limit. Lives in the controller (not middleware) so we
    // can log `rate_limited` outcome — middleware-level 429 would short-circuit
    // before logQrScan runs, leaving the spec'd outcome category unobservable.
    //
    // Key is shortId, not IP, because all scans funnel through the apps/web
    // Server Component so per-IP would always see the same Next.js server IP.
    // See QR_SYSTEM_SPEC.md for the per-IP follow-up plan.
    const rateLimitService = await app.container.make('rateLimitService')
    const throttle = rateLimitService.checkQrScanThrottle(shortIdRaw)
    if (!throttle.allowed) {
      await logQrScan({
        shortId: shortIdRaw,
        outcome: 'rate_limited',
        deviceClass,
        userAgent,
        referer,
        ipHash,
      })
      if (throttle.retryAfter !== undefined) {
        response.header('Retry-After', String(throttle.retryAfter))
      }
      const payload: ScanResponse = {
        outcome: 'rate_limited',
        shortId: shortIdRaw,
        kind: null,
        // Still return a waUrl — the user-facing affordance is "open WhatsApp
        // anyway and let Sippy handle it." Throttling is a backend hygiene
        // concern; it should never strand the scanner.
        waUrl: buildWaUrl('rate_limited', shortIdRaw),
        displayLabel: null,
      }
      return response.ok(payload)
    }

    const link = await getQrLinkForScan(shortIdRaw)

    let outcome: QrScanOutcome
    let kind: QrKind | null = null
    let displayLabel: string | null = null

    if (!link) {
      outcome = 'not_found'
    } else if (link.status === 'revoked') {
      outcome = 'revoked'
      kind = link.kind
    } else {
      outcome = 'redirected'
      kind = link.kind
      displayLabel = link.displayName ?? null
    }

    await logQrScan({
      shortId: shortIdRaw,
      outcome,
      deviceClass,
      userAgent,
      referer,
      ipHash,
    })

    const payload: ScanResponse = {
      outcome,
      shortId: shortIdRaw,
      kind,
      waUrl: buildWaUrl(outcome, shortIdRaw),
      displayLabel,
    }

    return response.ok(payload)
  }
}
