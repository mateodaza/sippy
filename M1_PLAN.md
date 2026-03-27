# Sippy M1 Plan — Production Ready

**Grant:** Questbook Arbitrum $25K (V8 approved Feb 6, 2026)
**Milestone:** M1 — $12,000 — Production Ready
**Deadline:** March 26, 2026
**Start:** Feb 20, 2026 (~5 weeks)

---

## M1 Deliverables (from approved proposal)

| #   | Deliverable                                                 | Status                     | Phase                                                                                                                                                                           |
| --- | ----------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Onramp integration (API, testing, user flow)                | Blocked (waiting on Maash) | P6                                                                                                                                                                              |
| 2   | Non-custodial wallet refinements                            | 100%                       | P1, P2, Sweep+Wallet, custom auth, unified wallet UI (Free gas + Direct modes), web send hardened — all done                                                                    |
| 3   | Security hardening (rate limits, tx checks, error handling) | 100%                       | SH (phone sanitization), TX (confirmation, self-send, velocity, amount hardening), EL (tiered limits), AU (audit), AC (block/unblock, global pause), web send guards — all done |
| 4   | Dual currency display (USD + local)                         | 100%                       | P3 (26 LATAM currencies, 24h cache)                                                                                                                                             |
| 5   | Privacy controls + Email Recovery                           | 100%                       | PV (phone visibility toggle, profile masking, WhatsApp command), email recovery — all done                                                                                      |
| 6   | User settings (daily limits via settings page)              | 100%                       | LN (language auto-detect + selector), EL (tiered limit display), PV (privacy toggle) — all done                                                                                 |
| 7   | Monitoring infrastructure (error tracking, uptime)          | 100%                       | MO (Sentry backend+frontend, health endpoint), PostHog analytics, indexer, admin dashboard — all done                                                                           |
| 8   | Legal entity establishment                                  | External                   | —                                                                                                                                                                               |
| 9   | WhatsApp production number active                           | 100%                       | Done                                                                                                                                                                            |
| 10  | Closed beta: 50 testers + onramp                            | 0%                         | P8 (E2E test matrix done, beta onboarding pending)                                                                                                                              |

**KPIs:** Security features tested, dual currency live, monitoring dashboard active, 50 beta testers, $10K+ USDC volume.

> **Note:** Backend migrated from Express monolith to AdonisJS v7 (Feb 28, 2026). All 18 routes ported with identical paths/methods/JSON responses. **500+ tests passing** (as of Mar 13). Frontend-compatible — no breaking changes. Admin panel with analytics dashboard deployed. Code at `apps/backend/`.

---

## Developer Handoff Notes

**Source of truth:** This file (`M1_PLAN.md`) is the implementation plan. `PROJECT-STATUS.md` is the external-facing progress doc.

**Rule: update `PROJECT-STATUS.md` after every shipped feature.** When you finish a task, update the deliverable percentages, add a line to "Recent Changes" with the date and a one-liner, and update the "What's Working" / "What's In Progress" sections if needed. This keeps Questbook reporting and internal alignment effortless.

**Our users are regular people — not crypto natives.** Every auth flow, recovery path, and error message must assume zero blockchain knowledge. If a flow would confuse your mom, simplify it. No jargon, no hex addresses in error messages, no "transaction reverted." Say "something went wrong, try again" and log the details server-side.

**Key architecture context:**

- CDP Embedded Wallets are non-custodial. Users never see private keys unless they export on `/settings`
- Smart accounts (ERC-4337) hold the USDC. The EOA is the signer but holds no funds by default
- `useSendUserOperation` always requires `evmSmartAccountObjects` — never fall back to `evmAccounts`
- GasRefuel.sol on Arbitrum One sponsors gas. `/api/ensure-gas` must be called before every on-chain tx
- USDC on Arbitrum: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, 6 decimals
- Web wallet sends bypass WhatsApp-side daily limits (self-custody mode)
- CDP sessions are short-lived (minutes). This is a known pain point — see Phase 4.6 for the fix

### Carlos Handoff (updated Mar 6, 2026)

**What's done and deployed:**

- AdonisJS backend (173 tests passing) — `apps/backend/`
- Ponder indexer with wallet-scoped USDC filter — `apps/indexer/`
- Admin panel fully working:
  - `/admin/analytics` — Total volume, fund flow, top users by volume, daily chart, gas refuels
  - `/admin/users` — Users table with real on-chain data (Total Sent, Total Received, Txs)
  - `/admin/users/:phone` — User detail with on-chain stats + activity log
- Wallet sync (backend → indexer) — `indexer.service.ts` with retry + backoff
- `offchain.sippy_wallet` table populated (3 wallets)
- Railway services: `sippy-backend`, `sippy-indexer`, shared Postgres

**What to pick up next (priority order):**

1. ~~**P4.6: Custom Auth — Sippy-branded OTP (CRITICAL PATH)**~~ **DONE (Mar 12, 2026)**
   - OTP service (Twilio), JWT service (RS256), JWKS endpoint live at `https://backend.sippy.lat/api/auth/.well-known/jwks.json`
   - CDP portal configured with custom auth (JWKS URL + issuer `https://backend.sippy.lat`)
   - All web pages (`/setup`, `/settings`, `/wallet`) migrated to `useAuthenticateWithJWT`
   - Unified wallet UI shipped: single wallet balance with two send modes -- "Free gas" (spender, daily limit) and "Direct" (user gas, no limit via sendUserOperation)
2. **P4.7: Web Wallet Session Robustness** — JWT TTL is 1h (upgrade from 15 min spec); inline re-auth on expiry pending
3. **P2: Onboarding Tightening** — quick wins, improves beta experience
4. **P4.1-4.2: Tx Confirmation + Webhook Security** — needed before beta
5. **Fix indexer restart mechanism** — replace `process.exit(0)` with Railway API redeploy (see Indexer Known Issues #1)

**Key files to know:**

- `apps/indexer/src/api/index.ts` — Hono API routes, `writeDb` for offchain writes, backfill logic
- `apps/indexer/ponder.config.ts` — wallet filter loading, `pollingInterval: 20_000`
- `apps/backend/app/services/indexer.service.ts` — `syncAllWalletsWithIndexer()` retry logic
- `apps/backend/config/database.ts` — indexer DB connection with `searchPath`
- `apps/backend/app/controllers/admin/analytics_controller.ts` — admin dashboard queries

**Railway access:**

- Both services share `crossover.proxy.rlwy.net:43347/railway`
- Indexer URL: `sippy-indexer-production.up.railway.app` (has `x-indexer-secret` auth)
- Backend env vars `INDEXER_DB_*` point to the shared DB
- Indexer env var `INDEXER_API_SECRET` must match backend's `INDEXER_API_SECRET`

**Path mapping — Express → AdonisJS:**
Phases 2-8 were written before the AdonisJS migration (Feb 28). File paths reference the old Express monolith structure. Use this table to find the actual files:

| Express path (in plan)                         | AdonisJS path (actual)                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/server.ts`                            | Logic split: `apps/backend/app/controllers/webhook_controller.ts` (WhatsApp handler), `apps/backend/start/routes.ts` (route defs), `apps/backend/app/middleware/` (IP throttle, auth) |
| `backend/src/commands/send.command.ts`         | Send logic in `apps/backend/app/controllers/webhook_controller.ts` + `apps/backend/app/services/`                                                                                     |
| `backend/src/commands/balance.command.ts`      | Same — command logic lives in controllers/services, no `commands/` dir                                                                                                                |
| `backend/src/commands/start.command.ts`        | Same pattern                                                                                                                                                                          |
| `backend/src/services/*.ts`                    | `apps/backend/app/services/*.ts` (same names: `db.ts`, `llm.service.ts`, `whatsapp.service.ts`, etc.)                                                                                 |
| `backend/src/utils/*.ts`                       | `apps/backend/app/utils/*.ts` (same names but snake_case: `message_parser.ts`, `messages.ts`, `errors.ts`, etc.)                                                                      |
| `backend/src/types/*.ts`                       | `apps/backend/app/types/*.ts`                                                                                                                                                         |
| `backend/src/routes/embedded-wallet.routes.ts` | `apps/backend/app/controllers/embedded_wallet_controller.ts` + routes in `apps/backend/start/routes.ts`                                                                               |
| `frontend/app/*.tsx`                           | `apps/web/app/*.tsx`                                                                                                                                                                  |
| `frontend/lib/*.ts`                            | `apps/web/lib/*.ts`                                                                                                                                                                   |
| `frontend/package.json`                        | `apps/web/package.json`                                                                                                                                                               |
| `backend/package.json`                         | `apps/backend/package.json`                                                                                                                                                           |

Key differences: AdonisJS uses `app/` not `src/`, snake_case filenames (e.g., `messageParser.ts` → `message_parser.ts`), no `commands/` directory (command handling is in `webhook_controller.ts` which calls services), routes defined in `start/routes.ts` not inline in server file.

### M1 Exit Checklist — Definition of Done per Deliverable

Every deliverable needs binary pass/fail criteria and a proof artifact. Don't submit M1 until every row passes.

| #   | Deliverable         | Exit Criteria                                                                            | Proof Artifact                                                                              |
| --- | ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Onramp              | See Path A / Path B below                                                                | Tx screenshot or mock test suite passing                                                    |
| 2   | Wallet refinements  | Setup → wallet → permission → send → sweep → export works e2e                            | Screen recording of full flow on mainnet                                                    |
| 3   | Security hardening  | Tx confirmation, velocity limits, webhook validation, admin block all functional         | Test matrix checklist (manual), curl proof for admin endpoints                              |
| 4   | Dual currency       | Balance + send messages show local currency for CO/MX/AR/BR numbers                      | Screenshots of balance in COP, MXN, ARS, BRL                                                |
| 5   | Privacy controls    | Phone visibility toggle works; profile hides phone when off                              | Screenshot: profile with visibility off shows masked phone                                  |
| 6   | User settings       | Daily limit, language, privacy toggleable from settings page                             | Screen recording of each toggle                                                             |
| 7   | Monitoring          | `GET /health` returns all green; Sentry captures a test error; pino logs structured JSON | Health endpoint response + Sentry dashboard screenshot                                      |
| 8   | Legal entity        | Entity established                                                                       | Certificate or registration document                                                        |
| 9   | WhatsApp production | Bot responds on production number                                                        | Screenshot of production conversation                                                       |
| 10  | Closed beta         | 50 testers onboarded, at least 10 completed a send                                       | DB query: `SELECT COUNT(*) FROM phone_registry` ≥ 50; `parse_log` showing 10+ send commands |

**Path B acceptance for #10:** If onramp is blocked, beta testers use crypto top-up (direct USDC transfer to wallet address) instead of fiat onramp. Acceptance: 50 testers set up, 10+ completed sends via WhatsApp or web wallet. Mock onramp demo shown separately to reviewer.

### Infrastructure Decision: Single Replica (M1)

**Decision:** M1 runs as a single Railway instance. All in-memory state (OTP codes, pending tx confirmations, velocity trackers, message dedup, spam protection, activeSends) is acceptable in-memory for a single process.

**What this means:**

- No Redis required for M1
- Server restart clears all in-memory state — this is acceptable because: OTPs expire in 5 min anyway, pending tx auto-expire in 2 min, dedup misses are rare and harmless (idempotent), velocity limits reset (safe — users just get a fresh window)
- **Do NOT scale to multiple replicas without migrating in-memory state to Redis first** — this will cause split-brain (user confirms on replica A, pending tx lives on replica B)
- M2 scope: evaluate Redis migration if beta load requires >1 replica

**Risk accepted:** A restart mid-beta clears pending confirmations. Mitigated by: short TTLs, blockchain tx state is always the source of truth (balance reconciles naturally).

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

> **⚠ Path note:** Phases 2-8 file paths use Express-era conventions (`backend/src/...`, `backend/server.ts`, `frontend/...`). See **"Path mapping — Express → AdonisJS"** in the Carlos Handoff section above for the actual file locations.

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
+57  → COP (Colombia)
+52  → MXN (Mexico)
+54  → ARS (Argentina)
+55  → BRL (Brazil)
+51  → PEN (Peru)
+56  → CLP (Chile)
+1   → USD (US — skip, already in dollars)
+507 → USD (Panama — skip, already in dollars)
+593 → USD (Ecuador — skip, already in dollars)
+503 → USD (El Salvador — skip, already in dollars)
All others → no local currency shown (USD only)
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
    - USD countries (skip conversion): `'1'`, `'507'`, `'593'`, `'503'` (US, Panama, Ecuador, El Salvador)
    - Return null for USD countries or unknown prefixes → no conversion, show USD only

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
  - Before executing, reply: "Send $10.00 to +57\*\*\*4567? Reply YES to confirm or NO to cancel."
  - Trilingual: "Enviar $10.00 a +57\*\*\*4567? Responde SI para confirmar o NO para cancelar."
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

> Think about what a confused user, a curious kid, or a malicious actor would type. Every edge case that reaches the blockchain costs gas and could lose money. Catch everything before it hits the chain.

- [ ] **Phone number edge cases** — phone.ts / send.command.ts
  - Reject phone numbers that are too short (< 10 digits after normalization)
  - Reject phone numbers that are too long (> 15 digits)
  - Reject known non-mobile prefixes if detectable
  - Handle "send 10 to myself" / "send 10 to me" → self-send block message
  - Handle "send 10 to 0" / "send 10 to 123" → "That doesn't look like a phone number"
  - Handle phone with spaces, dashes, dots: "+57 300-123-4567" → normalize to E.164
  - Handle phone with parentheses: "(300) 1234567" → normalize
  - Handle country code with double zeros: "0057..." → normalize to "+57..."
  - Recipient has no wallet → "They haven't set up Sippy yet. Send them an invite?"

- [ ] **Amount edge cases** — messageParser.ts / send.command.ts
  - "send 0 to +57..." → "Please send a positive amount."
  - "send 0.001 to +57..." → allow (valid micro-payment)
  - "send 99999999 to +57..." → hard block at $10,000
  - "send -5 to +57..." → regex won't match (negative), falls to unknown
  - "send all to +57..." → not matched by regex → format hint (future: "send all" support)
  - "send $10.5.5 to +57..." → regex won't match → format hint
  - Amount with comma as decimal separator: "send 10,50 to..." → common in LATAM, parse as 10.50
  - Amount with thousands separator: "send 1.000 to..." → ambiguous (1.0 or 1000?), reject with clarification
  - Amount in local currency: "send 40000 COP to..." → not supported yet, guide to use USD
  - Amount > user balance → clear message: "You have $X. You're trying to send $Y."
  - Amount exactly equal to balance → allow but warn about dust (gas might fail if ETH is too low)

- [ ] **Concurrent send protection** — send.command.ts
  - If user already has a send in-flight (processing), block new send
  - In-memory Set: `activeSends: Set<phoneNumber>`
  - Add before processing, remove after completion (in finally block)
  - "A transfer is already in progress. Please wait."
  - Edge case: server crashes mid-send → `activeSends` is lost → safe (allows retry)
  - Edge case: send takes > 30 seconds (chain congestion) → set timeout, clear from activeSends after 60s max

- [ ] **Webhook replay protection**
  - Already have message dedup (processedMessages Map)
  - Add: reject messages older than 5 minutes (stale timestamp)
  - `parseInt(timestamp) * 1000 < Date.now() - 5 * 60 * 1000` → skip

- [ ] **Wallet state edge cases**
  - User's smart account exists but has 0 ETH → GasRefuel should handle, but verify it does
  - User's smart account has USDC but GasRefuel contract is empty → must fail gracefully: "Transfers are temporarily unavailable. Try again later." (don't say "gas")
  - User deleted their wallet externally (via CDP dashboard) → backend still has phone→wallet mapping → detect stale wallet, guide to re-setup
  - Multiple WhatsApp messages in rapid succession while bot is processing → queue or reject, don't crash

- [ ] **Network/infra edge cases**
  - Arbitrum RPC is down → all balance checks and sends fail → show "Network issues, try again in a few minutes" (no blockchain jargon)
  - Blockscout API is down → balance shows stale data or fails → show last known balance with "may be outdated" note
  - WhatsApp API rate limit hit → queue outbound messages with backoff, don't drop them
  - Database connection pool exhausted → graceful error to user, not a crash
  - Server restart mid-send → in-memory state lost but blockchain tx may have succeeded → on next balance check, state reconciles naturally

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

### 4.6 Custom Auth: Replace CDP SMS with Sippy-Branded Auth (Twilio + JWT)

> **Why:** Right now, CDP's `useSignInWithSms` sends OTPs from "Coinbase" — users see a Coinbase-branded message, not Sippy. This is confusing and breaks trust for non-crypto users. Sessions are short-lived with no control over duration. Custom auth via `useAuthenticateWithJWT` gives us full control over branding, session TTL, and re-auth policy.
>
> **The user never sees "Coinbase" anywhere.** Every OTP, every message, every screen says "Sippy." CDP supports this via their custom auth integration — we provide a JWKS endpoint, they validate our JWTs. The wallet is still CDP under the hood, but the auth layer is 100% ours.
>
> **Our users are regular people.** The auth UX must be dead simple: phone number → OTP → done. No blockchain jargon. No confusing flows. If they lose access, recovery must be equally simple (see Phase 5.6 for recovery methods).

- [x] **Backend: Twilio OTP service** — `app/services/otp_service.ts`
  - `POST /api/auth/send-otp` + `POST /api/auth/verify-otp` — live and tested
  - SMS says "Sippy: Tu código es XXXXXX" (trilingual: es/en/pt)
  - 6-digit, 5-min TTL, max 5 verify attempts, rate limit 3 sends/min/phone

- [x] **Backend: JWT issuer** — `app/services/jwt_service.ts`
  - RS256 keypair in Railway env vars, `GET /api/auth/.well-known/jwks.json` live
  - JWT TTL: 1h (sub = E.164 phone, iss = `https://backend.sippy.lat`)
  - CDP Portal configured (JWKS URL + issuer registered)

- [x] **Frontend: `useAuthenticateWithJWT`** — all pages migrated (`/setup`, `/settings`, `/wallet`)
  - `lib/auth.ts`: `sendOtp`, `verifyOtp`, `storeToken`, `getFreshToken` (expiry-aware)
  - `lib/usdc-transfer.ts` uses stored JWT for `ensureGas` + `resolve-phone`

- [x] **Web wallet unified UI** (Mar 12 → Mar 26, 2026)
  - Single wallet balance with two send modes: "Free gas" (spender + daily limit) and "Direct" (user gas, no limit)
  - Resolved CDP dual-user drift from SMS→JWT auth migration (see docs/WALLET-ARCHITECTURE.md)
  - EOA send: `POST /api/send` (SpendPermission, same flow as WhatsApp)
  - Smart account send: UserOps (existing)
  - Auto-selects wallet with funds on load

- [ ] **Sensitive operation re-auth gate** — pending
  - Before export key or revoke: require fresh OTP if JWT > 5 min old

**Dependencies:** Phase 5.6 (recovery) builds on top of this.

### 4.7 Web Wallet Session Robustness

> **Sessions must die fast.** Once custom auth (4.6) is in place, JWT TTL controls everything. Default 15 min. No "remember me." Every time the user opens the webapp after their session expired, they verify with OTP again. This is intentional — our users carry money in their wallets, and short sessions protect against device theft, shared phones (common in LATAM), and session hijacking.

- [ ] **`useSessionGuard()` hook** — new `frontend/lib/useSessionGuard.ts`
  - Wraps `getAccessToken()` with automatic handling
  - Returns `{ isAuthenticated, token, requireReauth }`
  - Before any operation (send, sweep, permission change): call `requireReauth()` which checks token validity
  - If token expired → show inline re-auth prompt (phone + OTP), **preserve all form state**
  - If token valid but < 3 min remaining → silently refresh in background via `POST /api/auth/refresh`
  - If refresh fails → graceful degradation to re-auth prompt
  - Use this hook in `/wallet`, `/settings`, `/setup` — single source of truth for session state

- [ ] **Session expiry UX** — all authenticated pages
  - Never show a blank screen or cryptic error when session dies
  - Show: "Your session expired. Verify your phone to continue." + inline OTP input
  - After re-auth: resume exactly where user was (same form, same step, same data)
  - Visual countdown indicator when session is about to expire (optional, nice-to-have)

- [ ] **WhatsApp `wallet` command** — messageParser.ts + server.ts + messages.ts
  - Regex: `wallet`, `billetera`, `mi billetera`, `carteira`, `my wallet`
  - Reply with personalized link: `sippy.lat/wallet?phone=+57...`
  - Trilingual: "Open your wallet: [link]"
  - Same pattern as existing settings link delivery

- [ ] **WhatsApp post-setup wallet nudge** — embedded-wallet.routes.ts
  - After spend permission is registered, include wallet link in the "you're all set" WhatsApp message
  - "You can also manage your wallet anytime at sippy.lat/wallet"

### 4.8 Backend General Audit

> Before beta, the backend must be as tight as possible. This is a dedicated audit pass — not feature work. Read every file, question every assumption.

- [ ] **Error handling audit** — all command handlers + services
  - Every `try/catch` must: (1) log the real error server-side, (2) send a user-friendly trilingual message, (3) never leak stack traces, wallet addresses, or internal state
  - Check: what happens if CDP SDK throws? If Blockscout is down? If DB connection drops mid-send?
  - Check: are all async operations properly awaited? Any fire-and-forget that should be awaited?
  - Check: are all `finally` blocks cleaning up state (activeSends, pending tx maps)?

- [ ] **Input validation audit** — all API routes + webhook handler
  - Every `req.body` and `req.params` must be validated before use (Zod or manual)
  - Check: can a malformed WhatsApp webhook crash the server?
  - Check: are all phone numbers normalized before DB lookup? (E.164 format)
  - Check: are all USDC amounts validated as positive numbers with ≤ 6 decimals before on-chain tx?
  - Check: are all wallet addresses validated as `0x` + 40 hex chars before use?

- [ ] **Memory leak audit** — all in-memory Maps/Sets
  - `processedMessages`, `spamTracker`, `activeSends`, pending tx maps — all must have TTL cleanup
  - Check: if cleanup interval throws, does it crash the process?
  - Check: under sustained load (100 msgs/min), do maps grow unbounded?
  - Check: what's the maximum memory footprint with 10K active users?

- [ ] **Race condition audit** — concurrent operations
  - Two sends from same user at the exact same millisecond — what happens?
  - User sends "confirm" twice rapidly — does the tx execute twice?
  - Two webhook deliveries for the same message — dedup working?
  - `/api/register-wallet` called twice concurrently — duplicate wallet?
  - GasRefuel: two `ensure-gas` calls for same wallet simultaneously — double gas?

- [ ] **Environment variable audit**
  - List every env var used across backend — document in ENV-TEMPLATE.txt
  - Check: which are required vs optional? What happens if an optional one is missing?
  - Check: are there any hardcoded values that should be env vars (thresholds, limits, URLs)?
  - Check: are secrets (API keys, private keys) ever logged, even accidentally?

- [ ] **Dependency audit**
  - `pnpm audit` — check for known vulnerabilities
  - Check: are there unused dependencies inflating the bundle?
  - Check: are there pinned versions that should be updated?

**Required output:** `docs/AUDIT-M1.md` — table with columns: File, Finding, Severity (P0/P1/P2), Owner, Fix ETA, Status.
**Triage rule:** All P0 findings must be fixed before beta. P1 findings must be fixed or have documented workaround. P2 findings are tracked but can ship with.
**Estimate:** 4-6h (audit only — fixes may add more)

### Files to Create

- `backend/src/services/velocity.service.ts` — send rate limiting + fraud checks
- `backend/src/services/otp.service.ts` — Twilio OTP send/verify
- `backend/src/services/jwt.service.ts` — RS256 JWT issuer + JWKS endpoint
- `frontend/lib/useSessionGuard.ts` — session state hook for all authenticated pages

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

### Estimate: 26-34h (was 18-22h, added custom auth hardening + backend audit + expanded edge cases)

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
  - If phone_visible=false: show masked phone (\*\*\*1234) + "Private account"
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

- [ ] **5.6 Account Recovery + Secondary Auth** — DB + backend + frontend

  > **Context:** Our users are regular people, not crypto natives. They lose phones, forget passwords, share devices. Recovery must be as simple as the signup. This is also the second factor that protects sensitive operations (key export, permission revoke) from SIM-swap attacks. Phase 4.6 (custom auth) handles primary auth (phone + OTP). This phase adds the safety net.

  ***

  **M1 SCOPE LOCK:** Only 5.6.1 (recovery email) and 5.6.3 (design doc) ship in M1. Passkeys (5.6.2) are **out of M1 scope** — do not start implementation. If you're reading this and thinking "passkeys would be quick to add," stop. Ship email recovery first, validate with real users, then build passkeys in M2.

  ***

  **5.6.1 Recovery email** (M1 — ship this)
  - Collect email during `/setup` onboarding (after SMS verify): "Add a recovery email (recommended)"
  - Keep it optional — don't block setup if they skip, but nudge again on first `/settings` visit
  - New endpoint: `POST /api/auth/send-email-code` — sends 6-digit code via Resend (free tier: 3K/month)
  - New endpoint: `POST /api/auth/verify-email-code` — validates code (10-min expiry, 3 attempts max)
  - Email template: branded "Sippy" (same as OTP — no third-party branding)
  - Before export or revoke: if user has verified email → require email code. If no email → show warning but still allow
  - If user lost phone (SIM swap): can prove identity via email → re-link new phone number
  - Threat mitigated: SIM-swapper can intercept OTP but can't access email inbox

  **Email data model:**

  ```
  user_preferences table additions:
    email_encrypted  TEXT      -- AES-256-GCM encrypted email (for sending codes)
    email_hash       TEXT      -- SHA-256(normalized(email)) index for lookup/dedup
    email_verified   BOOLEAN   DEFAULT false
    email_verified_at TIMESTAMPTZ
  ```

  - Normalize before hashing: `trim().toLowerCase()`
  - Encrypt at rest with `EMAIL_ENCRYPTION_KEY` env var (AES-256-GCM, unique IV per row)
  - Decrypt only when sending a code — never return plaintext email in API responses
  - Hash index enables "is this email already linked to another account?" check without decrypting all rows
  - Retention: keep until user explicitly deletes or account is deactivated
  - On account deletion (future): zero out both columns, keep hash for 30 days to prevent re-registration abuse

  **5.6.2 Passkey support** (M2 ONLY — do not implement in M1)
  - WebAuthn/passkey as alternative to OTP for returning users
  - After first successful OTP auth, prompt: "Add Face ID / fingerprint for faster access next time"
  - Store passkey credential ID in DB, link to phone number
  - On subsequent visits: passkey auth → skip OTP entirely (faster, more secure)
  - Fallback: if passkey fails (new device, cleared data), fall back to OTP
  - This is the long-term UX win — regular users prefer biometrics over typing codes
  - CDP supports this via `useAuthenticateWithJWT` — passkey just changes how we issue the JWT
  - Library: `@simplewebauthn/server` + `@simplewebauthn/browser` (well-maintained, <10KB)

  **5.6.3 Recovery flow for lost phone** (M1 — design doc only, M2 — implement)
  - Deliverable: `docs/RECOVERY-DESIGN.md` documenting the full flow
  - User contacts support (WhatsApp or email) → identity verification via recovery email
  - Admin endpoint: `POST /admin/relink-phone` — updates phone number for existing wallet
  - Requires: verified email match + admin approval (manual for M1, automated for M2)
  - Edge case: user has no email and loses phone → wallet is recoverable only via exported private key
  - This is the one scenario where we can't help — make this very clear during setup if they skip email

  **Estimate:** 5.6.1 = 6-8h (M1), 5.6.2 = 8-10h (M2 only), 5.6.3 = 2-3h design doc (M1)
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

### Estimate: 15-20h (remaining tasks 5.1-5.6, expanded recovery/auth scope)

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

- [x] **7.6 Ponder on-chain indexer** — `apps/indexer/` — DEPLOYED
  - Real-time indexer watching USDC transfers + GasRefuel events on Arbitrum
  - **Scoped to registered wallets only** — loads wallets from `offchain.sippy_wallet` at boot, uses Ponder `filter` config (OR semantics: `from` OR `to` in wallet list). Fail-closed: burn-address self-transfer if no wallets loaded.
  - Tracks balances, transfer history, gas sponsorship, daily volume for Sippy wallets
  - Custom API endpoints: balance, transfers, stats, gas-refuel status, wallet sync/register
  - Deploys as separate Railway service (`sippy-indexer`), same Postgres DB
  - Admin analytics page (`/admin/analytics`) wired to indexer DB via `searchPath: ['ponder', 'offchain', 'public']`
  - **Wallet sync**: backend calls `/wallets/sync` on boot to push `phone_registry` → `offchain.sippy_wallet`
  - **Known issues — see "Indexer Known Issues" section below**

### Files to Create

- `backend/src/utils/logger.ts` — pino logger wrapper
- `apps/indexer/` — Ponder on-chain indexer (USDC transfers + GasRefuel events)

### Files to Modify

- `backend/server.ts` — Sentry init, health endpoint, replace console.log
- `backend/package.json` — add @sentry/node, pino
- `backend/src/commands/*.ts` — replace console.log with logger
- `backend/src/services/*.ts` — replace console.log with logger
- `frontend/package.json` — add @sentry/nextjs
- `frontend/next.config.js` — Sentry config

### Estimate: 16-20h (was 8-10h, added Ponder indexer)

### Indexer Known Issues (for Carlos)

> These were discovered during Railway deployment on Mar 5, 2026. The indexer is live and indexing, but these need fixing before beta.

**1. `process.exit(0)` restart mechanism is broken**

- The `scheduleRestart()` function in `apps/indexer/src/api/index.ts` calls `process.exit(0)` after 60s to reload the wallet filter when new wallets register.
- Ponder uses PostgreSQL advisory locks. `process.exit(0)` doesn't cleanly release them, causing `"Schema is locked by a different Ponder app"` crash loops on Railway.
- **Current workaround**: New wallets require manual Railway redeploy (Dashboard → sippy-indexer → Redeploy).
- **Fix needed**: Replace `process.exit(0)` with a Railway API redeploy trigger, or use Ponder's built-in config reload if available. Alternatively, use `railway service redeploy` via Railway CLI or their REST API (`POST /v2/deployments` with service ID).

**2. Ponder `db` from `ponder:api` is strictly read-only**

- ALL tables (onchain AND offchain) are read-only through the `db` object Ponder provides to API handlers.
- **Already fixed**: Added `writeDb` (separate `pg.Pool` + Drizzle connection) for offchain writes (wallet register, sync, deactivate).
- Backfill writes to Ponder-managed tables (`transfer`, `account`, `daily_volume`) will fail silently — this is acceptable because Ponder re-indexes natively after restart.

**3. `offchain` schema must be manually created on new DB**

- Ponder only manages its own `ponder` schema. The `offchain.sippy_wallet` table is not auto-created.
- On fresh Railway DB: run `CREATE SCHEMA IF NOT EXISTS offchain; CREATE TABLE IF NOT EXISTS offchain.sippy_wallet (address TEXT PRIMARY KEY, phone_hash TEXT, registered_at INTEGER NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true);`
- Consider adding a migration script or startup check.

**4. Config changes require schema drop**

- Any change to `ponder.config.ts` (filter, pollingInterval, contracts) changes Ponder's app fingerprint.
- This causes `MigrationError: Schema "ponder" was previously used by a different Ponder app`.
- **Fix**: `DROP SCHEMA ponder CASCADE; DROP SCHEMA ponder_sync CASCADE;` on Railway DB, then redeploy. Ponder re-indexes from `startBlock`.

**5. Admin analytics `searchPath` fix not yet deployed**

- `apps/backend/config/database.ts` was updated to add `searchPath: ['ponder', 'offchain', 'public']` for the indexer DB connection.
- This is committed (`0b9cbae`) but Carlos should verify the admin analytics page (`/admin/analytics`) works after deploy.
- Required Railway env vars on `sippy-backend`: `INDEXER_DB_HOST`, `INDEXER_DB_PORT`, `INDEXER_DB_USER`, `INDEXER_DB_PASSWORD`, `INDEXER_DB_DATABASE` — these were already set to `crossover.proxy.rlwy.net:43347/railway`.

**6. Alchemy CU budget monitoring**

- `pollingInterval: 20_000` (20s) targets ~27M CU/month out of 30M free tier.
- Monitor Alchemy dashboard for 24h after any redeploy. If pace exceeds 28M/month, bump to `pollingInterval: 30_000` in `ponder.config.ts` (will require schema drop — see #4).

**7. Indexer public domain exposure**

- `sippy-indexer-production.up.railway.app` was created for testing. Consider removing the public domain if not needed — it exposes `/wallets/register`, `/wallets/sync`, etc. These are protected by `x-indexer-secret` header but minimizing attack surface is better.

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

**Capacity:** 2 devs, ~20-24h/week combined (60/40 split Mateo/Carlos). Total available: ~100-120h.
**Total estimated: 93-120h** across both devs (includes all 8 phases + Ponder indexer).

### Actual Progress (as of Mar 5, 2026)

```
Week 1 (Feb 20-26):  DONE
  - AdonisJS migration (Mateo) — backend fully ported, 103 tests
  - P5.7 Sweep + Wallet (already done before M1 started)

Week 2 (Feb 27 - Mar 5):  DONE
  - AdonisJS admin panel + analytics dashboard (Mateo)
  - P7.6 Ponder indexer: built, deployed to Railway, wallet filter working (Mateo)
  - Backend tests: 173 passing
  - Indexer wallet sync working (3 wallets registered)
  - Admin analytics wired to indexer DB (searchPath fix committed)

UNPLANNED WORK (ate ~8h):
  - Railway deployment debugging (Ponder schema conflicts, advisory locks, read-only DB)
  - Manual DB ops (schema creation, schema drops × 3)
  - writeDb workaround for Ponder read-only API
```

### Remaining Plan (2 weeks left — as of Mar 12)

**Completed:** P1, P3 (dual currency), P4.6 (custom auth), P5.6.1 (email recovery), P5.7 (sweep+wallet), P7.6 (indexer)

```
Week 4 (Mar 13-19):                           Mateo        Carlos
  SH: Phone sanitization (SH-001→003) .....  [6-8h]
  TX: Tx confirm + velocity (TX-001→004) ... [8-10h]
  EL: Tiered limits (EL-001→004) ...........              [4-6h]
  LN: Language auto-detect (LN-001→003) ....              [4-6h]

Week 5 (Mar 20-26):
  PV: Phone visibility (PV-001→004) ........              [4-6h]
  AU: Backend audit (AU-001→002) ........... [6-8h]
  WS: Web session robustness (WS-001) ......              [4-6h]
  AC: Admin controls (AC-001) .............. [3-4h]
  MO: Monitoring (MO-001→002) ..............              [4-5h]
  BP: Beta prep (BP-001) ................... [4-5h]        [4-5h]
  P6: Onramp if unblocked, else Path B ..... [split]      [split]
  Buffer for audit fixes + edge cases ...... [4-6h]
```

**Critical path:** SH (phone sanitization) → TX (tx security) → AU (audit) → BP (beta prep).
EL, LN, PV, WS, MO can parallelize.
**External dependency:** Onramp (P6) blocked on Maash. Everything else ships independently. See "Onramp Acceptance Criteria" above for fallback plan.
**Indexer**: Deployed and live. See "Indexer Known Issues" in Phase 7 for items Carlos should be aware of.

**Task Queue:** All remaining work is tracked in `TASK_QUEUE.md`. Completed tasks archived in `COMPLETED_TASK_QUEUES.md`.

---

## Go/No-Go Gate

**Date:** March 24, 2026 (2 days before deadline)
**Who decides:** Mateo (final call), Carlos (engineering readiness input)

**Go criteria — all must be true:**

- [ ] Exit checklist: all deliverables pass or have approved Path B fallback
- [ ] No open P0 findings in `docs/AUDIT-M1.md`
- [ ] All P1 findings either fixed or have documented workaround
- [ ] Backend deploys cleanly on Railway, no crash loops in last 24h
- [ ] Frontend builds + deploys without errors
- [ ] At least 1 successful mainnet send via WhatsApp + 1 via web wallet in last 48h

**No-Go triggers (any one blocks submission):**

- Open P0 audit finding with no fix
- Backend crash loop on production
- Custom auth (4.6) not functional — users still see "Coinbase" in OTP
- Fewer than 20 testers onboarded (can't credibly claim 50-tester trajectory)

**If No-Go:** Notify Questbook reviewer immediately, request 1-week extension with specific blocker list.

## Escalation SLA

| Severity           | Example                                                      | Who Gets Paged                       | Response Target  |
| ------------------ | ------------------------------------------------------------ | ------------------------------------ | ---------------- |
| P0 — Service down  | Backend crash, all sends failing, GasRefuel empty            | Mateo (WhatsApp) + Carlos (WhatsApp) | 30 min           |
| P0 — Money at risk | Tx sent to wrong address, double-send, funds stuck           | Mateo (WhatsApp + call)              | 15 min           |
| P1 — Degraded      | Blockscout down (stale balances), LLM timeout, slow sends    | Carlos (WhatsApp)                    | 2 hours          |
| P1 — Security      | Suspicious activity, velocity limit hit, blocked user appeal | Mateo (WhatsApp)                     | 1 hour           |
| P2 — Minor         | Formatting bug, wrong language in edge case, UI glitch       | Carlos (async, Telegram)             | Next working day |

**During beta (Week 5+):**

- Mateo monitors WhatsApp support channel daily
- Carlos monitors Railway logs + Sentry alerts
- Both check GasRefuel ETH balance weekly (alert threshold: < 0.01 ETH)

---

## Risk Register

| Risk                             | Impact | Likelihood | Mitigation                                                                                                                                                      |
| -------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maash API not ready by M1        | High   | Medium     | Fallback Path B: mock-tested integration + readiness checklist (see Onramp Acceptance Criteria). Pre-agree with Questbook if needed by Mar 10.                  |
| Exchange rate API limits         | Low    | Low        | 15-min cache, fallback to last known, multiple providers                                                                                                        |
| WhatsApp rate limits during beta | Medium | Low        | Already approved 2K bot-initiated/day + unlimited user-initiated                                                                                                |
| GasRefuel runs low during beta   | Medium | Low        | Health endpoint monitors balance, alert on low                                                                                                                  |
| Confirmation flow adds friction  | Medium | Low        | Skip for amounts ≤ $5, keep it fast for micro-payments                                                                                                          |
| LLM costs spike                  | Low    | Low        | Regex handles 80%+ of messages (zero LLM cost). Remaining ~20% go to Groq free tier (Llama 3.3 70B). If rate limits hit, LLM degrades gracefully to regex-only. |

---

## What's NOT in M1 Scope

- Multi-token support (USDC only)
- Multi-country launch (Colombia focus, LATAM infrastructure ready)
- DeFi integrations / yield / savings
- Telegram or other messaging platforms
- ~~Admin dashboard UI (API-only for now)~~ **DONE** — Inertia.js + React + Tailwind CSS v4, 3 pages: analytics, users, user detail
- Mobile app
- Formal smart contract audit (GasRefuel is ~100 lines, internal review sufficient)
- PIN/2FA for transfers (confirmation flow is sufficient for M1 limits)
- CDP platform-level email 2FA (M2 ask for OCL — M1 uses our own email gate for sensitive ops)
- ~~Smart account → EOA sweep tool~~ **DONE** — shipped in Phase 5.7 with webapp fallback wallet
