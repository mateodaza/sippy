# P4.6 Custom Auth: Sippy-Branded SMS OTP (Twilio + JWT)

> **Goal:** Users see "Sippy: Tu código es 123456" instead of "Coinbase: Your code is..."
> **Delivery:** Twilio SMS for login OTP. Backend JWT + JWKS. Frontend `authenticateWithJWT()`.
> **Estimate:** 10-14h

## NC-001 [ ] Add JWT and Twilio env variables
- **Dependencies:** None

**File:** `apps/backend/start/env.ts`
- Add: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (required strings)
- Add: `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM` (required, base64-encoded PEM)
- Add: `JWT_KEY_ID` (optional, default "sippy-1"), `JWT_ISSUER` (optional, default "sippy")

Generate RS256 keypair (one-time):
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
cat private.pem | base64 | tr -d '\n'  # → JWT_PRIVATE_KEY_PEM
cat public.pem | base64 | tr -d '\n'   # → JWT_PUBLIC_KEY_PEM
```

Add to `apps/backend/.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKExxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+12345678900
JWT_PRIVATE_KEY_PEM=<base64 from above>
JWT_PUBLIC_KEY_PEM=<base64 from above>
JWT_KEY_ID=sippy-1
JWT_ISSUER=sippy
```

## NC-002 [ ] Create JWT service
- **Dependencies:** NC-001

**New file:** `apps/backend/app/services/jwt_service.ts`
- Uses `jose` (already installed v6.1.3)
- On init: decode base64 PEM env vars → `jose.importPKCS8` (private) / `jose.importSPKI` (public)
- `signToken(sub: string)` → RS256 JWT with `{ sub, iss, iat, exp(1h), jti(crypto.randomUUID()) }`
- `verifyToken(token: string)` → validates signature + expiry, returns payload
- `getJwks()` → export public key via `jose.exportJWK`, return `{ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }`
- Singleton pattern (module-level instance, lazy init)

## NC-003 [ ] Create OTP service with Twilio SMS
- **Dependencies:** NC-001

**New file:** `apps/backend/app/services/otp_service.ts`
- In-memory `Map<phone, { code, expiresAt, attempts, sendCount, sendWindowStart }>` (fole_limit_service.ts` pattern with MAX_MAP_ENTRIES cap)
- `sendOtp(phone)` →
  - Rate limit: max 3 sends per phone per minute (check sendCount + sendWindowStart)
  - Generate 6-digit code via `crypto.randomInt(100000, 999999)`
  - Store with 5-min TTL, reset attempts to 0
  - Don't invalidate existing code on re-request (either code works until expiry, per M1_PLAN)
  - Send via Twilio REST API: `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`
  - Use axios with Basic Auth (ACCOUNT_SID:AUTH_TOKEN)
  - Message body: `"Sippy: Tu código es {code}"` (Spanish-first, per M1_PLAN)
- `verifyOtp(phone, code)` →
  - Check code exists + not expired
  - On wrong code: increment attempts, max 5 wrong = delete entry (lockout)
  - On success: delete entry, return true
- Periodic cleanup: clear expired entries every 60s (same timer pattern as rate_limit_service)

## NC-004 [ ] Create auth API controller
- **Dependencies:** NC-002, NC-003

**New file:** `apps/backend/app/controllers/auth_api_controlle
- Follow pattern from `embedded_wallet_controller.ts`
- Three endpoints:

**`sendOtp` — POST /api/auth/send-otp**
- Body: `{ phone: string }`
- Normalize phone to E.164 (reuse `normalizePhone` from `app/utils/phone.ts`)
- Call `otpService.sendOtp(phone)`
- Return `{ success: true }`
- On rate limit: return 429 `{ error: "Too many requests. Try again in X seconds." }`

**`verifyOtp` — POST /api/auth/verify-otp**
- Body: `{ phone: string, code: string }`
- Normalize phone, call `otpService.verifyOtp(phone, code)`
- On success: call `jwtService.signToken(phone)`, return `{ token, expiresIn: 3600 }`
- On failure: return 401 `{ error: "Invalid or expired code." }`

**`jwks` — GET /api/auth/.well-known/jwks.json**
- Public endpoint, no auth
- Return `jwtService.getJwks()`
- Set `Cache-Control: public, max-age=3600`

## NC-005 [ ] Create JWT auth middleware
- **Dependencies:** NC-002

**New file:** `apps/backend/app/middleware/jwt_auth_middleware.ts`
- Extract `Authorization: Bearer <token>` from header
- CwtService.verifyToken(token)`
- Extract `sub` (phone number) from JWT payload
- Query DB: `SELECT wallet_address FROM phone_registry WHERE phone_number = ?`
- Set `ctx.cdpUser = { phoneNumber: sub, walletAddress }` — **same shape as CDP middleware, zero controller changes**
- Special case: if no wallet found AND route is `/api/register-wallet`, allow through with `walletAddress = ''` (first-time user hasn't registered yet)
- On any failure (no token, invalid token, expired): return 401

## NC-006 [ ] Register auth routes and swap middleware
- **Dependencies:** NC-004, NC-005

**File:** `apps/backend/start/routes.ts`
- Add public auth routes (before the API group):
  ```
  router.post('/api/auth/send-otp', [AuthApiController, 'sendOtp']).use(middleware.ipThrottle())
  router.post('/api/auth/verify-otp', [AuthApiController, 'verifyOtp']).use(middleware.ipThrottle())
  router.get('/api/auth/.well-known/jwks.json', [AuthApiController, 'jwks'])
  ```
- Change API group middleware: `middleware.cdpAuth()` → `meware.jwtAuth()`

**File:** `apps/backend/start/kernel.ts`
- Add to `router.named({})`: `jwtAuth: () => import('#middleware/jwt_auth_middleware')`

## NC-007 [ ] CDP Portal: Configure Custom Auth (manual)
- **Dependencies:** NC-004 (JWKS endpoint must be deployed first)

1. Go to portal.cdp.coinbase.com → project → Embedded Wallets → **Custom Auth** tab
2. Set JWKS URL: `https://sippy-backend-production.up.railway.app/api/auth/.well-known/jwks.json`
3. Set expected issuer: `sippy` (must match `JWT_ISSUER` env var)
4. Save and verify CDP can fetch the endpoint

## NC-008 [ ] Create frontend auth utility
- **Dependencies:** NC-006

**New file:** `apps/web/lib/auth.ts`
```typescript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

// Send OTP via Twilio (our backend)
sendOtp(phone: string): Promise<void>
  → POST ${BACKEND_URL}/api/auth/send-otp { phone }

// Verify OTP, get JWT
verifyOtp(phone: string, code: string): Promise<string>
  → POST ${BACKEND_URL}/api/auth/verify-otp { phone, code }ns token from response

// Token management (localStorage key: 'sippy_jwt')
storeToken(token: string): void
getStoredToken(): string | null
clearToken(): void

// Check expiry by decoding JWT payload (base64, no verification needed client-side)
isTokenExpired(token: string): boolean
  → decode payload, check exp < Date.now()/1000

// For CDPHooksProvider callback — returns valid token or null
getFreshToken(): string | null
  → getStoredToken() → if expired or null, return null
```

## NC-009 [ ] Update CDPHooksProvider with custom auth
- **Dependencies:** NC-008

**File:** `apps/web/app/providers/cdp-provider.tsx`
- Import `getFreshToken` from `@/lib/auth`
- Add `customAuth` to CDPHooksProvider config:
  ```tsx
  <CDPHooksProvider
    config={{
      projectId: CDP_PROJECT_ID,
      customAuth: {
        getJwt: async () => {
          const token = getFreshToken();
          return token ?? undefined;  // CDP expects string | undefined
        },
      },
      ethereum: {
        createOnLogin: 's       enableSpendPermissions: true,
      },
    }}
  >
  ```

## NC-010 [ ] Migrate setup page to JWT auth
- **Dependencies:** NC-008, NC-009

**File:** `apps/web/app/setup/page.tsx`

**Remove imports:**
- `useSignInWithSms`, `useVerifySmsOTP` from `@coinbase/cdp-hooks`

**Add imports:**
- `useAuthenticateWithJWT` from `@coinbase/cdp-hooks`
- `sendOtp`, `verifyOtp`, `storeToken`, `getStoredToken` from `@/lib/auth`

**Replace `handleSendOtp` (currently line ~225):**
```
Before: const result = await signInWithSms({ phoneNumber: formattedPhone })
After:  await sendOtp(formattedPhone)
```
- No more `flowId` — our backend tracks OTP by phone number

**Replace `handleVerifyOtp` (currently line ~250):**
```
Before: const { user, isNewUser } = await verifySmsOTP({ flowId, otp })
After:  const token = await verifyOtp(formattedPhone, otp)
        storeToken(token)
        const { user, isNewUser } = await authenticateWithJWT()
```
- `authenticateWithJWT()` calls `getJwt()` callback → gets our stored JWT → CDPates via JWKS → creates wallet session
- Returns same `{ user, isNewUser }` shape — rest of the flow unchanged

**Replace all `getAccessToken()` for backend API calls:**
```
Before: const accessToken = await getAccessToken()
After:  const accessToken = getStoredToken()
```
- Affects ~6 places in setup page (register-wallet, register-permission, wallet-status, ensure-gas, etc.)

**Keep unchanged:** `useCreateSpendPermission`, `useCurrentUser`, `useIsSignedIn`, `useSignOut`

## NC-011 [ ] Migrate wallet page to JWT auth
- **Dependencies:** NC-008, NC-009

**File:** `apps/web/app/wallet/page.tsx`
- Same pattern as NC-010
- Remove `useSignInWithSms`, `useVerifySmsOTP`
- Add `useAuthenticateWithJWT`, auth utility imports
- Replace `handleSendOtp` (line ~156): `sendOtp()` instead of `signInWithSms()`
- Replace `handleVerifyOtp` (line ~184): `verifyOtp()` → `storeToken()` → `authenticateWithJWT()`
- Replace `getAccessToken()` calls with `getStoredToken()`
- Keep wallet hooks unchanged (`useSendUserOperatio)

## NC-012 [ ] Migrate settings page to JWT auth
- **Dependencies:** NC-008, NC-009

**File:** `apps/web/app/settings/page.tsx`
- Same pattern (most complex — has permissions, revoke, export)
- Remove `useSignInWithSms`, `useVerifySmsOTP`
- Add `useAuthenticateWithJWT`, auth utility imports
- Replace `handleSendOtp` (line ~235): `sendOtp()` instead of `signInWithSms()`
- Replace `handleVerifyOtp` (line ~272): `verifyOtp()` → `storeToken()` → `authenticateWithJWT()`
- Replace all `getAccessToken()` calls with `getStoredToken()`
- Keep ALL wallet hooks unchanged (`useCreateSpendPermission`, `useRevokeSpendPermission`, `useExportEvmAccount`, `useSendUserOperation`, etc.)

## NC-013 [ ] Add sign-out token cleanup
- **Dependencies:** NC-010, NC-011, NC-012

All 3 pages: add `clearToken()` call alongside CDP `signOut()` to clear the stored JWT from localStorage on sign-out.

## NC-014 [ ] Verify end-to-end and cleanup
- **Dependencies:** NC-013

**Verify:**
1. `curl /api/auth/.well-known/jwks.json` → vapublic key
2. `POST /api/auth/send-otp` → receive SMS from Twilio saying "Sippy: Tu código es..."
3. `POST /api/auth/verify-otp` → valid JWT returned
4. Frontend: `authenticateWithJWT()` → `useCurrentUser()` returns user with wallet
5. Wallet ops: create spend permission, send USDC, export account — all still work
6. Backend API calls with JWT in Authorization header work
7. Run `node ace test` — tests pass

**Cleanup:**
- Keep `cdp_auth_middleware.ts` as rollback (delete after 1 week stable in prod)
- Keep `ctx.cdpUser` property name (zero controller changes)
- `@coinbase/cdp-sdk` stays (used for spend permission queries in embedded_wallet_controller)

---

# VPS Setup (Hetzner)

**Branch:** `feature/vps-setup`

## VPS-001 [ ] Auto-setup PostgreSQL databases
- **Dependencies:** None

**New file:** `scripts/vps-setup-db.sh`
- Check if PostgreSQL is installed, install if missing (`apt-get install postgresql`)
- Check if databases `sippy_test` and `sippy_indexer` exist, create if missing
- Create pr with password if not present
- Run backend migrations against `sippy_test`
- Print connection strings on completion
- Make script idempotent (safe to re-run)

## VPS-002 [ ] Auto-generate .env files for VPS
- **Dependencies:** VPS-001

**New file:** `scripts/vps-setup-env.sh`
- Generate `apps/backend/.env.test` with VPS-local DATABASE_URL and test defaults
- Generate `apps/indexer/.env` with VPS-local DATABASE_URL, real PONDER_RPC_URL, and INDEXER_API_SECRET
- Generate `apps/web/.env.local` with optional test defaults
- Prompt for or accept as args: DB password, Alchemy RPC key
- Skip files that already exist (don't overwrite without `--force` flag)
