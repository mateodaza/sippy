import UserPreference from '#models/user_preference'

/**
 * Tries canonical phone first; falls back to bare-digit if not found.
 * Remove after SH-003 backfill is confirmed complete.
 */
export async function findUserPrefByPhone(phoneNumber: string): Promise<UserPreference | null> {
  const pref = await UserPreference.findBy('phoneNumber', phoneNumber)
  if (pref || !phoneNumber.startsWith('+')) return pref
  return UserPreference.findBy('phoneNumber', phoneNumber.slice(1))
}

/**
 * Returns the phone key to use for updateOrCreate on user_preferences.
 * If a bare-digit row already exists, returns bare digits to avoid creating a duplicate row.
 * Remove after SH-003 backfill is confirmed complete.
 */
export async function resolveUserPrefKey(phoneNumber: string): Promise<string> {
  if (phoneNumber.startsWith('+')) {
    const existing = await UserPreference.findBy('phoneNumber', phoneNumber.slice(1))
    if (existing) return phoneNumber.slice(1)
  }
  return phoneNumber
}
