/**
 * Event-linked onboarding client.
 *
 * Wraps the two event endpoints exposed by the backend:
 *   GET  /api/events/:slug    (public)  — minimal lookup for UI chip
 *   POST /api/link-event      (JWT)     — tag the authenticated user
 *
 * Failures are non-fatal — onboarding completes regardless. Callers should
 * log and move on.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

export const EVENT_SLUG_STORAGE_KEY = 'sippy:event-slug'

export type PublicEvent = {
  slug: string
  name: string
  active: boolean
  endsAt: string | null
}

export type LinkEventResponse =
  | { linked: false }
  | {
      linked: true
      event: { slug: string; name: string; endsAt: string | null }
      actions: string[]
      poapClaimUrl: string | null
    }

/**
 * Fetch public, IP-throttled event metadata. Returns null on 404 / any error
 * so the UI can silently fall back to "no event".
 */
export async function getEvent(slug: string): Promise<PublicEvent | null> {
  if (!BACKEND_URL || !slug) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/events/${encodeURIComponent(slug)}`)
    if (!res.ok) return null
    return (await res.json()) as PublicEvent
  } catch {
    return null
  }
}

/**
 * Idempotently link the authenticated user to an event by slug.
 * Returns `{ linked: false }` on any error so callers can treat link failure
 * the same as a silent server-side reject.
 */
export async function linkEvent(slug: string, accessToken: string): Promise<LinkEventResponse> {
  if (!BACKEND_URL || !slug) return { linked: false }
  try {
    const res = await fetch(`${BACKEND_URL}/api/link-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ eventSlug: slug }),
    })
    if (!res.ok) return { linked: false }
    return (await res.json()) as LinkEventResponse
  } catch {
    return { linked: false }
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
  } catch {
    /* sessionStorage unavailable — fine */
  }
}
