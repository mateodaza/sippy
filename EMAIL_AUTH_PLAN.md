# Email as Auth Resilience Layer

## Goal

Give existing users a way to recover wallet access when SMS and WhatsApp OTP delivery fails, by letting them log in with a verified email. Make email mandatory for all new users so the unverified population shrinks to zero over time.

---

## Part 1 -- Make Email Mandatory in Onboarding

### Changes

- Remove the "Skip" button from the email step in `/setup`
- Remove `handleSkipEmail()` handler
- Email step becomes a hard gate: `emailVerified = true` required before ToS
- Set tier limit to `$500` unconditionally for all newly onboarded users (the `$50` unverified branch becomes dead code -- remove the ternary, hardcode `'500'`)

### Product decision (explicit)

All new users start at the $500 tier. The $50 tier existed as a safety net for unverified users. Mandatory email eliminates that population, so the lower tier no longer serves a purpose.

### Grandfathering

Existing users who onboarded without email are unaffected. They keep their current tier and can add email later in settings. They cannot use email login until they do.

### Files

- `apps/web/app/setup/page.tsx` -- remove skip button (~line 1157), remove `handleSkipEmail` (~line 751), hardcode tier to `'500'` (~line 813)

### Acceptance

- No way to reach ToS step without `emailVerified = true`
- Tier limit is `500` unconditionally for new onboarding
- Setup tests updated to remove skip-email paths

---

## Part 2 -- Emergency Email Login (Existing Users Only)

Two new public endpoints on `AuthApiController`. No JWT required (the whole point is the user lost their JWT because phone OTP failed).

### POST /api/auth/send-email-login

Request: `{ "email": "user@example.com" }`

Server logic:

1. Normalize and hash the email
2. Look up `user_preferences` by `emailHash` where `emailVerified = true`
3. If match: send OTP via `emailService.sendEmailCode(email)`
4. If no match, unverified, rate-limited, or provider failure: do nothing

**HTTP contract (enumeration resistance):**

- Always return `200 { message: "If this email is registered, you'll receive a code" }`
- Same status, same body, same shape for: not found, unverified, rate-limited, Resend failure, and success
- Log the real outcome server-side only
- No 429 surfaced to the client on this endpoint
- Rate limited via `rateLimitService.checkIpResolveThrottle()` inside the controller (not route-level middleware, which would leak a 429)

### POST /api/auth/verify-email-login

Request: `{ "email": "user@example.com", "code": "123456" }`

Server logic:

1. Normalize and hash the email
2. Verify code via `emailService.verifyEmailCode(email, code)`
3. If invalid: return generic error
4. If valid: look up `user_preferences` by `emailHash`, get `phoneNumber`
5. Issue JWT with `sub = phone` (preserves wallet binding -- entire system keys on phone)
6. Return `{ token }` (no phone in response -- see privacy note)

**HTTP contract (enumeration resistance):**

- Invalid email, invalid code, expired code, locked out all return: `401 { error: "Invalid or expired code" }`
- No variation in response shape or status across failure modes
- Rate limited via `rateLimitService.checkIpResolveThrottle()` inside the controller (not route-level middleware, which would leak a 429)

**Privacy note:** The response does NOT include the phone number. Leaking the phone associated with an email is unnecessary. After receiving the JWT, the frontend calls `/api/wallet-status` to hydrate user state (same as phone OTP flow).

### Security summary

- Only works for `emailVerified = true` rows
- Same rate limiting as SMS OTP (`ipThrottle` + `emailService` internal per-email rate limit)
- 6-digit code, 10-min TTL, 3-attempt lockout (existing `emailService` behavior)
- Generic responses on all paths (no email existence leakage)
- In-memory code store (`emailService.codeStore` is a `Map`) -- consistent with existing email verification flow. Note: backend restart between send and verify loses the code. Acceptable for M1; Redis-backed store is a post-M1 improvement if needed.
- **Cross-purpose code collision:** `emailService` codes are shared across onboarding verification, gate/export verification, and email login. All are keyed by plaintext email with no purpose namespace. Sending a new code for the same email (from any flow) invalidates the previous one. Accepted for M1 -- in practice these flows rarely overlap for the same user at the same time.

### Files

- `apps/backend/app/controllers/auth_api_controller.ts` -- two new methods
- `apps/backend/start/routes.ts` -- two new public routes in the `/api/auth` group
- `apps/backend/app/services/email_service.ts` -- no changes needed

---

## Part 3 -- Frontend Email Login UI (Web Recovery via /setup)

**Scope:** This is a recovery escape hatch on `/setup` only, not general auth resilience across the app. Existing users who lose phone delivery while already in `/wallet` or `/settings` cannot recover inline there -- the re-auth modals remain phone-only. Extending email login to re-auth modals is post-M1 scope if phone delivery remains unreliable.

### Where it lives

The `/setup` page, on the phone step. Not a separate page.

### UX

A subtle "Log in with email" link below the phone input. Not prominent -- this is an escape hatch, not the primary flow.

```
[Phone input]
[Send Code button]

--- or ---

Log in with email ->
```

Clicking it switches to an inline email-login flow:

1. Email input -> "Send code"
2. OTP input -> "Verify"
3. On success -> `storeToken(jwt)` -> call `/api/wallet-status` -> run `advanceToCorrectStep()` (same routing logic as phone OTP login)

### Post-login routing (critical)

Do NOT hardcode a redirect to `/wallet` or `/settings`. After email login issues the JWT, the frontend must:

1. Call `/api/wallet-status`
2. Run the existing `advanceToCorrectStep()` flow

This handles edge cases where a user has a verified email but never completed ToS or permission creation. Same flow as phone OTP -- no special routing logic for email login.

### Files

- `apps/web/app/setup/page.tsx` -- add email-login alternate flow on phone step
- `apps/web/lib/auth.ts` -- add `sendEmailLogin(email)` and `verifyEmailLogin(email, code)` client functions

---

## Part 4 -- Feature Flag (Optional, post-M1)

- Backend: `EMAIL_LOGIN_ENABLED` env var (default: `true`)
- Frontend: `NEXT_PUBLIC_EMAIL_LOGIN_ENABLED` env var (default: `true`)
- Can be flipped off if email login gets abused

Not required for initial ship. Add later if needed.

---

## Task Order

1. **Backend**: email-login endpoints (no frontend dependency)
2. **Frontend**: remove email skip + hardcode $500 tier (standalone)
3. **Frontend**: add email-login UI on phone step (depends on #1)
4. **Tests**: all three

---

## What This Does NOT Cover

- **New users during a total Resend outage**: they can't complete onboarding (email is now a hard dependency). Acceptable risk -- Resend has 99.9%+ uptime and this is a narrower failure window than "SMS + WhatsApp both down."
- **WhatsApp bot access during outage**: bot is dead if WhatsApp is down regardless. Email login recovers web wallet access only.
- **Existing users who never verified email**: they can't use email login. This population shrinks to zero over time as all new users must verify email. They can add email in settings to opt in.
- **Email login on re-auth modals** (wallet/settings): out of scope. Currently those re-trigger phone OTP. Adding email login there is post-M1 if phone delivery remains unreliable.
- **Email copy for login vs verification**: `emailService` currently sends "Your verification code" for all OTPs. Slight UX mismatch for login use case. Acceptable for M1; can add a `purpose` param to customize subject/body later.
