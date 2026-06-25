/**
 * Superadmin gate.
 *
 * Some admin actions are irreversible (e.g. draining an event operator
 * wallet) and should not be routinely available to every `role='admin'`
 * user. This util identifies the single account allowed to perform them:
 * `SUPER_ADMIN_EMAIL` env, defaulted to `admin@sippy.lat`.
 *
 * Comparison is lower-cased on both sides so casing differences in the env
 * or the admin_users row don't accidentally lock the superadmin out.
 */

const DEFAULT_SUPER_ADMIN_EMAIL = 'admin@sippy.lat'

export function getSuperAdminEmail(): string {
  return (process.env.SUPER_ADMIN_EMAIL ?? DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase()
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase() === getSuperAdminEmail()
}
