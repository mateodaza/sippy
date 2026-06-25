/**
 * QR short-id generator.
 *
 * Format: 8 chars from a 31-character base32 alphabet that excludes the
 * ambiguous glyphs `0`, `O`, `1`, `I`, `L`. ~40 bits of entropy
 * (~1T combinations) makes collisions negligible at our expected scale.
 *
 * Random + lookup (not deterministic HMAC) so each QR is revocable
 * independently — see QR_SYSTEM_SPEC.md for the design rationale.
 *
 * Sampling: cryptographic randomBytes + bit masking with rejection.
 * `byte & 31` gives an index in [0, 31]; if it lands on 31 (one slot past
 * the 31-char alphabet) we reject that byte and try the next one. This
 * keeps the distribution exactly uniform — no modulo bias. Per-byte
 * acceptance rate is 31/32 = 96.875%.
 */

import { randomBytes } from 'node:crypto'
import { query } from '#services/db'

export const QR_SHORT_ID_LENGTH = 8

// 31 characters. Order is the canonical index for byte-mask sampling.
export const QR_SHORT_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

const MAX_COLLISION_RETRIES = 5

/**
 * Generate a single short-id without any uniqueness check.
 *
 * Pure function — does not touch the DB. Use {@link generateUniqueShortId}
 * when persisting; this entry point exists so tests can supply a
 * deterministic generator.
 */
export function generateShortId(): string {
  let result = ''
  // Request ~2x the bytes we expect to need so the inner loop almost always
  // finishes in one pass (probability of needing a second pass ≈ 0.03^8).
  while (result.length < QR_SHORT_ID_LENGTH) {
    const buf = randomBytes(QR_SHORT_ID_LENGTH * 2)
    for (let i = 0; i < buf.length && result.length < QR_SHORT_ID_LENGTH; i++) {
      const idx = buf[i] & 31
      if (idx < QR_SHORT_ID_ALPHABET.length) {
        result += QR_SHORT_ID_ALPHABET[idx]
      }
      // else: byte landed in the rejected slot — discard and continue.
    }
  }
  return result
}

/**
 * Existence-check function type. Returns true if the short-id is already
 * taken in `qr_links`. Tests inject a fake; production uses the default
 * DB-backed implementation below.
 */
export type ShortIdExistsCheck = (shortId: string) => Promise<boolean>

/**
 * Default existence check — single-row probe against `qr_links`.
 */
async function defaultExistsCheck(shortId: string): Promise<boolean> {
  const result = await query<{ exists: number }>(
    'SELECT 1 AS exists FROM qr_links WHERE short_id = $1 LIMIT 1',
    [shortId]
  )
  return result.rows.length > 0
}

/**
 * Thrown when {@link generateUniqueShortId} fails to find an unused id
 * after {@link MAX_COLLISION_RETRIES} attempts. At our alphabet/length
 * this is functionally impossible in steady state, so seeing this error
 * almost certainly means the existence check is broken (always returning
 * true) rather than a real collision storm.
 */
export class QrShortIdCollisionError extends Error {
  constructor() {
    super(`Failed to generate a unique QR short-id after ${MAX_COLLISION_RETRIES} attempts`)
    this.name = 'QrShortIdCollisionError'
  }
}

/**
 * Generate a short-id that is not present in `qr_links`.
 *
 * @param exists Existence-check function. Default queries `qr_links`
 *   directly. Tests can inject a fake.
 * @param generate Short-id generator. Default is {@link generateShortId}.
 *   Tests can inject a deterministic sequence to exercise the retry loop.
 *
 * @throws {QrShortIdCollisionError} after {@link MAX_COLLISION_RETRIES}
 *   consecutive collisions.
 */
export async function generateUniqueShortId(
  exists: ShortIdExistsCheck = defaultExistsCheck,
  generate: () => string = generateShortId
): Promise<string> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = generate()
    if (!(await exists(candidate))) {
      return candidate
    }
  }
  throw new QrShortIdCollisionError()
}
