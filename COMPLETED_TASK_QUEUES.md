# Completed Task Queues — Sippy

> Archive of completed task queue sections. Moved here to keep TASK_QUEUE.md focused on pending work.

## Status Legend
- [ ] Queued — ready for agent
- [ ] In Progress
- [x] Completed
- [!] Blocked — needs manual human action, skip and move to next

## Agent Rules
1. Pick the first `[ ]` task whose dependencies are all `[x]`. Skip `[!]` blocked tasks.
2. Read all files listed in **Files** before writing any code.
3. Follow existing patterns — check sibling files in the same directory for style, imports, and conventions.
4. Do NOT install new npm packages unless explicitly stated.
5. Do NOT modify files not listed in **Files** unless the change is a direct consequence (e.g. fixing an import).
6. After completing a task, run the **Verify** command. If it fails, fix before marking `[x]`.
7. Commit each task separately with message: `feat(auth): NC-XXX — {task title}`.
8. If a task is ambiguous, read the referenced pattern files in **Context** before asking for clarification.

---

## P4.6 Custom Auth: Sippy-Branded SMS OTP (Twilio + JWT)

> **Goal:** Users see "Sippy: Tu código es 123456" instead of "Coinbase: Your code is..."
> **Estimate:** 10-14h

#### NC-001 [x] Add JWT and Twilio env variables
- **What:** Add Twilio + JWT env vars to AdonisJS env schema and `.env`. Generate RS256 keypair.
- **Acceptance criteria:**
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` added to `env.ts` as optional strings
  - `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM` added as optional strings (base64-encoded PEM)
  - `JWT_KEY_ID`, `JWT_ISSUER` added as optional strings
  - RS256 keypair generated via `openssl genrsa 2048` and base64-encoded values added to `.env`
- **Verify:** `cd apps/backend && node ace check:env` exits 0
- **Dependencies:** None
- **Files:** `apps/backend/start/env.ts`, `apps/backend/.env`

#### NC-002 [x] Create JWT service
- **What:** RS256 JWT signing, verification, and JWKS export using `jose` v6 (already installed).
- **Acceptance criteria:**
  - Exports singleton with lazy init: decodes base64 PEM env vars → `jose.importPKCS8` / `jose.importSPKI`
  - `signToken(sub: string)` → RS256 JWT with claims `{ sub, iss, iat, exp(1h), jti(crypto.randomUUID()) }`
  - `verifyToken(token: string)` → validates signature + expiry, returns `JWTPayload`
  - `getJwks()` → exports public key via `jose.exportJWK`, returns `{ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }`
  - Uses `env.get('JWT_KEY_ID', 'sippy-1')` and `env.get('JWT_ISSUER', 'sippy')` for defaults
- **Verify:** Write a quick smoke test or `node -e` that imports the service and calls `signToken` + `verifyToken`
- **Dependencies:** NC-001
- **Context:** `apps/backend/app/services/` for service patterns
- **Files:** `apps/backend/app/services/jwt_service.ts` (new)

#### NC-003 [x] Create OTP service with Twilio raw SMS
- **What:** In-memory OTP store + Twilio Messages API for branded, trilingual SMS delivery.
- **Acceptance criteria:**
  - `sendOtp(phone: string, lang?: string)` →
    - Rate limit: max 3 sends per phone per 60s window
    - Generate 6-digit code via `crypto.randomInt(100000, 999999)`
    - Store in Map with 5-min TTL, reset attempts to 0
    - Send via `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` using axios + Basic Auth
    - SMS body by language: ES `"Sippy: Tu código es {code}"` / EN `"Sippy: Your code is {code}"` / PT `"Sippy: Seu código é {code}"`
    - Language resolution: check `user_preferences.preferred_language` from DB, fallback to phone prefix (`+55`→PT, `+1`→EN, else→ES)
  - `verifyOtp(phone: string, code: string)` →
    - Check code exists and not expired
    - Wrong code: increment attempts, max 5 = delete entry (lockout)
    - Correct: delete entry, return `true`
  - In-memory `Map<string, OtpEntry>` with `MAX_MAP_ENTRIES = 100_000` cap
  - 60s cleanup timer for expired entries (same pattern as `rate_limit_service.ts`)
- **Verify:** `cd apps/backend && npx tsc --noEmit` compiles without errors
- **Dependencies:** NC-001
- **Constraints:** Use axios with Basic Auth. Do NOT install `twilio` npm package.
- **Context:** `apps/backend/app/services/rate_limit_service.ts` (follow Map + cleanup timer pattern)
- **Files:** `apps/backend/app/services/otp_service.ts` (new)

#### NC-004 [x] Create auth API controller
- **What:** Controller with 3 methods: `sendOtp`, `verifyOtp`, `jwks`.
- **Acceptance criteria:**
  - `sendOtp({ request, response })` — reads `{ phone }` from body, normalizes via `normalizePhoneNumber()` from `app/utils/phone.ts`, calls `otpService.sendOtp(phone)`, returns `{ success: true }`. On rate limit: 429 with `{ error: "Too many requests" }`.
  - `verifyOtp({ request, response })` — reads `{ phone, code }`, normalizes phone, calls `otpService.verifyOtp()`. On success: `jwtService.signToken(phone)` → return `{ token, expiresIn: 3600 }`. On failure: 401 `{ error: "Invalid or expired code" }`.
  - `jwks({ response })` — returns `jwtService.getJwks()` with header `Cache-Control: public, max-age=3600`.
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** NC-002, NC-003
- **Context:** `apps/backend/app/controllers/embedded_wallet_controller.ts` (follow controller pattern)
- **Files:** `apps/backend/app/controllers/auth_api_controller.ts` (new)

#### NC-005 [x] Create JWT auth middleware
- **What:** Middleware that validates our JWT and sets `ctx.cdpUser` — same shape as CDP middleware, zero controller changes.
- **Acceptance criteria:**
  - Extracts `Authorization: Bearer <token>` from request header
  - Calls `jwtService.verifyToken(token)` — on failure returns 401
  - Reads `sub` from JWT payload (this is the phone number)
  - Queries DB: `SELECT wallet_address FROM phone_registry WHERE phone_number = ?` using Lucid
  - Sets `ctx.cdpUser = { phoneNumber: sub, walletAddress }` — MUST match shape in `apps/backend/app/types/cdp_auth.ts`
  - Special case: if route is `/api/register-wallet` AND no wallet found, allow through with `walletAddress = ''`
  - On missing/invalid/expired token: return `ctx.response.unauthorized({ error: 'Unauthorized' })`
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** NC-002
- **Context:** `apps/backend/app/middleware/cdp_auth_middleware.ts` (replaces this — study its `ctx.cdpUser` shape), `apps/backend/app/types/cdp_auth.ts` (type declaration to match)
- **Files:** `apps/backend/app/middleware/jwt_auth_middleware.ts` (new)

#### NC-006 [x] Register auth routes and swap middleware
- **What:** Wire up auth endpoints in routes, register JWT middleware in kernel, swap API group from CDP to JWT.
- **Acceptance criteria:**
  - In `routes.ts`, add before the CDP-authenticated group:
    ```
    router.post('/api/auth/send-otp', [AuthApiController, 'sendOtp']).use(middleware.ipThrottle())
    router.post('/api/auth/verify-otp', [AuthApiController, 'verifyOtp']).use(middleware.ipThrottle())
    router.get('/api/auth/.well-known/jwks.json', [AuthApiController, 'jwks'])
    ```
  - In `routes.ts`, change `.use(middleware.cdpAuth())` → `.use(middleware.jwtAuth())` on the API group
  - In `kernel.ts`, add `jwtAuth: () => import('#middleware/jwt_auth_middleware')` to `router.named({})`
- **Verify:** `cd apps/backend && node ace test` — all existing tests pass
- **Dependencies:** NC-004, NC-005
- **Files:** `apps/backend/start/routes.ts`, `apps/backend/start/kernel.ts`

#### NC-007 [!] CDP Portal: Configure Custom Auth
- **What:** MANUAL STEP — human must register JWKS URL in CDP Portal so CDP validates our JWTs. Agent cannot do this.
- **Acceptance criteria:**
  - Go to portal.cdp.coinbase.com → project → Embedded Wallets → Custom Auth tab
  - Set JWKS URL: `https://sippy-backend-production.up.railway.app/api/auth/.well-known/jwks.json`
  - Set expected issuer: `sippy`
  - Save and verify CDP can fetch the endpoint
- **Dependencies:** NC-006 deployed to production
- **Constraints:** Requires browser login to CDP portal. Agent MUST skip this task.

#### NC-008 [x] Create frontend auth utility
- **What:** Client-side module with OTP API calls and JWT localStorage management.
- **Acceptance criteria:**
  - `sendOtp(phone: string): Promise<void>` → `POST /api/auth/send-otp` with `{ phone }`
  - `verifyOtp(phone: string, code: string): Promise<string>` → `POST /api/auth/verify-otp`, returns `token` from response
  - `storeToken(token: string): void` → saves to `localStorage.setItem('sippy_jwt', token)`
  - `getStoredToken(): string | null` → reads from localStorage
  - `clearToken(): void` → `localStorage.removeItem('sippy_jwt')`
  - `isTokenExpired(token: string): boolean` → base64-decode JWT payload, check `exp < Date.now() / 1000`
  - `getFreshToken(): string | null` → returns stored token if not expired, else null
  - Uses `process.env.NEXT_PUBLIC_BACKEND_URL` for API base URL
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** NC-006
- **Context:** `apps/web/lib/` for existing utility patterns
- **Files:** `apps/web/lib/auth.ts` (new)

#### NC-009 [x] Update CDPHooksProvider with custom auth
- **What:** Add `customAuth.getJwt` callback to CDPHooksProvider config so CDP uses our JWT.
- **Acceptance criteria:**
  - Import `getFreshToken` from `@/lib/auth`
  - Add to CDPHooksProvider config object: `customAuth: { getJwt: async () => getFreshToken() ?? undefined }`
  - Keep existing `projectId`, `ethereum.createOnLogin`, `ethereum.enableSpendPermissions` unchanged
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** NC-008
- **Files:** `apps/web/app/providers/cdp-provider.tsx`

#### NC-010 [x] Migrate setup page to JWT auth
- **What:** Replace CDP SMS auth hooks with our OTP + `useAuthenticateWithJWT`.
- **Acceptance criteria:**
  - Remove imports: `useSignInWithSms`, `useVerifySmsOTP` from `@coinbase/cdp-hooks`
  - Add imports: `useAuthenticateWithJWT` from `@coinbase/cdp-hooks`; `sendOtp`, `verifyOtp`, `storeToken`, `getStoredToken` from `@/lib/auth`
  - In `handleSendOtp`: replace `signInWithSms({ phoneNumber })` → `await sendOtp(phone)`
  - In `handleVerifyOtp`: replace `verifySmsOTP({ flowId, otp })` → `const token = await verifyOtp(phone, code); storeToken(token); const { user, isNewUser } = await authenticateWithJWT()`
  - Replace every `getAccessToken()` call → `getStoredToken()` (search for all occurrences)
  - Remove `flowId` state variable if it exists (no longer needed)
  - DO NOT touch wallet hooks: `useCreateSpendPermission`, `useCurrentUser`, `useIsSignedIn`, `useSignOut`
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** NC-008, NC-009
- **Files:** `apps/web/app/setup/page.tsx`

#### NC-011 [x] Migrate wallet page to JWT auth
- **What:** Same auth swap as NC-010 but on the wallet page.
- **Acceptance criteria:**
  - Remove imports: `useSignInWithSms`, `useVerifySmsOTP` from `@coinbase/cdp-hooks`
  - Add imports: `useAuthenticateWithJWT` from `@coinbase/cdp-hooks`; `sendOtp`, `verifyOtp`, `storeToken`, `getStoredToken` from `@/lib/auth`
  - In `handleSendOtp`: replace `signInWithSms({ phoneNumber })` → `await sendOtp(phone)`
  - In `handleVerifyOtp`: replace `verifySmsOTP({ flowId, otp })` → `verifyOtp()` → `storeToken()` → `authenticateWithJWT()`
  - Replace every `getAccessToken()` → `getStoredToken()`
  - Remove `flowId` state if it exists
  - DO NOT touch: `useSendUserOperation`, `useCurrentUser`, or any wallet hooks
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** NC-008, NC-009
- **Context:** `apps/web/app/setup/page.tsx` (NC-010 already done — use as reference for the exact pattern)
- **Files:** `apps/web/app/wallet/page.tsx`

#### NC-012 [x] Migrate settings page to JWT auth
- **What:** Same auth swap — most complex page (has permissions, revoke, export, send).
- **Acceptance criteria:**
  - Remove imports: `useSignInWithSms`, `useVerifySmsOTP` from `@coinbase/cdp-hooks`
  - Add imports: `useAuthenticateWithJWT` from `@coinbase/cdp-hooks`; `sendOtp`, `verifyOtp`, `storeToken`, `getStoredToken` from `@/lib/auth`
  - In `handleSendOtp`: replace `signInWithSms({ phoneNumber })` → `await sendOtp(phone)`
  - In `handleVerifyOtp`: replace `verifySmsOTP({ flowId, otp })` → `verifyOtp()` → `storeToken()` → `authenticateWithJWT()`
  - Replace every `getAccessToken()` → `getStoredToken()`
  - Remove `flowId` state if it exists
  - DO NOT touch: `useCreateSpendPermission`, `useRevokeSpendPermission`, `useExportEvmAccount`, `useSendUserOperation`, or any other wallet hooks
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** NC-008, NC-009
- **Context:** `apps/web/app/setup/page.tsx` (NC-010 already done — use as reference)
- **Files:** `apps/web/app/settings/page.tsx`

#### NC-013 [x] Add sign-out token cleanup
- **What:** On every sign-out, clear our JWT from localStorage alongside CDP `signOut()`.
- **Acceptance criteria:**
  - In each page that calls `signOut()`, add `clearToken()` from `@/lib/auth` immediately before or after
  - Affected pages: `setup/page.tsx`, `wallet/page.tsx`, `settings/page.tsx`
  - After sign-out, `getStoredToken()` must return `null`
- **Verify:** `cd apps/web && npx tsc --noEmit && grep -r "clearToken" apps/web/app/ | wc -l` shows 3+ occurrences
- **Dependencies:** NC-010, NC-011, NC-012
- **Files:** `apps/web/app/setup/page.tsx`, `apps/web/app/wallet/page.tsx`, `apps/web/app/settings/page.tsx`

#### NC-014 [x] Run tests and verify build
- **What:** Ensure backend tests pass and both apps compile after all changes.
- **Acceptance criteria:**
  - `cd apps/backend && node ace test` — all tests pass
  - `cd apps/web && npx tsc --noEmit` — no type errors
  - `cdp_auth_middleware.ts` still exists (kept as rollback, do NOT delete)
  - `ctx.cdpUser` property name unchanged across all controllers
- **Verify:** Both commands above exit 0
- **Dependencies:** NC-013
- **Constraints:** Do NOT delete `cdp_auth_middleware.ts`. Do NOT remove `@coinbase/cdp-sdk` from dependencies.
- **Files:** (read-only verification, no new files)

#### NC-015 [x] Fix OTP cleanup timer initialization
- **What:** OTP service cleanup timer was never started — memory leak risk. Created `otp_provider.ts` and registered it in `adonisrc.ts`.
- **Acceptance criteria:**
  - `apps/backend/providers/otp_provider.ts` exists with `boot()` calling `otpService.startCleanupTimer()` and `shutdown()` calling `stopCleanupTimer()`
  - Provider registered in `adonisrc.ts` providers array
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** NC-003
- **Files:** `apps/backend/providers/otp_provider.ts` (new), `apps/backend/adonisrc.ts`

---

## VPS Setup (Hetzner)

#### VPS-001 [x] Auto-setup PostgreSQL databases
- **What:** Bash script to install PostgreSQL, create databases, run migrations on VPS.
- **Acceptance criteria:**
  - Checks if PostgreSQL is installed, installs via `apt-get` if missing
  - Creates `sippy_test` and `sippy_indexer` databases if they don't exist
  - Creates postgres user with password if not present
  - Runs backend migrations against `sippy_test`
  - Prints connection strings on completion
  - Idempotent — safe to re-run without errors
- **Verify:** `bash scripts/vps-setup-db.sh` exits 0 on second run (idempotent)
- **Dependencies:** None
- **Files:** `scripts/vps-setup-db.sh` (new)

#### VPS-002 [x] Auto-generate .env files for VPS
- **What:** Bash script to generate env files for all apps on VPS.
- **Acceptance criteria:**
  - Generates `apps/backend/.env.test`, `apps/indexer/.env`, `apps/web/.env.local`
  - Accepts args: `--db-password`, `--alchemy-key`
  - Skips files that already exist unless `--force` is passed
  - Each generated file has correct DATABASE_URL for local PostgreSQL
- **Verify:** `bash scripts/vps-setup-env.sh --db-password test --alchemy-key test` creates files without error
- **Dependencies:** VPS-001
- **Files:** `scripts/vps-setup-env.sh` (new)

---

## P3 Dual Currency Display — COMPLETED

> **Goal:** All balance and transfer messages show USD + local currency equivalent, auto-detected from phone prefix.
> **Deliverable:** M1 #4

#### DC-001 [x] Create exchange rate service
#### DC-002 [x] Create dual amount formatter
#### DC-003 [x] Update balance message to show dual currency
#### DC-004 [x] Update send messages to show dual currency
#### DC-005 [x] Thread rate through webhook command handler
#### DC-006 [x] Write tests for exchange rate service

---

## P5.6 Email Recovery — COMPLETED

> **Goal:** Users can add a recovery email during setup. Email serves as 2FA for sensitive operations.
> **Deliverable:** M1 #5 (partial), M1 #6

#### ER-001 [x] Add email columns to user_preferences
#### ER-002 [x] Create email encryption helpers
#### ER-003 [x] Create email service with Resend
#### ER-004 [x] Create email auth controller endpoints
#### ER-005 [x] Add email collection to setup page
#### ER-006 [x] Add email management to settings page
#### ER-007 [x] Gate sensitive operations on email verification
#### ER-008 [x] Write tests for email service
#### ER-009 [x] Create recovery design doc
