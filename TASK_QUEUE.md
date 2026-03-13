# Task Queue — Sippy

> This file is consumed by an AI agent. Tasks are executed in order, respecting dependencies.
> Only Mateo adds or reorders tasks. The agent marks completion status.
> Tasks use stable IDs that never change when tasks are reordered.
> Completed task sections are archived in `COMPLETED_TASK_QUEUES.md`.

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

## SH — Security Hardening: Phone Sanitization & DB Constraints

> **Goal:** Guarantee phone numbers are stored in a single canonical format. Prevent duplicates caused by format variations (+57 vs 0057 vs 57). Enforce at both application and DB level.
> **Deliverable:** M1 #3
> **Priority:** P0 — must fix before beta (data integrity)
>
> **Current state:** Two separate normalization functions exist (`utils/phone.ts:normalizePhoneNumber` for WhatsApp and `auth_api_controller.ts:normalizePhone` for API auth). Phone is stored WITHOUT `+` prefix in `phone_registry` but WITH `+` prefix in JWT `sub` claims. This inconsistency is a ticking bomb.

#### SH-001 [x] Unify phone normalization into a single canonical function
- **What:** Create one definitive `canonicalizePhone(input: string): string | null` function that ALL code paths use. Output: E.164 format WITH `+` prefix (e.g., `+573001234567`). This becomes the single source of truth.
- **Acceptance criteria:**
  - New function in `app/utils/phone.ts`: `canonicalizePhone(input: string): string | null`
  - Handles all input variants:
    - `+573001234567` → `+573001234567`
    - `573001234567` → `+573001234567`
    - `0057 300 123-4567` → `+573001234567`
    - `(300) 123-4567` with `DEFAULT_COUNTRY_CODE=57` → `+573001234567`
    - `+1 (555) 123-4567` → `+15551234567`
  - Strips all whitespace, dashes, dots, parentheses before processing
  - Rejects numbers < 10 digits or > 15 digits (after stripping)
  - Rejects numbers that don't start with a valid country code
  - Returns `null` for invalid input
  - **Does NOT replace `normalizePhoneNumber()` yet** — SH-002 does the swap
  - Unit tests for all variants above
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Context:** `apps/backend/app/utils/phone.ts` (existing normalize functions), `apps/backend/app/controllers/auth_api_controller.ts:22-27` (second normalize)
- **Files:** `apps/backend/app/utils/phone.ts`, `apps/backend/tests/unit/phone_canonicalize.spec.ts` (new)

#### SH-002 [x] Replace all phone normalization call sites with canonicalizePhone
- **What:** Swap every call to `normalizePhoneNumber()` and the inline `normalizePhone()` in auth controller to use `canonicalizePhone()`. Ensure all DB writes use the canonical format.
- **Acceptance criteria:**
  - `auth_api_controller.ts`: replace inline `normalizePhone()` with `canonicalizePhone()` from `app/utils/phone.ts`
  - `webhook_controller.ts`: use `canonicalizePhone()` for incoming WhatsApp sender phone
  - `embedded_wallet_controller.ts:registerWallet()`: use `canonicalizePhone()` — stop stripping `+` prefix
  - All `phone_registry` lookups use canonical format
  - JWT `sub` claim uses canonical format (with `+` prefix)
  - `jwt_auth_middleware.ts`: phone from JWT matches DB format
  - Existing tests updated to match new format
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** SH-001
- **Files:** `apps/backend/app/controllers/auth_api_controller.ts`, `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/app/controllers/embedded_wallet_controller.ts`, `apps/backend/app/middleware/jwt_auth_middleware.ts`, `apps/backend/app/services/jwt_service.ts`

#### SH-003 [x] Add DB migration for phone format consistency + unique constraint audit
- **What:** Migration to normalize all existing phone_registry rows to E.164 with `+` prefix. Add CHECK constraint to prevent non-E.164 inserts.
- **Acceptance criteria:**
  - New migration:
    - UPDATE `phone_registry` SET `phone_number = '+' || phone_number` WHERE `phone_number NOT LIKE '+%'`
    - UPDATE `user_preferences` SET `phone_number = '+' || phone_number` WHERE `phone_number NOT LIKE '+%'`
    - ADD CHECK constraint on `phone_registry.phone_number`: `phone_number ~ '^\+[1-9]\d{6,14}$'`
    - ADD CHECK constraint on `user_preferences.phone_number`: same pattern
  - Verify FK or join relationships between `phone_registry` and `user_preferences` still work after format change
  - **Rollback plan:** migration down removes CHECK constraints and strips `+` prefix
- **Verify:** `cd apps/backend && nvm use 24 && node ace migration:run --dry-run`
- **Dependencies:** SH-002
- **Files:** `apps/backend/database/migrations/*_normalize_phone_e164.ts` (new)

---

## EL — Email-Gated Daily Limit Raise

> **Goal:** Default daily limit is $50 USD. Users who verify a recovery email can raise their limit (up to $500). This incentivizes email recovery setup while keeping unverified accounts low-risk.
> **Deliverable:** M1 #3 (security), M1 #6 (settings)
> **Priority:** P1

#### EL-001 [x] Add tiered daily limit logic based on email verification
- **What:** Change the hardcoded $500 daily limit to a tiered system: $50 default, $500 for email-verified users.
- **Acceptance criteria:**
  - New constants in `cdp_wallet.service.ts`:
    - `DAILY_LIMIT_UNVERIFIED = 50` (USD)
    - `DAILY_LIMIT_VERIFIED = 500` (USD)
  - `checkSecurityLimits()` now checks `user_preferences.email_verified` for the caller's phone
  - If `email_verified = true` → use $500 limit
  - If `email_verified = false` or no email → use $50 limit
  - When user hits limit and is unverified: message includes "Verify your email to raise your daily limit to $500"
  - Trilingual limit messages updated
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None (email infrastructure already exists from ER-* tasks)
- **Context:** `apps/backend/app/services/cdp_wallet.service.ts:32-36` (current limits), `apps/backend/app/services/cdp_wallet.service.ts:188-215` (checkSecurityLimits)
- **Files:** `apps/backend/app/services/cdp_wallet.service.ts`, `apps/backend/app/utils/messages.ts`

#### EL-002 [x] Update settings page to show limit tier + email CTA
- **What:** Settings page shows current daily limit tier and prompts unverified users to add email.
- **Acceptance criteria:**
  - Daily limit section shows: "Your daily limit: $50/day" or "$500/day" based on verification status
  - If unverified: prominent CTA "Verify your email to unlock $500/day limit"
  - After email verification on settings page: limit display updates immediately to $500
  - WhatsApp balance message includes remaining daily allowance
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** EL-001
- **Files:** `apps/web/app/settings/page.tsx`

#### EL-003 [x] Update WhatsApp limit messages with tier info
- **What:** When user hits daily limit via WhatsApp, tell them their tier and how to upgrade.
- **Acceptance criteria:**
  - Unverified user hits $50 limit: "You've reached your daily limit of $50. Add a recovery email at sippy.lat/settings to increase it to $500/day."
  - Verified user hits $500 limit: "You've reached your daily limit of $500. Try again tomorrow."
  - Balance command shows remaining daily allowance: "Daily limit: $42.50 remaining of $50.00"
  - All messages trilingual
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** EL-001
- **Files:** `apps/backend/app/utils/messages.ts`, `apps/backend/app/services/cdp_wallet.service.ts`

#### EL-004 [x] Write tests for tiered limits
- **What:** Unit + functional tests for the tiered daily limit system.
- **Acceptance criteria:**
  - Test: unverified user blocked at $50
  - Test: verified user allowed up to $500
  - Test: user verifies email mid-day → limit immediately changes
  - Test: limit message includes upgrade CTA for unverified users
  - Test: limit resets daily regardless of tier
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** EL-001
- **Files:** `apps/backend/tests/unit/tiered_limits.spec.ts` (new)

---

## LN — Language Auto-Detection for Website

> **Goal:** Website language is determined by the user's phone number. US numbers (+1) → English. Brazil (+55) → Portuguese. Everything else → Spanish. Support 3 languages for now, leave extensible for more later.
> **Deliverable:** M1 #6
> **Priority:** P1
>
> **Design:** Phone prefix → language mapping (same zero-friction approach as currency detection):
> - `+1` → `en` (English)
> - `+55` → `pt` (Portuguese)
> - All other LATAM prefixes → `es` (Spanish)
> - Unknown → `es` (default)
> Future: add more mappings as needed (no code change, just add to map).

#### LN-001 [x] Create phone-to-language mapping utility
- **What:** Shared utility that maps phone prefix to website language code.
- **Acceptance criteria:**
  - New function in `app/utils/phone.ts`: `getLanguageForPhone(phone: string): 'en' | 'es' | 'pt'`
  - `+1` → `en`
  - `+55` → `pt`
  - Everything else → `es`
  - Uses longest-prefix match (so `+1` doesn't accidentally match `+1X` country codes — but for now +1 is only US/Canada which is fine)
  - Export also from `@sippy/shared` if the shared package exists, otherwise keep in backend and duplicate to frontend
- **Verify:** `cd apps/backend && npx tsc --noEmit`
- **Dependencies:** None
- **Context:** `apps/backend/app/services/exchange_rate_service.ts` (existing phone prefix → currency mapping for reference)
- **Files:** `apps/backend/app/utils/phone.ts`

#### LN-002 [x] Auto-set website language on auth
- **What:** After phone verification on setup/wallet/settings pages, detect language from phone and apply it.
- **Acceptance criteria:**
  - After successful `verifyOtp()`, call `getLanguageForPhone(phone)` to determine language
  - Store detected language in `localStorage` key `sippy_lang`
  - If `user_preferences.preferred_language` exists in DB, that takes priority (user explicitly chose)
  - New API endpoint: `GET /api/user-language` → returns `{ language: 'es' | 'en' | 'pt', source: 'preference' | 'phone' }`
  - Frontend reads language on load: check localStorage first, then API, then phone detection
  - Apply language to all UI strings (use existing i18n setup or create simple one)
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** LN-001
- **Files:** `apps/web/lib/auth.ts`, `apps/web/lib/i18n.ts` (new if needed), `apps/backend/start/routes.ts`, `apps/backend/app/controllers/auth_api_controller.ts`

#### LN-003 [x] Add language selector to settings page (manual override)
- **What:** Users can manually override auto-detected language. This saves to `user_preferences.preferred_language` which then takes priority over phone detection.
- **Acceptance criteria:**
  - Language selector in settings: English, Espanol, Portugues
  - `POST /api/set-language` → saves to `user_preferences.preferred_language`
  - After manual selection: localStorage updated, page re-renders in new language
  - "Auto-detect" option that clears the preference and reverts to phone-based detection
  - Selection persists across sessions (DB-backed)
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** LN-002
- **Files:** `apps/web/app/settings/page.tsx`, `apps/backend/start/routes.ts`, `apps/backend/app/controllers/embedded_wallet_controller.ts`

---

## PV — Phone Visibility / Privacy Controls

> **Goal:** Users can control whether their phone number is visible on their public profile. Default: visible. Toggle via settings page or WhatsApp command.
> **Deliverable:** M1 #5
> **Priority:** P2
>
> **Where it lives:**
> - **DB:** `user_preferences.phone_visible BOOLEAN DEFAULT true`
> - **API:** `POST /api/set-privacy` (toggle), `GET /api/privacy-status` (read)
> - **Frontend:** Settings page toggle + profile page respects it
> - **WhatsApp:** `privacy on/off` command
> - **Profile page:** If hidden → show masked phone (***1234) + "Private account"

#### PV-001 [x] Add phone_visible column + API endpoints
- **What:** DB migration + backend API for phone visibility toggle.
- **Acceptance criteria:**
  - New migration: ADD `phone_visible BOOLEAN NOT NULL DEFAULT true` to `user_preferences`
  - `POST /api/set-privacy` — body `{ phoneVisible: boolean }`, requires JWT auth, updates `user_preferences.phone_visible`
  - `GET /api/privacy-status` — returns `{ phoneVisible: boolean }`, requires JWT auth
  - Model updated with new column
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Files:** `apps/backend/database/migrations/*_add_phone_visible.ts` (new), `apps/backend/app/models/user_preference.ts`, `apps/backend/app/controllers/embedded_wallet_controller.ts`, `apps/backend/start/routes.ts`

#### PV-002 [x] Profile page respects phone visibility
- **What:** Public profile page checks `phone_visible` before showing the phone number.
- **Acceptance criteria:**
  - `GET /api/profile/:phone` (or equivalent) returns `phoneVisible` flag
  - If `phone_visible = false`: profile shows masked phone `***1234` + label "Private account"
  - Wallet address always visible (public blockchain data, can't hide)
  - Transaction history still visible (on-chain data)
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** PV-001
- **Files:** `apps/web/app/profile/[phone]/page.tsx`, `apps/backend/app/controllers/embedded_wallet_controller.ts`

#### PV-003 [x] Add privacy toggle to settings page
- **What:** Toggle switch on settings page for phone visibility.
- **Acceptance criteria:**
  - New section: "Privacy" in settings page
  - Toggle: "Show phone number on profile" (default: on)
  - Explanation text: "When off, your phone number is hidden on your public profile"
  - Saves via `POST /api/set-privacy` on toggle
  - Shows current state on page load via `GET /api/privacy-status`
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** PV-001
- **Files:** `apps/web/app/settings/page.tsx`

#### PV-004 [x] WhatsApp privacy command
- **What:** Regex command to toggle phone visibility from WhatsApp.
- **Acceptance criteria:**
  - Regex patterns: `privacy on/off`, `privacidad on/off`, `privacidade on/off`
  - New command type: `'privacy'` in types
  - `privacy on` → phone visible, `privacy off` → phone hidden
  - Confirmation message in user's language: "Your phone number is now hidden/visible on your profile."
  - Trilingual messages
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** PV-001
- **Context:** `apps/backend/app/utils/message_parser.ts` (regex patterns), `apps/backend/app/controllers/webhook_controller.ts` (command handling)
- **Files:** `apps/backend/app/utils/message_parser.ts`, `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/app/utils/messages.ts`, `apps/backend/app/types/index.ts`

---

## TX — Transaction Security (from M1_PLAN P4.1-4.4)

> **Goal:** Transaction confirmation flow, velocity checks, edge case hardening. Required before real money flows in beta.
> **Deliverable:** M1 #3
> **Priority:** P0

#### TX-001 [x] Transaction confirmation flow
- **What:** Before executing a send, reply with confirmation prompt. User must reply YES/SI/SIM to proceed.
- **Acceptance criteria:**
  - Before executing send: reply "Send $10.00 to +57***4567? Reply YES to confirm or NO to cancel." (trilingual)
  - Store pending tx: `Map<phoneNumber, { amount, recipient, timestamp, lang }>`
  - Auto-expire after 2 minutes (cleanup on interval)
  - Only ONE pending tx per user at a time — new send replaces old pending
  - New regex patterns: confirm (`yes`, `si`, `sim`, `confirmar`, `dale`, `va`) and cancel (`no`, `cancel`, `cancelar`, `nao`)
  - New command types: `'confirm'` and `'cancel'`
  - Confirm handler: look up pending tx → execute → clear. Cancel handler: clear → "Transfer cancelled."
  - No pending tx + confirm → "No pending transfer."
  - User sends other command while pending → cancel pending first, process new command
  - **Skip confirmation for amounts <= $5** (configurable via `CONFIRM_THRESHOLD` env var)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Context:** M1_PLAN.md Phase 4.1
- **Files:** `apps/backend/app/utils/message_parser.ts`, `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/app/utils/messages.ts`, `apps/backend/app/types/index.ts`, `apps/backend/start/env.ts`

#### TX-002 [x] Self-send block + concurrent send protection
- **What:** Block sending to yourself. Block multiple simultaneous sends from same user.
- **Acceptance criteria:**
  - Self-send: `fromPhone === toPhone` (after canonicalization) → "You cannot send money to yourself." (trilingual)
  - Check before balance check (fail fast)
  - Concurrent protection: `activeSends: Set<phoneNumber>` — add before processing, remove in `finally` block
  - If user already has send in-flight: "A transfer is already in progress. Please wait." (trilingual)
  - Timeout: clear from `activeSends` after 60s max (safety valve for stuck sends)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** SH-001 (needs canonicalizePhone for self-send check)
- **Files:** `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/app/utils/messages.ts`

#### TX-003 [x] Velocity limiter service
- **What:** Per-user send velocity tracking to prevent abuse.
- **Acceptance criteria:**
  - New service: `app/services/velocity_service.ts`
  - Track per user: sends in last 10 minutes, total USD in last hour, unique new recipients in last hour
  - Rules (configurable via env):
    - Max 5 sends per 10 minutes
    - Max $500 total per hour
    - Max 3 unique new recipients per hour (anti-scatter / anti-spray)
  - In-memory Map with TTL cleanup (same pattern as spam protection)
  - Returns: `{ allowed: boolean, reason?: string }`
  - Trilingual limit messages
  - Unit tests
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Context:** `apps/backend/app/services/rate_limit_service.ts` (follow pattern)
- **Files:** `apps/backend/app/services/velocity_service.ts` (new), `apps/backend/tests/unit/velocity_service.spec.ts` (new)

#### TX-004 [x] Amount sanity checks + input hardening
- **What:** Block obviously abusive or malformed amounts before they reach the chain.
- **Acceptance criteria:**
  - Block amounts > $10,000 (hard ceiling)
  - Warn amounts > $500 in confirmation prompt: "This is a large transfer."
  - Block amounts with more than 2 decimal places (e.g., $10.123)
  - Block amounts = 0
  - Handle comma as decimal separator: "10,50" → 10.50 (common in LATAM)
  - Reject ambiguous thousands separators: "1.000" → reject with clarification message
  - Phone number edge cases: reject < 10 digits, reject > 15 digits, handle "send 10 to 0" → "That doesn't look like a phone number"
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Files:** `apps/backend/app/utils/phone.ts`, `apps/backend/app/utils/message_parser.ts`, `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/app/utils/messages.ts`

---

## AU — Backend Audit (from M1_PLAN P4.8)

> **Goal:** Systematic audit of all backend code for security, error handling, memory leaks, race conditions.
> **Deliverable:** M1 #3
> **Priority:** P1 — do after TX tasks

#### AU-001 [x] Error handling + input validation audit
- **What:** Read every controller, service, and command handler. Verify: every try/catch logs server-side + sends trilingual user message + never leaks internals. Every req.body is validated.
- **Acceptance criteria:**
  - Audit doc: `docs/AUDIT-M1.md` with table: File, Finding, Severity (P0/P1/P2), Status
  - Fix all P0 findings inline
  - All phone numbers normalized before DB lookup
  - All USDC amounts validated as positive with <= 6 decimals before on-chain tx
  - All wallet addresses validated as `0x` + 40 hex chars
  - No stack traces or internal state leaked to users
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** SH-002, TX-001
- **Files:** All backend controllers and services (read), `docs/AUDIT-M1.md` (new)

#### AU-002 [x] Memory leak + race condition audit
- **What:** Audit all in-memory Maps/Sets for TTL cleanup. Check concurrent operation safety.
- **Acceptance criteria:**
  - All Maps have TTL cleanup: `processedMessages`, `spamTracker`, `activeSends`, pending tx, OTP, email codes, velocity
  - Cleanup interval errors caught (don't crash process)
  - Document max memory footprint estimate for 10K active users
  - Race conditions checked: double-confirm, double-send, double-register, double-gas-refuel
  - Findings added to `docs/AUDIT-M1.md`
- **Verify:** Manual review
- **Dependencies:** TX-003
- **Files:** All backend services (read), `docs/AUDIT-M1.md`

---

## WS — Web Session Robustness (from M1_PLAN P4.7)

> **Goal:** Session expiry is handled gracefully. No blank screens or cryptic errors.
> **Deliverable:** M1 #3
> **Priority:** P2

#### WS-001 [x] Session guard hook for authenticated pages
- **What:** `useSessionGuard()` hook that wraps token checking + re-auth flow.
- **Acceptance criteria:**
  - New hook: `apps/web/lib/useSessionGuard.ts`
  - Returns `{ isAuthenticated, token, requireReauth }`
  - If token expired → show inline re-auth prompt (phone + OTP), preserve form state
  - If token valid but < 3 min remaining → warn user
  - Used in `/wallet`, `/settings`, `/setup`
- **Verify:** `cd apps/web && npx tsc --noEmit`
- **Dependencies:** None
- **Files:** `apps/web/lib/useSessionGuard.ts` (new), `apps/web/app/wallet/page.tsx`, `apps/web/app/settings/page.tsx`

---

## MO — Monitoring (from M1_PLAN P7)

> **Goal:** Error tracking, structured logging, health endpoint.
> **Deliverable:** M1 #7
> **Priority:** P2

#### MO-001 [ ] Health endpoint
- **What:** `GET /health` returning DB status, uptime, GasRefuel balance level.
- **Acceptance criteria:**
  - Returns JSON: `{ db: 'ok'|'error', uptime: seconds, gasRefuel: 'healthy'|'low'|'critical', whatsapp: 'ok'|'error', timestamp }`
  - DB check: `SELECT 1`
  - GasRefuel: check ETH balance (healthy > 0.05, low > 0.01, critical <= 0.01)
  - No auth required (for Railway health checks)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Files:** `apps/backend/start/routes.ts`, `apps/backend/app/controllers/health_controller.ts` (new)

#### MO-002 [ ] Sentry integration (backend + frontend)
- **What:** Install and configure Sentry for error tracking.
- **Acceptance criteria:**
  - Backend: `@sentry/node` init on startup, capture unhandled exceptions, manual capture on send failures
  - Frontend: `@sentry/nextjs` for setup/wallet/settings page errors
  - PII redacted: phone numbers masked, wallet addresses truncated in breadcrumbs
  - Environment + release tags set
- **Verify:** `pnpm turbo build`
- **Dependencies:** None
- **Constraints:** Install `@sentry/node` and `@sentry/nextjs` packages
- **Files:** `apps/backend/app/services/sentry_service.ts` (new), `apps/backend/start/env.ts`, `apps/web/next.config.js`, `apps/web/package.json`

---

## AC — Admin Controls (from M1_PLAN P4.5)

> **Goal:** Ability to block users and pause the system for maintenance.
> **Deliverable:** M1 #3
> **Priority:** P2

#### AC-001 [ ] User block/unblock + global pause
- **What:** Admin endpoints to block users and pause all processing.
- **Acceptance criteria:**
  - New migration: ADD `blocked BOOLEAN NOT NULL DEFAULT false` to `user_preferences`
  - `POST /admin/block-user` — `{ phone, reason }`, requires admin auth
  - `POST /admin/unblock-user` — `{ phone }`, requires admin auth
  - Blocked user at top of webhook handler: "Your account has been temporarily suspended." (trilingual)
  - `POST /admin/pause` — maintenance mode, all users get "Sippy is undergoing maintenance."
  - `POST /admin/resume` — resume normal operation
  - In-memory `isPaused` flag (acceptable for single replica)
- **Verify:** `cd apps/backend && nvm use 24 && node ace test`
- **Dependencies:** None
- **Files:** `apps/backend/database/migrations/*_add_blocked_column.ts` (new), `apps/backend/app/controllers/admin_controller.ts`, `apps/backend/app/controllers/webhook_controller.ts`, `apps/backend/start/routes.ts`, `apps/backend/app/utils/messages.ts`

---

## BP — Beta Launch Prep (from M1_PLAN P8)

> **Goal:** 50 testers, e2e test matrix, production hardening.
> **Deliverable:** M1 #10
> **Priority:** P2 — last phase before submission

#### BP-001 [ ] End-to-end test matrix
- **What:** Manual test checklist covering all user flows.
- **Acceptance criteria:**
  - `docs/E2E-TEST-MATRIX.md` with checkboxes for:
    - New user: setup → fund → balance → send → receive → history
    - Returning user: start → balance → send (EN, ES, PT)
    - Edge cases: wrong format, media messages, greetings
    - Security: confirmation, velocity, self-send, concurrent
    - Privacy: toggle visibility, check profile
    - Dual currency: CO, MX, AR, BR numbers
    - Email: add, verify, gate, limit raise
    - Web wallet: send via EOA + smart account
- **Verify:** File exists and is valid markdown
- **Dependencies:** TX-001, EL-001, PV-001, LN-001
- **Files:** `docs/E2E-TEST-MATRIX.md` (new)

#### BP-002 [!] Beta tester onboarding (50 users)
- **What:** MANUAL — onboard 50 testers via WhatsApp broadcast.
- **Dependencies:** BP-001, all P0 tasks complete
- **Constraints:** Requires human action. Agent MUST skip.

#### BP-003 [!] Onramp integration (Maash)
- **What:** BLOCKED — waiting on Maash API docs + credentials.
- **Dependencies:** External (Maash)
- **Constraints:** If still blocked at M1 deadline, execute Path B (mock-tested integration). See M1_PLAN.md "Onramp Acceptance Criteria".
