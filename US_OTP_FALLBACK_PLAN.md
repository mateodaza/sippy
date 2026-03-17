# US OTP Fallback: Conditional CDP Auth Plan

## Problem

- US/NANP numbers (`+1`) can't receive Twilio SMS (no A2P 10DLC registration)
- CDP has built-in SMS (`useSignInWithSms`/`useVerifySmsOTP`) that works for `+1` numbers
- When `customAuth` is set in `CDPHooksProvider`, the built-in SMS hooks are disabled
- Need `+1` numbers to use CDP SMS, all others to use Twilio

## Solution

One `CDPHooksProvider` per page, config chosen by phone prefix. No dual providers, no layout-level hacks.

- **`+1` (NANP)** → `CDPProviderNative` (no `customAuth`) → CDP sends SMS directly
- **All others** → `CDPProviderCustomAuth` (with `customAuth`) → Twilio via backend

Both flows produce a Sippy JWT. From `register-wallet` onward, everything is identical.

## NANP Coverage

`+1` covers USA, Canada, Puerto Rico, Jamaica, Trinidad & Tobago, Dominican Republic, Bahamas, Barbados, and ~20 more Caribbean nations. All share the same Twilio A2P 10DLC restriction and CDP SMS availability. This has been verified: the Twilio restriction is per-prefix (`+1`), not per-country, so all NANP destinations are affected equally.

**Note:** If in the future specific NANP countries (e.g., Jamaica) have issues with CDP SMS delivery, the `isNANP` check can be narrowed to specific area codes. But for now, prefix-level routing matches the Twilio restriction boundary exactly.

## Prerequisite: Wallet Determinism (BLOCKER)

Both auth methods must produce the **same wallet** for the same phone number. CDP wallets are keyed by `project + user identity`. The identity for CDP native SMS is the phone number; the identity for custom JWT auth is the JWT `sub` claim (which is also the phone number).

**This MUST be verified before any code is written:**
1. Register a test `+1` number via CDP native SMS flow → note wallet address
2. Mint a Sippy JWT with that same phone as `sub` → call `authenticateWithJWT()` → note wallet address
3. If addresses differ, the approach is dead — stop here

If they match, proceed with implementation.

## Flow Diagrams

### US user (+1) setup
```
URL ?phone=+12125551234
  → CDPProviderNative (no customAuth)
  → signInWithSms({ phoneNumber }) — CDP sends SMS
  → verifySmsOTP({ flowId, otp }) — CDP verifies, creates wallet
  → useGetAccessToken() → getAccessToken() — retrieves CDP access token
  → POST /api/auth/exchange-cdp-token — backend validates CDP token, mints Sippy JWT
  → storeToken(sippyJwt)
  → register-wallet, email, tos, permission (identical to international)
```

### International user (+57, +52, +55, etc.) setup
```
URL ?phone=+573001234567
  → CDPProviderCustomAuth (with customAuth)
  → sendOtp via Twilio backend
  → verifyOtp → Sippy JWT
  → authenticateWithJWT() — CDP authenticates via Sippy JWT
  → register-wallet, email, tos, permission (identical)
```

### Returning user (any country) on settings
```
Has Sippy JWT in localStorage
  → CDPProviderCustomAuth wraps settings page
  → useSessionGuard checks JWT, calls authenticateWithJWT()
  → Works identically for US and international users
  → Re-auth for +1 users diverges — see re-auth section below
```

### Re-auth when JWT expires (any country, settings/wallet pages)

**Implementation note:** The actual implementation diverged from the original plan below.
Instead of routing +1 re-auth through the backend (`otp_service.ts`), re-auth uses
client-side CDP hooks directly in `useSessionGuard.ts`.

```
JWT expired on settings/wallet page
  → useSessionGuard shows re-auth modal
  → User enters phone + OTP

  +1 (NANP) path:
    → handleReAuthSendOtp → signInWithSms({ phoneNumber }) via CDP hooks (client-side)
    → handleReAuthVerifyOtp → verifySmsOTP → getAccessToken()
    → POST /api/auth/exchange-cdp-token → new Sippy JWT
    → storeToken(newJwt)
    → authenticateWithJWT() → restores CDP session
    → setIsAuthenticated(true), dismiss modal

  International path (unchanged):
    → handleReAuthSendOtp → POST /api/auth/send-otp (Twilio)
    → handleReAuthVerifyOtp → POST /api/auth/verify-otp → new Sippy JWT
    → storeToken(newJwt)
    → authenticateWithJWT() → restores CDP session
    → setIsAuthenticated(true), dismiss modal
```

Both paths converge at `storeToken` → `authenticateWithJWT()` → session restored.

## Implementation Steps

### 0. Verify wallet determinism (BLOCKER)

Before writing any code, test with a real `+1` number:
1. Use CDP native SMS to create wallet for `+12125551234` → note address
2. Mint Sippy JWT with `sub: "+12125551234"` → call `authenticateWithJWT()` → note address
3. Confirm they're the same. If not, STOP.

### 1. `packages/shared/src/phone.ts` — add NANP helper

```ts
export function isNANP(e164Phone: string): boolean {
  return e164Phone.startsWith('+1')
}
```

### 2. `apps/web/app/providers/cdp-provider.tsx` — split into two exports

- `CDPProviderCustomAuth` — current config (with `customAuth: { getJwt }`)
- `CDPProviderNative` — same `projectId` and `ethereum` config, **no** `customAuth`

Both share:
```ts
const sharedConfig = {
  projectId: CDP_PROJECT_ID,
  ethereum: {
    createOnLogin: 'smart',
    enableSpendPermissions: true,
  },
}
```

### 3. `apps/web/app/layout.tsx` — remove CDPProvider from layout

Each page wraps itself with the appropriate provider variant.

### 4. `apps/web/app/setup/page.tsx` — conditional auth flow

**Audit fix (🔴 #1): handle manual phone entry on bare `/setup`.**

The current page allows users to land on `/setup` without a `?phone=` param and type their phone manually. The provider must be chosen *after* the phone is known, not at initial mount.

Solution: two-phase mount.
- Phase 1: No provider. Render the phone input step. User types phone.
- Phase 2: Once phone is submitted (either from URL or manual entry), mount the correct provider and render the auth steps.

```tsx
function SetupPage() {
  const searchParams = useSearchParams();
  const rawPhone = (searchParams.get('phone') || '').replace(/[^\d]/g, '');
  const phoneFromUrl = rawPhone ? `+${rawPhone}` : '';

  // Phone is known from URL → mount provider immediately
  if (phoneFromUrl) {
    const Provider = isNANP(phoneFromUrl) ? CDPProviderNative : CDPProviderCustomAuth;
    return (
      <Provider>
        <SetupContent phoneFromUrl={phoneFromUrl} authMode={isNANP(phoneFromUrl) ? 'cdp-sms' : 'twilio'} />
      </Provider>
    );
  }

  // No phone from URL → show phone input first, then mount provider after submission
  return <PhoneEntryGate />;
}

function PhoneEntryGate() {
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);

  if (!submittedPhone) {
    return <PhoneInputStep onSubmit={setSubmittedPhone} />;
  }

  const Provider = isNANP(submittedPhone) ? CDPProviderNative : CDPProviderCustomAuth;
  return (
    <Provider>
      <SetupContent phoneFromUrl={submittedPhone} authMode={isNANP(submittedPhone) ? 'cdp-sms' : 'twilio'} />
    </Provider>
  );
}
```

Inside `SetupContent`, branch on `authMode`:

**twilio** (current flow, unchanged):
1. `sendOtp(phone)` → backend → Twilio SMS
2. `verifyOtp(phone, code)` → backend returns Sippy JWT
3. `storeToken(sippyJwt)`
4. `authenticateWithJWT()` → CDP authenticates via JWT

**cdp-sms** (new flow):
1. `signInWithSms({ phoneNumber })` → CDP sends SMS directly, returns `flowId`
2. `verifySmsOTP({ flowId, otp })` → CDP verifies, creates wallet, user is authenticated
3. `getAccessToken()` from `useGetAccessToken` hook → retrieves CDP access token (confirmed exported by `@coinbase/cdp-hooks`)
4. `POST /api/auth/exchange-cdp-token` → backend validates CDP token, mints Sippy JWT
5. `storeToken(sippyJwt)`

From this point both flows are identical: `register-wallet` → email → ToS → spend permission.

### 5. `apps/web/app/settings/page.tsx` — wrap in CDPProviderCustomAuth

All returning users have a Sippy JWT, so always use `customAuth`. No branching needed.

### 6. `apps/web/app/wallet/page.tsx` — wrap in CDPProviderCustomAuth

Same as settings — returning users only.

### 7. `apps/backend/app/controllers/auth_api_controller.ts` — new endpoint

`POST /api/auth/exchange-cdp-token`:

The validation logic already exists in `cdp_auth_middleware.ts:63`. Reuse the same pattern:

```ts
async exchangeCdpToken({ request, response }: HttpContext) {
  const { cdpAccessToken } = request.body()

  if (!cdpAccessToken || typeof cdpAccessToken !== 'string') {
    return response.status(422).json({ error: 'Missing cdpAccessToken' })
  }

  const cdp = getCdpClient()
  const endUser = await cdp.endUser.validateAccessToken({ accessToken: cdpAccessToken })

  // Extract phone from SMS auth method (same as cdp_auth_middleware.ts:66)
  const smsAuth = endUser.authenticationMethods?.find(
    (m: { type: string }) => m.type === 'sms'
  ) as { type: 'sms'; phoneNumber: string } | undefined

  if (!smsAuth?.phoneNumber) {
    return response.status(401).json({ error: 'No phone in CDP token' })
  }

  const canonicalPhone = canonicalizePhone(smsAuth.phoneNumber)
  if (!canonicalPhone) {
    return response.status(422).json({ error: 'Invalid phone number' })
  }

  const token = await jwtService.signToken(canonicalPhone)
  return response.status(200).json({ token, expiresIn: 3600 })
}
```

### 8. `apps/backend/start/routes.ts` — register route

```ts
router.post('/exchange-cdp-token', [AuthApiController, 'exchangeCdpToken']).use(middleware.ipThrottle())
```

In the public auth group (no JWT required — the CDP token is the proof of identity).

### 9. `apps/web/lib/useSessionGuard.ts` — re-auth for +1 users (IMPLEMENTED)

**Actual implementation:** Instead of modifying `otp_service.ts` on the backend, re-auth
for +1 users is handled entirely client-side using CDP hooks inside `useSessionGuard.ts`.

The hook detects NANP phones via `isNANP()` and branches:

**+1 (NANP) re-auth:**
1. `signInWithSms({ phoneNumber })` — CDP sends SMS directly (client-side)
2. `verifySmsOTP({ flowId, otp })` — CDP verifies
3. `getAccessToken()` — retrieves CDP access token
4. `POST /api/auth/exchange-cdp-token` — backend validates CDP token, mints Sippy JWT
5. `storeToken(newToken)` + `authenticateWithJWT()` — session restored

**International re-auth (unchanged):**
1. `sendOtp(phone)` → `POST /api/auth/send-otp` (Twilio)
2. `verifyOtp(phone, otp)` → Sippy JWT
3. `storeToken(newToken)` + `authenticateWithJWT()` — session restored

No backend `otp_service.ts` changes were needed.

### 10. Tests

- `isNANP` unit tests (`packages/shared`)
- `exchange-cdp-token` endpoint tests (backend)
- Setup page tests for both auth modes (web)
- Re-auth flow tests for +1 numbers
- Remove existing source-integrity tests that block `useSignInWithSms` imports:
  - `setup/page.test.tsx:730`
  - `settings/page.test.tsx:1077-1079`
- Replace with tests that verify `useSignInWithSms` is only used in the cdp-sms code path

## Implementation Order

0 (blocker) → 1 → 7 → 8 → 2 → 3 → 4 → 5 → 6 → 9 → 10

Step 0 (wallet determinism) must pass before anything else. Backend (1, 7, 8) can be done independently of frontend (2-6). Re-auth (9) is last because it may require an alternative SMS provider.

## Open Items

1. ~~**CDP server-side SMS API**~~ — Resolved. Re-auth uses client-side CDP hooks (`signInWithSms`/`verifySmsOTP` in `useSessionGuard.ts`), so no backend SMS routing was needed.

2. **`useGetAccessToken` after native SMS auth** — The hook exists in `@coinbase/cdp-hooks` (confirmed: `export declare const useGetAccessToken: () => { getAccessToken: () => Promise<string | null> }`). Verify it returns a non-null token after `verifySmsOTP` succeeds. Test in step 0 alongside wallet determinism.
