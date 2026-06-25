import type { HttpContext } from '@adonisjs/core/http'

/**
 * Admin UI language. Operator-facing pages (admin/operator_send,
 * admin/event_attendees) are bilingual ES/EN; the rest of the admin
 * (analytics, roles, layout chrome) stays in English because admin users
 * are anglophone-by-default. Default is ES because Pizza Day operators
 * are LatAm.
 */
export type AdminLang = 'es' | 'en'

export const ADMIN_LANG_COOKIE = 'sippy_admin_lang'

/**
 * Reads the operator's UI language preference off the request cookie.
 * Defaults to `es` when the cookie is missing/malformed so an operator
 * who never touched the toggle sees the Spanish UI immediately.
 *
 * Used by both the Inertia share() hook (to propagate the value into
 * client-side React) and the operator-send controller (to localize
 * server-rendered error responses).
 */
export function getAdminLang(ctx: HttpContext): AdminLang {
  const raw = ctx.request.plainCookie(ADMIN_LANG_COOKIE)
  if (raw === 'en' || raw === 'es') return raw
  return 'es'
}
