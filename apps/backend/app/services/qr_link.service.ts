/**
 * QR Link Service
 *
 * The data layer for QR system v1. Three responsibilities:
 *
 *  - getQrLinkForScan: lookup a short-id at scan time (read path)
 *  - logQrScan: append-only scan event log + best-effort scan_count bump
 *  - createQrLink: insert a new QR row (admin path for event/assistant QRs)
 *
 * Identity is anchored on `user_preferences.phone_number` per the rest of
 * this backend. Spec: QR_SYSTEM_SPEC.md.
 */

import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { query } from '#services/db'
import { generateUniqueShortId } from '#services/qr_short_id.service'

// ── Types ───────────────────────────────────────────────────────────────────

export type QrKind = 'pay' | 'event' | 'referral'
export type QrStatus = 'active' | 'revoked'
export type DeviceClass = 'mobile' | 'desktop' | 'unknown'
export type QrScanOutcome =
  | 'redirected'
  | 'revoked'
  | 'not_found'
  | 'rate_limited'
  | 'invalid_version'

export interface QrLinkForScan {
  shortId: string
  kind: QrKind
  status: QrStatus
  ownerPhoneNumber: string
  eventSlug: string | null
  sourceTag: string | null
  displayName: string | null
}

// ── Read: scan-time lookup ──────────────────────────────────────────────────

/**
 * Look up a QR link by short-id for a scan event. Returns null if the
 * short-id doesn't exist — the caller logs `outcome='not_found'` separately.
 *
 * This is the canonical lookup used by both the public scan route and the
 * future resolve API. Centralizing it here keeps the kind→payload mapping
 * in one place.
 */
export async function getQrLinkForScan(shortId: string): Promise<QrLinkForScan | null> {
  const result = await query<{
    short_id: string
    kind: QrKind
    status: QrStatus
    owner_phone_number: string
    event_slug: string | null
    source_tag: string | null
    display_name: string | null
  }>(
    `SELECT short_id, kind, status, owner_phone_number, event_slug, source_tag, display_name
     FROM qr_links
     WHERE short_id = $1
     LIMIT 1`,
    [shortId]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    shortId: row.short_id,
    kind: row.kind,
    status: row.status,
    ownerPhoneNumber: row.owner_phone_number,
    eventSlug: row.event_slug,
    sourceTag: row.source_tag,
    displayName: row.display_name,
  }
}

// ── Write: append scan log ──────────────────────────────────────────────────

export interface LogQrScanArgs {
  shortId: string
  outcome: QrScanOutcome
  deviceClass: DeviceClass
  userAgent?: string | null
  ipHash?: string | null
  referer?: string | null
  resolvedToPhoneNumber?: string | null
}

/**
 * Append a row to `qr_scans`. On a successful scan (`outcome='redirected'`),
 * also bumps the denormalized `qr_links.scan_count` cache.
 *
 * Non-blocking: catches and logs all errors. Scan logging never breaks the
 * user-facing redirect path — a failed insert is observability noise, not a
 * functional defect.
 */
export async function logQrScan(args: LogQrScanArgs): Promise<void> {
  try {
    await query(
      `INSERT INTO qr_scans
        (short_id, outcome, device_class, user_agent, ip_hash, referer,
         resolved_to_phone_number, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        args.shortId,
        args.outcome,
        args.deviceClass,
        args.userAgent ?? null,
        args.ipHash ?? null,
        args.referer ?? null,
        args.resolvedToPhoneNumber ?? null,
        args.resolvedToPhoneNumber ? new Date() : null,
      ]
    )
  } catch (error) {
    logger.warn(
      {
        shortId: args.shortId,
        outcome: args.outcome,
        deviceClass: args.deviceClass,
        err: error,
      },
      'qr_scan insert failed (non-blocking)'
    )
    return
  }

  // Counter bump only on actual successful redirects. Other outcomes (not_found,
  // revoked, rate_limited, invalid_version) shouldn't inflate the "scanned"
  // metric for the owner's QR.
  if (args.outcome === 'redirected') {
    try {
      await query(
        `UPDATE qr_links
         SET scan_count = scan_count + 1,
             last_scanned_at = now()
         WHERE short_id = $1`,
        [args.shortId]
      )
    } catch (error) {
      logger.warn(
        { shortId: args.shortId, err: error },
        'qr_links scan_count bump failed (non-blocking)'
      )
    }
  }
}

// ── Read: list event QRs ────────────────────────────────────────────────────

/**
 * List all active QR links for an event slug, ordered by `source_tag` so the
 * printable view is deterministic and assistants always appear in the same
 * order across re-prints.
 *
 * Used by the admin sheets page to render printable assistant QRs. Excludes
 * revoked links — ops shouldn't accidentally print a QR that's been killed.
 */
export async function listEventQrLinks(eventSlug: string): Promise<QrLinkForScan[]> {
  const result = await query<{
    short_id: string
    kind: QrKind
    status: QrStatus
    owner_phone_number: string
    event_slug: string | null
    source_tag: string | null
    display_name: string | null
  }>(
    `SELECT short_id, kind, status, owner_phone_number, event_slug, source_tag, display_name
     FROM qr_links
     WHERE event_slug = $1 AND status = 'active' AND kind = 'event'
     ORDER BY source_tag ASC NULLS LAST, created_at ASC`,
    [eventSlug]
  )

  return result.rows.map((row) => ({
    shortId: row.short_id,
    kind: row.kind,
    status: row.status,
    ownerPhoneNumber: row.owner_phone_number,
    eventSlug: row.event_slug,
    sourceTag: row.source_tag,
    displayName: row.display_name,
  }))
}

// ── Write: create a new QR link ─────────────────────────────────────────────

export interface CreateQrLinkArgs {
  kind: QrKind
  ownerPhoneNumber: string
  eventSlug?: string | null
  sourceTag?: string | null
  displayName?: string | null
}

/**
 * Insert a new QR link row. Allocates a unique short-id, validates the
 * kind/payload combination against the DB CHECK constraint (`event` requires
 * `event_slug`; `pay`/`referral` forbid it), and returns the created row's
 * canonical shape.
 *
 * The owner_phone_number must exist in `user_preferences` — the DB enforces
 * this via FK. Callers should resolve the phone via `resolveUserPrefKey` if
 * the input might be in legacy bare-digit form.
 *
 * Pass `trx` to participate in an existing transaction (used by the admin
 * bulk-create flow so that partial failures roll back cleanly). The short-id
 * generator runs outside the transaction — its lookup is read-only and the
 * collision probability is functionally zero at our scale.
 *
 * Throws on validation errors (caller should treat as 400) or DB errors
 * (caller should treat as 500). Does NOT swallow — this is a write path
 * with user-facing consequences.
 */
export async function createQrLink(
  args: CreateQrLinkArgs,
  trx?: TransactionClientContract
): Promise<QrLinkForScan> {
  // Mirror the DB CHECK so we fail fast with a useful error rather than a
  // generic "constraint violation" from Postgres.
  if (args.kind === 'event' && !args.eventSlug) {
    throw new Error("createQrLink: kind='event' requires eventSlug")
  }
  if (args.kind !== 'event' && args.eventSlug) {
    throw new Error(`createQrLink: kind='${args.kind}' must not include eventSlug`)
  }

  const shortId = await generateUniqueShortId()

  // Lucid rawQuery on a transaction client uses ? placeholders (knex convention).
  // Keep $-style for the non-trx path so it stays consistent with the rest of
  // qr_link.service.ts via the query() wrapper, which does the $→? rewrite.
  if (trx) {
    // Cast the bindings array because Lucid's TransactionClientContract.rawQuery
    // typed bindings exclude `null` from StrictValues, but the underlying knex
    // driver accepts null fine (and the schema's nullable columns require it).
    // The non-trx path uses our `query()` wrapper which has a looser signature.
    await trx.rawQuery(
      `INSERT INTO qr_links
        (short_id, owner_phone_number, kind, event_slug, source_tag, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        shortId,
        args.ownerPhoneNumber,
        args.kind,
        args.eventSlug ?? null,
        args.sourceTag ?? null,
        args.displayName ?? null,
      ] as unknown as string[]
    )
  } else {
    await query(
      `INSERT INTO qr_links
        (short_id, owner_phone_number, kind, event_slug, source_tag, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        shortId,
        args.ownerPhoneNumber,
        args.kind,
        args.eventSlug ?? null,
        args.sourceTag ?? null,
        args.displayName ?? null,
      ]
    )
  }

  logger.info(
    `qr.created short_id=${shortId} kind=${args.kind}` +
      (args.eventSlug ? ` event=${args.eventSlug}` : '') +
      (args.sourceTag ? ` source=${args.sourceTag}` : '')
  )

  return {
    shortId,
    kind: args.kind,
    status: 'active',
    ownerPhoneNumber: args.ownerPhoneNumber,
    eventSlug: args.eventSlug ?? null,
    sourceTag: args.sourceTag ?? null,
    displayName: args.displayName ?? null,
  }
}
