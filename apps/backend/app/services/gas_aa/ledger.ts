/**
 * Gas → AA — the `gas_aa_prepared_user_ops` ledger ("model").
 *
 * Raw-SQL repository (season-style) over the authorization spine. The lifecycle
 * is authorized → prepared → landed | failed | expired. A row is the ONLY thing
 * that authorizes a sponsored op — the webhook matches against a row, never
 * calldata alone.
 *
 * Concurrency (P1): `setNonce` writes sender_nonce while the row is still
 * `authorized`, so the partial-unique index on active rows
 * (chain_id, entry_point, sender, sender_nonce) rejects a second active row on
 * the same nonce at the DB layer — the backstop to the in-process nonce lock.
 */

import { randomUUID } from 'node:crypto'
import { query } from '#services/db'

export type GasAaStatus =
  | 'authorized'
  | 'awaiting_signature' // setup lane: sponsored + nonce-held, browser-signing pending (no signed op yet)
  | 'prepared'
  | 'landed'
  | 'failed'
  | 'expired'
  | 'cancelled' // setup lane: fallback-terminalized so legacy GasRefuel could run

export interface PreparedOpRow {
  id: string
  lane: string
  semanticActionId: string | null
  sender: string
  decodedUser: string | null
  chainId: number
  entryPoint: string
  senderNonce: string | null // NUMERIC(78,0) → decimal string; null until resolved
  callsHash: string
  capBucket: string | null
  status: GasAaStatus
  userOpHash: string | null
  signedUserOp: Record<string, unknown> | null
  meta: Record<string, unknown>
  expiresAt: number // unix seconds
  createdAt: string
  updatedAt: string
  // ── setup lane (Track B); NULL for free_send ──
  initCodeHash: string | null // §5 binding: the op's expected initCode hash
  unsignedUserOp: Record<string, unknown> | null // the sponsored op /submit attaches the sig to
  userEoa: string | null // the owner /submit verifies the sig recovers to
}

/** Default authorization window — MINUTES, not hours (stale-row safety, P2). */
export const DEFAULT_EXPIRY_MINUTES = 5

function mapRow(r: any): PreparedOpRow {
  return {
    id: r.id,
    lane: r.lane,
    semanticActionId: r.semantic_action_id ?? null,
    sender: r.sender,
    decodedUser: r.decoded_user ?? null,
    chainId: Number(r.chain_id),
    entryPoint: r.entry_point,
    senderNonce:
      r.sender_nonce === null || r.sender_nonce === undefined ? null : String(r.sender_nonce),
    callsHash: r.calls_hash,
    capBucket: r.cap_bucket ?? null,
    status: r.status,
    userOpHash: r.user_op_hash ?? null,
    signedUserOp: r.signed_user_op ?? null,
    meta: r.meta ?? {},
    expiresAt: Number(r.expires_at),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    initCodeHash: r.init_code_hash ?? null,
    unsignedUserOp: r.unsigned_user_op ?? null,
    userEoa: r.user_eoa ?? null,
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface InsertAuthorizedParams {
  lane: string
  semanticActionId?: string | null
  sender: string
  decodedUser?: string | null
  chainId: number
  entryPoint: string
  callsHash: string
  capBucket?: string | null
  expiresInMinutes?: number
  meta?: Record<string, unknown>
  /** Setup lane only: the expected initCode hash bound at the webhook (§5). */
  initCodeHash?: string | null
}

/**
 * Insert a fresh `authorized` row (no nonce / hash / signed op yet). Called only
 * AFTER the app's own velocity/security checks pass. Returns the row id, which
 * is also handed to Pimlico as the paymasterContext `prepared_op_id`.
 */
export async function insertAuthorized(params: InsertAuthorizedParams): Promise<string> {
  const id = `gasaa_${randomUUID()}`
  const expiresAt = nowSec() + (params.expiresInMinutes ?? DEFAULT_EXPIRY_MINUTES) * 60
  await query(
    `INSERT INTO gas_aa_prepared_user_ops
       (id, lane, semantic_action_id, sender, decoded_user, chain_id, entry_point,
        calls_hash, cap_bucket, status, meta, expires_at, init_code_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'authorized', $10::jsonb, $11, $12)`,
    [
      id,
      params.lane,
      params.semanticActionId ?? null,
      params.sender.toLowerCase(),
      params.decodedUser?.toLowerCase() ?? null,
      params.chainId,
      params.entryPoint.toLowerCase(),
      params.callsHash.toLowerCase(),
      params.capBucket ?? null,
      JSON.stringify(params.meta ?? {}),
      expiresAt,
      params.initCodeHash ? params.initCodeHash.toLowerCase() : null,
    ]
  )
  return id
}

/**
 * Attach the resolved 4337 nonce while the row is still `authorized`. Throws on
 * a partial-unique-index violation (another active row already holds this nonce
 * for this sender) — the caller treats that as a pre-broadcast failure and falls
 * back cleanly. `senderNonce` is a decimal string (uint256-safe).
 */
export async function setNonce(id: string, senderNonce: string): Promise<void> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET sender_nonce = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'authorized'`,
    [id, senderNonce]
  )
  if (res.rowCount === 0) {
    throw new Error(`gas_aa: setNonce found no authorized row ${id} (already advanced or expired)`)
  }
}

/**
 * Commit the FULL signed UserOp + its hash and flip to `prepared`. This is the
 * point of no return — after this the lane is committed to this exact op
 * (idempotent rebroadcast only, never a rebuild). Persisted BEFORE the bundler
 * `eth_sendUserOperation`. Unique `user_op_hash` index guards against a
 * duplicate hash.
 */
export async function markPrepared(
  id: string,
  userOpHash: string,
  signedUserOp: Record<string, unknown>
): Promise<void> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'prepared', user_op_hash = $2, signed_user_op = $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND status = 'authorized'`,
    [id, userOpHash.toLowerCase(), JSON.stringify(signedUserOp)]
  )
  if (res.rowCount === 0) {
    throw new Error(`gas_aa: markPrepared found no authorized row ${id}`)
  }
}

// ── setup lane (Track B) ──────────────────────────────────────────────────────

/**
 * Setup lane: the op was built + sponsored (paymaster fetched) and returned to the
 * browser to sign. Persist the unsigned op, the `userOpHash` (which IS the hashToSign
 * — raw v0.6 hash, sig-seam spike), and the owner EOA `/submit` must recover to; flip
 * `authorized → awaiting_signature`. The row stays NONCE-ACTIVE; there is NO
 * `signed_user_op` yet, so it remains fallback-eligible until `/submit`.
 */
export async function markAwaitingSignature(
  id: string,
  args: { userOpHash: string; unsignedUserOp: Record<string, unknown>; userEoa: string }
): Promise<void> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'awaiting_signature',
           user_op_hash = $2,
           unsigned_user_op = $3::jsonb,
           user_eoa = $4,
           updated_at = NOW()
     WHERE id = $1 AND status = 'authorized'`,
    [
      id,
      args.userOpHash.toLowerCase(),
      JSON.stringify(args.unsignedUserOp),
      args.userEoa.toLowerCase(),
    ]
  )
  if (res.rowCount === 0) {
    throw new Error(`gas_aa: markAwaitingSignature found no authorized row ${id}`)
  }
}

/**
 * Fallback-terminalize (atomic): flip `awaiting_signature → cancelled` so legacy
 * GasRefuel onboarding can run. Returns true ONLY if it won the row (`rowCount=1`);
 * false ⇒ the op already advanced (`prepared`/landed) ⇒ legacy must NOT run. Shares
 * the `WHERE status='awaiting_signature'` guard with `markPreparedFromAwaitingSignature`,
 * so cancel and submit are mutually exclusive — exactly one wins.
 */
export async function cancelSetupOp(id: string): Promise<boolean> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status = 'awaiting_signature'`,
    [id]
  )
  return res.rowCount === 1
}

/**
 * Setup lane `/submit`: the browser signature is verified + wrapped into the op.
 * Persist the FULL signed op and flip `awaiting_signature → prepared` under the SAME
 * conditional guard as `cancelSetupOp` (mutual exclusion). Returns true if it flipped
 * (point of no return — rebroadcast-only thereafter); false ⇒ the row was cancelled or
 * already advanced ⇒ caller returns 409, NO broadcast. (`user_op_hash` was set at
 * `markAwaitingSignature`; the unique index already guards it.)
 */
export async function markPreparedFromAwaitingSignature(
  id: string,
  signedUserOp: Record<string, unknown>
): Promise<boolean> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'prepared', signed_user_op = $2::jsonb, updated_at = NOW()
     WHERE id = $1 AND status = 'awaiting_signature'`,
    [id, JSON.stringify(signedUserOp)]
  )
  return res.rowCount === 1
}

export async function markLanded(id: string, txHash?: string | null): Promise<void> {
  await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'landed',
           meta = meta || jsonb_build_object('tx_hash', $2::text, 'landed_at', $3::bigint),
           updated_at = NOW()
     WHERE id = $1 AND status IN ('prepared', 'expired')`,
    [id, txHash ?? null, nowSec()]
  )
}

export async function markFailed(id: string, reason?: string): Promise<void> {
  await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'failed',
           meta = meta || jsonb_build_object('failed_reason', $2::text, 'failed_at', $3::bigint),
           updated_at = NOW()
     WHERE id = $1 AND status IN ('authorized', 'prepared')`,
    [id, reason ?? null, nowSec()]
  )
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getById(id: string): Promise<PreparedOpRow | null> {
  const res = await query(`SELECT * FROM gas_aa_prepared_user_ops WHERE id = $1`, [id])
  return res.rows[0] ? mapRow(res.rows[0]) : null
}

export interface MatchKey {
  chainId: number
  entryPoint: string
  sender: string
  senderNonce: string
  callsHash: string
  decodedUser: string
  capBucket: string
  /**
   * Setup lane only — the op's initCode hash (§5 binding). Omitted for free_send,
   * where it matches NULL rows (the free-send rows have no init_code_hash), so the
   * existing free-send match is behaviour-preserving.
   */
  initCodeHash?: string | null
}

/**
 * The webhook authorization match (P1): an ACTIVE (authorized|prepared),
 * not-expired row whose full key equals the decoded request. The sender_nonce
 * disambiguates repeated identical sends, so two valid sends never collide on
 * one authorization. No match ⇒ caller returns `{ sponsor: false }`.
 */
export async function findActiveMatch(key: MatchKey): Promise<PreparedOpRow | null> {
  const res = await query(
    `SELECT * FROM gas_aa_prepared_user_ops
     WHERE chain_id = $1
       AND entry_point = $2
       AND sender = $3
       AND sender_nonce = $4
       AND calls_hash = $5
       AND decoded_user = $6
       AND cap_bucket = $7
       AND init_code_hash IS NOT DISTINCT FROM $8
       AND status IN ('authorized', 'awaiting_signature', 'prepared')
       AND expires_at > $9
     LIMIT 1`,
    [
      key.chainId,
      key.entryPoint.toLowerCase(),
      key.sender.toLowerCase(),
      key.senderNonce,
      key.callsHash.toLowerCase(),
      key.decodedUser.toLowerCase(),
      key.capBucket,
      key.initCodeHash ? key.initCodeHash.toLowerCase() : null,
      nowSec(),
    ]
  )
  return res.rows[0] ? mapRow(res.rows[0]) : null
}

/**
 * Highest nonce currently held by an ACTIVE (authorized|prepared) row for this
 * sender — the in-flight high-water mark. The submitter resolves the next nonce
 * as max(on-chain getNonce, maxActiveNonce + 1) so a second concurrent send (even
 * from another process, where the in-memory lock doesn't reach) allocates the
 * NEXT nonce instead of colliding on the on-chain value while the first op is
 * still pending. Returns null when no active row holds a nonce.
 */
export async function maxActiveNonce(
  chainId: number,
  entryPoint: string,
  sender: string
): Promise<bigint | null> {
  const res = await query(
    `SELECT MAX(sender_nonce) AS max FROM gas_aa_prepared_user_ops
     WHERE chain_id = $1 AND entry_point = $2 AND sender = $3
       AND sender_nonce IS NOT NULL
       AND status IN ('authorized', 'awaiting_signature', 'prepared')`,
    [chainId, entryPoint.toLowerCase(), sender.toLowerCase()]
  )
  const max = res.rows[0]?.max
  return max === null || max === undefined ? null : BigInt(max)
}

/**
 * Stamp `sponsorship_finalized_at` on the row matching the full key, WITHOUT
 * changing status. Pimlico's `finalized` event means sponsorship was committed,
 * not that the op mined — so landing stays owned by waitForUserOperationReceipt.
 * Status-agnostic match (a finalized op may be prepared/landed/expired). Returns
 * the matched id, or null if nothing matched (no-op).
 */
export async function stampSponsorshipFinalized(key: MatchKey): Promise<string | null> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET meta = meta || jsonb_build_object('sponsorship_finalized_at', $8::bigint),
           updated_at = NOW()
     WHERE chain_id = $1 AND entry_point = $2 AND sender = $3 AND sender_nonce = $4
       AND calls_hash = $5 AND decoded_user = $6 AND cap_bucket = $7
       AND init_code_hash IS NOT DISTINCT FROM $9
     RETURNING id`,
    [
      key.chainId,
      key.entryPoint.toLowerCase(),
      key.sender.toLowerCase(),
      key.senderNonce,
      key.callsHash.toLowerCase(),
      key.decodedUser.toLowerCase(),
      key.capBucket,
      nowSec(),
      key.initCodeHash ? key.initCodeHash.toLowerCase() : null,
    ]
  )
  return res.rows[0]?.id ?? null
}

/**
 * Cleanup sweep (P2): expire stale `authorized` AND `awaiting_signature` rows past
 * their window — these RESERVED a nonce but were never broadcast (no signed op), so
 * expiring them releases the nonce from both the active-nonce unique index AND
 * maxActiveNonce (status-based), keeping allocation from drifting forward after a
 * crash. `awaiting_signature` is the setup-lane abandoned-after-prepare reclaim: a
 * user who prepared then closed the tab (signed or not, never submitted) must not
 * strand the nonce — the sweep frees it for a retry or the legacy fallback.
 *
 * `prepared` rows are deliberately NOT swept: they were broadcast and hold a real
 * on-chain nonce until mined, so they're reconciled to their true outcome
 * (landed/failed) by the reconciler — never expired out from under an in-flight op.
 * Returns the expired ids.
 */
export async function sweepExpired(): Promise<string[]> {
  const res = await query(
    `UPDATE gas_aa_prepared_user_ops
       SET status = 'expired', updated_at = NOW()
     WHERE status IN ('authorized', 'awaiting_signature') AND expires_at <= $1
     RETURNING id`,
    [nowSec()]
  )
  return res.rows.map((r: any) => r.id)
}

/**
 * Stuck `prepared` ops whose owning request likely died after markPrepared
 * (durability recovery, P1): broadcast-committed rows (signed op persisted) that
 * have sat un-landed longer than `graceSec` — beyond a normal send's
 * wait-for-receipt. The reconciler idempotently rebroadcasts the EXACT signed op
 * by hash and settles it. The grace avoids racing an in-flight request that just
 * prepared. `ageSec` lets the caller alert on ones stuck pathologically long.
 */
export async function listStuckPrepared(
  graceSec: number
): Promise<Array<{ id: string; userOpHash: string; ageSec: number }>> {
  const res = await query(
    `SELECT id, user_op_hash,
            EXTRACT(EPOCH FROM (NOW() - updated_at))::bigint AS age_sec
       FROM gas_aa_prepared_user_ops
      WHERE status = 'prepared'
        AND signed_user_op IS NOT NULL
        AND user_op_hash IS NOT NULL
        AND updated_at <= NOW() - make_interval(secs => $1)
      ORDER BY updated_at ASC
      LIMIT 100`,
    [graceSec]
  )
  return res.rows.map((r: any) => ({
    id: r.id,
    userOpHash: r.user_op_hash,
    ageSec: Number(r.age_sec),
  }))
}
