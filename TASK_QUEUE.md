# Custom Auth: CDP SMS OTP → Twilio + JWT

## NC-001 [ ] Add JWT and Twilio env variables
- **Dependencies:** None

**File:** `apps/backend/start/env.ts`
- Add: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (required strings)
- Add: `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM` (required, base64-encoded PEM)
- Add: `JWT_KEY_ID` (optional, default "sippy-1"), `JWT_ISSUER` (optional, default "sippy")

Generate RS256 keypair:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
cat private.pem | base64 | tr -d '\n'  # → JWT_PRIVATE_KEY_PEM
cat public.pem | base64 | tr -d '\n'   # → JWT_PUBLIC_KEY_PEM
```

## NC-002 [ ] Create JWT service
- **Dependencies:** NC-001

**New file:** `apps/backend/app/services/jwt_service.ts`
- Uses `jose` (already installed v6.1.3)
- `signToken(sub: string)` → RS256 JWT with `{ sub, iss, iat, exp(1h), jti(uuid) }`
- `verifyToken(token: string)` → validates signature + expiry
- `getJwks()` → returns `{ ken, e, kid, alg: "RS256", use: "sig" }] }`

## NC-003 [ ] Create OTP service with Twilio
- **Dependencies:** NC-001

**New file:** `apps/backend/app/services/otp_service.ts`
- In-memory `Map<phone, { code, expiresAt, attempts }>` (follow `rate_limit_service.ts` pattern)
- `sendOtp(phone)` → generate 6-digit code, store 5-min TTL, send via Twilio REST API (axios POST, no twilio npm package)
- `verifyOtp(phone, code)` → check match + expiry, 5 wrong attempts = delete (lockout)
- Rate limit: 3 sends/min per phone
- Periodic cleanup of expired entries

## NC-004 [ ] Create auth API controller
- **Dependencies:** NC-002, NC-003

**New file:** `apps/backend/app/controllers/auth_api_controller.ts`
- `POST /api/auth/send-otp` — body `{ phone }`, normalize to E.164, call otpService
- `POST /api/auth/verify-otp` — body `{ phone, code }`, returns `{ token, expiresIn: 3600 }`
- `GET /api/auth/.well-known/jwks.json` — public, returns JWKS, Cache-Control: 1h

## NC-005 [ ] Create JWT auth middleware
- **Dependen-002

**New file:** `apps/backend/app/middleware/jwt_auth_middleware.ts`
- Extract Bearer token → `jwtService.verifyToken()`
- Extract `sub` (phone) from JWT payload
- Look up `walletAddress` from `phone_registry` table by phone
- Set `ctx.cdpUser = { phoneNumber, walletAddress }` (same shape, zero controller changes)
- Allow `/api/register-wallet` through without walletAddress (first-time user)

## NC-006 [ ] Register auth routes and swap middleware
- **Dependencies:** NC-004, NC-005

**File:** `apps/backend/start/routes.ts`
- Add public auth routes: `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/auth/.well-known/jwks.json`
- Change API group: `middleware.cdpAuth()` → `middleware.jwtAuth()`

**File:** `apps/backend/start/kernel.ts`
- Add `jwtAuth` to named middleware

## NC-007 [ ] Create frontend auth utility
- **Dependencies:** NC-004

**New file:** `apps/web/lib/auth.ts`
- `sendOtp(phone)` → POST to backend
- `verifyOtp(phone, code)` → POST to backend, returns JWT
- `storeToken(token)` / `gToken()` / `clearToken()` → localStorage `sippy_jwt`
- `isTokenExpired(token)` → decode base64 payload, check exp
- `getFreshToken()` → returns stored token if valid, null if expired

## NC-008 [ ] Update CDPHooksProvider with custom auth
- **Dependencies:** NC-007

**File:** `apps/web/app/providers/cdp-provider.tsx`
- Add `customAuth: { getJwt: async () => getFreshToken() }` to config
- Import `getFreshToken` from `@/lib/auth`

## NC-009 [ ] Migrate setup page to JWT auth
- **Dependencies:** NC-007, NC-008

**File:** `apps/web/app/setup/page.tsx`
- Remove: `useSignInWithSms`, `useVerifySmsOTP` imports
- Add: `useAuthenticateWithJWT` from `@coinbase/cdp-hooks`
- Add: `sendOtp`, `verifyOtp`, `storeToken`, `getStoredToken` from `@/lib/auth`
- `handleSendOtp`: call `sendOtp(phone)` instead of `signInWithSms()`
- `handleVerifyOtp`: call `verifyOtp(phone, code)` → `storeToken(token)` → `authenticateWithJWT()` → continue to permission step
- Replace all `getAccessToken()` for backend API calls with `gn()`
- Keep wallet hooks unchanged (`useCreateSpendPermission`, etc.)

## NC-010 [ ] Migrate wallet page to JWT auth
- **Dependencies:** NC-007, NC-008

**File:** `apps/web/app/wallet/page.tsx`
- Same pattern as setup page: replace CDP SMS hooks with OTP + authenticateWithJWT
- Replace `getAccessToken()` calls with `getStoredToken()`
- Keep wallet hooks unchanged

## NC-011 [ ] Migrate settings page to JWT auth
- **Dependencies:** NC-007, NC-008

**File:** `apps/web/app/settings/page.tsx`
- Same pattern (most complex — has permissions, revoke, export)
- Replace CDP SMS hooks with OTP + authenticateWithJWT
- Replace `getAccessToken()` calls with `getStoredToken()`
- All wallet hooks stay unchanged

## NC-012 [ ] Add sign-out token cleanup
- **Dependencies:** NC-009, NC-010, NC-011

All pages: add `clearToken()` call alongside CDP `signOut()` to clear the stored JWT from localStorage on sign-out.

## NC-013 [ ] Cleanup legacy CDP auth middleware
- **Dependencies:** NC-012

- Keep `cdp_auth_middleware.ts` teorarily as rollback option
- Keep `ctx.cdpUser` property name (avoids touching 8+ controller methods)
- Remove `cdp_auth_middleware.ts` after 1 week in production if stable
- `@coinbase/cdp-sdk` backend dependency stays (used for spend permission queries)
