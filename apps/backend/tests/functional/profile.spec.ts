/**
 * PV-002: Profile endpoint functional tests
 *
 * Tests GET /api/profile against a live DB, covering all four behavioral
 * branches of getProfile(): 400 (invalid phone), 404 (no wallet), visible,
 * and hidden.
 *
 * Fixtures use prefix +15550050XXX to avoid collision with other test data.
 */
import { test } from '@japa/runner'
import { query } from '#services/db'
import app from '@adonisjs/core/services/app'
import '#types/container'
import { isDbAvailable } from '../helpers/skip_without_db.js'

const NOW = Date.now()

// ---------------------------------------------------------------------------
// Setup helpers — reused across groups
// ---------------------------------------------------------------------------

async function seedWallet(phone: string, address: string) {
  await query(
    `INSERT INTO phone_registry
      (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (phone_number) DO UPDATE SET wallet_address = EXCLUDED.wallet_address`,
    [phone, `test-wallet-pv002-${phone.slice(-4)}`, address, NOW, NOW, 0, new Date().toDateString()]
  )
}

async function seedPreference(phone: string, phoneVisible: boolean) {
  await query(
    `INSERT INTO user_preferences (phone_number, phone_visible)
     VALUES ($1, $2)
     ON CONFLICT (phone_number) DO UPDATE SET phone_visible = EXCLUDED.phone_visible`,
    [phone, phoneVisible]
  )
}

async function cleanupPhone(phone: string) {
  await query('DELETE FROM phone_registry WHERE phone_number = $1', [phone])
  await query('DELETE FROM user_preferences WHERE phone_number = $1', [phone])
}

// ---------------------------------------------------------------------------
// 400 — invalid/missing phone
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | invalid phone → 400', (group) => {
  // Reset the shared IP throttle budget before profile tests run, so prior
  // functional tests (auth, middleware, parity) don't exhaust the 10 req/min limit.
  group.setup(async () => {
    const rls = await app.container.make('rateLimitService')
    rls.resetIpThrottle()
  })

  test('TC-PV-002-F01: missing phone param returns 400', async ({ client }) => {
    const response = await client.get('/api/profile')
    response.assertStatus(400)
  })

  test('TC-PV-002-F02: non-E.164 phone returns 400', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: 'not-a-phone' })
    response.assertStatus(400)
  })
})

// ---------------------------------------------------------------------------
// 404 — phone not in phone_registry
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | unknown phone → 404', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  test('TC-PV-002-F03: phone not in registry returns 404', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050099' })
    response.assertStatus(404)
  })
})

// ---------------------------------------------------------------------------
// phone_visible = true (default — no preference row)
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | phone_visible = true (default)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => {
    if (!(await isDbAvailable())) return
    await seedWallet('+15550050001', '0x0000000000000000000000000000000000000011')
  })
  group.teardown(async () => {
    if (!(await isDbAvailable())) return
    await cleanupPhone('+15550050001')
  })

  test('TC-PV-002-F04: no preference row → phoneVisible defaults to true', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050001' })
    response.assertStatus(200)
    response.assertBodyContains({ phoneVisible: true })
  })

  test('TC-PV-002-F05: returns address and phone in body', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050001' })
    response.assertStatus(200)
    response.assertBodyContains({
      address: '0x0000000000000000000000000000000000000011',
      phone: '+15550050001',
    })
  })
})

// ---------------------------------------------------------------------------
// phone_visible = false (private)
// ---------------------------------------------------------------------------

test.group('PV-002 | GET /api/profile | phone_visible = false (private)', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable())) t.skip(true, 'No local DB')
  })
  group.setup(async () => {
    if (!(await isDbAvailable())) return
    await seedWallet('+15550050002', '0x0000000000000000000000000000000000000012')
    await seedPreference('+15550050002', false)
  })
  group.teardown(async () => {
    if (!(await isDbAvailable())) return
    await cleanupPhone('+15550050002')
    // Reset throttle after profile tests finish so resolve.spec.ts starts fresh.
    const rls = await app.container.make('rateLimitService')
    rls.resetIpThrottle()
  })

  test('TC-PV-002-F06: phone_visible=false → response contains phoneVisible:false', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050002' })
    response.assertStatus(200)
    response.assertBodyContains({ phoneVisible: false })
  })

  test('TC-PV-002-F07: address is present in response even when phone is private', async ({ client }) => {
    const response = await client.get('/api/profile').qs({ phone: '+15550050002' })
    response.assertStatus(200)
    response.assertBodyContains({ address: '0x0000000000000000000000000000000000000012' })
  })
})
