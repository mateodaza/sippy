/**
 * Helper to check if a local PostgreSQL connection is available.
 *
 * In CI (CI=true), DB is expected to be present — unavailability throws
 * instead of skipping, so missing DB coverage is never silently hidden.
 *
 * Usage:
 *   import { isDbAvailable } from '../helpers/skip_without_db.js'
 *
 *   test.group('My DB test', (group) => {
 *     group.each.setup(async (t) => {
 *       if (!(await isDbAvailable())) t.skip(true, 'No local DB')
 *     })
 *     group.setup(async () => {
 *       if (!(await isDbAvailable())) return
 *       // ... seed data
 *     })
 *   })
 */

import { query } from '#services/db'

let cachedResult: boolean | null = null

export async function isDbAvailable(): Promise<boolean> {
  if (cachedResult !== null) return cachedResult
  try {
    await query('SELECT 1')
    cachedResult = true
  } catch {
    if (process.env.CI === 'true') {
      throw new Error('DB is unavailable but CI=true — DB-backed tests must not be silently skipped in CI')
    }
    cachedResult = false
  }
  return cachedResult
}
