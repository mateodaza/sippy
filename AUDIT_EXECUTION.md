# Sippy Production Audit -- Execution Plan

> Generated: March 14, 2026 | Reconciled against HEAD: March 14, 2026
> Goal: Fix all P0, P1, P2 before beta launch (50 testers by March 26)
> Status: IN PROGRESS -- All P0 + most P1/P2 implemented, pending review + staging test

## Phase 1 Scoreboard

| ID | Issue | Owner | Status | Gate |
|----|-------|-------|--------|------|
| P0-1 | `/api/send` concurrency guard (double-spend) | C | DONE | Exploitable by any user with JWT |
| P0-2 | `transferCompleted` guard on embedded send | C | DONE | User sees "failed" after money sent |
| P0-3 | `WHATSAPP_APP_SECRET` required in env schema | MC | DONE | Webhook spoofing vector |
| P0-4 | Remove `?address=` bypass on fund page | M | DONE | Fund theft via crafted link |
| P0-5 | Coinbase Onramp false success on popup close | M | DONE | Misleading success for real money |
| P0-6 | Stale `permissionsData` in revoke flow | M | DONE | Users can't revoke permissions |
| P0-7 | Replace hardcoded public Arbitrum RPC | C | DONE | All balance/send fails on RPC degradation |
| P0-8 | SH-003 fallback in `sendUSDC` daily_spent | C | DONE | Daily limit bypass for legacy rows |

**Phase 1: ALL 8 P0s DONE. Pending: review diffs, staging test, write unit tests.**

---

## HEAD Reconciliation Log

Items verified against current `main` HEAD (commit `069a407`):

| Item | Status | Notes |
|------|--------|-------|
| P0-5 (Coinbase Onramp) | **STILL OPEN** | `CoinbaseOnrampTab` at `apps/fund/app/page.tsx:321-365` still uses `generateOnRampURL` + popup-close polling. Line 272 is the LI.FI widget, not Coinbase. If a fix exists on another branch, it hasn't been merged to `main`. |
| P2-5 (createUserWallet idempotent) | **ALREADY FIXED** | `cdp_wallet.service.ts:326` already uses `cdp.evm.getOrCreateAccount`. Removing from plan. |
| All other items | **CONFIRMED OPEN** | Verified against source files. Line numbers updated where they drifted. |

---

## Legend

Each item includes:
- **Owner**: M (Mateo), C (Carlos), MC (either)
- **Depends**: items that must complete first
- **Proof**: how to verify the fix works
- **Gate**: what blocks beta if this fails

---

## Phase 1: Critical Security & Money Safety (P0)

**Timeline: Days 1-3**
Nothing ships to beta users until all P0s are green.

### Day 1: Money Safety + Webhook Security

#### P0-1: Add concurrency guard to `/api/send`
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/controllers/embedded_wallet_controller.ts:575`
- **Problem**: WhatsApp path uses `activeSends` Set; web path has nothing. Two simultaneous requests both pass `checkSecurityLimits` before either updates `daily_spent`. TOCTOU gap.
- **Fix**: Add per-user in-memory concurrency Set (matching WhatsApp pattern) to `sendFromWeb`. Reject with 429 if user already has an in-flight send. Add safety-valve timer (same as webhook: 60s).
- **Proof**: Write test that fires two concurrent POST `/api/send` from same JWT, assert only one returns `success: true` and the other returns 429.
- **Gate**: BLOCKS BETA -- exploitable by any user with a valid JWT.
- [ ] Implemented
- [ ] Test written
- [ ] Tested on staging

#### P0-2: Add `transferCompleted` guard to `handleEmbeddedSend`
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/commands/send_command.ts:228-384`
- **Problem**: The embedded send path at line 308 calls `sendToPhoneNumber` (on-chain transfer). Line 309 calls `velocityService.recordSend` outside any try/catch. If it throws, the error propagates to the outer `handleSendCommand` catch at line 209, where `transferCompleted` is still `false` (only set at line 172 in the legacy path). User gets "transfer failed" when money was already sent. Velocity limiter is also blind to the completed transfer.
- **Fix**: Add `let embeddedTransferCompleted = false` at the top of `handleEmbeddedSend`. Set `true` immediately after line 308 (`sendToPhoneNumber` success). Wrap lines 309+ in a try/catch that logs errors but returns `true` if transfer already completed. Mirror the pattern from the legacy path (lines 170-214).
- **Proof**: Unit test: mock `sendToPhoneNumber` success + `velocityService.recordSend` throw. Assert function returns `true`, not `false`.
- **Gate**: BLOCKS BETA -- user sees "failed" after money was sent; no velocity tracking.
- [ ] Implemented
- [ ] Test written
- [ ] Tested on staging

#### P0-3: Make `WHATSAPP_APP_SECRET` required in env schema
- **Owner**: MC
- **Depends**: none
- **File**: `apps/backend/start/env.ts:20`
- **Problem**: Marked `Env.schema.string.optional()`. The rate_limit_provider throws on boot if missing (good), but the schema should enforce it too. If the provider check is ever removed, webhook HMAC verification silently disappears.
- **Fix**: Change to `Env.schema.string()`. The provider boot check becomes redundant (fine, defense in depth).
- **Proof**: Remove `WHATSAPP_APP_SECRET` from `.env`, boot in production mode, confirm startup crash with clear error.
- **Gate**: BLOCKS BETA -- spoofing vector.
- [ ] Implemented
- [ ] Verified on staging

#### P0-8: Fix missing SH-003 fallback in `sendUSDC` daily_spent update
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/services/cdp_wallet.service.ts:355-359`
- **Problem**: `UPDATE phone_registry SET daily_spent = $1 ... WHERE phone_number = $3` has no `rowCount` check and no bare-digit fallback. Every other query in this file has the SH-003 fallback. For pre-backfill rows, this UPDATE silently matches 0 rows. Daily limit never increments.
- **Fix**: Add `rowCount` check + retry with `phoneNumber.slice(1)` fallback, matching the `updateLastActivity` pattern at lines 183-190.
- **Proof**: Manual test: create a bare-digit row, send USDC, verify `daily_spent` incremented.
- **Gate**: BLOCKS BETA -- daily limit bypass for legacy-format users.
- [ ] Implemented
- [ ] Tested

### Day 2: Fund Page + RPC

#### P0-4: Remove `?address=` bypass from production fund page
- **Owner**: M
- **Depends**: none
- **File**: `apps/fund/app/page.tsx:91-95`
- **Problem**: `directAddress` query param accepts any 0x address, bypassing the signed fund token. Attacker crafts `fund.sippy.lat/?address=0x<attacker>` and LI.FI routes funds there.
- **Fix**: Remove `directAddress` support. Gate behind `process.env.NODE_ENV === 'development'` if needed for testing.
- **Proof**: Visit `fund.sippy.lat/?address=0xABC...` in production, confirm 404 or redirect to error.
- **Gate**: BLOCKS BETA -- fund theft vector.
- [ ] Implemented
- [ ] Verified on production URL

#### P0-5: Fix Coinbase Onramp false success on popup close
- **Owner**: M
- **Depends**: none
- **File**: `apps/fund/app/page.tsx:321-365` (CoinbaseOnrampTab component)
- **Problem**: `setStatus('success')` fires when popup closes (line 363), regardless of purchase outcome. User sees "Purchase Complete?" with a green checkmark even if they cancelled.
- **Fix**: Replace `generateOnRampURL` + popup polling with `initOnRamp` using `onSuccess`/`onExit` callbacks from `@coinbase/cbpay-js`. If SDK limitations prevent this, change the success screen to "Checking your purchase..." and poll the user's USDC balance for confirmation.
- **Proof**: Open Coinbase popup, close it without buying. Confirm UI shows "cancelled" or neutral state, NOT success.
- **Gate**: BLOCKS BETA -- misleading success state for real money operations.
- [ ] Implemented
- [ ] Tested manually

#### P0-7: Replace hardcoded public Arbitrum RPC
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/services/cdp_wallet.service.ts:292`
- **Problem**: `new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc')` -- public endpoint with rate limits, no SLA. All balance checks and legacy sends depend on it. The embedded wallet service already uses `getRpcUrl()` from config.
- **Fix**: Replace hardcoded URL with `getRpcUrl()` (reads `ARBITRUM_RPC_URL` env var). Set up Alchemy or QuickNode account for production.
- **Proof**: Set `ARBITRUM_RPC_URL` to Alchemy endpoint, call `getUserBalance`, confirm it uses the paid provider (check Alchemy dashboard for the request).
- **Gate**: BLOCKS BETA -- balance queries fail under any RPC degradation.
- [ ] Implemented
- [ ] Alchemy/QuickNode account created
- [ ] Env var set on Railway

### Day 3: Frontend State + Session + OTP Language

#### P0-6: Fix stale `permissionsData` after refetch in revoke flow
- **Owner**: M
- **Depends**: none
- **File**: `apps/web/app/settings/page.tsx:419-426`
- **Problem**: After `await refetchPermissions()`, `permissionsData` is the stale closure value. The `.find()` searches pre-refetch data. If permission was just created, it won't be found and revoke throws "No active Sippy permission found."
- **Fix**: Add a short delay + re-read, or move the find logic into a `useEffect` triggered by `permissionsData` changes, or poll `permissionsData` until it reflects the expected state (with timeout).
- **Proof**: Create a spend permission in setup, navigate to settings, immediately revoke. Confirm it succeeds without "No active permission" error.
- **Gate**: BLOCKS BETA -- users can't revoke permissions they just created.
- [ ] Implemented
- [ ] Tested end-to-end

#### P1-SESSION: Fix session not persisting across setup -> wallet navigation
- **Owner**: M
- **Depends**: none
- **Files**: `apps/web/lib/useSessionGuard.ts`, `apps/web/app/setup/page.tsx`, `apps/web/app/wallet/page.tsx`
- **Problem**: After completing setup, navigating to `/wallet` prompts for a new OTP. The JWT is stored in localStorage (setup/page.tsx:301 calls `storeToken`), and `useSessionGuard` reads it (line 59 calls `getStoredToken`). But `useSessionGuard` at line 87 checks CDP's `isSignedIn` state, which is React hook state that doesn't persist across page navigation. When the wallet page loads, CDP hooks haven't settled yet, so `isSignedIn` is `false`, and the guard drops the user into unauthenticated state despite having a valid JWT.
- **Fix**: When `useSessionGuard` finds a valid JWT in localStorage but CDP `isSignedIn` is false, it should call `authenticateWithJWT()` to re-establish the CDP session from the stored token before declaring the user unauthenticated.
- **Proof**: Complete setup, navigate to `/wallet`, confirm wallet loads without OTP prompt.
- **Gate**: BLOCKS BETA -- every user hits this on first use.
- [ ] Implemented
- [ ] Tested end-to-end

#### P1-OTP-LANG: Fix OTP messages not picking the right language
- **Owner**: MC
- **Depends**: none
- **Files**: `apps/backend/app/services/otp_service.ts`, `apps/backend/app/controllers/embedded_wallet_controller.ts`
- **Problem**: OTP messages arrive in the wrong language. The `sendOtp` method at line 70 calls `this.resolveLanguage(phone, lang)` but the `lang` param from the controller may not be passed correctly, or the resolution logic isn't reading `user_preferences` properly for the first OTP (when the user hasn't set a preference yet).
- **Fix**: Trace the `lang` parameter from the controller through to OTP send. Ensure `resolveLanguage` falls back to phone-based detection (country code -> language) when no stored preference exists. Verify the controller passes `lang` from the request or detects it.
- **Proof**: Colombian number (+57): OTP arrives in Spanish. Brazilian number (+55): Portuguese. US number (+1): English.
- **Gate**: Bad first impression for beta testers.
- [ ] Implemented
- [ ] Tested with +57, +55, +1 numbers

---

## Phase 2: User Experience & Reliability (P1)

**Timeline: Days 4-7**
Confusing UX, silent failures, or security gaps that matter under load.

### Day 4: Webhook + LLM + Auth + Setup

#### P1-1: Move `markProcessed` to `finally` block
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/controllers/webhook_controller.ts:642`
- **Problem**: If `sendTextMessage` throws after successful transfer, message is never marked processed. Meta retries indefinitely. User paid but never got success notification, and now gets repeated retry attempts.
- **Fix**: Wrap the async processing block in try/finally. Call `rateLimitService.markProcessed(messageId)` in `finally`.
- **Proof**: Mock `sendTextMessage` throw after successful transfer. Verify message is still marked processed and Meta doesn't retry.
- [ ] Implemented
- [ ] Test written

#### P1-2: Strip `<think>` tags before JSON.parse in LLM classifier
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/services/llm.service.ts:281-283`
- **Problem**: Qwen3-32b can emit `<think>...</think>` before its JSON response. `JSON.parse(content)` throws, returns `null`, user gets "unknown command." The sanitizer strips think tags from outbound messages but not from the classifier's inbound parsing.
- **Fix**: Add `content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()` before `JSON.parse(content)` at line 283.
- **Proof**: Existing test in `llm_live.spec.ts` ("Qwen classifies cuanto tengo") already covers this. Also add a unit test with a think-prefixed JSON string.
- [ ] Implemented
- [ ] Test passes

#### P1-3: Replace `Math.random()` with `crypto.randomInt()` for OTP
- **Owner**: MC
- **Depends**: none
- **File**: `apps/backend/app/services/otp_service.ts:59`
- **Fix**: `import { randomInt } from 'node:crypto'` then `const code = String(randomInt(0, 1_000_000)).padStart(6, '0')`. The email service at `email_service.ts:67` already uses `crypto.randomInt` -- match it.
- **Proof**: Generate 100 OTPs, confirm they're 6-digit strings. (Correctness is guaranteed by Node.js crypto module.)
- [ ] Implemented

#### P1-4: Block progress on wallet registration failure during setup
- **Owner**: M
- **Depends**: none
- **File**: `apps/web/app/setup/page.tsx:324-343`
- **Problem**: Backend registration failure only triggers `console.warn`. User completes setup, tries WhatsApp, gets "wallet not found" with no explanation.
- **Fix**: If `response.ok` is false (line 336) or the fetch throws (line 340), show an error toast/banner and don't advance to the email step. Add a retry button.
- **Proof**: Block the `/api/register-wallet` endpoint (return 500), complete OTP, confirm error is shown and user stays on current step.
- [ ] Implemented
- [ ] Tested

### Day 5: Error Visibility

#### P1-5: Add logging to `fetchRateContext` catch block
- **Owner**: MC
- **Depends**: none
- **File**: `apps/backend/app/controllers/webhook_controller.ts:138-140`
- **Fix**: Replace empty `catch {}` with `catch (err) { logger.warn('fetchRateContext failed (falling back to USD): %o', err) }`.
- [ ] Implemented

#### P1-9: Add logging + UI fallback to LI.FI fund notification
- **Owner**: M
- **Depends**: none
- **File**: `apps/fund/app/page.tsx:136-141`
- **Fix**: Replace `.catch(() => {})` with `.catch((err) => console.error('Fund notification failed:', err))`. Show a UI banner after LI.FI route completion: "Funds sent! If you don't receive a WhatsApp notification, check your balance."
- [ ] Implemented

#### P1-13: Replace `console.error` with `logger.error` (4 locations)
- **Owner**: MC
- **Depends**: none
- **Files**: `exchange_rate_service.ts:117`, `otp_service.ts:123`, `email_service.ts:159`, `webhook_controller.ts:80`
- **Fix**: Import and use `@adonisjs/core/services/logger` in each file. This ensures errors appear in structured logs and PostHog.
- [ ] Implemented (all 4)

### Day 6: Infrastructure

#### P1-6: Add periodic GasRefuel balance monitoring
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/app/services/refuel.service.ts`
- **Problem**: Checks balance once at boot (line 72-89), never again. When contract drains mid-operation, all new user sends silently fail with generic error messages.
- **Fix**: Add a `setInterval` check (every 30 min). When balance < threshold, log at `error` level and send a PostHog event. Optionally send a WhatsApp alert to admin phone.
- **Proof**: Set threshold to a high value (e.g., 10 ETH), confirm alert fires within 30 min of boot.
- [ ] Implemented
- [ ] Alert verified

#### P1-7: Enable CSP
- **Owner**: MC
- **Depends**: none
- **File**: `apps/backend/config/shield.ts:9`
- **Fix**: Set `csp: { enabled: true }` with directives allowing `self`, CDN origins, and any embedded widget origins (LI.FI, Coinbase). Test that admin dashboard still renders.
- [ ] Implemented
- [ ] Admin dashboard verified

#### P1-8: Fix SSL cert verification on production DB
- **Owner**: C
- **Depends**: none
- **File**: `apps/backend/config/database.ts:5`
- **Problem**: `ssl: { rejectUnauthorized: false }` disables certificate verification. MITM risk on the Railway internal network.
- **Fix**: Check if Railway provides a CA certificate. If yes, use it. If not, Railway's internal networking may justify `rejectUnauthorized: false` -- document the risk decision explicitly in a code comment.
- [ ] Investigated
- [ ] Decision documented or fixed

### Day 7: Frontend Security

#### P1-10: Clear private key from React state after copy
- **Owner**: M
- **Depends**: none
- **File**: `apps/web/app/settings/page.tsx:554`
- **Fix**: After `hasCopied` is set to true, call `setExportedKey(null)` after a short delay (2 seconds to let the user see the confirmation). Or reduce the 5-minute window to 30 seconds with auto-clear.
- [ ] Implemented

#### P1-11: Lock phone number during re-auth overlay
- **Owner**: M
- **Depends**: none
- **File**: `apps/web/app/wallet/page.tsx:448-455`
- **Fix**: When re-auth overlay appears, pre-fill the phone input with the phone from the current session (from the expired JWT payload or from a stored value). Disable the input so the user can't change it.
- [ ] Implemented

---

## Phase 3: Tech Debt & Hardening (P2)

**Timeline: Days 8-12 (before beta), remainder before public launch June 5**

### Days 8-9: Data Integrity + Mobile UX

| ID | Item | Owner | Fix | Proof |
|----|------|-------|-----|-------|
| P2-1 | SH-003 backfill + remove dual-format code | C | Run backfill migration, verify 0 bare-digit rows, delete 12+ compat instances in one PR | Query: `SELECT count(*) FROM phone_registry WHERE phone_number NOT LIKE '+%'` returns 0 |
| P2-3 | Persist `pendingTransactions` to DB | C | Store pending txs in DB table with TTL column. Clean expired on interval | Server restart between "send 100" and "yes" -> pending tx survives |
| P2-17 | Persist `isPaused` flag to DB | C | Read/write pause from DB. Check on boot | Pause, restart, confirm still paused |
| P2-7 | Add viewport meta tag | M | `export const viewport = { width: 'device-width', initialScale: 1 }` in both layouts | Mobile Safari renders correctly |
| P2-8 | Fix OTP input keyboard on mobile | M | Add `inputMode="numeric"` to all 5 OTP inputs | Android shows number pad |

### Days 9-10: Rate Limiting + API Updates

| ID | Item | Owner | Fix | Proof |
|----|------|-------|-----|-------|
| P2-6 | Update WhatsApp API version to v21.0 | MC | Move to env var `WHATSAPP_API_VERSION`, default `v21.0` | Messages still send on v21.0 |
| P2-10 | Add auth to `/resolve-address` | C | Require JWT or API key | Unauthenticated request returns 401 |
| P2-15 | Remove `localhost:3001` fallback in server routes | M | Throw descriptive config error if `NEXT_PUBLIC_BACKEND_URL` is missing | Boot without env var, confirm clear error |
| P2-9 | Dynamic `html lang` attribute | M | `useEffect` sets `document.documentElement.lang` from detected language | Screen reader announces Spanish content correctly |
| P2-12 | Add timeouts to CDP SDK calls | C | Wrap in `Promise.race` with 30s timeout (matching LLM pattern) | Simulate hung CDP call, confirm timeout fires |

### Days 11-12: Ops + Remaining

| ID | Item | Owner | Fix | Proof |
|----|------|-------|-----|-------|
| P2-16 | Use `toAmount` not `toAmountMin` for LI.FI notification | M | Change line 135 in fund page | Notification shows actual amount, not slippage-adjusted minimum |
| P2-14 | Scrub phone numbers from production logs | MC | Mask to last 4 digits in log statements | Grep prod logs, confirm no full phone numbers |
| P2-18 | Add Railway health check config | C | Create `railway.toml` for backend/web with health check paths | Railway dashboard shows health checks passing |
| P2-19 | Add bounds to GasRefuel admin setters | C | `require(_refuelAmount <= 0.01 ether)` style guards | Attempt to set refuelAmount to 1 ETH, confirm revert |

### Test Suite (Parallel Track -- any day)

| ID | Item | Owner | Fix | Proof |
|----|------|-------|-----|-------|
| TEST-1 | Move `llm_live.spec.ts` out of `tests/unit/` | MC | Move to `scripts/` or `tests/integration/`. Remove `process.exit()` calls | `pnpm test` runs without EADDRINUSE |
| TEST-2 | Set `PORT=0` in `.env.test` | MC | Change from `PORT=3333` to `PORT=0` | No port collisions on parallel test runs |
| TEST-3 | Add `send_command.ts` unit tests | C | Cover: balance, limits, velocity, `transferCompleted` flag | Tests pass, cover all guard branches |
| TEST-4 | Add `start_command.ts` branch tests | C | Cover: 4 onboarding branches | Tests pass |
| TEST-5 | Add `notification.service.ts` tests | MC | Cover: template payload, phone masking | Tests pass |
| TEST-6 | Gate live LLM tests | MC | `GROQ_LIVE_TESTS=true` env var gate, `pnpm test:llm` script | `pnpm test` skips LLM tests; `pnpm test:llm` runs them |

### After Beta, Before Public Launch (April-May)

| ID | Item | Notes |
|----|------|-------|
| P2-2 | Redis-backed rate limiting | All in-memory rate limits reset on deploy. Fine for 50 users, not for public launch |
| P2-4 | Persistent LLM rate limiter | Daily quota can be re-spent after crash |
| P2-11 | httpOnly cookie for JWT | Larger refactor: requires backend cookie-setting changes |

---

## Execution Order Summary

```
Day 1:  P0-1, P0-2, P0-3, P0-8         (money safety + webhook security)
Day 2:  P0-4, P0-5, P0-7               (fund page + RPC)
Day 3:  P0-6, P1-SESSION, P1-OTP-LANG  (frontend state + session + language)
Day 4:  P1-1, P1-2, P1-3, P1-4         (webhook + LLM + auth + setup)
Day 5:  P1-5, P1-9, P1-13              (error visibility -- fast batch)
Day 6:  P1-6, P1-7, P1-8               (infrastructure)
Day 7:  P1-10, P1-11                    (frontend security)
Day 8:  P2-1, P2-3, P2-17, P2-7, P2-8  (data + mobile UX)
Day 9:  P2-6, P2-10, P2-15, P2-9       (API + config)
Day 10: P2-12, P2-16, P2-14            (timeouts + ops)
Day 11: P2-18, P2-19                    (railway + contract)
Day 12: Buffer / catch-up               (anything that slipped)
```

TEST-1 through TEST-6 run as a parallel track on any day with spare capacity.

---

## Validation Checklist (Before Beta Sign-Off)

All must be green before inviting the first tester:

**Money Safety**
- [ ] Cannot double-send via concurrent web + WhatsApp requests
- [ ] Embedded send returns `true` even if post-transfer operations throw
- [ ] Daily spend limit increments correctly for all phone formats (canonical + bare-digit)
- [ ] Cannot route funds to arbitrary address via `?address=` param

**Security**
- [ ] Cannot spoof webhook messages without valid HMAC
- [ ] `WHATSAPP_APP_SECRET` is required, not optional
- [ ] Balance queries use paid RPC provider (not public endpoint)

**UX**
- [ ] Coinbase Onramp does not show false success on popup close
- [ ] Revoke flow works after fresh permission creation
- [ ] Session persists from setup to wallet without re-OTP
- [ ] OTP messages arrive in user's detected language (ES for +57, PT for +55, EN for +1)
- [ ] Setup blocks on wallet registration failure (error shown, no silent continue)

**Infrastructure**
- [ ] GasRefuel balance is monitored with periodic alerts
- [ ] `markProcessed` runs even when notification fails
- [ ] `<think>` tags don't break LLM classifier

**Mobile**
- [ ] OTP inputs show numeric keyboard on Android
- [ ] Viewport meta tag renders correctly on iOS Safari and Android Chrome
