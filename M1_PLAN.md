# Sippy M1 Plan — Production Ready

**Grant:** Questbook Arbitrum $25K (V8 approved Feb 6, 2026)
**Milestone:** M1 — $12,000 — Production Ready
**Deadline:** March 26, 2026
**Start:** Feb 20, 2026 (~5 weeks)

---

## M1 Deliverables (from approved proposal)

| # | Deliverable | Status | Phase |
|---|------------|--------|-------|
| 1 | Onramp integration (API, testing, user flow) | Blocked (waiting on Maash) | P6 |
| 2 | Non-custodial wallet refinements | 95% | P1 (done), P2, Sweep+Wallet (done) |
| 3 | Security hardening (rate limits, tx checks, error handling) | 75% | P4, rate limiting (partial) |
| 4 | Dual currency display (USD + local) | 0% | P3 |
| 5 | Privacy controls (phone visibility) | 0% | P5 |
| 6 | User settings (daily limits via settings page) | 80% | P5 |
| 7 | Monitoring infrastructure (error tracking, uptime) | 20% | P7 |
| 8 | Legal entity establishment | External | — |
| 9 | WhatsApp production number active | 100% | Done |
| 10 | Closed beta: 50 testers + onramp | 0% | P8 |

**KPIs:** Security features tested, dual currency live, monitoring dashboard active, 50 beta testers, $10K+ USDC volume.

### Onramp Acceptance Criteria (deliverable #1)

Onramp is blocked on Maash API access. Two acceptance paths:

**Path A — Maash unblocked before Mar 26:**
Full e2e: COP deposit via Maash → USDC arrives in user wallet → WhatsApp notification. All tasks in Phase 6 completed and tested.

**Path B — Maash still blocked at M1 deadline (fallback):**
Demonstrate onramp readiness without live Maash integration:
- [ ] `onramp.service.ts` implemented with Maash API client (mock-tested)
- [ ] Webhook receiver (`POST /webhook/onramp`) with signature validation, idempotency
- [ ] `onramp_orders` DB table with full status lifecycle
- [ ] Frontend onramp flow (COP input → exchange rate display → payment redirect)
- [ ] WhatsApp `depositar` / `add funds` command sending fund link
- [ ] Integration test suite passing against mock Maash responses
- [ ] Documentation: what's ready, what's waiting, expected timeline to go live

This fallback demonstrates that the only missing piece is Maash flipping the API key on — no engineering work remains. To be pre-agreed with Questbook reviewer before M1 submission if Path B is needed.

**Action items:**
- Follow up with Maash weekly (owner: Mateo)
- If no response by Mar 10, notify Questbook reviewer and request Path B approval

---

## Phase 1: LLM Layer + Message Quality (COMPLETED)

> Regex-first parsing, trilingual support, professional tone, observability.

### Done
- [x] Invert parsing: regex-first, LLM fallback (messageParser.ts)
- [x] Send commands regex-only (LLM never triggers money movement)
- [x] Trilingual regex patterns EN/ES/PT (all commands)
- [x] Zod validation for LLM outputs (schemas.ts)
- [x] Language detection + persistence with confidence scoring (language.ts)
- [x] Language follows user (auto-updates on language switch)
- [x] Trilingual message catalog — all 35+ user-facing strings (messages.ts)
- [x] Trilingual error messages (errors.ts)
- [x] `lang` threaded through all sendTextMessage/sendButtonMessage calls
- [x] Outbound message sanitizer — trilingual fallback (sanitize.ts)
- [x] LLM personality + product knowledge in system prompt
- [x] Regex greetings (hola/hi/hey/oi — zero LLM cost)
- [x] Regex social phrases (gracias/thanks/ok/dale — zero LLM cost)
- [x] Media message handling (photos/voice/stickers → text-only reply)
- [x] Parse observability logging (parse_log table, correlation keys)
- [x] PYUSD → USDC cleanup across codebase
- [x] 6 security bugs fixed (recipient lang, fund notification lang, dead column, etc.)

### Files Modified
- `backend/src/utils/messageParser.ts` — regex-first parser
- `backend/src/utils/messages.ts` — trilingual catalog
- `backend/src/utils/errors.ts` — trilingual error messages
- `backend/src/utils/sanitize.ts` — trilingual sanitizer
- `backend/src/utils/language.ts` — new: language detection
- `backend/src/utils/phone.ts` — phone normalization
- `backend/src/types/schemas.ts` — new: Zod schemas
- `backend/src/types/index.ts` — extended types
- `backend/src/services/llm.service.ts` — Zod integration, simplified prompt
- `backend/src/services/whatsapp.service.ts` — lang param threading
- `backend/src/services/db.ts` — parse_log table, user_preferences
- `backend/src/commands/send.command.ts` — lang threading, recipient lang
- `backend/src/commands/balance.command.ts` — lang threading
- `backend/src/commands/start.command.ts` — lang threading
- `backend/server.ts` — language persistence, greeting/social/media handling

---

## Phase 2: Onboarding Tightening

> The first 60 seconds determine if a user stays. Setup → wallet → spend permission must be bulletproof.
> Affects deliverables #2, #3, #10.

### 2.1 WhatsApp First-Contact Flow

- [ ] **Smart welcome based on user state** — start.command.ts
  - New user (no wallet): send setup link with clear CTA
  - Wallet created but no spend permission: send setup link pointing to permission step
  - Wallet + permission but expired/revoked: guide to settings to re-enable
  - Fully set up: "Welcome back" + balance summary
  - Current start.command.ts already has this logic — audit each branch for clarity and edge cases

- [ ] **Proactive nudge after wallet creation** — embedded-wallet.routes.ts
  - After `POST /api/register-wallet` succeeds: send WhatsApp message
    "Your wallet is ready. Now set your daily spending limit to start sending money."
  - Include setup link pointing directly to permission step
  - If user already has permission, skip nudge

- [ ] **Proactive nudge after spend permission** — embedded-wallet.routes.ts
  - After `POST /api/register-permission` succeeds: send WhatsApp message
    "You're all set. Try sending money: send 1 to +57..."
  - Include quick-start tips

- [ ] **Abandoned setup reminder** — scheduled check (optional for M1)
  - If wallet created > 24h ago but no spend permission → send reminder
  - Simple: cron job or periodic check on server start
  - "You're almost there. Complete your setup to start sending dollars."
  - Max 1 reminder per user (track `setup_reminder_sent` in DB)

### 2.2 Setup Page UX Hardening — frontend

- [ ] **Error recovery on setup page** — frontend/app/setup/page.tsx
  - If SMS verification fails: clear error message + retry button (not just a spinner)
  - If CDP wallet creation fails: specific guidance (network error vs timeout vs invalid phone)
  - If spend permission tx fails: explain what happened, offer retry
  - If user closes page mid-setup and returns: detect state, resume from where they left off

- [ ] **Setup progress indicator** — frontend/app/setup/page.tsx
  - Visual stepper: Step 1: Verify Phone → Step 2: Create Wallet → Step 3: Set Limit
  - Show current step clearly
  - Allow going back to previous steps

- [ ] **Phone number validation on setup** — frontend
  - Validate phone format before sending to CDP (catch typos early)
  - Show expected format with country code example
  - Reject obviously invalid numbers client-side

- [ ] **Deep link from WhatsApp** — setup URL params
  - Setup link includes phone number pre-filled: `sippy.lat/setup?phone=+573001234567`
  - When user lands, phone field is pre-populated (less friction)
  - Verify pre-filled phone matches SMS verification phone (security)

### 2.3 Post-Setup Onboarding Messages

- [ ] **"What's next" guide after full setup** — messages.ts
  - After permission is granted, user's first WhatsApp interaction should include:
    - Their balance ($0.00 for new users)
    - How to add funds (fund link)
    - How to send (example command)
    - How to get help
  - Keep it to 4 lines max — don't overwhelm

- [ ] **Empty balance guidance** — balance.command.ts
  - When balance is $0.00: append "Add funds to get started: [fund link]"
  - Don't show this for users with balance > 0 (they don't need the nudge)

### 2.4 Edge Cases

- [ ] **User sends commands before setup complete**
  - "balance" with no wallet → "No wallet found. Send 'start' to set up." (already exists, verify tone)
  - "send 10 to +57..." with no wallet → same, but gentler: "Set up your wallet first to start sending."
  - "send 10 to +57..." with wallet but no permission → link to permission step specifically

- [ ] **User tries to set up twice**
  - If wallet already exists, `/setup` page should detect and skip to permission step
  - If permission already exists, show "You're already set up" + redirect to settings

- [ ] **User revokes permission then tries to send**
  - Clear message: "Your spending permission has been revoked. Re-enable it in settings."
  - Include settings link

### Files to Modify
- `backend/src/commands/start.command.ts` — state-aware welcome messages
- `backend/src/commands/balance.command.ts` — empty balance guidance
- `backend/src/commands/send.command.ts` — no-permission edge case messaging
- `backend/src/routes/embedded-wallet.routes.ts` — post-registration WhatsApp nudges
- `backend/src/utils/messages.ts` — onboarding message templates
- `frontend/app/setup/page.tsx` — error recovery, progress stepper, phone validation
- `frontend/app/settings/page.tsx` — already-setup detection

### Estimate: 8-10h

---

## Phase 3: Dual Currency Display

> Show USD + local currency in all balances and transaction messages.
> Deliverable #4. Currency is auto-detected from phone country code — no user preference needed.

### Design: Phone Prefix → Currency

Currency is derived from the user's phone number, not a manual preference:

```
+57 → COP (Colombia)
+52 → MXN (Mexico)
+54 → ARS (Argentina)
+55 → BRL (Brazil)
+51 → PEN (Peru)
+56 → CLP (Chile)
+1  → USD (US — no conversion needed, skip)
All others → no local currency shown
```

This is zero-friction: users never configure anything, they just see their local currency automatically.

### Tasks

- [ ] **3.1 Exchange rate service** — new file `backend/src/services/exchange-rate.service.ts`
  - Fetch USD→local rates from free API (exchangerate-api.com or similar)
  - Cache all LATAM rates in a single call, refresh every 15 minutes
  - In-memory cache with TTL — if API fails, serve last known rate
  - Export: `getLocalRate(currencyCode: string): Promise<number | null>`
  - Export: `getCurrencyForPhone(phoneNumber: string): string | null`
    - Extract country code from phone prefix
    - Map: `{ '57': 'COP', '52': 'MXN', '54': 'ARS', '55': 'BRL', '51': 'PEN', '56': 'CLP' }`
    - Return null for US (+1) or unknown prefixes → no conversion

- [ ] **3.2 Dual amount formatter** — messages.ts
  - New helper: `formatDualAmount(usd: number, rate: number | null, currency: string | null): string`
    - If rate + currency: returns `$10.00 (~41,500 COP)`
    - If no rate/currency: returns `$10.00` (USD only, graceful fallback)
  - Format local amounts with thousands separator (locale-aware)

- [ ] **3.3 Update message formatters** — messages.ts
  - `formatBalanceMessage` — pass rate/currency, show dual amount
  - `formatSendProcessingMessage` — show local equivalent of send amount
  - `formatSendSuccessMessage` — show local equivalent
  - `formatSendRecipientMessage` — use recipient's phone prefix for their local currency
  - `formatInsufficientBalanceMessage` — show both for balance and needed
  - All formatters already accept `lang` — add optional `localRate` + `localCurrency` params

- [ ] **3.4 Thread rate through command handlers** — server.ts
  - Before handleCommand: fetch rate for user's phone prefix
  - Pass rate/currency to handleCommand → to balance, send, start handlers
  - Non-blocking: if rate fetch fails, show USD only — never error to user
  - For send: also fetch recipient's local currency for their notification

### Files to Create
- `backend/src/services/exchange-rate.service.ts`

### Files to Modify
- `backend/src/utils/messages.ts` — dual amount formatting in all money-related templates
- `backend/server.ts` — rate fetching before handleCommand
- `backend/src/commands/send.command.ts` — pass rate to formatters
- `backend/src/commands/balance.command.ts` — pass rate to formatters

### Estimate: 6-8h

---

## Phase 4: Security Hardening

> Transaction confirmation, webhook validation, velocity checks, edge case coverage.
> Deliverable #3. Required before any real money flows in beta.
>
> **Priority note:** CDP session persistence is short-lived (minutes, not days). Users re-authenticate frequently on the web wallet and settings page. This makes session management and auth UX a P0 concern — every friction point multiplies. Phase 4 must also harden the web wallet auth experience: session refresh before expiry, clear re-auth prompts, and graceful handling of expired tokens mid-operation (e.g., mid-send or mid-sweep). The WhatsApp `wallet` command (see below) becomes the primary re-entry point.

### 4.1 Transaction Confirmation Flow

- [ ] **Confirmation prompt before every send**
  - Before executing, reply: "Send $10.00 to +57***4567? Reply YES to confirm or NO to cancel."
  - Trilingual: "Enviar $10.00 a +57***4567? Responde SI para confirmar o NO para cancelar."
  - Store pending tx: `Map<phoneNumber, { amount, recipient, timestamp, lang }>`
  - Auto-expire after 2 minutes (cleanup on interval)
  - Only ONE pending tx per user at a time — new send replaces old pending

- [ ] **Confirm/cancel regex patterns** — messageParser.ts
  - `confirm` patterns: `yes`, `si`, `sim`, `confirmar`, `confirm`, `dale`, `va`
  - `cancel` patterns: `no`, `cancel`, `cancelar`, `nao`
  - New command types: `'confirm'` and `'cancel'` in types/index.ts

- [ ] **Confirmation handler** — server.ts
  - `case 'confirm'`: look up pending tx → execute → clear pending
  - `case 'cancel'`: clear pending → "Transfer cancelled."
  - If user sends confirm/cancel with no pending tx → "No pending transfer."
  - If user sends any OTHER command while pending → cancel pending first, then process new command

- [ ] **Skip confirmation for micro amounts**
  - Configurable threshold: `CONFIRM_THRESHOLD = 5` (env var)
  - Amounts <= threshold execute immediately (frictionless for small payments)
  - Amounts > threshold require confirmation

### 4.2 Webhook Security

- [ ] **WhatsApp webhook signature validation** — server.ts
  - Validate `X-Hub-Signature-256` header on POST /webhook/whatsapp
  - HMAC-SHA256 with `WHATSAPP_APP_SECRET` env var
  - Reject requests with invalid signature (403)
  - Skip validation in dev when `WHATSAPP_APP_SECRET` is not set (log warning)

- [ ] **Admin endpoints require auth** — server.ts
  - All `/admin/*` and `/debug/*` endpoints require `ADMIN_API_KEY` header
  - Return 401 if missing/wrong
  - Block access in production without key

### 4.3 Velocity & Fraud Checks

- [ ] **Send velocity limiter** — new `backend/src/services/velocity.service.ts`
  - Track per user: sends in last 10 minutes, total USD in last hour
  - Rules (configurable via env):
    - Max 5 sends per 10 minutes
    - Max $500 total per hour
    - Max 3 unique new recipients per hour (anti-scatter)
  - In-memory Map with TTL cleanup (same pattern as spam protection)
  - Returns: `{ allowed: boolean, reason?: string }`
  - Trilingual limit message

- [ ] **Self-send block** — send.command.ts
  - Block: `fromPhone === toPhone` → "You cannot send money to yourself."
  - Check before balance check (fail fast)

- [ ] **New recipient warning** — send.command.ts
  - Track send history: `sent_to` table or in-memory Set per user
  - First time sending to a number → add to confirmation prompt:
    "This is a new recipient. Please verify the number."
  - Subsequent sends to same recipient → normal confirmation

- [ ] **Amount sanity checks** — send.command.ts (before confirmation)
  - Block amounts > $10,000 (hard ceiling, no override)
  - Warn amounts > $500: extra line in confirmation "This is a large transfer."
  - Block non-round suspicious amounts (e.g., $9999.99) → likely testing/abuse
  - Block amounts with more than 2 decimal places (e.g., $10.123)

### 4.4 Edge Cases — Input Hardening

- [ ] **Phone number edge cases** — phone.ts / send.command.ts
  - Reject phone numbers that are too short (< 10 digits after normalization)
  - Reject phone numbers that are too long (> 15 digits)
  - Reject known non-mobile prefixes if detectable
  - Handle "send 10 to myself" / "send 10 to me" → self-send block message
  - Handle "send 10 to 0" / "send 10 to 123" → recipient not found

- [ ] **Amount edge cases** — messageParser.ts / send.command.ts
  - "send 0 to +57..." → "Please send a positive amount."
  - "send 0.001 to +57..." → allow (valid micro-payment)
  - "send 99999999 to +57..." → hard block at $10,000
  - "send -5 to +57..." → regex won't match (negative), falls to unknown
  - "send all to +57..." → not matched by regex → format hint
  - "send $10.5.5 to +57..." → regex won't match → format hint

- [ ] **Concurrent send protection** — send.command.ts
  - If user already has a send in-flight (processing), block new send
  - In-memory Set: `activeSends: Set<phoneNumber>`
  - Add before processing, remove after completion (in finally block)
  - "A transfer is already in progress. Please wait."

- [ ] **Webhook replay protection**
  - Already have message dedup (processedMessages Map)
  - Add: reject messages older than 5 minutes (stale timestamp)
  - `parseInt(timestamp) * 1000 < Date.now() - 5 * 60 * 1000` → skip

### 4.5 Admin Controls

- [ ] **User block/unblock** — db.ts + server.ts
  - Add `blocked BOOLEAN DEFAULT false` to user_preferences table
  - Check at top of webhook handler (before parsing)
  - Blocked user gets: "Your account has been temporarily suspended. Contact support."
  - `POST /admin/block-user` — { phone, reason }
  - `POST /admin/unblock-user` — { phone }

- [ ] **Global pause** — server.ts
  - `POST /admin/pause` — stop processing new commands (maintenance mode)
  - All users get: "Sippy is undergoing maintenance. Please try again shortly."
  - `POST /admin/resume` — resume normal operation

### 4.6 Custom Auth: Replace CDP SMS with Sippy OTP (Twilio + JWT)

> **Why:** CDP's `useSignInWithSms` sends OTP from "Coinbase" — confusing for Sippy users. Sessions are short-lived with no control over duration. Custom auth via `useAuthenticateWithJWT` gives us full control over branding, session TTL, and re-auth policy.

- [ ] **Backend: Twilio OTP service** — new `backend/src/services/otp.service.ts`
  - `POST /api/auth/send-otp` — sends OTP via Twilio to phone (E.164 format)
  - `POST /api/auth/verify-otp` — verifies code, returns signed JWT
  - SMS template: "Sippy: Tu codigo es 123456" (branded, trilingual)
  - OTP: 6-digit, 5-min expiry, max 3 attempts, rate limit 5 OTPs/phone/hour
  - Store pending OTPs in-memory Map (same pattern as other throttles)

- [ ] **Backend: JWT issuer** — `backend/src/services/jwt.service.ts`
  - Generate RS256 keypair (store private key in env `JWT_PRIVATE_KEY`, publish public key via JWKS)
  - `POST /api/auth/.well-known/jwks.json` — serves public key for CDP to validate
  - JWT claims: `{ sub: phoneNumber, iat, exp }` — set `exp` to 30 minutes (configurable via env)
  - Register JWKS endpoint in CDP Portal under "Custom auth" tab

- [ ] **Frontend: Replace `useSignInWithSms` with `useAuthenticateWithJWT`** — all pages
  - Update `CDPHooksProvider` config with `customAuth: { getJwt }` callback
  - `getJwt` calls `POST /api/auth/verify-otp` on first auth, then `POST /api/auth/refresh` for session extension
  - Replace auth flows in `/setup`, `/settings`, `/wallet` — phone input + OTP input stays the same UI, but OTP goes to our backend instead of CDP
  - Session TTL controlled by JWT `exp` — 30 min default, require fresh OTP for sensitive ops (export, revoke)

- [ ] **Sensitive operation re-auth gate**
  - Before export key or revoke permission: check if JWT was issued < 5 min ago
  - If stale: require fresh OTP ("Verify again to continue") before proceeding
  - Prevents session hijacking from accessing high-risk operations

**Prerequisites:** Twilio account + phone number, CDP Portal custom auth configuration
**Estimate:** 10-14h
**Dependencies:** None — can be done in parallel with other Phase 4 tasks

### 4.7 Web Wallet Session Robustness

- [ ] **Proactive session refresh** — frontend /wallet + /settings
  - CDP sessions expire quickly (minutes). Before any operation (send, sweep, permission change), call `getAccessToken()` and handle null → show re-auth prompt inline instead of a broken state
  - If session dies mid-send or mid-sweep: catch, show clear "Session expired — verify again to continue", preserve form state so user doesn't lose input
  - Consider a `useSessionGuard()` hook that wraps `getAccessToken()` with auto-redirect to phone step on failure

- [ ] **WhatsApp `wallet` command** — messageParser.ts + server.ts + messages.ts
  - Regex: `wallet`, `billetera`, `mi billetera`, `carteira`, `my wallet`
  - Reply with personalized link: `sippy.lat/wallet?phone=+57...`
  - Trilingual: "Open your wallet: [link]"
  - Same pattern as existing settings link delivery

- [ ] **WhatsApp post-setup wallet nudge** — embedded-wallet.routes.ts
  - After spend permission is registered, include wallet link in the "you're all set" WhatsApp message
  - "You can also manage your wallet anytime at sippy.lat/wallet"

### Files to Create
- `backend/src/services/velocity.service.ts` — send rate limiting + fraud checks

### Files to Modify
- `backend/src/commands/send.command.ts` — confirmation flow, self-send, concurrent protection
- `backend/src/utils/messageParser.ts` — confirm/cancel/yes/no regex + wallet command
- `backend/src/utils/messages.ts` — confirmation prompts, velocity messages, blocked messages, wallet link
- `backend/src/utils/phone.ts` — phone validation edge cases
- `backend/src/types/index.ts` — add 'confirm', 'cancel', 'wallet' commands
- `backend/server.ts` — webhook validation, pending tx, blocked check, admin endpoints, stale msg check, wallet handler
- `backend/src/services/db.ts` — blocked column
- `backend/src/routes/embedded-wallet.routes.ts` — wallet link in post-setup nudge
- `frontend/app/wallet/page.tsx` — session guard, re-auth UX
- `frontend/app/settings/page.tsx` — session guard for sweep/export

### Estimate: 18-22h

---

## Phase 5: Privacy Controls + Settings Completion

> Phone visibility toggle, language preference UI, settings page polish.
> Deliverables #5, #6.

### Tasks

- [ ] **5.1 Phone visibility setting** — DB + backend
  - Add `phone_visible BOOLEAN DEFAULT true` to user_preferences table
  - Add `getPhoneVisibility()` / `setPhoneVisibility()` helpers in db.ts
  - New API route: `POST /api/set-privacy` (toggle phone visibility)

- [ ] **5.2 Profile page respects visibility** — frontend
  - `frontend/app/profile/[phone]/page.tsx` — check visibility before showing
  - If phone_visible=false: show masked phone (***1234) + "Private account"
  - Wallet address still visible (public blockchain data)

- [ ] **5.3 Language preference UI** — frontend settings
  - Add language selector to settings page (English, Espanol, Portugues)
  - Save via new API route → calls `setUserLanguage` in backend
  - New API route: `POST /api/set-language`

- [ ] **5.4 Privacy toggle UI** — frontend settings
  - Add "Phone visibility" toggle to settings page
  - Explanation text: "When off, your phone number is hidden on your public profile"
  - Save via `POST /api/set-privacy`

- [ ] **5.5 WhatsApp privacy command** — regex
  - `privacidad on/off` / `privacy on/off` regex command
  - Toggles phone_visible
  - Confirmation message in user's language

- [ ] **5.6 Recovery email verification** — DB + backend + frontend
  - Gate sensitive operations (key export, permission revoke) behind email confirmation
  - Add `verified_email` column to user DB (hashed for storage, raw for sending codes)
  - New endpoint: `POST /api/verify-email` — sends 6-digit code via Resend (free tier: 3K/month)
  - New endpoint: `POST /api/confirm-email-code` — validates code (10-min expiry, 3 attempts max)
  - Collect email during `/setup` onboarding (after SMS verify): "Add a recovery email (recommended)"
  - Before export or revoke: if user has verified email → require email code. If no email → show warning but still allow
  - Threat mitigated: SIM-swapper can sign in via CDP but can't export key or revoke permissions without email inbox
  - Uses Resend transactional email (generous free tier, simple API)
  - For M2: push CDP team (Austin/David) to support email as platform-level 2FA

- [x] **5.7 Sweep-to-EOA + Webapp Fallback Wallet** — DONE (shipped ahead of M2)
  - Sweep-to-EOA integrated into export flow on /settings: warning → sweep_offer → sweeping → export_active
  - Auto-skips sweep if smart account balance < $0.01; user can also skip manually
  - Uses `useSendUserOperation` with `evmSmartAccountObjects` (never EOA fallback)
  - New `/wallet` page: SMS auth → balance card (30s auto-refresh) → send USDC (to phone or 0x address) → activity list
  - Send uses authenticated `POST /api/resolve-phone` (per-user throttle, 20/hr) for phone→wallet resolution
  - Audit trail: `POST /api/log-web-send` → `web_send_log` table (fire-and-forget, tx_hash dedup)
  - IP rate limiting on public `GET /resolve-phone` (10 req/min/IP, proxy-aware)
  - `swept` event added to export audit schema
  - Web wallet is unrestricted self-custody mode (user signs directly, no backend limits)
  - Shared infra: `lib/usdc-transfer.ts` (encodeUsdcTransfer, ensureGasReady, buildUsdcTransferCall)
  - Nav: /settings ↔ /wallet cross-links for authenticated users
  - "Recover access" info box removed from wallet security section — will re-add when email recovery (5.6) ships

### Files Created (5.7)
- `frontend/lib/usdc-transfer.ts` — shared USDC transfer encoding + gas helper
- `frontend/app/wallet/page.tsx` — webapp fallback wallet page

### Files Modified (5.7)
- `backend/src/types/schemas.ts` — `swept` event + `webSendEventSchema`
- `backend/src/services/db.ts` — `web_send_log` table + `logWebSend()` helper
- `backend/src/routes/embedded-wallet.routes.ts` — `POST /api/resolve-phone` + `POST /api/log-web-send`
- `backend/server.ts` — trust proxy + IP rate limiter on `GET /resolve-phone`
- `frontend/lib/constants.ts` — `USDC_ADDRESS` + `USDC_DECIMALS`
- `frontend/app/settings/page.tsx` — sweep-to-EOA flow + /wallet nav link

### Files to Create (remaining)
- `backend/src/services/email.service.ts` — Resend integration + code generation/verification

### Files to Modify (remaining)
- `backend/src/services/db.ts` — phone_visible column + helpers, verified_email column + helpers
- `backend/src/routes/embedded-wallet.routes.ts` — new API routes (privacy, email verify, email confirm)
- `backend/src/utils/messageParser.ts` — privacy command regex
- `backend/src/utils/messages.ts` — privacy confirmation messages
- `backend/src/types/index.ts` — add 'privacy' command
- `backend/server.ts` — privacy command handler
- `frontend/app/settings/page.tsx` — language + privacy UI, email collection
- `frontend/app/setup/page.tsx` — email collection step during onboarding
- `frontend/app/profile/[phone]/page.tsx` — visibility check

### Estimate: 10-14h (remaining tasks 5.1-5.6)

---

## Phase 6: Onramp Integration

> Fiat (COP) → USDC flow via Maash.
> Deliverable #1. **BLOCKED: waiting on Maash API response.**

### Status
- Partner: Maash (identified, agreement in place)
- Blocker: Waiting on API docs + credentials from Maash
- Action: Follow up weekly. Everything else in M1 can ship independently.
- Fallback: See "Onramp Acceptance Criteria" at top of document for Path B if still blocked at deadline.

### Tasks (to start once unblocked)

- [ ] **6.1 Maash API integration** — new `backend/src/services/onramp.service.ts`
  - API client for Maash endpoints (create order, check status, webhook)
  - Handle: COP amount → USDC conversion → deposit to user wallet address
  - Error handling: timeout, failed conversion, partial fills
  - Signature validation on Maash webhooks

- [ ] **6.2 Onramp webhook receiver** — server.ts
  - `POST /webhook/onramp` — receive deposit confirmations from Maash
  - Validate webhook signature
  - On success: notify user via WhatsApp ("$X deposited to your wallet")
  - On failure: notify user + log for investigation
  - Idempotency: dedup by Maash order ID

- [ ] **6.3 Onramp frontend flow** — fund page rewrite
  - Replace ETH swap flow with fiat onramp flow
  - Step 1: User enters COP amount (or USD amount → show COP equivalent)
  - Step 2: Show USDC equivalent + exchange rate + Maash fee
  - Step 3: Redirect to Maash payment page (PSE, Nequi, bank transfer)
  - Step 4: Confirmation screen after webhook callback
  - Keep existing ETH fund path as secondary option

- [ ] **6.4 WhatsApp fund trigger** — regex + handler
  - `agregar fondos` / `add funds` / `adicionar fundos` / `depositar` → send fund link
  - Include personalized URL with phone number pre-filled
  - Trilingual message with step-by-step instructions

- [ ] **6.5 Onramp order tracking** — DB
  - New table: `onramp_orders` (id, phone, amount_local, currency, amount_usdc, status, partner_ref, created_at, completed_at)
  - Status lifecycle: created → pending_payment → processing → completed / failed / expired
  - `GET /api/onramp-status/:orderId` for frontend polling

- [ ] **6.6 Frontend PYUSD → USDC migration**
  - Current fund page swaps ETH → PYUSD (legacy ETHOnline code)
  - Update `frontend/lib/uniswapSwap.ts` to target USDC
  - Update all contract address references
  - Update all UI text

### Files to Create
- `backend/src/services/onramp.service.ts`

### Files to Modify
- `backend/server.ts` — onramp webhook endpoint, fund command handler
- `backend/src/services/db.ts` — onramp_orders table
- `backend/src/utils/messageParser.ts` — fund command regex
- `backend/src/utils/messages.ts` — onramp/fund notification messages
- `frontend/app/fund/page.tsx` — rewrite for fiat onramp flow
- `frontend/lib/uniswapSwap.ts` — PYUSD → USDC

### Estimate: 15-20h (once unblocked)

---

## Phase 7: Monitoring Infrastructure

> Error tracking, structured logging, health dashboard.
> Deliverable #7.

### Tasks

- [ ] **7.1 Sentry integration** — backend
  - Install `@sentry/node`
  - Init in server startup with environment + release tags
  - Capture: unhandled exceptions, unhandled rejections
  - Manual capture: send failures, WhatsApp API errors, LLM errors, DB errors
  - Redact PII: phone numbers, wallet addresses in breadcrumbs

- [ ] **7.2 Structured logging** — replace console.log
  - Install `pino` (lightweight, JSON by default)
  - Replace all `console.log/warn/error` with logger calls
  - Fields: timestamp, level, message, phoneNumber (masked), messageId, command
  - Redact: full phone numbers → last 4 digits only in logs
  - Log levels: error (failures), warn (degraded), info (commands), debug (verbose)

- [ ] **7.3 Health endpoint** — server.ts
  - `GET /health` — returns:
    - DB: connected/error (try `SELECT 1`)
    - WhatsApp API: ok/error (check env vars present)
    - LLM: enabled + available / disabled
    - GasRefuel: balance level (healthy/low/critical)
    - Uptime: seconds since start
    - Last successful transaction: timestamp from DB

- [ ] **7.4 Enhanced parse stats** — already exists, polish
  - `/debug/parse-stats` — add: regex vs LLM ratio, command frequency, language distribution
  - Add: error rate by type, avg latency percentiles

- [ ] **7.5 Frontend Sentry** — Next.js
  - Install `@sentry/nextjs`
  - Track: settings page errors, setup flow failures, fund page errors
  - Source maps upload for readable stack traces

### Files to Create
- `backend/src/utils/logger.ts` — pino logger wrapper

### Files to Modify
- `backend/server.ts` — Sentry init, health endpoint, replace console.log
- `backend/package.json` — add @sentry/node, pino
- `backend/src/commands/*.ts` — replace console.log with logger
- `backend/src/services/*.ts` — replace console.log with logger
- `frontend/package.json` — add @sentry/nextjs
- `frontend/next.config.js` — Sentry config

### Estimate: 8-10h

---

## Phase 8: Beta Launch Prep

> 50 testers, end-to-end validation, documentation.
> Deliverable #10.

### Tasks

- [ ] **8.1 End-to-end test matrix** — manual checklist
  - New user flow: setup → fund → balance → send → receive → history
  - Returning user: start → balance → send (EN, ES, PT)
  - Edge cases: wrong format, insults, media messages, greetings, social phrases
  - Security: confirmation flow, velocity limits, self-send, concurrent sends
  - Onramp: COP deposit → USDC arrives → send via WhatsApp (if Maash ready)
  - Language: auto-detect, explicit switch, persistence across commands
  - Privacy: toggle visibility, check profile page

- [ ] **8.2 Beta tester onboarding**
  - WhatsApp broadcast template for inviting testers
  - Step-by-step setup instructions (trilingual)
  - Known limitations list
  - Feedback form link

- [ ] **8.3 Bug bash + polish**
  - Fix all issues found during e2e testing
  - Polish response timing
  - Verify all error paths → proper trilingual messages
  - Verify dual currency displays correctly for CO/MX/AR/BR numbers

- [ ] **8.4 Production environment check**
  - Railway deployment config verified
  - Database backups configured
  - WhatsApp Business API rate limits documented
  - GasRefuel contract funded (check ETH balance)
  - Sentry alerts configured + tested
  - Domain + SSL verified
  - All env vars documented

- [ ] **8.5 Beta tracking**
  - Query parse_log + phone_registry for: active users, tx count, volume
  - Weekly summary for grant reporting

### Estimate: 8-10h

---

## Timeline (5 weeks)

```
Week 1 (Feb 20-26):
  Onboarding Tightening (P2) ........... [8-10h]
  Maash: follow up on API docs

Week 2 (Feb 27 - Mar 5):
  Dual Currency Display (P3) ........... [6-8h]
  Security Hardening (P4) start ........ [6-8h]

Week 3 (Mar 6-12):
  Security Hardening (P4) finish ....... [8-10h]
  Privacy + Settings (P5) .............. [6-8h]

Week 4 (Mar 13-19):
  Monitoring Infrastructure (P7) ....... [8-10h]
  Onramp (P6) if Maash unblocked ...... [15-20h]
  Frontend PYUSD → USDC (P6.6) ........ [can start without Maash]

Week 5 (Mar 20-26):
  Beta Launch Prep (P8) ................ [8-10h]
  Onramp testing (if ready)
```

**Total estimated: 65-84h** across both devs (includes all 8 phases)

**Critical path:** Onboarding (P2) → Dual Currency (P3) → Security (P4) → Beta Prep (P8).
Privacy (P5) and Monitoring (P7) can parallelize with Security (P4).
**External dependency:** Onramp (P6) blocked on Maash. Everything else ships independently. See "Onramp Acceptance Criteria" above for fallback plan.

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Maash API not ready by M1 | High | Medium | Fallback Path B: mock-tested integration + readiness checklist (see Onramp Acceptance Criteria). Pre-agree with Questbook if needed by Mar 10. |
| Exchange rate API limits | Low | Low | 15-min cache, fallback to last known, multiple providers |
| WhatsApp rate limits during beta | Medium | Low | Already approved 2K bot-initiated/day + unlimited user-initiated |
| GasRefuel runs low during beta | Medium | Low | Health endpoint monitors balance, alert on low |
| Confirmation flow adds friction | Medium | Low | Skip for amounts ≤ $5, keep it fast for micro-payments |
| LLM costs spike | Low | Low | Regex handles 80%+ of messages (zero LLM cost). Remaining ~20% go to Groq free tier (Llama 3.3 70B). If rate limits hit, LLM degrades gracefully to regex-only. |

---

## What's NOT in M1 Scope

- Multi-token support (USDC only)
- Multi-country launch (Colombia focus, LATAM infrastructure ready)
- DeFi integrations / yield / savings
- Telegram or other messaging platforms
- Admin dashboard UI (API-only for now)
- Mobile app
- Formal smart contract audit (GasRefuel is ~100 lines, internal review sufficient)
- PIN/2FA for transfers (confirmation flow is sufficient for M1 limits)
- CDP platform-level email 2FA (M2 ask for OCL — M1 uses our own email gate for sensitive ops)
- ~~Smart account → EOA sweep tool~~ **DONE** — shipped in Phase 5.7 with webapp fallback wallet
