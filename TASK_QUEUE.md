# Task Queue — Sippy

> This file is consumed by an AI agent. Tasks are executed in order, respecting dependencies.
> Only Mateo adds or reorders tasks. The agent marks completion status.
> Tasks use stable IDs (DC-001, ER-001, etc.) that never change when tasks are reordered.

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
7. Commit each task separately with message: `feat(<scope>): <ID> — {task title}`.
8. If a task is ambiguous, read the referenced pattern files in **Context** before asking for clarification.
9. AdonisJS backend requires **Node 24** (`nvm use 24`) for tests.

---

## P3 Dual Currency Display

> **Goal:** All balance and transfer messages show USD + local currency equivalent, auto-detected from phone prefix.
> **Deliverable:** M1 #4
> **Estimate:** 6-8h

#### DC-001 [x] Create exchange rate service
- **What:** Fetch USD→LATAM rates from a free API, cache in-memory with 15-min TTL.
- **Acceptance criteria:**
  - New file exporting singleton with lazy init
  - `getCurrencyForPhone(phoneNumber: string): string | null` — maps phone prefix to currency:
    - `+57` → `COP`, `+52` → `MXN`, `+54` → `ARS`, `+55` → `BRL`, `+51` → `PEN`, `+56` → `CLP`
    - USD countries return `null` (skip conversion): `+1`, `+507`, `+593`, `+503`
    - Unknown prefixes return `null`
  - `getLocalRate(currencyCode: string): Promise<number | null>` — returns rate or null if unavailable
  - Fetches all LATAM rates in a single API call, caches result for 15 minutes
  - If API fails, serves last known rate (stale is better than broken)
  - If no cached rate exists yet and API fails, returns `null` (graceful fallback to USD-only)
  - Cleanup: refresh timer via `setInterval` (same pattern as `rate_limit_service.ts`)
- **Verify:** `cd apps/backend && node --experimental-strip-types -e "import('./app/services/exchange_rate_service.ts').then(m => m.exchangeRateService.getCurrencyForPhone('+573001234567'))"`
- **Dependencies:** None
- **Context:** `apps/backend/app/services/rate_limit_service.ts` (follow Map + cleanup timer pattern)
- **Files:** `apps/backend/app/services/exchange_rate_service.ts` (new)

#### DC-002 [x] Create dual amount formatter
- **What:** Helper function that formats USD amount with optional local currency equivalent.
- **Acceptance criteria:**
  - New function in messages.ts: `formatDualAmount(usd: number, rate: number | null, currency: string | null): string`
  - If rate + currency: returns `$10.00 (~41,500 COP)`
  - If no rate/currency: returns `$10.00` (USD only, graceful fallback)
  - Local amounts use thousands separator (`.` for ES/PT locales)
  - No decimal places on local amounts (rounded) — e.g., `41,500 COP` not `41,500.00 COP`
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** None
- **Files:** `apps/backend/app/utils/messages.ts`

#### DC-003 [x] Update balance message to show dual currency
- **What:** Thread exchange rate through balance command so users see local equivalent.
- **Acceptance criteria:**
  - `formatBalanceMessage` accepts optional `localRate` + `localCurrency` params
  - When provided, balance shows: `Tu saldo: $10.00 (~41,500 COP)`
  - When not provided (USD country or API down), shows: `Tu saldo: $10.00`
  - Existing tests still pass — new params are optional with backward-compatible defaults
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** DC-001, DC-002
- **Context:** `apps/backend/app/utils/messages.ts` (find `formatBalanceMessage`)
- **Files:** `apps/backend/app/utils/messages.ts`

#### DC-004 [ ] Update send messages to show dual currency
- **What:** Thread exchange rate through send command — processing, success, and recipient messages.
- **Acceptance criteria:**
  - `formatSendProcessingMessage` — shows local equivalent of send amount
  - `formatSendSuccessMessage` — shows local equivalent
  - `formatSendRecipientMessage` — uses **recipient's** phone prefix for their local currency
  - `formatInsufficientBalanceMessage` — shows both balance and needed amount in local currency
  - All formatters accept optional `localRate` + `localCurrency` (backward-compatible)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** DC-001, DC-002
- **Files:** `apps/backend/app/utils/messages.ts`

#### DC-005 [ ] Thread rate through webhook command handler
- **What:** Fetch exchange rate before handling commands and pass to formatters.
- **Acceptance criteria:**
  - In the webhook controller, before `handleCommand`: fetch rate for sender's phone prefix via `exchangeRateService`
  - Pass `localRate` + `localCurrency` through to balance and send command handlers
  - For send: also fetch **recipient's** local currency for their notification
  - Non-blocking: if rate fetch fails or returns null, show USD only — never error to user
  - No new `await` in the critical path if rate is cached (in-memory lookup)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** DC-003, DC-004
- **Context:** `apps/backend/app/controllers/webhook_controller.ts` (command handling flow)
- **Files:** `apps/backend/app/controllers/webhook_controller.ts`

#### DC-006 [ ] Write tests for exchange rate service
- **What:** Unit tests for currency mapping, rate caching, and graceful fallback.
- **Acceptance criteria:**
  - Test `getCurrencyForPhone`: all LATAM codes map correctly, USD codes return null, unknown returns null
  - Test `formatDualAmount`: with rate, without rate, zero amount, large amounts, rounding
  - Test graceful fallback: when rate is null, formatters return USD-only strings
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** DC-002
- **Files:** `apps/backend/tests/unit/exchange_rate_service.spec.ts` (new), `apps/backend/tests/unit/dual_currency.spec.ts` (new)

---

## P5.6 Email Recovery (M1 scope)

> **Goal:** Users can add a recovery email during setup. Email serves as 2FA for sensitive operations and as identity proof for lost-phone recovery.
> **Deliverable:** M1 #5 (partial), M1 #6
> **Estimate:** 6-8h
> **Constraint:** Install `resend` npm package (free tier: 3K emails/month). Do NOT implement passkeys (M2 only).

#### ER-001 [ ] Add email columns to user_preferences
- **What:** Database migration adding encrypted email storage columns.
- **Acceptance criteria:**
  - New migration adding to `user_preferences`:
    - `email_encrypted TEXT` — AES-256-GCM encrypted email (for sending codes)
    - `email_hash TEXT` — SHA-256(normalized(email)) for lookup/dedup (unique index)
    - `email_verified BOOLEAN DEFAULT false`
    - `email_verified_at TIMESTAMPTZ`
  - New env var: `EMAIL_ENCRYPTION_KEY` in `apps/backend/start/env.ts` (optional string, 32-byte hex)
  - Lucid model updated with new columns
- **Verify:** `cd apps/backend && nvm use 24 && node ace migration:run --dry-run`
- **Dependencies:** None
- **Context:** `apps/backend/database/migrations/` (follow existing migration patterns)
- **Files:** `apps/backend/database/migrations/*_add_email_to_user_preferences.ts` (new), `apps/backend/start/env.ts`, `apps/backend/app/models/user_preference.ts` (if exists, else check model pattern)

#### ER-002 [ ] Create email encryption helpers
- **What:** Encrypt/decrypt email at rest using AES-256-GCM, plus hash for lookups.
- **Acceptance criteria:**
  - New utility file with:
    - `encryptEmail(email: string): { encrypted: string, iv: string }` — AES-256-GCM with unique IV per call
    - `decryptEmail(encrypted: string, iv: string): string` — reverse
    - `hashEmail(email: string): string` — SHA-256 of `email.trim().toLowerCase()`
    - `normalizeEmail(email: string): string` — `trim().toLowerCase()`
  - Uses `EMAIL_ENCRYPTION_KEY` env var (hex-encoded 32 bytes)
  - Stores encrypted + IV together as single string (e.g., `iv:ciphertext` base64)
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** ER-001
- **Files:** `apps/backend/app/utils/email_crypto.ts` (new)

#### ER-003 [ ] Create email service with Resend
- **What:** Send branded verification emails via Resend API.
- **Acceptance criteria:**
  - Install `resend` npm package: `cd apps/backend && pnpm add resend`
  - New env vars: `RESEND_API_KEY` (optional string) in `env.ts`
  - `sendEmailCode(email: string, lang?: string): Promise<{ success: boolean } | { error: string }>` →
    - Rate limit: max 3 sends per email per 60s
    - Generate 6-digit code via `crypto.randomInt(100000, 999999)`
    - Store in Map with 10-min TTL, reset attempts to 0
    - Send via Resend with branded subject: ES `"Sippy: Tu código de verificación"` / EN `"Sippy: Your verification code"` / PT `"Sippy: Seu código de verificação"`
    - Body: simple text with code, no HTML template needed for M1
  - `verifyEmailCode(email: string, code: string): Promise<{ valid: boolean }>` →
    - Check code exists and not expired
    - Wrong code: increment attempts, max 3 = delete entry
    - Correct: delete entry, return `{ valid: true }`
  - In-memory `Map<string, EmailCodeEntry>` with `MAX_MAP_ENTRIES = 50_000` cap
  - 60s cleanup timer for expired entries (same pattern as `otp_service.ts`)
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** ER-001
- **Constraints:** Install `resend` package. Follow `otp_service.ts` pattern for rate limiting and code storage.
- **Context:** `apps/backend/app/services/otp_service.ts` (follow Map + cleanup pattern)
- **Files:** `apps/backend/app/services/email_service.ts` (new), `apps/backend/start/env.ts`

#### ER-004 [ ] Create email auth controller endpoints
- **What:** API endpoints for email verification flow.
- **Acceptance criteria:**
  - `POST /api/auth/send-email-code` — reads `{ email }` from body, normalizes, checks not already linked to another account (hash lookup), encrypts + stores, sends code. Requires JWT auth.
  - `POST /api/auth/verify-email-code` — reads `{ email, code }`, verifies code, marks `email_verified = true` + `email_verified_at = now()` in DB. Requires JWT auth.
  - `GET /api/auth/email-status` — returns `{ hasEmail: boolean, verified: boolean }` for current user. Requires JWT auth.
  - All endpoints behind `jwtAuth` middleware
  - Validation: email format check (basic regex), reject disposable domains (optional)
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** ER-002, ER-003
- **Context:** `apps/backend/app/controllers/auth_api_controller.ts` (add methods to existing controller)
- **Files:** `apps/backend/app/controllers/auth_api_controller.ts`, `apps/backend/start/routes.ts`

#### ER-005 [ ] Add email collection to setup page
- **What:** Optional email step during onboarding, after phone verification.
- **Acceptance criteria:**
  - After wallet creation step, show: "Add a recovery email (recommended)"
  - Email input + "Send code" button → calls `POST /api/auth/send-email-code`
  - Code input + "Verify" button → calls `POST /api/auth/verify-email-code`
  - "Skip" link that advances without email — don't block setup
  - After verification: green checkmark + "Email verified" message
  - If user skips: no email stored, no nag on this page (will nudge on settings)
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** ER-004
- **Files:** `apps/web/app/setup/page.tsx`

#### ER-006 [ ] Add email management to settings page
- **What:** View/add/change recovery email from settings.
- **Acceptance criteria:**
  - New section: "Recovery Email" in settings page
  - If no email: show input + "Add recovery email" CTA
  - If email verified: show masked email (m***@gmail.com) + "Change" button
  - If email added but not verified: show "Verify" button + resend option
  - Change flow: enter new email → verify via code → replaces old email
  - First visit after skipping email during setup: subtle banner "Add a recovery email to protect your account"
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** ER-004
- **Files:** `apps/web/app/settings/page.tsx`

#### ER-007 [ ] Gate sensitive operations on email verification
- **What:** Require email code before export key or revoke permission, if user has a verified email.
- **Acceptance criteria:**
  - Before export private key: if user has verified email → require email code inline
  - Before revoke spend permission: same gate
  - If user has no email → show warning "We recommend adding a recovery email" but still allow operation
  - Inline flow: email code input appears on the same page (no redirect)
  - After successful verification, proceed with the operation
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** ER-006
- **Files:** `apps/web/app/settings/page.tsx`

#### ER-008 [ ] Write tests for email service
- **What:** Unit tests for email code generation, verification, rate limiting, and encryption.
- **Acceptance criteria:**
  - Test `sendEmailCode`: code generation, rate limiting (4th call rejected), map cleanup
  - Test `verifyEmailCode`: correct code, wrong code, expired code, max attempts lockout
  - Test `encryptEmail`/`decryptEmail`: roundtrip, different IVs per call
  - Test `hashEmail`: deterministic, normalized
  - Test controller endpoints: send code, verify code, email status
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** ER-003
- **Files:** `apps/backend/tests/unit/email_service.spec.ts` (new), `apps/backend/tests/unit/email_crypto.spec.ts` (new)

#### ER-009 [ ] Create recovery design doc
- **What:** Document the full lost-phone recovery flow for M2 implementation.
- **Acceptance criteria:**
  - File: `docs/RECOVERY-DESIGN.md`
  - Covers: user contacts support → identity verification via recovery email → admin re-links phone
  - Documents admin endpoint spec: `POST /admin/relink-phone` (M2 implementation)
  - Documents edge case: no email + lost phone → only recoverable via exported private key
  - Documents M2 passkey scope (reference only, no implementation spec)
  - Clear about what ships in M1 vs M2
- **Verify:** File exists and is valid markdown
- **Dependencies:** None
- **Files:** `docs/RECOVERY-DESIGN.md` (new)
