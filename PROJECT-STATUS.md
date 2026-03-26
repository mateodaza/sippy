# Project Status — Sippy

**Last Updated:** March 24, 2026
**Current Milestone:** M1 — Production Ready (deadline Mar 26, 2026)
**Detailed Plan:** [M1_PLAN.md](./M1_PLAN.md)
**Task Queue:** [TASK_QUEUE.md](./TASK_QUEUE.md)

---

## M1 Deliverable Progress

| #   | Deliverable                         | Status   | Notes                                                                                                                                                                                                                                                             |
| --- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Onramp integration                  | Blocked  | Waiting on Maash API response                                                                                                                                                                                                                                     |
| 2   | Non-custodial wallet refinements    | 100%     | CDP Embedded Wallets, sweep-to-EOA, unified wallet UI (Free gas + Direct modes), custom auth, web send hardened, drift detection                                                                                                                                  |
| 3   | Security hardening                  | 100%     | Phone sanitization (SH), tx confirmation + self-send block + concurrent protection (TX), velocity limiter, tiered limits (EL), amount hardening, backend audit (AU), admin block/unblock + global pause (AC), web send guards (self-send, velocity, daily limits) |
| 4   | Dual currency display (USD + local) | 100%     | 26 LATAM currencies, phone prefix mapping, 24h cache, all separators                                                                                                                                                                                              |
| 5   | Privacy controls + Email Recovery   | 100%     | Phone visibility toggle (settings + WhatsApp command), profile masking, email recovery                                                                                                                                                                            |
| 6   | User settings                       | 100%     | Language auto-detect + selector (LN), tiered limit display (EL), privacy toggle (PV), email management, key export                                                                                                                                                |
| 7   | Monitoring infrastructure           | 100%     | Sentry (backend + frontend), health endpoint, PostHog analytics, indexer, admin dashboard                                                                                                                                                                         |
| 8   | Legal entity                        | External | In progress separately                                                                                                                                                                                                                                            |
| 9   | WhatsApp production number          | 100%     | Active, approved                                                                                                                                                                                                                                                  |
| 10  | Closed beta: 50 testers             | 0%       | E2E test matrix done, beta onboarding pending                                                                                                                                                                                                                     |

---

## Current Focus: Beta Launch Prep (Week 5)

All security, privacy, language, and monitoring tasks are complete. Remaining work:

1. **BP-002 — Beta tester onboarding (50 users):** Manual — WhatsApp broadcast
2. **BP-003 — Onramp integration (Maash):** Blocked — waiting on API. Path B fallback if still blocked at deadline
3. **Legal entity:** External — in progress separately

---

## What's Working

### WhatsApp Bot — Production

- Regex-first message parsing (80%+ resolved at zero cost, <1ms)
- LLM fallback (Groq Llama 3.3 70B) for natural language and questions
- Send commands are regex-only — LLM never triggers money movement
- Zod schema validation on all LLM outputs
- Trilingual: English, Spanish, Portuguese (all commands + all responses)
- Language auto-detection with confidence scoring and persistence
- Language follows the user — switches when user changes language
- Greetings and social phrases handled by regex (zero LLM cost)
- Media messages (photos, voice, stickers) handled gracefully
- Professional tone across all messages (no emojis)
- Parse observability: `parse_log` table with message correlation, latency, token usage
- Spam protection: 10 msgs/min per user
- Message deduplication (webhook replay protection)
- Privacy command: `privacy on/off` (trilingual)
- Admin controls: user block/unblock, global pause/resume

### Wallets — Production

- Coinbase CDP Embedded Wallets (non-custodial, user-owned)
- One wallet per phone number
- Automatic creation on first interaction (`start` command)
- Spend permission system with configurable daily limits
- Setup flow: phone verification → wallet creation → spending limit

### Transfers — Production

- USDC peer-to-peer on Arbitrum One
- Gasless: GasRefuel.sol auto-funds gas before each transfer
- Tiered daily limits: $50/day (unverified), $500/day (email-verified)
- Transaction confirmation flow (amounts > $5 require YES/SI/SIM)
- Self-send blocked (phone + address, WhatsApp + web)
- Concurrent send protection (one in-flight per user)
- Velocity limiter: 5 sends/10min, $500/hour, 3 new recipients/hour
- Amount hardening: $10K cap, decimal validation, ambiguous separator detection
- Recipient notifications in recipient's language
- Transaction receipts with shareable links

### Frontend — Production

- Setup page: full onboarding flow (phone → OTP → wallet → permission → optional recovery email) — custom auth via Twilio+JWT
- Settings page: daily limit management, private key export with sweep-to-EOA, recovery email management, language selector, privacy toggle, session persistence
- Wallet page: web fallback — balance card, send USDC (to phone or 0x address) with full security guards, activity list
- All pages: Sippy-branded SMS OTP (not Coinbase), JWT-based auth with CDP `authenticateWithJWT`, session guard with re-auth
- Language auto-detection from phone prefix (EN/ES/PT) + manual override
- PostHog analytics integration
- Fund page: add ETH/USDC to wallet
- Profile pages: balance + transaction history, phone masking when hidden
- Receipt pages: shareable transaction details
- Responsive, Tailwind CSS

### Smart Contracts — Deployed

- GasRefuel.sol on Arbitrum One (`0xE4e5474E97E89d990082505fC5708A6a11849936`)
- Automatic gas refueling before USDC transfers
- Admin-funded, configurable minimum balance threshold

### Admin Dashboard — Production

- AdonisJS v7 backend with Inertia.js + React + Tailwind CSS v4
- `/admin/analytics` — Total USDC volume, fund flow breakdown, top users by volume, daily volume chart, gas refuel stats
- `/admin/users` — Users table with real on-chain data (Total Sent, Total Received, Txs, Last Activity)
- `/admin/users/:phone` — User detail with on-chain stats + activity log
- Phone normalization unified to canonical E.164 format (SH-001→003)
- Sentry error tracking (backend + frontend)
- Health endpoint with DB + GasRefuel status

### Ponder On-Chain Indexer — Deployed

- Ponder v0.15 at `apps/indexer/`, deployed on Railway
- Watches Arbitrum for USDC transfers and GasRefuel events (wallet-scoped filter)
- Hono API with 15+ endpoints (wallet mgmt, stats, dashboard, gas refuel)
- Backend wallet sync with retry + exponential backoff
- `offchain.sippy_wallet` table for wallet-scoped filtering

### Database — Production

- PostgreSQL on Railway (shared between backend + indexer)
- Tables: `phone_registry`, `user_preferences`, `parse_log`, `export_audit_log`, `web_send_log`
- Indexer tables: `account`, `transfer`, `refuel_event`, `gas_refuel_status`, `daily_volume`, `offchain.sippy_wallet`
- Language preference persistence
- Parse observability data

---

## Known Issues

- **Onramp blocked:** Waiting on Maash API. Fallback Path B documented in M1_PLAN.md
- **Web send error messages:** Backend returns safe error allowlist but wallet UI collapses all failures to generic "Send failed" via `localizeError`. Follow-up: wire specific errors through to UI
- **SH-003 dual-format phone lookup:** 6 call sites still do canonical + bare-digit fallback during migration transition. Extract shared helper post-M1

---

## Architecture

```
sippy/                      ← Turborepo + pnpm workspaces
  apps/
    backend/                ← AdonisJS v7
    web/                    ← Next.js 16
    indexer/                ← Ponder v0.15
  packages/
    shared/                 ← @sippy/shared (constants, ABIs, types)
  contracts/
    gas-refuel/             ← Hardhat (GasRefuel.sol)
  archive/
    express-backend/        ← Legacy Express (archived)
```

---

## Key Metrics

| Metric                | Value                                       |
| --------------------- | ------------------------------------------- |
| Parse latency (regex) | <1ms                                        |
| Parse latency (LLM)   | 500-2000ms                                  |
| LLM calls per message | ~20% (regex handles 80%+)                   |
| LLM cost              | $0/month (Groq free tier)                   |
| Supported languages   | 3 (EN, ES, PT)                              |
| User-facing strings   | 35+ (all trilingual)                        |
| WhatsApp capacity     | 2K bot-initiated + unlimited user-initiated |
| Smart contract        | GasRefuel.sol deployed on Arbitrum One      |
| Backend tests         | 500+ passing (unit + functional)            |

---

## Recent Changes

**Mar 24** — Zoho Desk support ticketing integration: backend service (`zoho_desk.service.ts`) with OAuth2 refresh-token flow and in-memory token caching, support controller with public (IP-throttled) and authenticated endpoints, `SupportForm` component on landing page and settings page, 19 i18n keys in EN/ES/PT. Zoho Desk free plan (3 agents, 5K API credits/day). Pending: end-to-end testing with live Zoho API.
**Mar 13** — Merged `develop` into `main`: all SH, TX, EL, LN, PV, AU, MO, AC, WS, BP-001 tasks complete. PostHog migration. Web send hardened (self-send block for phone + address, velocity checks, tiered daily limits, safe error allowlist). Privacy fallback fixed. Moderation uses SH-003-safe `resolveUserPrefKey`. Silent catch blocks now log. Deliverables 2, 3, 5, 6, 7 moved to 100%.
**Mar 12** — Task queue restructured: completed tasks archived to `COMPLETED_TASK_QUEUES.md`, new TASK_QUEUE.md with SH (phone sanitization), TX (tx security), EL (tiered limits), LN (language detection), PV (phone visibility), AU (audit), MO (monitoring), AC (admin controls), WS (session robustness), BP (beta prep). M1_PLAN timeline updated for weeks 4-5.
**Mar 26** — Unified wallet UI: replaced dual-wallet cards with single balance + two send modes ("Free gas" with daily limit via spender, "Direct" with user gas and no limit via sendUserOperation). Fixed CDP dual-user drift from SMS→JWT migration. Added drift detection, self-send protection, improved error messages for limit exceeded. See `docs/WALLET-ARCHITECTURE.md`.
**Mar 12** — Web wallet UI shipped with dual-wallet cards (later unified Mar 26). CDP Portal configured (JWKS URL + issuer live). Dual currency COMPLETE (26 LATAM currencies, 24h cache). Email recovery infrastructure COMPLETE (collection, verification, gate tokens, Resend integration). Security fixes: email bypass vulnerability patched, email squatting blocked via partial unique index. 437 tests passing.
**Mar 11** — P4.6 Custom Auth COMPLETE: Twilio raw SMS OTP (trilingual) + RS256 JWT + JWKS endpoint. Backend: jwt_service, otp_service, jwt_auth_middleware replacing CDP auth. Frontend: all 3 pages migrated to `authenticateWithJWT()`. CDP Portal config pending (manual).
**Mar 6** — Doc cleanup: removed stale planning docs (ADONISJS-POC-PLAN, PONDER plans, loyalty-network). M1_PLAN.md updated with Carlos handoff priorities — custom auth (P4.6) is now #1.
**Mar 5** — Admin analytics fixes: Top Users now ranks by total volume (sent + received), daily volume chart renders with pixel-based bar heights. Users page shows real on-chain data from indexer.
**Mar 2** — Ponder on-chain indexer built (phases 7.6.1–7.6.8): 5 on-chain tables, 6 event handlers, 15+ Hono API routes, backend integration with fire-and-forget wallet registration. Repo now runs as a Turborepo/pnpm workspace with apps under `apps/backend`, `apps/web`, and `apps/indexer`. Admin dashboard COMPLETE (Inertia.js + React + Tailwind CSS v4, 6 pages).
**Feb 28** — AdonisJS migration COMPLETE: all 18 Express routes ported to AdonisJS v7, 103 tests passing (unit + functional), same JSON responses — frontend-compatible. Key fixes: `forceExit: true`, `$N→?` placeholder conversion for Lucid, phone length validation.

---

## Environment

| Service           | Provider               | Status                     |
| ----------------- | ---------------------- | -------------------------- |
| Backend hosting   | Railway                | Active                     |
| Database          | Railway PostgreSQL     | Active                     |
| Blockchain        | Arbitrum One           | Active                     |
| Wallets           | Coinbase CDP Embedded  | Active                     |
| Messaging         | WhatsApp Business API  | Active (production number) |
| LLM               | Groq (free tier)       | Active                     |
| Smart contract    | GasRefuel.sol          | Deployed                   |
| Domain            | sippy.lat              | Active                     |
| On-chain indexer  | Ponder v0.15 + Railway | Deployed                   |
| SMS OTP           | Twilio (raw SMS API)   | Configured                 |
| Email delivery    | Resend                 | Configured                 |
| Exchange rates    | open.er-api.com (free) | Active                     |
| Onramp            | Maash                  | Blocked (waiting on API)   |
| Support ticketing | Zoho Desk (free plan)  | Configured — testing       |
