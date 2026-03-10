# Task Queue — Sippy

> Tasks are executed in order, respecting dependencies.
> Tasks use stable IDs (NC-001, etc.) that never change when tasks are reordered.

## Status Legend
- [ ] Queued
- [~] In Progress
- [x] Completed
- [!] Blocked — needs manual action

---

## P4.6 Custom Auth: Sippy-Branded SMS OTP (Twilio + JWT)

> **Goal:** Users see "Sippy: Tu código es 123456" instead of "Coinbase: Your code is..."
> **Estimate:** 10-14h

#### NC-001 [ ] Add JWT and Twilio env variables
- **What:** Add Twilio + JWT env vars to AdonisJS env schema and `.env`. Generate RS256 keypair.
- **Acceptance criteria:**
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` added to `env.ts` (optional strings)
  - `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM` added (optional, base64-encoded PEM)
  - `JWT_KEY_ID` (default "sippy-1"), `JWT_ISSUER` (default "sippy") added
  - RS256 keypair generated and base64-encoded values added to `.env`
- **Dependencies:** None
- **Files:** `apps/backend/start/env.ts`, `apps/backend/.env`

#### NC-002 [ ] Create JWT service
- **What:** RS256 JWT signing, verification, and JWKS export using `jose` v6.
- **Acceptance criteria:**
  - `signToken(sub)` returns RS256 JWT with `{ sub, iss, iat, exp(1h), jti }`
  - `verifyToken(token)` validates signature + expiry, returns payload
  - `getJwks()` returns `{ keys: [{ kty, n, e, kid, alg: "RS256", use: "sig" }] }`
  - Singleton pattern with lazy init from base64 PEM env vars
- **Dependencies:** NC-001
- **Files:** `apps/backend/app/services/jwt_service.ts` (new)

#### NC-003 [ ] Create OTP service with Twilio raw SMS
- **What:** In-memory OTP store + Twilio Messages API for branded SMS delivery.
- **Acceptance criteria:**
  - `sendOtp(phone, lang?)` generates 6-digit code, stores with 5-min TTL, sends via Twilio REST API
  - SMS body is trilingual: "Sippy: Tu código es {code}" / "Your code is" / "Seu código é"
  - Language resolved from `user_preferences` or phone prefix fallback
  - Rate limit: max 3 sends per phone per minute
  - `verifyOtp(phone, code)` checks match + expiry, max 5 wrong attempts = lockout
  - In-memory Map with MAX_MAP_ENTRIES cap and 60s cleanup timer (follows `rate_limit_service.ts`)
- **Dependencies:** NC-001
- **Constraints:** Use axios with Basic Auth, no `twilio` npm package
- **Files:** `apps/backend/app/services/otp_service.ts` (new)

#### NC-004 [ ] Create auth API controller
- **What:** Three endpoints: send-otp, verify-otp, JWKS.
- **Acceptance criteria:**
  - `POST /api/auth/send-otp` — body `{ phone }`, normalizes to E.164, returns `{ success: true }` or 429
  - `POST /api/auth/verify-otp` — body `{ phone, code }`, returns `{ token, expiresIn: 3600 }` or 401
  - `GET /api/auth/.well-known/jwks.json` — public, returns JWKS, `Cache-Control: public, max-age=3600`
- **Dependencies:** NC-002, NC-003
- **Files:** `apps/backend/app/controllers/auth_api_controller.ts` (new)

#### NC-005 [ ] Create JWT auth middleware
- **What:** Replace CDP token validation with our JWT. Same `ctx.cdpUser` shape — zero controller changes.
- **Acceptance criteria:**
  - Extracts `Authorization: Bearer <token>`, verifies via `jwtService.verifyToken()`
  - Looks up `walletAddress` from `phone_registry` by phone (JWT `sub`)
  - Sets `ctx.cdpUser = { phoneNumber, walletAddress }` — identical shape to CDP middleware
  - Allows `/api/register-wallet` through without walletAddress (first-time user)
  - Returns 401 on missing/invalid/expired token
- **Dependencies:** NC-002
- **Files:** `apps/backend/app/middleware/jwt_auth_middleware.ts` (new)

#### NC-006 [ ] Register auth routes and swap middleware
- **What:** Wire up auth endpoints, register JWT middleware, swap API group from CDP to JWT auth.
- **Acceptance criteria:**
  - Auth routes added: `send-otp`, `verify-otp`, `jwks` (public, with ipThrottle on OTP routes)
  - API group middleware changed from `cdpAuth()` to `jwtAuth()`
  - `jwtAuth` registered in `kernel.ts` named middleware
  - Existing tests still pass
- **Dependencies:** NC-004, NC-005
- **Files:** `apps/backend/start/routes.ts`, `apps/backend/start/kernel.ts`

#### NC-007 [!] CDP Portal: Configure Custom Auth
- **What:** Manual step — register JWKS URL in CDP Portal so CDP validates our JWTs.
- **Acceptance criteria:**
  - JWKS URL set to `https://sippy-backend-production.up.railway.app/api/auth/.well-known/jwks.json`
  - Expected issuer set to `sippy`
  - CDP can fetch and parse the JWKS endpoint
- **Dependencies:** NC-006 (JWKS endpoint must be deployed first)
- **Constraints:** Manual action in portal.cdp.coinbase.com

#### NC-008 [ ] Create frontend auth utility
- **What:** Client-side helpers for OTP flow and JWT token management in localStorage.
- **Acceptance criteria:**
  - `sendOtp(phone)` calls backend send-otp endpoint
  - `verifyOtp(phone, code)` calls backend verify-otp, returns JWT token
  - `storeToken(token)` / `getStoredToken()` / `clearToken()` manage `sippy_jwt` in localStorage
  - `isTokenExpired(token)` decodes base64 payload, checks `exp`
  - `getFreshToken()` returns stored token if valid, null if expired
- **Dependencies:** NC-006
- **Files:** `apps/web/lib/auth.ts` (new)

#### NC-009 [ ] Update CDPHooksProvider with custom auth
- **What:** Add `customAuth.getJwt` callback so CDP uses our JWT instead of its own SMS.
- **Acceptance criteria:**
  - `customAuth: { getJwt: async () => getFreshToken() ?? undefined }` added to provider config
  - CDP calls this callback to get our JWT, validates it via JWKS
- **Dependencies:** NC-008
- **Files:** `apps/web/app/providers/cdp-provider.tsx`

#### NC-010 [ ] Migrate setup page to JWT auth
- **What:** Replace `useSignInWithSms` / `useVerifySmsOTP` with our OTP + `useAuthenticateWithJWT`.
- **Acceptance criteria:**
  - `signInWithSms()` replaced with `sendOtp()` from auth utility
  - `verifySmsOTP()` replaced with `verifyOtp()` → `storeToken()` → `authenticateWithJWT()`
  - All `getAccessToken()` calls replaced with `getStoredToken()`
  - Wallet hooks unchanged (`useCreateSpendPermission`, `useCurrentUser`, etc.)
  - Full setup flow works: phone → OTP → permission → done
- **Dependencies:** NC-008, NC-009
- **Files:** `apps/web/app/setup/page.tsx`

#### NC-011 [ ] Migrate wallet page to JWT auth
- **What:** Same auth swap as setup page — replace CDP SMS hooks with JWT auth.
- **Acceptance criteria:**
  - Same replacements as NC-010
  - Send USDC flow still works end-to-end
- **Dependencies:** NC-008, NC-009
- **Files:** `apps/web/app/wallet/page.tsx`

#### NC-012 [ ] Migrate settings page to JWT auth
- **What:** Same auth swap — most complex page (permissions, revoke, export).
- **Acceptance criteria:**
  - Same replacements as NC-010
  - All wallet hooks unchanged (`useRevokeSpendPermission`, `useExportEvmAccount`, etc.)
  - Export key, revoke permission, send USDC all still work
- **Dependencies:** NC-008, NC-009
- **Files:** `apps/web/app/settings/page.tsx`

#### NC-013 [ ] Add sign-out token cleanup
- **What:** Clear stored JWT from localStorage on sign-out across all pages.
- **Acceptance criteria:**
  - `clearToken()` called alongside CDP `signOut()` on all 3 pages
  - After sign-out, `getStoredToken()` returns null
- **Dependencies:** NC-010, NC-011, NC-012
- **Files:** `apps/web/app/setup/page.tsx`, `apps/web/app/wallet/page.tsx`, `apps/web/app/settings/page.tsx`

#### NC-014 [ ] Verify end-to-end and cleanup
- **What:** Full integration test and cleanup of old CDP auth.
- **Acceptance criteria:**
  - JWKS endpoint returns valid RSA public key
  - SMS arrives from Twilio saying "Sippy: Tu código es..."
  - `authenticateWithJWT()` creates CDP session with wallet
  - Wallet ops work: spend permission, send USDC, export account
  - Backend API calls with JWT auth work
  - `node ace test` passes
  - `cdp_auth_middleware.ts` kept as rollback (delete after 1 week stable)
- **Dependencies:** NC-013
- **Constraints:** Keep `ctx.cdpUser` property name (zero controller changes), keep `@coinbase/cdp-sdk` (used for spend permissions)

---

## VPS Setup (Hetzner)

#### VPS-001 [ ] Auto-setup PostgreSQL databases
- **What:** Script to install PostgreSQL, create databases, run migrations on VPS.
- **Acceptance criteria:**
  - Installs PostgreSQL if missing
  - Creates `sippy_test` and `sippy_indexer` databases
  - Creates postgres user with password
  - Runs backend migrations against `sippy_test`
  - Idempotent (safe to re-run)
- **Dependencies:** None
- **Files:** `scripts/vps-setup-db.sh` (new)

#### VPS-002 [ ] Auto-generate .env files for VPS
- **What:** Script to generate env files for backend, indexer, and web on VPS.
- **Acceptance criteria:**
  - Generates `apps/backend/.env.test`, `apps/indexer/.env`, `apps/web/.env.local`
  - Accepts DB password and Alchemy RPC key as args
  - Skips existing files without `--force` flag
- **Dependencies:** VPS-001
- **Files:** `scripts/vps-setup-env.sh` (new)
