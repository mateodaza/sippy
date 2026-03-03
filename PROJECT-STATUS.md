# Project Status — Sippy

**Last Updated:** March 2, 2026
**Current Milestone:** M1 — Production Ready (deadline Mar 26, 2026)
**Detailed Plan:** [M1_PLAN.md](./M1_PLAN.md)
**AdonisJS Migration:** [ADONISJS-POC-PLAN.md](./ADONISJS-POC-PLAN.md)
**Ponder Indexer:** [PONDER_M1_PLAN.md](./PONDER_M1_PLAN.md)

---

## M1 Deliverable Progress

| # | Deliverable | Status | Notes |
|---|------------|--------|-------|
| 1 | Onramp integration | Blocked | Waiting on Maash API response |
| 2 | Non-custodial wallet refinements | 95% | CDP Embedded Wallets working, sweep-to-EOA + web wallet done |
| 3 | Security hardening | 75% | Rate limits + spam + auth endpoints done, tx confirmation + velocity pending |
| 4 | Dual currency display (USD + local) | 0% | Phone prefix → currency mapping designed, not built |
| 5 | Privacy controls | 0% | Planned: phone visibility toggle |
| 6 | User settings | 80% | Settings page working, language via WhatsApp working |
| 7 | Monitoring infrastructure | 60% | Parse logging done, Ponder indexer built (deploy pending), Sentry pending |
| 8 | Legal entity | External | In progress separately |
| 9 | WhatsApp production number | 100% | Active, approved |
| 10 | Closed beta: 50 testers | 0% | Depends on security + onramp completion |

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

### Wallets — Production

- Coinbase CDP Embedded Wallets (non-custodial, user-owned)
- One wallet per phone number
- Automatic creation on first interaction (`start` command)
- Spend permission system with configurable daily limits
- Setup flow: phone verification → wallet creation → spending limit

### Transfers — Production

- USDC peer-to-peer on Arbitrum One
- Gasless: GasRefuel.sol auto-funds gas before each transfer
- Daily spending limits enforced per user
- Recipient notifications in recipient's language
- Transaction receipts with shareable links

### Frontend — Production

- Setup page: full onboarding flow (phone → wallet → permission)
- Settings page: daily limit management, private key export with sweep-to-EOA, session persistence
- Wallet page: web fallback — balance card, send USDC (to phone or 0x address), activity list
- Fund page: add ETH/USDC to wallet
- Profile pages: balance + transaction history (Blockscout API)
- Receipt pages: shareable transaction details
- Responsive, Tailwind CSS

### Smart Contracts — Deployed

- GasRefuel.sol on Arbitrum One (`0xC8367a549e05D9184B8e320856cb9A10FDc1DE46`)
- Automatic gas refueling before USDC transfers
- Admin-funded, configurable minimum balance threshold

### Database — Production

- PostgreSQL on Railway
- Tables: `phone_registry`, `user_preferences`, `parse_log`, `export_audit_log`, `web_send_log`
- Language preference persistence
- Parse observability data

---

## What's In Progress

### Phase 1: LLM Layer + Message Quality — COMPLETED

Full details in [M1_PLAN.md](./M1_PLAN.md#phase-1-llm-layer--message-quality-completed).

Summary: Inverted parsing order (regex-first), trilingual everything, Zod validation, language persistence, professional tone, observability logging, PYUSD→USDC cleanup, 6 security bug fixes.

### Phase 2: Onboarding Tightening — Not Started

- Smart welcome based on user state (new / wallet-no-permission / fully set up)
- Post-registration WhatsApp nudges
- Setup page error recovery + progress indicator
- Empty balance guidance with fund link

### Phase 3: Dual Currency Display — Not Started

- Phone country code → local currency mapping (zero-friction)
- Exchange rate service with 15-min cache
- All balance/transfer messages show USD + local equivalent

### Phase 4: Security Hardening — Partially Done (75%)

- Done: rate limiting, spam protection, message deduplication, daily spending limits, amount validation, authenticated phone resolution, IP rate limiting, web send audit logging
- Pending: transaction confirmation flow, webhook signature validation, velocity checks, self-send block, concurrent send protection, admin controls, custom auth (Twilio+JWT)

### Phase 5: Privacy Controls + Settings — Partially Done

- Done: sweep-to-EOA in export flow, webapp fallback wallet (/wallet), cross-nav between /settings and /wallet
- Pending: phone visibility toggle, language preference UI, WhatsApp privacy command, email recovery

### Phase 6: Onramp — BLOCKED

- Waiting on Maash API docs and credentials
- Everything else ships independently

### Phase 7: Monitoring — Partially Done

- Parse logging done (parse_log table)
- Ponder on-chain indexer built (USDC transfers + GasRefuel events on Arbitrum)
- 15+ API endpoints for analytics, dashboard, wallet stats
- Backend integration done (fire-and-forget wallet registration)
- Deploy on Railway pending (after PR merge)
- Sentry, structured logging (pino) pending

### Phase 8: Beta Launch Prep — Not Started

- End-to-end test matrix
- 50 tester onboarding
- Production environment hardening

### AdonisJS Migration — COMPLETE (core backend + admin dashboard)

Migrated Express monolith → AdonisJS v7. All 18 routes ported with identical paths, methods, and JSON responses. Frontend-compatible — no breaking changes. Full plan: [ADONISJS-POC-PLAN.md](./ADONISJS-POC-PLAN.md)

| Phase | What | Status |
|-------|------|--------|
| 0: Scaffold | AdonisJS v7 project + DB + env (27 vars) | Done |
| 1: Port Core | Utils (6), types (2), services (6), models (5) | Done |
| 1.5: Cleanup | Fix broken imports, missing env, lint (1004→0) | Done |
| 2: Middleware | RateLimitService, CdpAuth, IpThrottle | Done |
| 3: Controllers | 6 controllers, 18 routes (exact same paths) | Done |
| 4: Tests | 103 tests passing (unit + functional), 3s runtime | Done |
| 5: Admin Dashboard | Inertia + React + Tailwind CSS v4 (6 pages) | Done |

### Ponder On-Chain Indexer — COMPLETE (deploy pending)

Standalone Ponder v0.15 indexer at `indexer/`. Watches Arbitrum for USDC transfers and GasRefuel events, stores in PostgreSQL, exposes Hono API. Full plan: [PONDER_M1_PLAN.md](./PONDER_M1_PLAN.md)

| Phase | What | Status |
|-------|------|--------|
| 7.6.1: Scaffold | ponder.config.ts, ABIs, workspace | Done |
| 7.6.2: On-chain schema | 5 tables (account, transfer, refuelEvent, gasRefuelStatus, dailyVolume) | Done |
| 7.6.3: Off-chain schema | sippy_wallet table (Drizzle pgSchema) | Done |
| 7.6.4: Indexing handlers | 6 event handlers (USDC:Transfer, GasRefuel events) | Done |
| 7.6.5-7: API layer | 15+ Hono routes (wallet mgmt, stats, dashboard, gas refuel) | Done |
| 7.6.8: Backend integration | indexer.service.ts, fire-and-forget hooks, boot sync | Done |
| 7.6.9: Deploy | Railway deployment | Pending (after PR merge) |

---

## Architecture

```
sippy/
  sippy-backend-admin/    ← AdonisJS v7 (plain, no Turborepo)
  indexer/                ← Ponder v0.15 (standalone)
  backend/                ← Legacy Express (being replaced)
  frontend/               ← Next.js
  contracts/              ← Hardhat (GasRefuel.sol)
```

```
┌──────────────┐
│   WhatsApp   │  message: "enviar 10 a +573001234567"
│   User       │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Backend (AdonisJS v7)                   │
│                                          │
│  ┌─────────────────────┐                 │
│  │  Regex Parser       │  <1ms, zero cost│
│  │  (trilingual)       │  80%+ of msgs   │
│  └────────┬────────────┘                 │
│           │ unknown?                     │
│           ▼                              │
│  ┌─────────────────────┐                 │
│  │  LLM Fallback       │  Groq free tier │
│  │  (Zod-validated)    │  ~20% of msgs   │
│  │  (no send commands) │                 │
│  └────────┬────────────┘                 │
│           │                              │
│           ▼                              │
│  ┌─────────────────────┐                 │
│  │  Command Handler    │                 │
│  │  → balance, send,   │                 │
│  │    start, help, etc │                 │
│  └────────┬────────────┘                 │
│           │                              │
│           ▼                              │
│  ┌─────────────────────┐   ┌───────────┐│
│  │  CDP Embedded       │   │ GasRefuel ││
│  │  Wallets            │   │ Contract  ││
│  │  (non-custodial)    │   │ (auto-gas)││
│  └────────┬────────────┘   └─────┬─────┘│
└───────────┼──────────────────────┼───────┘
            │                      │
            ▼                      ▼
      ┌───────────────────────────────┐
      │        Arbitrum One           │
      │        (USDC transfers)       │
      └──────────────┬────────────────┘
                     │
                     ▼
      ┌───────────────────────────────┐
      │  Ponder Indexer               │
      │  (USDC + GasRefuel events)    │
      │  → 15+ Hono API endpoints    │
      │  → Dashboard analytics        │
      └───────────────────────────────┘
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Parse latency (regex) | <1ms |
| Parse latency (LLM) | 500-2000ms |
| LLM calls per message | ~20% (regex handles 80%+) |
| LLM cost | $0/month (Groq free tier) |
| Supported languages | 3 (EN, ES, PT) |
| User-facing strings | 35+ (all trilingual) |
| WhatsApp capacity | 2K bot-initiated + unlimited user-initiated |
| Smart contract | GasRefuel.sol deployed on Arbitrum One |

---

## Recent Changes

**Mar 2** — Ponder on-chain indexer built (phases 7.6.1–7.6.8): 5 on-chain tables, 6 event handlers, 15+ Hono API routes, backend integration with fire-and-forget wallet registration. Repo restructured: removed Turborepo, flattened AdonisJS to `sippy-backend-admin/`, moved indexer to standalone `indexer/` at root. Admin dashboard COMPLETE (Inertia.js + React + Tailwind CSS v4, 6 pages).
**Feb 28** — AdonisJS migration COMPLETE: all 18 Express routes ported to AdonisJS v7, 103 tests passing (unit + functional), same JSON responses — frontend-compatible. Key fixes: `forceExit: true`, `$N→?` placeholder conversion for Lucid, phone length validation.
**Feb 21** — Sweep-to-EOA in export flow, webapp fallback wallet (/wallet), authenticated phone resolution, web send audit logging, IP rate limiting, repo cleanup (22 outdated docs removed)
**Feb 20** — Regex greetings/social phrases, media message handling, language continuity fix
**Feb 19** — Trilingual sanitizer fallback, recipient language in notifications
**Feb 18** — PYUSD → USDC migration, Zod validation, parse observability logging
**Feb 17** — Regex-first parser, trilingual message catalog, language detection + persistence
**Feb 16** — LLM system prompt rewrite, personality + product knowledge

---

## Environment

| Service | Provider | Status |
|---------|----------|--------|
| Backend hosting | Railway | Active |
| Database | Railway PostgreSQL | Active |
| Blockchain | Arbitrum One | Active |
| Wallets | Coinbase CDP Embedded | Active |
| Messaging | WhatsApp Business API | Active (production number) |
| LLM | Groq (free tier) | Active |
| Smart contract | GasRefuel.sol | Deployed |
| Domain | sippy.lat | Active |
| On-chain indexer | Ponder v0.15 + PostgreSQL | Built (deploy pending) |
| Onramp | Maash | Blocked (waiting on API) |
