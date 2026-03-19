# Onboarding Flow Audit

Date: 2026-03-18
Scope: setup/page.tsx, settings/page.tsx, useSessionGuard.ts, backend onboarding endpoints

---

## Flow overview

```
phone → otp → [wallet creation] → email (optional) → tos → permission → done → /settings
```

Two auth modes:
- **NANP (+1):** CDP native SMS (`signInWithSms` → `verifySmsOTP` → exchange-cdp-token → JWT)
- **International:** Twilio OTP → Sippy JWT → `authenticateWithJWT()` → CDP session

Session recovery on page reload: checks CDP session → finds wallet → register-wallet → wallet-status → resumes at correct step.

---

## Real bugs — progress loss or stuck states

### BUG 1: isLoading stuck true when CDP token exchange fails

**File:** setup/page.tsx, lines 326-435
**Severity:** HIGH — user completely stuck, must refresh

In the CDP SMS OTP flow:
1. `verifySmsOTP()` succeeds (line 330)
2. `getAccessToken()` returns null (line 334-336) → throws
3. Caught at line 428 → error message set
4. Finally block (line 430-435): `if (authMode !== 'cdp-sms') { setIsLoading(false) }`
5. Since authMode IS `cdp-sms`, **isLoading stays true**
6. `awaitingCdpWallet` was never set (line 367 is unreachable) → useEffect at line 441 never fires
7. All buttons disabled. Error is displayed but user can't retry or go back.

**Same issue if:** exchange-cdp-token returns non-OK (line 345-351) — throws before `setAwaitingCdpWallet(true)`.

**Fix:** In the catch block, always `setIsLoading(false)` and `setAwaitingCdpWallet(false)` for the CDP SMS path when the error happens before `awaitingCdpWallet` is set.

---

### BUG 2: Orphaned on-chain spend permission

**File:** setup/page.tsx, lines 626-672
**Severity:** HIGH — on-chain state diverges from backend, user creates duplicate permissions

Flow:
1. `createSpendPermission()` (line 626) → user signs on-chain transaction
2. Transaction confirmed on-chain → user has a real spend permission
3. **Tab closes / network error before `register-permission` (line 657) completes**
4. Backend doesn't know about the permission
5. Session recovery: `wallet-status` returns `hasPermission: false`
6. User is asked to create ANOTHER permission → now 2 permissions exist on-chain
7. Backend registers the second one. First is orphaned forever.

**Impact:** Wasted gas, orphaned on-chain permissions. Not a security issue but a real UX/cost problem.

**Fix options:**
- A) Backend `register-permission` should scan ALL on-chain permissions for this wallet and register the most recent valid one — it already does this (line 186-196 in embedded_wallet_controller.ts). But it only runs when the frontend calls it. The fix is to call `register-permission` during session recovery if `hasPermission === false` but wallet exists.
- B) Add an idempotency check: before `createSpendPermission`, query if an on-chain permission already exists for this wallet+spender.

---

### BUG 3: authenticateWithJWT may not immediately populate wallet

**File:** setup/page.tsx, lines 383-391
**Severity:** MEDIUM — user sees "No wallet found" error but can recover by refreshing

```typescript
const { user } = await authenticateWithJWT();
const smartAccountAddress = user?.evmSmartAccounts?.[0] || user?.evmAccounts?.[0];
if (!smartAccountAddress) {
  throw new Error('No wallet found. Please try again.');
}
```

CDP SDK creates the wallet asynchronously. The `user` object returned by `authenticateWithJWT()` may not have the wallet populated yet — it appears in a subsequent render cycle via `currentUser` hook.

The CDP SMS flow handles this correctly with `awaitingCdpWallet` + useEffect. The Twilio flow does NOT — it expects the wallet immediately.

**Impact:** International users occasionally see "No wallet found" on first attempt. Refreshing works because session recovery finds the wallet via `currentUser`.

**Fix:** Add an `awaitingCdpWallet`-style polling mechanism for the Twilio path too, or retry wallet lookup with a small delay.

---

### BUG 4: Email verification setTimeout on unmounted component

**File:** setup/page.tsx, lines 546-557
**Severity:** LOW — React warning, minor state inconsistency

After successful email verification, a `setTimeout` schedules step transition after 1500ms. If user navigates away during this window, the timeout fires on an unmounted component.

**Fix:** Use a ref to track mounted state, or clear the timeout in a cleanup function.

---

### BUG 5: ToS acceptance silently skipped when token is missing

**File:** setup/page.tsx, lines 576-593
**Severity:** HIGH — user permanently stuck as `embedded_incomplete`

```typescript
if (!accessToken) {
  console.warn('handleAcceptTos: no access token — ToS acceptance will not be recorded on backend');
}
if (accessToken) {
  // ... record ToS ...
}
// Falls through to setStep('permission') regardless
setStep('permission');
```

If `getStoredToken()` returns null (expired or cleared), `handleAcceptTos` logs a warning but **proceeds to the permission step** without recording ToS in the database. The user completes setup, but `wallet-status` will return `tosAccepted: false` forever, making the WhatsApp bot treat them as `embedded_incomplete`.

**Note:** `useSessionGuard` handles JWT expiration on `/settings`, but `/setup` does NOT use `useSessionGuard` — it uses `getStoredToken()` directly.

**Fix:** Block progression if ToS cannot be recorded. Show an error and prompt re-authentication, or call `getFreshToken()` with re-auth fallback.

---

### BUG 6: Session recovery register-wallet missing cdpAccessToken

**File:** setup/page.tsx, lines 160-167
**Severity:** MEDIUM — permanent 401 for edge-case users

During session recovery, `register-wallet` is called with only `{ walletAddress }` in the body — no `cdpAccessToken`.

**File:** jwt_auth_middleware.ts, lines 67-100: For new users (no DB record), the middleware **requires** `cdpAccessToken` to prove wallet ownership. Without it → 401 Unauthorized.

Normal flow: recovery only fires for users with an existing CDP session, so they should already have a DB record and the middleware's "Branch A: DB record exists" path handles it. But if the user's DB row was lost (migration issue, DB corruption), recovery fails permanently with no way to re-register.

**Fix:** Include `cdpAccessToken` (via `getAccessToken()`) in the recovery register-wallet call body.

---

### BUG 7: getStoredToken() used instead of getFreshToken() for API calls

**File:** setup/page.tsx — lines 241, 398, 466, 510, 538, 576, 652, 688
**Severity:** MEDIUM — expired tokens cause silent API failures

`getStoredToken()` returns tokens regardless of expiration. `getFreshToken()` exists and returns null for expired tokens. Multiple API calls throughout the setup flow use `getStoredToken()`, which means they silently fail with 401 if the JWT has expired.

While `useSessionGuard` handles this on `/settings`, the `/setup` page does NOT use `useSessionGuard` — it relies on raw `getStoredToken()` calls.

**Fix:** Replace `getStoredToken()` with `getFreshToken()` in all setup page API calls, and handle the null case (prompt re-auth or show error).

---

### BUG 8: No daily limit input validation

**File:** setup/page.tsx, lines 956-959
**Severity:** MEDIUM — can brick account

The custom daily limit input accepts any number — 0, negative, or extremely large values. `createSpendPermission` will be called with `parseUnits(dailyLimit, 6)`, and:
- `dailyLimit = "0"` → creates a $0/day permission, effectively bricking the account (no sends possible)
- `dailyLimit = "-5"` → `parseUnits` may throw or create an invalid permission
- `dailyLimit = ""` → `parseUnits` throws

**Fix:** Add `min="1" max="500"` on the input, and validate before calling `handleApprovePermission`.

---

## Potential issues — worth monitoring

### ISSUE 9: Refuel failure not communicated to user

**File:** embedded_wallet_controller.ts, lines 117-129
**Severity:** MEDIUM — already handled by `ensureGas` but confusing UX

`registerWallet` returns `200 OK` even if refuel fails. This is intentional — registration succeeded, refuel is best-effort. The frontend then calls `ensureGasReady()` before permission creation, which properly checks gas balance and retries refuel.

**Problem:** If refuel fails consistently (e.g., admin wallet empty), user gets stuck in a loop: "wallet created" → "preparing gas" → error → retry → same error. No guidance about what went wrong.

**Recommendation:** Return refuel status in the `register-wallet` response so frontend can show a more specific message.

### ISSUE 10: Email code stored in-memory only

**File:** email_service.ts, line 9 (`private codeStore: Map`)
**Severity:** MEDIUM — standard pattern, but worth documenting

Email verification codes are stored in-memory with 10-minute TTL. Server restart loses all pending codes. Users must resend.

**Accepted trade-off.** The code is consumed on verification (one-time use) and the resend flow handles this.

### ISSUE 11: No fetch timeouts on onboarding API calls

**File:** setup/page.tsx — all `fetch()` calls
**Severity:** LOW — standard SPA limitation

No `AbortController` or timeout on any fetch call. If backend hangs, user sees loading spinner indefinitely. Only recovery is page refresh.

**Recommendation:** Add `AbortController` with 30s timeout on critical calls (register-wallet, ensure-gas, register-permission).

### ISSUE 12: SH-003 dual-format phone race condition

**File:** embedded_wallet_controller.ts, lines 76-105
**Severity:** LOW — unlikely in practice

`registerWallet` first tries UPDATE on bare-digit format (pre-SH-003 compatibility), then falls back to INSERT...ON CONFLICT with canonical format. Two concurrent requests for the same phone could theoretically create two rows. In practice this doesn't happen because register-wallet is called once per user and the ON CONFLICT handles duplicates.

### ISSUE 13: register-permission picks most-recent permission

**File:** embedded_wallet_controller.ts, lines 186-196
**Severity:** LOW — correct behavior for normal flow

If multiple on-chain permissions exist (see BUG 2), the endpoint picks the one with the highest `start` timestamp. This is the intended behavior for retry scenarios but could register the wrong permission if user manually created one via another tool. Not a realistic concern for normal onboarding.

### ISSUE 14: Daily limit options misleading for unverified-email users

**File:** setup/page.tsx, line 934
**Severity:** MEDIUM — confusing UX, not data loss

The permission step shows $50, $100, $250, $500 options to all users. Users without a verified email can **create** a $500 onchain permission but are silently limited to $50/day by `checkSecurityLimits` when actually sending via the backend.

The user thinks they set $500/day but transfers above $50 will be rejected at send time with no clear explanation.

**Fix:** Either hide options above $50 for unverified-email users, or show a note explaining the security tiers.

### ISSUE 15: Email step skipped on session recovery

**File:** setup/page.tsx, lines 201-204
**Severity:** LOW — intentional but has side effects

Recovery jumps to the `tos` step when wallet exists but ToS not accepted. The email step is skipped ("Email step is only shown in the initial fresh flow, not on recovery"). This means users who crash during the email step silently lose the opportunity to link an email during onboarding.

**Impact:** User is downgraded to the $50/day security tier with no indication of why. They can add email later via `/settings`.

### ISSUE 16: No back navigation from email/tos/permission steps

**File:** setup/page.tsx
**Severity:** LOW — UX friction

Only the OTP step has a "Back" button. Once past OTP verification, users cannot go back to change phone number, email address, or daily limit without a full page reload.

### ISSUE 17: Recovery error leaves inconsistent walletAddress state

**File:** setup/page.tsx, lines 152, 170-179
**Severity:** LOW — cosmetic, no data loss

During session recovery, `setWalletAddress(smartAccountAddress)` is called (line 152) before `register-wallet` is attempted. If registration fails, the error is shown but `walletAddress` is already set while `step` hasn't advanced. The UI is in an inconsistent state — no clear retry path visible to the user.

---

## Session recovery analysis

| Scenario | Recovery path | Works? |
|----------|--------------|--------|
| Tab closed after OTP verify, before wallet creation | Reload → CDP session exists → finds wallet → register-wallet → resumes | ✓ |
| Tab closed after wallet registered, before email | Reload → wallet-status returns `tosAccepted: false` → resumes at ToS | ✓ (email step skipped on recovery) |
| Tab closed after ToS accepted, before permission | Reload → wallet-status returns `hasPermission: false` → resumes at permission | ✓ |
| Tab closed during permission signing (on-chain tx) | Reload → recovery calls register-permission → finds existing onchain permission | ✓ (fixed — BUG 2) |
| Tab closed after permission registered | Reload → wallet-status returns `hasPermission: true` → step=done | ✓ |
| JWT expired during any step | useSessionGuard re-auth modal appears → re-authenticates | ✓ (but only on /settings — /setup uses raw getStoredToken, see BUG 7) |
| Server restart during email verification | Code lost, user must resend | ✓ (graceful) |
| Network error on register-wallet | Error displayed, user can retry | ✓ |
| CDP SDK hangs (never returns currentUser) | awaitingCdpWallet timeout fires after 30s → shows error | ✓ |
| JWT expired mid-setup (no useSessionGuard) | getFreshToken returns null → "Session expired" error + reload button → recovery resumes | ⚠ (fixed — BUG 5, 7; reload required, no inline re-auth yet) |
| DB row lost + session recovery attempted | register-wallet fails 401 (no cdpAccessToken in body) | ✗ (see BUG 6) |
| User enters $0 custom daily limit | Validation blocks — must be $1–$10,000 | ✓ (fixed — BUG 8) |

---

## Settings page post-onboarding

| Concern | Status |
|---------|--------|
| No server-side route protection (Next.js middleware) | Accepted SPA trade-off — auth enforced client-side via useSessionGuard |
| JWT expires during settings usage | Handled — useSessionGuard polls every 30s, shows re-auth modal |
| Direct navigation to /settings without onboarding | useSessionGuard checks wallet exists → signs out if missing → redirects to setup |
| Blank screen if CDP hooks hang | Suspense fallback shows "Loading..." — no timeout. LOW risk |
| Permission status banner not cleared after operation | UX nit — stale success message until page refresh |

---

## Priority fixes

| # | Bug | Severity | Effort |
|---|-----|----------|--------|
| 1 | isLoading stuck in CDP SMS error path | HIGH | Small — add `setIsLoading(false)` in catch |
| 2 | Orphaned on-chain permission on tab close | HIGH | Medium — add permission scan to session recovery |
| 5 | ToS acceptance silently skipped when token missing | HIGH | Small — block progression, show error |
| 3 | authenticateWithJWT wallet timing | MEDIUM | Medium — add retry/polling for wallet |
| 7 | getStoredToken vs getFreshToken on /setup | MEDIUM | Small — replace calls, add null handling |
| 8 | No daily limit validation (0/negative bricks account) | MEDIUM | Small — add min/max + validation |
| 14 | Daily limit options misleading for unverified email | MEDIUM | Small — show note or filter options |
| 6 | Recovery register-wallet missing cdpAccessToken | MEDIUM | Small — include token in body |
| 4 | Email setTimeout on unmounted component | LOW | Small — cleanup ref |

BUG 1 is a one-line fix. BUG 5 is a small guard (block instead of warn). BUG 2 requires adding a `register-permission` call to session recovery when `hasPermission === false` but wallet exists. BUG 8 is a simple input validation.

### Implemented fixes (2026-03-18)

All fixes applied in `setup/page.tsx`:

| Bug | What was done |
|-----|---------------|
| 1 | Added `setIsLoading(false)` in catch block for CDP-SMS path when error occurs before `awaitingCdpWallet` is set |
| 2 | Session recovery now calls `register-permission` when `tosAccepted` but `hasPermission === false`, recovering orphaned onchain permissions before asking user to create a new one |
| 4 | Replaced bare `setTimeout` with `emailTimerRef` (useRef) + cleanup on unmount |
| 5 | `handleAcceptTos` now uses `getFreshToken()` and throws (blocking progression) if token is expired/missing |
| 6 | Already fixed in current code — recovery register-wallet already includes `cdpAccessToken` |
| 7 | Replaced `getStoredToken()` with `getFreshToken()` in `ensureGasReady`, `handleSendEmailCode`, `handleVerifyEmailCode`, `handleAcceptTos`, `handleApprovePermission` (register-permission + gas retry). Added null handling with session-expired error |
| 8 | Added `min={1} max={10000}` on custom input + runtime validation in `handleApprovePermission` before onchain call |

Additionally: error display now shows a "Reload page" button when the JWT is expired and the user is past the phone/otp steps. Page reload triggers session recovery which resumes at the correct step.

### Not implemented — future improvement

**Integrate `useSessionGuard` into `/setup`:** Currently `/setup` has no token refresh or re-auth mechanism. The `useSessionGuard` hook (used by `/settings` and `/wallet`) polls for expiry every 30s and shows a re-auth modal with full OTP flow. Integrating it into `/setup` would provide seamless re-authentication mid-onboarding instead of requiring a page reload. Current mitigation (reload button + session recovery) is functional but not as smooth.
