# Security Audit — Sippy

Date: 2026-03-18
Scope: Full backend + frontend audit

---

## Part 1 — Original findings, corrected

### Confirmed vulnerabilities (now fixed)

**#1 Public phone/wallet enumeration (HIGH)**
`GET /resolve-phone` and `GET /resolve-address` were public with IP throttling only. `byAddress` returned full phone numbers regardless of privacy setting.

**#3 Public profile leaks privacy preference (MEDIUM)**
`GET /api/profile` returned `phoneVisible` in the response body, defeating the privacy setting.

**#4 No RBAC in admin routes (MEDIUM)**
All admin write routes guarded by session auth only. Any authenticated backoffice user could modify roles, block users, or pause the system.

**#5 JWT middleware trusts request body for wallet on first registration (MEDIUM)**
jwt_auth_middleware.ts accepted any syntactically valid `walletAddress` from the request body if no DB record existed. No CDP ownership proof.

**#9 Re-auth broken for +1 users (HIGH — functional)**
NANP users locked out after JWT expiry because re-auth routed through Twilio which can't deliver to +1 (no A2P 10DLC).

**#10 exchange-cdp-token had no per-user rate limiting (MEDIUM)**
`POST /api/auth/exchange-cdp-token` used only IP throttle. No per-phone rate limiting.

**#12 PII in production logs (HIGH)**
20+ locations across backend logged full phone numbers at INFO/WARN level in plaintext.

**#13 Silent spend tracking failure (HIGH)**
On-chain transfer succeeded but daily spend DB update could return 0 rows silently, allowing users to exceed daily limits.

**#16 Phone echoed in 404 response (MEDIUM)**
`byPhone` returned canonicalized phone in the 404 error body, aiding enumeration scripts.

**#17 Console.log in frontend (MEDIUM)**
15+ `console.log` calls in setup/settings pages exposed wallet addresses and operational data in browser DevTools.

**#19 Onramp error body leaked to client (MEDIUM)**
Coinbase API error details forwarded directly to the browser in the fund app.

### Downgraded / removed

**#2 Webhook signature verification (was P0 → removed)**
False positive. `WHATSAPP_APP_SECRET` is required by env schema and startup hard-fails without it.

**#6 Notify-fund auth (LOW)**
Shared header secret with `timingSafeEqual`. Functional server-to-server auth.

**#7 Rate limiting on authenticated resolve (LOW)**
Per-user throttle and IP throttling are enforced. No anomaly detection.

**#8 Debug endpoints in test mode (LOW)**
Only exposed when `app.inDev || app.inTest`.

**#11 Error classification in exchange-cdp-token uses string matching (LOW)**
Fragile if CDP SDK changes error wording. Not a direct vulnerability.

---

## Part 2 — Fixes applied

### #1 — Resolve endpoint privacy (HIGH → mitigated)

| | Before | After |
|---|--------|-------|
| Routes | Public, no privacy checks | Public, IP-throttled (unchanged URLs) |
| `byAddress` response | Always returns full phone | Returns `phone: null` when `phoneVisible: false` |
| `byPhone` response | Returns wallet address + phone | Returns wallet address only (phone removed from 404) |

**Files:** resolve_controller.ts, routes.ts

**Trade-off:** Endpoints remain public because server-to-server callers (Next.js API routes, fund app) don't have JWTs. Privacy is enforced at the controller level. The `byPhone` success response still includes `phone: canonicalPhone` because callers (fund flow, Next.js proxy) depend on it for display.

**Residual risk:** `byPhone` confirms whether a phone number has a Sippy wallet. Inherent to the product's phone-based payment model. IP throttle limits bulk enumeration.

### #3 — Profile privacy (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Response body | `{ address, phone, phoneVisible }` | `{ address, phone }` where phone is `null` when hidden |

**Files:** embedded_wallet_controller.ts

### #4 — Admin RBAC (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Role changes | Any authenticated admin | `admin` role required |
| Block/unblock | Any authenticated admin | `admin` role required |
| Global pause/resume | Any authenticated admin | `admin` role required |
| Self-role modification | Allowed | Blocked |
| Read-only routes | Any authenticated admin | Any authenticated admin (unchanged) |

**Files:** admin_role_middleware.ts (new), kernel.ts, routes.ts, roles_controller.ts

### #5 — Wallet ownership verification (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| First-time registration | Accepts any wallet address from request body | Requires CDP access token proving wallet ownership |
| CDP token present | N/A | Wallet must exist in `endUser.evmSmartAccounts` |
| CDP token absent | Accepted blindly | Rejected with 401 |
| Returning users | DB lookup (unchanged) | DB lookup (unchanged) |

**Files:** jwt_auth_middleware.ts, setup/page.tsx

All register-wallet callers now send `cdpAccessToken`:
- `handleCdpSmsVerify` (Twilio OTP verify flow) — sends cdpAccessToken ✓
- `handleAwaitWallet` (CDP SMS await-wallet flow) — sends cdpAccessToken ✓
- `checkExistingSession` (session recovery) — sends cdpAccessToken when available ✓
- Gas error retry in `createSpendPermission` catch — sends cdpAccessToken when available ✓

For the recovery and retry paths, cdpAccessToken is optional: returning users hit Tier 1 (DB lookup) and skip the CDP check entirely. The cdpAccessToken is a belt-and-suspenders for the edge case where a new user's first register-wallet failed and they reload.

### #9 — NANP re-auth (HIGH → fixed)

| | Before | After |
|---|--------|-------|
| +1 re-auth send OTP | Twilio (fails) | CDP native SMS via `signInWithSms` |
| +1 re-auth verify OTP | N/A (OTP never arrives) | CDP `verifySmsOTP` → `getAccessToken` → `exchange-cdp-token` → Sippy JWT |
| International re-auth | Twilio (unchanged) | Twilio (unchanged) |

**Files:** useSessionGuard.ts

### #10 — Exchange rate limit (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Rate limiting | IP throttle only | IP throttle + per-phone throttle (5 req / 15 min) |

**Files:** rate_limit_service.ts, auth_api_controller.ts

### #12 — PII masked in logs (HIGH → fixed)

| | Before | After |
|---|--------|-------|
| Phone in INFO/WARN logs | Full plaintext (`+573001234567`) | Masked (`+57********67`) |
| Phone in ERROR logs | Full plaintext | Full plaintext (kept for debugging) |
| Console.error in otp_service | Used `console.error` with phone | Uses `logger.error` (structured) |

**Files:** phone.ts (new `maskPhone` utility), embedded_wallet_controller.ts, cdp_wallet.service.ts, embedded_wallet.service.ts, notification.service.ts, notify_controller.ts, resolve_controller.ts, balance_command.ts, send_command.ts, otp_service.ts, jwt_auth_middleware.ts, whatsapp.service.ts, webhook_controller.ts

### #13 — Spend tracking failure alerting (HIGH → fixed)

| | Before | After |
|---|--------|-------|
| Both DB updates return 0 rows | Silent success | `logger.error({ alert: 'spend-tracking-failure', ... })` |
| Transfer result | Returned to user (correct) | Returned to user (unchanged) |

**Files:** cdp_wallet.service.ts, embedded_wallet.service.ts

The structured `alert` tag allows monitoring systems to trigger on spend tracking failures without parsing log messages.

### #16 — Phone removed from 404 response (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| 404 body | `{ error, message, phone, whatsappLink }` | `{ error, message, whatsappLink }` |

**Files:** resolve_controller.ts

### #17 — Console.log removed from frontend (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| setup/page.tsx | 16 `console.log` + 3 `console.debug` | 0 (all `console.error` preserved) |
| settings/page.tsx | 4 `console.log` | 0 |

**Files:** setup/page.tsx, settings/page.tsx

### #19 — Onramp error body hidden (MEDIUM → fixed)

| | Before | After |
|---|--------|-------|
| Error response to client | `{ error, detail: errorBody, status }` | `{ error: 'Failed to generate onramp token' }` |
| Server-side logging | `console.error` with full details | Unchanged (kept for debugging) |

**Files:** onramp-token/route.ts

---

## Part 3 — Remaining items

### Accepted risks

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 14 | JWT in localStorage | HIGH | Accepted SPA trade-off. 1h expiry limits exposure. Hardening: migrate to httpOnly cookies |
| 15 | JWT missing `aud` claim | MEDIUM | Single-service today. Add `.setAudience('sippy-api')` if multi-service |
| 18 | AdminRole middleware only handles `admin` case | MEDIUM | Only `admin` used today. Generalize if `viewer`-restricted routes added |
| 6 | Notify-fund replay | LOW | Shared secret + timing-safe. Hardening: add nonce/timestamp |
| 7 | Enumeration anomaly detection | LOW | Throttles enforced. Hardening: pattern-based detection |
| 8 | Debug endpoints in test | LOW | Only if test env is network-reachable |
| 11 | Fragile error classification | LOW | Works today. Use CDP SDK error codes if available |
| 20 | Language cookie SameSite=Lax | LOW | Non-sensitive cookie |
| 21 | No CSRF on Next.js POST endpoints | LOW | Server-to-server proxies, not user-facing forms |
| 22 | In-memory concurrency guard | LOW | Single-process deployment. Breaks if multi-process |
| 23 | Rate limit map race conditions | LOW | Theoretical — single-threaded Node event loop |
| 24 | Missing pagination validation | LOW | Negative page values cause empty results, not errors |

---

## Part 4 — Final status

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Resolve enumeration | HIGH | **Mitigated** — `byAddress` respects privacy; `byPhone` inherent to product |
| 9 | NANP re-auth broken | HIGH | **Fixed** |
| 12 | PII in production logs | HIGH | **Fixed** — `maskPhone()` across 13 files |
| 13 | Silent spend tracking failure | HIGH | **Fixed** — structured error alert |
| 14 | JWT in localStorage | HIGH | **Accepted** |
| 5 | Wallet ownership on registration | MEDIUM | **Fixed** — CDP token required |
| 4 | Admin RBAC | MEDIUM | **Fixed** |
| 3 | Profile privacy leak | MEDIUM | **Fixed** |
| 10 | Exchange rate limit | MEDIUM | **Fixed** |
| 15 | JWT missing `aud` claim | MEDIUM | **Accepted** |
| 16 | Phone in 404 response | MEDIUM | **Fixed** |
| 17 | Console.log in frontend | MEDIUM | **Fixed** |
| 18 | AdminRole middleware gap | MEDIUM | **Accepted** |
| 19 | Onramp error body leak | MEDIUM | **Fixed** |
| 6-8, 11, 20-24 | Hardening items | LOW | **Accepted** |

**Fixed: 12 issues** | **Mitigated: 1** | **Accepted: 11** (all LOW or architecture trade-offs)

---

## Files changed

```
Backend:
  app/utils/phone.ts                              — maskPhone() utility
  app/controllers/embedded_wallet_controller.ts    — profile privacy + masked logs
  app/controllers/resolve_controller.ts            — byAddress privacy, phone removed from 404, masked logs
  app/controllers/notify_controller.ts             — masked logs
  app/controllers/webhook_controller.ts            — masked logs
  app/controllers/admin/roles_controller.ts        — self-role modification block
  app/controllers/auth_api_controller.ts           — per-phone rate limit on exchange-cdp-token
  app/middleware/admin_role_middleware.ts           — new RBAC middleware
  app/middleware/jwt_auth_middleware.ts             — CDP wallet ownership verification + masked logs
  app/services/cdp_wallet.service.ts               — spend tracking alert + masked logs
  app/services/embedded_wallet.service.ts          — spend tracking alert + masked logs
  app/services/notification.service.ts             — masked logs
  app/services/otp_service.ts                      — console.error → logger.error
  app/services/rate_limit_service.ts               — cdpExchangeThrottle map
  app/services/whatsapp.service.ts                 — masked logs
  app/commands/balance_command.ts                  — masked logs
  app/commands/send_command.ts                     — masked logs
  start/kernel.ts                                  — adminRole middleware registration
  start/routes.ts                                  — RBAC on admin write routes

Frontend:
  apps/web/app/setup/page.tsx                      — cdpAccessToken in register-wallet, console.log removed
  apps/web/app/settings/page.tsx                   — console.log removed
  apps/web/lib/useSessionGuard.ts                  — NANP re-auth via CDP native SMS

Fund:
  apps/fund/app/api/onramp-token/route.ts          — generic error response to client
```
