/**
 * Event-linked onboarding client.
 *
 * Wraps the event endpoints exposed by the backend:
 *   POST /api/link-event            (JWT)    — tag the authenticated user
 *   POST /api/event-poap-claimed    (JWT)    — record POAP claim intent
 *
 * Failures are non-fatal — onboarding completes regardless. Callers should
 * log and move on.
 */

import type { LinkedAtStep, LinkEventResponse } from '@sippy/shared'

// Re-exported so existing call sites importing from this file keep working.
export type { LinkedAtStep, LinkEventResponse }

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export const EVENT_SLUG_STORAGE_KEY = 'sippy:event-slug'
export const EVENT_SOURCE_STORAGE_KEY = 'sippy:event-source'

/**
 * Idempotently link the authenticated user to an event by slug.
 * Returns `{ linked: false }` on any error so callers can treat link failure
 * the same as a silent server-side reject.
 */
export async function linkEvent(
  slug: string,
  accessToken: string,
  linkedAtStep: LinkedAtStep = 'done',
  source: string | null = null
): Promise<LinkEventResponse> {
  if (!BACKEND_URL || !slug) return { linked: false }
  try {
    const body: Record<string, unknown> = { eventSlug: slug, linkedAtStep }
    if (source) body.source = source
    const res = await fetch(`${BACKEND_URL}/api/link-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { linked: false }
    return (await res.json()) as LinkEventResponse
  } catch {
    return { linked: false }
  }
}

export type PoapClaimStatus = 'claimed' | 'already-claimed' | 'not-linked' | 'error'

/**
 * Record that the user clicked the "Claim your POAP" button for an event.
 * Idempotent server-side. Returns the explicit status from the server so
 * callers can distinguish "we recorded it" from "user wasn't linked, nothing
 * recorded" — important to avoid lying to the UI.
 */
export async function markPoapClaimed(slug: string, accessToken: string): Promise<PoapClaimStatus> {
  if (!BACKEND_URL || !slug) return 'error'
  try {
    const res = await fetch(`${BACKEND_URL}/api/event-poap-claimed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eventSlug: slug }),
    })
    if (!res.ok) return 'error'
    const body = (await res.json()) as { status?: PoapClaimStatus }
    return body.status ?? 'error'
  } catch {
    return 'error'
  }
}

/**
 * Read the event slug from URL or sessionStorage. Writes back to sessionStorage
 * if the URL had it, so a mid-flow refresh preserves the tag.
 *
 * Returns null on SSR (no window).
 */
export function readAndPersistEventSlug(urlSlug: string | null): string | null {
  if (typeof window === 'undefined') return null
  if (urlSlug) {
    try {
      window.sessionStorage.setItem(EVENT_SLUG_STORAGE_KEY, urlSlug)
    } catch {
      /* sessionStorage unavailable — fine */
    }
    return urlSlug
  }
  try {
    return window.sessionStorage.getItem(EVENT_SLUG_STORAGE_KEY)
  } catch {
    return null
  }
}

export function clearEventSlug() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(EVENT_SLUG_STORAGE_KEY)
    window.sessionStorage.removeItem(EVENT_SOURCE_STORAGE_KEY)
  } catch {
    /* sessionStorage unavailable — fine */
  }
}

/**
 * POAP claim intent. Persisted to **localStorage** (not sessionStorage) on
 * purpose: claiming opens the POAP page in a new tab, and on flaky venue
 * Wi-Fi our `markPoapClaimed` fetch can drop while the user navigates away.
 * Storing the slug lets a subsequent mount detect the unconfirmed claim and
 * retry the server call.
 *
 * Key holds the slug so a stale intent for a different event can be detected
 * and cleared rather than silently retried against the wrong link row.
 */
export const POAP_CLAIM_INTENT_STORAGE_KEY = 'sippy:poap-claim-intent'

export function setPoapClaimIntent(slug: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(POAP_CLAIM_INTENT_STORAGE_KEY, slug)
  } catch {
    /* localStorage unavailable — fine, retry won't fire but UI stays correct */
  }
}

export function getPoapClaimIntent(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(POAP_CLAIM_INTENT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function clearPoapClaimIntent() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(POAP_CLAIM_INTENT_STORAGE_KEY)
  } catch {
    /* localStorage unavailable — fine */
  }
}

/**
 * Channel attribution tag. URL wins; falls back to sessionStorage on refresh.
 * Optional companion to the slug — works the same way but never blocks linking.
 */
export function readAndPersistEventSource(urlSource: string | null): string | null {
  if (typeof window === 'undefined') return null
  if (urlSource) {
    try {
      window.sessionStorage.setItem(EVENT_SOURCE_STORAGE_KEY, urlSource)
    } catch {
      /* sessionStorage unavailable — fine */
    }
    return urlSource
  }
  try {
    return window.sessionStorage.getItem(EVENT_SOURCE_STORAGE_KEY)
  } catch {
    return null
  }
}
