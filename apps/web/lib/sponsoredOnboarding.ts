/**
 * Gas → AA Track B (B1.1d) — sponsored-onboarding client flow.
 *
 * Tries the sponsored cold deploy+approve op; degrades to legacy GasRefuel onboarding on
 * ANY non-success. 404-as-signal: the backend gates /api/setup-op/* on
 * GAS_AA_ONBOARD_ENABLED, so a 404 means "flag off" → legacy. That makes the backend flag
 * the SINGLE switch (flip it and the frontend uses sponsored immediately, no coordinated
 * frontend deploy, no second source of truth to drift).
 *
 * Invariant mirrored from the backend: once the sponsored op LANDS, NEVER fall to legacy —
 * legacy's createSpendPermission on top of a landed approve = a duplicate on-chain grant.
 * A landed-but-unrecorded op is recoverable (adopt-first records it on the next attempt),
 * so it returns a retryable `error`, not `legacy`.
 *
 * Extracted from the React component so the branch logic is unit-testable.
 */

export type SponsoredResult =
  | { kind: 'done' } // alreadyGranted, or prepared → signed → submitted → recorded
  | { kind: 'legacy' } // flag off / pre-broadcast fallback / sign-reject → run legacy
  | { kind: 'error'; message: string } // landed but recording missed — retryable, NOT legacy

export interface SponsoredOnboardingIO {
  /** The owner EOA the browser signs with (CDP `useEvmAccounts`) — null ⇒ legacy. */
  ownerEoa: string | null
  /** The user's CDP access token (proof of the owner EOA) — null ⇒ legacy. */
  getCdpToken(): Promise<string | null>
  /** POST /api/setup-op/prepare `{ cdpAccessToken }`. A 404 means the flag is off. */
  prepare(cdpAccessToken: string): Promise<Response>
  /** CDP `signEvmHash` over the userOpHash with the owner EOA → the raw signature. */
  signHash(args: { evmAccount: string; hash: string }): Promise<string>
  /** POST /api/setup-op/submit `{ opId, signature }`. */
  submit(args: { opId: string; signature: string }): Promise<Response>
  /** Record the now-on-chain permission hash (register-permission `justCreated`). */
  recordPermission(): Promise<Response>
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function attemptSponsoredOnboarding(
  io: SponsoredOnboardingIO
): Promise<SponsoredResult> {
  if (!io.ownerEoa) return { kind: 'legacy' }

  // ── PREPARE + SIGN are PRE-broadcast: any failure here means nothing was sent, so
  //    degrading to legacy is safe (no op exists to double-grant). ──
  let cdpToken: string | null
  try {
    cdpToken = await io.getCdpToken()
  } catch {
    return { kind: 'legacy' }
  }
  if (!cdpToken) return { kind: 'legacy' }

  let prep: Response
  try {
    prep = await io.prepare(cdpToken)
  } catch {
    return { kind: 'legacy' } // network, pre-broadcast
  }
  if (prep.status === 404 || !prep.ok) return { kind: 'legacy' } // flag off / 5xx
  const body = await readJson(prep)
  if (!body) return { kind: 'legacy' }
  if (body.alreadyGranted) return { kind: 'done' } // adopt-first already recorded the hash
  // A prior sponsored op is already broadcasting for this account — wait, NEVER legacy (it
  // would duplicate the approve the in-flight op is landing). The backend reconciler settles
  // it; adopt-first records it on the next attempt.
  if (body.processing) return { kind: 'error', message: 'in-flight' }
  if (body.fallback || body.sponsored === false) return { kind: 'legacy' }
  const opId = body.opId
  const userOpHash = body.userOpHash
  if (typeof opId !== 'string' || typeof userOpHash !== 'string') return { kind: 'legacy' }

  let signature: string
  try {
    signature = await io.signHash({ evmAccount: io.ownerEoa, hash: userOpHash })
  } catch {
    return { kind: 'legacy' } // user rejected / sign failed — pre-broadcast, safe
  }

  // ── SUBMIT is the BROADCAST BOUNDARY. Once the request leaves the browser the backend
  //    may already have flipped the row to `prepared` and broadcast (then the browser
  //    loses the response / gets a 502 / sees a 409 "already submitted"). So legacy is
  //    safe ONLY on an explicit `{ status: 'fallback' }` — the backend's signal that it
  //    DURABLY terminalized the op BEFORE broadcasting. A thrown fetch, 409, 5xx,
  //    malformed body, or unknown status might mean the op is in flight ⇒ NEVER legacy
  //    (it would double-grant the approve); surface a retryable error. The backend
  //    reconciler settles any in-flight op, and adopt-first records it on the next try. ──
  let sub: Response
  try {
    sub = await io.submit({ opId, signature })
  } catch {
    return { kind: 'error', message: 'submit-ambiguous' } // may have broadcast — NOT legacy
  }
  const subBody = await readJson(sub)
  if (sub.ok && subBody?.status === 'landed') {
    // Landed — NEVER legacy from here. A recording miss/throw is retryable; adopt-first
    // records the now-on-chain permission on the next attempt.
    try {
      const rec = await io.recordPermission()
      if (rec.ok) return { kind: 'done' }
    } catch {
      /* fall through to the retryable error */
    }
    return { kind: 'error', message: 'landed-record-failed' }
  }
  if (sub.ok && subBody?.status === 'fallback') {
    return { kind: 'legacy' } // durable pre-broadcast terminalize — the only legacy-safe submit outcome
  }
  // 409 / 5xx / 502 / malformed / unknown — the op MAY be in flight ⇒ never legacy.
  return { kind: 'error', message: 'submit-ambiguous' }
}
