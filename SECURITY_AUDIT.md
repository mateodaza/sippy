# Security Audit — Post OTP Fallback Implementation

Date: 2026-03-17

## Original findings, corrected

### Confirmed vulnerabilities

**#1 Public phone/wallet enumeration (HIGH)**
`GET /resolve-phone` and `GET /resolve-address` are public with IP throttling only. Returns exact phone↔wallet mappings. Anyone can enumerate the user base.

**#3 Public profile leaks privacy preference (MEDIUM)**
`GET /api/profile` is public and returned `phoneVisible` in the response, defeating the privacy setting.

**#4 No RBAC in admin routes (MEDIUM)**
All admin routes guarded by session auth only. Any authenticated backoffice user could hit `PUT /roles/:id`, `POST /pause`, `POST /resume`. Self-elevation risk is limited (only admin/viewer roles exist), but the authorization gap was real.

**#5 JWT middleware trusts request body for wallet on first registration (MEDIUM)**
jwt_auth_middleware.ts accepted any syntactically valid `walletAddress` from the request body if no DB record existed. No CDP ownership proof on that path.

### Downgraded / removed

**#2 Webhook signature verification (was P0 → removed)**
False positive. `WHATSAPP_APP_SECRET` is required by env schema (env.ts:16) and startup hard-fails without it (rate_limit_provider.ts:19). The `if (appSecret)` branch in webhook_controller.ts is dead code in practice — not an active vulnerability.

**#6 Notify-fund auth (was MEDIUM → LOW)**
Uses shared header secret with `timingSafeEqual`. Not unauthenticated. Replay protection and rotation would harden it, but functional server-to-server auth. Not broken.

**#7 Rate limiting on authenticated resolve (was MEDIUM → LOW)**
Per-user throttle exists in embedded_wallet_controller.ts backed by rate_limit_service.ts. IP throttling on public resolver. Limits are enforced. Fair criticism: no anomaly detection or exponential backoff on enumeration patterns.

**#8 Debug endpoints in test mode (LOW)**
True but operational. Only matters if a test environment is network-reachable.

### New findings from OTP fallback implementation

**#9 Re-auth was broken for +1 users (HIGH — functional)**
When a NANP user's JWT expired, `useSessionGuard` triggered re-auth via `POST /api/auth/send-otp`, which always sent via Twilio. Twilio cannot deliver to +1 numbers (no A2P 10DLC) — so +1 users were locked out after JWT expiry.

**#10 exchange-cdp-token had no per-user rate limiting (MEDIUM)**
`POST /api/auth/exchange-cdp-token` used only IP throttle. No per-phone rate limiting after extracting identity from the CDP token.

**#11 Error classification in exchange-cdp-token uses string matching (LOW)**
Auth failure detection relies on substring matching against error messages. Fragile if CDP SDK changes error wording. Not a direct vulnerability.

---

## Fixes applied

### #1 — Resolve endpoint privacy (HIGH → mitigated)

| | Before | After |
|---|--------|-------|
| Routes | Public, no privacy checks | Public, IP-throttled (unchanged URLs) |
| `byAddress` response | Always returns full phone | Returns `phone: null` when user set `phoneVisible: false` |
| `byPhone` response | Returns wallet address | Unchanged (wallet addresses are public on-chain) |

**Files:** resolve_controller.ts, routes.ts

**Trade-off:** Endpoints remain public because server-to-server callers (Next.js API routes, fund app) don't have JWTs. Privacy is enforced at the controller level instead. Users who set `phoneVisible: false` are protected from reverse lookup. Users who haven't changed the default remain discoverable — this matches the product's phone-based payment model.

**Residual risk:** `byPhone` still confirms whether a phone number has a Sippy wallet. This is inherent to the product's design (send USDC to a phone number). IP throttle (10 req/min) limits bulk enumeration.

---

### #3 — Profile privacy (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Response body | `{ address, phone, phoneVisible }` | `{ address, phone }` where phone is `null` when hidden |

**Files:** embedded_wallet_controller.ts

The `phoneVisible` preference is no longer leaked. Phone is masked when the user opted out. Public profile pages still load (endpoint remains public at `/api/profile`).

---

### #4 — Admin RBAC (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Role changes | Any authenticated admin | `admin` role required |
| Block/unblock | Any authenticated admin | `admin` role required |
| Global pause/resume | Any authenticated admin | `admin` role required |
| Self-role modification | Allowed | Blocked |
| Read-only routes | Any authenticated admin | Any authenticated admin (unchanged) |

**Files:** admin_role_middleware.ts (new), kernel.ts, routes.ts, roles_controller.ts

New `adminRole` middleware checks `user.role` before allowing write operations. Viewers can see dashboards, users, analytics, and roles — but cannot modify anything. Admins cannot change their own role.

---

### #5 — Wallet ownership verification (MEDIUM → partially fixed)

| | Before | After |
|---|--------|-------|
| First-time registration | Accepts any wallet address from request body | Validates wallet via CDP access token when provided |
| CDP token present | N/A | Wallet must exist in `endUser.evmSmartAccounts` |
| CDP token absent | Accepted blindly | Accepted with warning log |
| Returning users | DB lookup (unchanged) | DB lookup (unchanged) |

**Files:** jwt_auth_middleware.ts, setup/page.tsx

**Why graceful, not strict:** The frontend sends `cdpAccessToken` alongside `walletAddress` for first-time registration. However, `getAccessToken()` from `@coinbase/cdp-hooks` may not return a usable token after `authenticateWithJWT()` (custom JWT auth) — only confirmed to work after CDP native SMS auth (`verifySmsOTP`). Making the check mandatory could break international (Twilio) user onboarding.

**Current behavior:**
- CDP token provided + wallet matches → allowed (verified)
- CDP token provided + wallet doesn't match → rejected (401)
- CDP token provided + validation fails → rejected (401)
- CDP token absent → allowed with warning log (unverified, old behavior)

**Hardening path:** Test `getAccessToken()` after `authenticateWithJWT()` in both NANP and international flows. If it returns a valid token in both cases, change the `else` branch from warn-and-allow to reject. The warning logs will show how often registrations happen without CDP proof — if the count is zero, it's safe to make the check mandatory.

---

### #9 — NANP re-auth (HIGH → fixed)

| | Before | After |
|---|--------|-------|
| +1 re-auth send OTP | Twilio (fails — no A2P 10DLC) | CDP native SMS via `signInWithSms` |
| +1 re-auth verify OTP | N/A (OTP never arrives) | CDP `verifySmsOTP` → `getAccessToken` → `exchange-cdp-token` → Sippy JWT |
| International re-auth | Twilio (unchanged) | Twilio (unchanged) |

**Files:** useSessionGuard.ts

Re-auth now detects NANP phones via `isNANP()` and routes through CDP native SMS instead of the Twilio backend. The `exchange-cdp-token` endpoint converts the CDP access token into a Sippy JWT. Both flows converge at `storeToken` → `authenticateWithJWT()` → session restored.

---

### #10 — Exchange rate limit (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Rate limiting | IP throttle only | IP throttle + per-phone throttle (5 req / 15 min) |

**Files:** rate_limit_service.ts, auth_api_controller.ts

New `cdpExchangeThrottle` map in rate limit service. After extracting and canonicalizing the phone from the CDP token, the endpoint checks the per-phone limit before issuing a Sippy JWT. Returns 429 with `Retry-After` header when exceeded.

---

## Final status

| # | Issue | Severity | Status | Residual risk |
|---|-------|----------|--------|---------------|
| 1 | Resolve endpoint enumeration | HIGH | Mitigated | `byPhone` still confirms user existence; `byAddress` respects `phoneVisible` |
| 9 | NANP re-auth broken | HIGH | Fixed | None |
| 5 | Wallet ownership on registration | MEDIUM | Partially fixed | Graceful mode: logs but allows unverified registrations. Needs testing to harden |
| 4 | Admin RBAC | MEDIUM | Fixed | None |
| 3 | Profile privacy leak | MEDIUM | Fixed | None |
| 10 | Exchange rate limit | MEDIUM | Fixed | None |
| 6 | Notify-fund replay | LOW | Accepted | Shared secret with timing-safe compare. Hardening: add nonce/timestamp |
| 7 | Enumeration anomaly detection | LOW | Accepted | Throttles enforced. Hardening: pattern-based detection |
| 11 | Fragile error classification | LOW | Accepted | Works today. Hardening: use CDP SDK error codes if available |
| 8 | Debug endpoints in test | LOW | Accepted | Only if test env is network-reachable |

## Files changed

```
apps/backend/app/controllers/admin/roles_controller.ts    — self-role modification block
apps/backend/app/controllers/auth_api_controller.ts       — per-phone rate limit on exchange-cdp-token
apps/backend/app/controllers/embedded_wallet_controller.ts — profile privacy fix
apps/backend/app/controllers/resolve_controller.ts        — byAddress phoneVisible check
apps/backend/app/middleware/admin_role_middleware.ts       — new RBAC middleware
apps/backend/app/middleware/jwt_auth_middleware.ts         — CDP wallet ownership verification
apps/backend/app/services/rate_limit_service.ts           — cdpExchangeThrottle map
apps/backend/start/kernel.ts                              — adminRole middleware registration
apps/backend/start/routes.ts                              — RBAC on admin write routes
apps/web/app/setup/page.tsx                               — send cdpAccessToken with register-wallet
apps/web/lib/useSessionGuard.ts                           — NANP re-auth via CDP native SMS
```
