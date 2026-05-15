/**
 * Wire types for the event-linked onboarding endpoints.
 *
 * Imported by both the AdonisJS backend (service layer + controller) and the
 * Next.js frontend client (lib/events.ts). Lives here so the two sides can't
 * drift when fields are added or renamed.
 */

/**
 * The /setup step at which the user was tagged. 'done' = they actually
 * finished onboarding here; 'returning' = they already had a wallet and
 * scanned an event QR retroactively. Backed by a CHECK constraint in the
 * `user_event_links` migration.
 */
export type LinkedAtStep = 'done' | 'returning'

/**
 * Response body of POST /api/link-event.
 *
 * `linked: false` is a silent reject — unknown / inactive / expired slugs
 * return this shape so we don't leak which slugs exist.
 */
export type LinkEventResponse =
  | { linked: false }
  | {
      linked: true
      event: { slug: string; name: string; endsAt: string | null }
      actions: string[]
      poapClaimUrl: string | null
      poapClaimed: boolean
      linkedAtStep: LinkedAtStep
    }
