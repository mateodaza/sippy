/**
 * Gas → AA — Pimlico sponsorship webhook integration tests (live Postgres + the
 * real HTTP controller; skipped without a DB or the 0031 migration).
 *
 * Auth is exercised with the REAL `@pimlico/webhook` verifier (svix), bound to a
 * test secret via the injectable verifier so no env secret is needed:
 *   - a valid signature passes; a tampered body, a wrong secret, and a missing
 *     signature are rejected with 401 BEFORE any DB work.
 * DB-binding (valid signature):
 *   - no matching prepared row ⇒ { sponsor: false }
 *   - unregistered permission.account ⇒ { sponsor: false }
 *   - a recipient with no authorized row (≠ calls_hash) ⇒ { sponsor: false }
 *   - wrong chain ⇒ { sponsor: false }
 *   - a fully-matching active row ⇒ { sponsor: true }
 * Finalized (sponsorship-finalized, NOT mined):
 *   - no matching row ⇒ no-op; a matching row gets a `sponsorship_finalized_at`
 *     metadata stamp but is NEVER marked landed (landing is owned by the receipt).
 */

import { test } from '@japa/runner'
import basex from 'base-x'
import { Webhook } from 'svix'
import { getAddress, keccak256, type Hex } from 'viem'
import { isDbAvailable } from '../helpers/skip_without_db.js'
import { query } from '#services/db'
import { pimlicoWebhookVerifier } from '@pimlico/webhook/_esm/index.js'
import {
  __setWebhookVerifierForTest,
  __setConfiguredPolicyForTest,
  __setSetupPolicyForTest,
} from '#controllers/webhook_pimlico_controller'
import { ENTRY_POINT_V06, SPEND_PERMISSION_MANAGER } from '#services/gas_aa/config'
import {
  buildFreeSendCalls,
  buildSetupCalls,
  callsHash,
  capBucketForAccount,
  encodeApproveCall,
  encodeExecute,
  encodeExecuteBatch,
  type RawPermission,
} from '#services/gas_aa/decode'
import { insertAuthorized, setNonce, markPrepared } from '#services/gas_aa/ledger'

const URL = '/webhook/pimlico/sponsorship'
const CHAIN = 42161
const EP = ENTRY_POINT_V06
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const SPENDER = '0x1111111111111111111111111111111111111111'
const USER = '0x2222222222222222222222222222222222222222'
const RECIPIENT = '0x3333333333333333333333333333333333333333'
const USER_PHONE = '+15550009000'

// ── svix signing (mirrors the verifier's secret transform) ───────────────────
const B58 = basex('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvxyz')
const SECRET =
  'pim_whsec_' + B58.encode(Buffer.from(Array.from({ length: 24 }, (_, i) => (i * 31 + 7) & 0xff)))
const WRONG_SECRET =
  'pim_whsec_' + B58.encode(Buffer.from(Array.from({ length: 24 }, (_, i) => (i * 17 + 3) & 0xff)))
const realVerify = pimlicoWebhookVerifier(SECRET)

function secretHex(secret: string): string {
  return Buffer.from(B58.decode(secret.replace('pim_whsec_', ''))).toString('hex')
}
function sign(secret: string, payload: string): Record<string, string> {
  const id = 'msg_gasaa_test'
  const ts = new Date()
  const signature = new Webhook(secretHex(secret)).sign(id, ts, payload)
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
    'svix-signature': signature,
  }
}

// ── op fixtures ──────────────────────────────────────────────────────────────
function permission(): RawPermission {
  return {
    account: USER,
    spender: SPENDER,
    token: USDC,
    allowance: 1_000_000n,
    period: 86_400,
    start: 1_700_000_000,
    end: 1_800_000_000,
    salt: 0n,
    extraData: '0x',
  }
}
function calls(recipient = RECIPIENT, amount = 250_000n) {
  return buildFreeSendCalls({
    spendManager: SPEND_PERMISSION_MANAGER,
    permission: permission(),
    usdcAddress: USDC,
    recipient,
    amountUnits: amount,
  })
}
// Real Pimlico payload shape: data.object.{userOperation, entryPoint, chainId,
// sponsorshipPolicyId} (https://docs.pimlico.io/.../sponsorship-policies/webhook).
// Each group sets the configured policy to 'sp_test' in-process (no env reliance).
// policyId: undefined → 'sp_test' (matches); null → omit the field (fail-closed).
function requestedEvent(
  over: { nonce?: string; recipient?: string; chainId?: number; policyId?: string | null } = {}
) {
  const c = calls(over.recipient ?? RECIPIENT)
  const object: any = {
    userOperation: { sender: SPENDER, nonce: over.nonce ?? '0x9', callData: encodeExecuteBatch(c) },
    entryPoint: EP,
    chainId: over.chainId ?? CHAIN,
  }
  if (over.policyId !== null) object.sponsorshipPolicyId = over.policyId ?? 'sp_test'
  return { type: 'user_operation.sponsorship.requested', data: { object } }
}

// Finalized carries the userOperation (no tx hash) under the same data.object.
function finalizedEvent(
  over: { nonce?: string; recipient?: string; policyId?: string | null } = {}
) {
  const c = calls(over.recipient ?? RECIPIENT)
  const object: any = {
    userOperation: { sender: SPENDER, nonce: over.nonce ?? '0x9', callData: encodeExecuteBatch(c) },
    entryPoint: EP,
    chainId: CHAIN,
  }
  if (over.policyId !== null) object.sponsorshipPolicyId = over.policyId ?? 'sp_test'
  return { type: 'user_operation.sponsorship.finalized', data: { object } }
}

async function ensureSchema(): Promise<boolean> {
  try {
    await query('SELECT 1 FROM gas_aa_prepared_user_ops LIMIT 0')
    await query('SELECT 1 FROM phone_registry LIMIT 0')
    return true
  } catch {
    return false
  }
}
async function seedUser(): Promise<void> {
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
     VALUES ($1, 'gasaa-test', $2, 0, 0, 0, '')
     ON CONFLICT (phone_number) DO UPDATE SET wallet_address = EXCLUDED.wallet_address`,
    [USER_PHONE, USER.toLowerCase()]
  )
}
async function seedRow(over: { nonce?: string; recipient?: string } = {}): Promise<string> {
  const c = calls(over.recipient ?? RECIPIENT)
  const id = await insertAuthorized({
    lane: 'free_send',
    sender: SPENDER,
    decodedUser: USER,
    chainId: CHAIN,
    entryPoint: EP,
    callsHash: callsHash(c),
    capBucket: capBucketForAccount(USER),
  })
  await setNonce(id, BigInt(over.nonce ?? '0x9').toString())
  return id
}
async function clean(): Promise<void> {
  await query(`DELETE FROM gas_aa_prepared_user_ops WHERE sender = $1`, [SENDER_LC])
  await query(`DELETE FROM phone_registry WHERE phone_number = $1`, [USER_PHONE])
}
const SENDER_LC = SPENDER.toLowerCase()

function post(client: any, event: any, secret = SECRET) {
  const payload = JSON.stringify(event)
  return client.post(URL).headers(sign(secret, payload)).json(event)
}

// ── Auth (real verifier, bound to the test secret) ───────────────────────────
test.group('gas_aa webhook | auth', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa/phone_registry not migrated')
      return
    }
    __setWebhookVerifierForTest((h, p) => realVerify(h, p))
    __setConfiguredPolicyForTest('sp_test')
    await clean()
    await seedUser()
    await seedRow()
  })
  group.each.teardown(async () => {
    __setWebhookVerifierForTest(null)
    __setConfiguredPolicyForTest(null)
    if (await isDbAvailable()) await clean()
  })

  test('valid signature passes auth (and sponsors the seeded op)', async ({ client, assert }) => {
    const res = await post(client, requestedEvent())
    assert.equal(res.status(), 200)
    assert.equal(res.body().sponsor, true)
  })

  test('a tampered body is rejected 401', async ({ client, assert }) => {
    // Sign the real event, then POST a different one under the same signature.
    const signed = sign(SECRET, JSON.stringify(requestedEvent()))
    const res = await client
      .post(URL)
      .headers(signed)
      .json(requestedEvent({ nonce: '0x123' }))
    assert.equal(res.status(), 401)
  })

  test('a wrong-secret signature is rejected 401', async ({ client, assert }) => {
    const res = await post(client, requestedEvent(), WRONG_SECRET)
    assert.equal(res.status(), 401)
  })

  test('a missing signature is rejected 401', async ({ client, assert }) => {
    const res = await client.post(URL).json(requestedEvent())
    assert.equal(res.status(), 401)
  })
})

// ── DB binding (valid signatures) ────────────────────────────────────────────
test.group('gas_aa webhook | DB binding', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa/phone_registry not migrated')
      return
    }
    __setWebhookVerifierForTest((h, p) => realVerify(h, p))
    __setConfiguredPolicyForTest('sp_test')
    await clean()
  })
  group.each.teardown(async () => {
    __setWebhookVerifierForTest(null)
    __setConfiguredPolicyForTest(null)
    if (await isDbAvailable()) await clean()
  })

  test('registered + matching active row ⇒ sponsor:true', async ({ client, assert }) => {
    await seedUser()
    await seedRow()
    const res = await post(client, requestedEvent())
    assert.equal(res.body().sponsor, true)
  })

  test('registered but NO prepared row ⇒ sponsor:false', async ({ client, assert }) => {
    await seedUser() // no row
    const res = await post(client, requestedEvent())
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'no matching authorized op')
  })

  test('unregistered permission.account ⇒ sponsor:false', async ({ client, assert }) => {
    await seedRow() // row exists, but user NOT seeded
    const res = await post(client, requestedEvent())
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'permission.account is not registered')
  })

  test('a recipient with no authorized row ⇒ sponsor:false', async ({ client, assert }) => {
    await seedUser()
    await seedRow({ recipient: RECIPIENT }) // authorized for RECIPIENT only
    // Attacker re-points the transfer to a different recipient (different calls_hash).
    const res = await post(
      client,
      requestedEvent({ recipient: '0x4444444444444444444444444444444444444444' })
    )
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'no matching authorized op')
  })

  test('wrong chain ⇒ sponsor:false', async ({ client, assert }) => {
    await seedUser()
    await seedRow()
    const res = await post(client, requestedEvent({ chainId: 1 }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'wrong chain')
  })

  // Each group sets the configured policy to 'sp_test' in-process, so binding is active.
  test('a MISSING sponsorship policy id ⇒ sponsor:false (fail closed)', async ({
    client,
    assert,
  }) => {
    await seedUser()
    await seedRow()
    const res = await post(client, requestedEvent({ policyId: null }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'unknown or missing sponsorship policy')
  })

  test('a WRONG sponsorship policy id ⇒ sponsor:false', async ({ client, assert }) => {
    await seedUser()
    await seedRow()
    const res = await post(client, requestedEvent({ policyId: 'sp_wrong' }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'unknown or missing sponsorship policy')
  })

  test('a different nonce does not match the authorized row ⇒ sponsor:false', async ({
    client,
    assert,
  }) => {
    await seedUser()
    await seedRow({ nonce: '0x9' })
    const res = await post(client, requestedEvent({ nonce: '0x1234' }))
    assert.equal(res.body().sponsor, false)
  })
})

// ── Finalized reconcile ──────────────────────────────────────────────────────
test.group('gas_aa webhook | finalized', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa/phone_registry not migrated')
      return
    }
    __setWebhookVerifierForTest((h, p) => realVerify(h, p))
    __setConfiguredPolicyForTest('sp_test')
    await clean()
  })
  group.each.teardown(async () => {
    __setWebhookVerifierForTest(null)
    __setConfiguredPolicyForTest(null)
    if (await isDbAvailable()) await clean()
  })

  test('finalized with no matching row is a no-op', async ({ client, assert }) => {
    // No seeded row for this nonce → nothing to stamp.
    const res = await post(client, finalizedEvent({ nonce: '0x1234' }))
    assert.equal(res.status(), 200)
    assert.equal(res.body().reconciled, false)
  })

  test('finalized stamps metadata but does NOT mark landed', async ({ client, assert }) => {
    const id = await seedRow() // authorized, nonce 9
    await markPrepared(id, '0x' + 'ab'.repeat(32), { sender: SPENDER, nonce: '0x9' }) // → prepared

    const res = await post(client, finalizedEvent())
    assert.equal(res.body().reconciled, true)

    const row = await query(`SELECT status, meta FROM gas_aa_prepared_user_ops WHERE id = $1`, [id])
    // Landing is owned by waitForUserOperationReceipt — finalized must NOT land it.
    assert.equal(row.rows[0].status, 'prepared')
    assert.exists(row.rows[0].meta.sponsorship_finalized_at)
  })

  test('finalized with a missing policy id is a no-op (fail closed)', async ({
    client,
    assert,
  }) => {
    const id = await seedRow()
    await markPrepared(id, '0x' + 'ab'.repeat(32), { sender: SPENDER, nonce: '0x9' })

    const res = await post(client, finalizedEvent({ policyId: null }))
    assert.equal(res.body().reconciled, false)
    assert.equal(res.body().reason, 'unknown or missing sponsorship policy')

    // The row must be untouched (no metadata stamp).
    const row = await query(`SELECT meta FROM gas_aa_prepared_user_ops WHERE id = $1`, [id])
    assert.notExists(row.rows[0].meta.sponsorship_finalized_at)
  })
})

// ── setup lane (Track B / B1.1c) ─────────────────────────────────────────────
// The cold deploy+approve onboarding op: a single `approve(SpendPermission)` to the
// SPM (`execute` OR `executeBatch` envelope) with a non-empty initCode. Dispatch is
// by decode (a setup-shaped op routes to the setup lane), then the setup policy is a
// SECOND gate. The init_code_hash binds the exact deploy. EVERY address compare
// lowercases both sides — the casing-positive (checksummed phone_registry row vs a
// lowercased op sender) is the one that would silently dead-end a real signup.
const USER_SETUP_LC = '0xabcdef0123456789abcdef0123456789abcdef01'
const USER_SETUP = getAddress(USER_SETUP_LC) // checksummed (mixed-case) — CDP storage form
const SETUP_PHONE = '+15550009100'
const SETUP_NONCE = '0x11'
const INIT_CODE = ('0x' + 'ab'.repeat(80)) as Hex // non-empty: the cold op deploys
const INIT_CODE_HASH = keccak256(INIT_CODE)
const OTHER_INIT_CODE = ('0x' + 'cd'.repeat(80)) as Hex // a different deploy → different hash
const NON_USDC = '0xdEAD000000000000000000000000000000000000'

function setupPermission(over: { account?: string; token?: string } = {}): RawPermission {
  return {
    account: over.account ?? USER_SETUP,
    spender: SPENDER,
    token: over.token ?? USDC,
    allowance: 5_000_000n,
    period: 86_400,
    start: 1_700_000_000,
    end: 1_800_000_000,
    salt: 0n,
    extraData: '0x',
  }
}
function setupCalls(over: { account?: string; token?: string } = {}) {
  return buildSetupCalls({
    spendManager: SPEND_PERMISSION_MANAGER,
    permission: setupPermission(over),
  })
}
function setupCallData(over: { account?: string; token?: string } = {}): Hex {
  return encodeExecute(setupCalls(over)[0])
}

// Real Pimlico shape: data.object.{userOperation:{sender,nonce,callData,initCode},
// entryPoint, chainId, sponsorshipPolicyId}. The sender DEFAULTS to the LOWERCASED
// account (the casing landmine — a checksummed phone_registry row must still match).
function setupEvent(
  type: 'requested' | 'finalized',
  over: {
    nonce?: string
    sender?: string
    callData?: Hex
    initCode?: string
    policyId?: string | null
    chainId?: number
  } = {}
) {
  const object: any = {
    userOperation: {
      sender: over.sender ?? USER_SETUP_LC,
      nonce: over.nonce ?? SETUP_NONCE,
      callData: over.callData ?? setupCallData(),
      initCode: over.initCode ?? INIT_CODE,
    },
    entryPoint: EP,
    chainId: over.chainId ?? CHAIN,
  }
  if (over.policyId !== null) object.sponsorshipPolicyId = over.policyId ?? 'sp_setup'
  return { type: `user_operation.sponsorship.${type}`, data: { object } }
}

async function seedSetupUser(walletAddress = USER_SETUP): Promise<void> {
  // Store the CHECKSUMMED address (CDP format) — exercises LOWER() in isRegisteredUser.
  await query(
    `INSERT INTO phone_registry
       (phone_number, cdp_wallet_name, wallet_address, created_at, last_activity, daily_spent, last_reset_date)
     VALUES ($1, 'gasaa-setup-test', $2, 0, 0, 0, '')
     ON CONFLICT (phone_number) DO UPDATE SET wallet_address = EXCLUDED.wallet_address`,
    [SETUP_PHONE, walletAddress]
  )
}
async function seedSetupRow(
  over: { nonce?: string; initCodeHash?: string | null } = {}
): Promise<string> {
  const c = setupCalls()
  const id = await insertAuthorized({
    lane: 'setup',
    sender: USER_SETUP, // the user's smart account IS the op sender
    decodedUser: USER_SETUP,
    chainId: CHAIN,
    entryPoint: EP,
    callsHash: callsHash(c),
    capBucket: capBucketForAccount(USER_SETUP),
    initCodeHash: over.initCodeHash === undefined ? INIT_CODE_HASH : over.initCodeHash,
  })
  await setNonce(id, BigInt(over.nonce ?? SETUP_NONCE).toString())
  return id
}
async function cleanSetup(): Promise<void> {
  await query(`DELETE FROM gas_aa_prepared_user_ops WHERE sender = $1`, [USER_SETUP_LC])
  await query(`DELETE FROM phone_registry WHERE phone_number = $1`, [SETUP_PHONE])
}

test.group('gas_aa webhook | setup lane', (group) => {
  group.each.setup(async (t) => {
    if (!(await isDbAvailable()) || !(await ensureSchema())) {
      t.skip(true, 'No local DB / gas_aa/phone_registry not migrated')
      return
    }
    __setWebhookVerifierForTest((h, p) => realVerify(h, p))
    __setConfiguredPolicyForTest('sp_test') // free-send policy (for the cross-lane test)
    __setSetupPolicyForTest('sp_setup')
    await cleanSetup()
  })
  group.each.teardown(async () => {
    __setWebhookVerifierForTest(null)
    __setConfiguredPolicyForTest(null)
    __setSetupPolicyForTest(null)
    if (await isDbAvailable()) await cleanSetup()
  })

  // R1 — THE casing landmine. A checksummed phone_registry row + a lowercased op
  // sender must still authorize. If any address bind dropped a lower() this fails.
  test('checksummed phone_registry row matches a lowercased op sender ⇒ sponsor:true', async ({
    client,
    assert,
  }) => {
    await seedSetupUser(USER_SETUP) // checksummed (mixed-case) wallet_address
    await seedSetupRow()
    const res = await post(client, setupEvent('requested', { sender: USER_SETUP_LC }))
    assert.equal(res.status(), 200)
    assert.equal(res.body().sponsor, true)
  })

  // Envelope flexibility: the same single approve as executeBatch still sponsors.
  test('executeBatch([approve]) envelope also sponsors', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const res = await post(
      client,
      setupEvent('requested', { callData: encodeExecuteBatch(setupCalls()) })
    )
    assert.equal(res.body().sponsor, true)
  })

  // R2 — explicit no-ETH-value bind: an approve carrying value is not a setup op.
  test('approve WITH ETH value ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const approveWithValue = encodeExecute({
      ...encodeApproveCall(SPEND_PERMISSION_MANAGER, setupPermission()),
      value: 1n,
    })
    const res = await post(client, setupEvent('requested', { callData: approveWithValue }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'not a sponsorable op (no lane matched)')
  })

  // R2 — explicit no-extra-calls bind: [approve, transfer] is neither lane's shape.
  test('[approve, transfer] (extra call) ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const approveCall = encodeApproveCall(SPEND_PERMISSION_MANAGER, setupPermission())
    const transferCall = calls()[1] // a real USDC transfer call from the free-send fixture
    const res = await post(
      client,
      setupEvent('requested', { callData: encodeExecuteBatch([approveCall, transferCall]) })
    )
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'not a sponsorable op (no lane matched)')
  })

  test('permission.account != op sender ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    // Decodes as a setup op, but the sender is a different address than the grantee.
    const res = await post(
      client,
      setupEvent('requested', { sender: '0x9999999999999999999999999999999999999999' })
    )
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'permission.account != sender')
  })

  test('token != USDC ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const res = await post(
      client,
      setupEvent('requested', { callData: setupCallData({ token: NON_USDC }) })
    )
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'token is not USDC')
  })

  test('setup op with empty initCode ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const res = await post(client, setupEvent('requested', { initCode: '0x' }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'setup op has no initCode')
  })

  test('unregistered permission.account ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupRow() // row exists, but no phone_registry user
    const res = await post(client, setupEvent('requested'))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'permission.account is not registered')
  })

  test('registered but NO prepared row ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser() // no row
    const res = await post(client, setupEvent('requested'))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'no matching authorized op')
  })

  // THE setup-specific binding: a different initCode (≠ the bound deploy) won't match.
  test('op initCode ≠ the row init_code_hash ⇒ sponsor:false', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow({ initCodeHash: INIT_CODE_HASH })
    // Same calls/sender/nonce, but the op deploys via a DIFFERENT initCode.
    const res = await post(client, setupEvent('requested', { initCode: OTHER_INIT_CODE }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'no matching authorized op')
  })

  test('a different nonce does not match the authorized row ⇒ sponsor:false', async ({
    client,
    assert,
  }) => {
    await seedSetupUser()
    await seedSetupRow({ nonce: SETUP_NONCE })
    const res = await post(client, setupEvent('requested', { nonce: '0x99' }))
    assert.equal(res.body().sponsor, false)
  })

  // Cross-lane isolation: a setup op carrying the FREE-SEND policy id is rejected —
  // an attacker can't get a setup op sponsored under the free-send policy.
  test('setup op under the free-send policy id ⇒ sponsor:false (policy is a 2nd gate)', async ({
    client,
    assert,
  }) => {
    await seedSetupUser()
    await seedSetupRow()
    const res = await post(client, setupEvent('requested', { policyId: 'sp_test' }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'unknown or missing sponsorship policy')
  })

  test('a MISSING setup policy id ⇒ sponsor:false (fail closed)', async ({ client, assert }) => {
    await seedSetupUser()
    await seedSetupRow()
    const res = await post(client, setupEvent('requested', { policyId: null }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'unknown or missing sponsorship policy')
  })

  // OUR setup policy unset (not the op's) ⇒ fail closed, so a row-authorized setup op
  // can't silently ride the free-send Pimlico policy. Degrades to legacy fallback.
  test('an UNSET setup policy ⇒ sponsor:false (does not ride free-send policy)', async ({
    client,
    assert,
  }) => {
    __setSetupPolicyForTest('') // setup policy not configured
    await seedSetupUser()
    await seedSetupRow()
    // Otherwise-valid op (carries a policy id) — rejection is purely the unset policy.
    const res = await post(client, setupEvent('requested', { policyId: 'sp_setup' }))
    assert.equal(res.body().sponsor, false)
    assert.equal(res.body().reason, 'sponsorship policy not configured')
  })

  // R4 — finalized stays metadata-only for setup: stamps, never lands.
  test('finalized stamps metadata but does NOT mark the setup row landed', async ({
    client,
    assert,
  }) => {
    const id = await seedSetupUser().then(() => seedSetupRow())
    await markPrepared(id, '0x' + 'cd'.repeat(32), { sender: USER_SETUP_LC, nonce: SETUP_NONCE })

    const res = await post(client, setupEvent('finalized'))
    assert.equal(res.body().reconciled, true)

    const row = await query(`SELECT status, meta FROM gas_aa_prepared_user_ops WHERE id = $1`, [id])
    assert.equal(row.rows[0].status, 'prepared') // landing is owned by the receipt, not finalized
    assert.exists(row.rows[0].meta.sponsorship_finalized_at)
  })

  test('finalized for setup with no matching row is a no-op', async ({ client, assert }) => {
    const res = await post(client, setupEvent('finalized', { nonce: '0x99' }))
    assert.equal(res.status(), 200)
    assert.equal(res.body().reconciled, false)
  })
})
