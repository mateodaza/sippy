# Project Status — Sippy

**Last Updated:** March 12, 2026
**Current Milestone:** M1 — Production Ready (deadline Mar 26, 2026)
**Detailed Plan:** [M1_PLAN.md](./M1_PLAN.md)

---

## M1 Deliverable Progress

| # | Deliverable | Status | Notes |
|---|------------|--------|-------|
| 1 | Onramp integration | Blocked | Waiting on Maash API response |
| 2 | Non-custodial wallet refinements | 95% | CDP Embedded Wallets working, sweep-to-EOA + web wallet done |
| 3 | Security hardening | 90% | Rate limits + spam + auth + custom auth + email gates + email squatting fix done, tx confirmation + velocity pending |
| 4 | Dual currency display (USD + local) | 100% | 26 LATAM currencies, phone prefix mapping, 24h cache, all separators |
| 5 | Privacy controls + Email Recovery | 90% | Email collection, verification, gate tokens, recovery design — phone visibility toggle pending |
| 6 | User settings | 95% | Settings page + email management + daily limits + key export, language UI pending |
| 7 | Monitoring infrastructure | 70% | Indexer deployed, admin analytics + users showing real on-chain data, Sentry pending |
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

- Setup page: full onboarding flow (phone → OTP → wallet → permission → optional recovery email) — custom auth via Twilio+JWT
- Settings page: daily limit management, private key export with sweep-to-EOA, recovery email management, session persistence
- Wallet page: web fallback — balance card, send USDC (to phone or 0x address), activity list
- All pages: Sippy-branded SMS OTP (not Coinbase), JWT-based auth with CDP `authenticateWithJWT`
- Fund page: add ETH/USDC to wallet
- Profile pages: balance + transaction history (Blockscout API)
- Receipt pages: shareable transaction details
- Responsive, Tailwind CSS

### Smart Contracts — Deployed

- GasRefuel.sol on Arbitrum One (`0xC8367a549e05D9184B8e320856cb9A10FDc1DE46`)
- Automatic gas refueling before USDC transfers
- Admin-funded, configurable minimum balance threshold

### Admin Dashboard — Production

- AdonisJS v7 backend with Inertia.js + React + Tailwind CSS v4
- `/admin/analytics` — Total USDC volume, fund flow breakdown, top users by volume, daily volume chart, gas refuel stats
- `/admin/users` — Users table with real on-chain data (Total Sent, Total Received, Txs, Last Activity)
- `/admin/users/:phone` — User detail with on-chain stats + activity log
- 437 tests passing (unit + functional)

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

## What's In Progress

### Phase 4.6: Custom Auth — DONE

- Replaced CDP's `useSignInWithSms` with Twilio OTP + `useAuthenticateWithJWT`
- Backend: `otp_service.ts` (Twilio raw SMS, trilingual) + `jwt_service.ts` (RS256 + JWKS) + `jwt_auth_middleware.ts`
- Frontend: all 3 pages migrated (`/setup`, `/settings`, `/wallet`), CDP provider configured with `customAuth.getJwt`
- CDP Portal configured (JWKS URL + issuer registered, verified live Mar 12)

### Phase 2: Onboarding Tightening — Not Started

- Smart welcome based on user state (new / wallet-no-permission / fully set up)
- Post-registration WhatsApp nudges
- Setup page error recovery + progress indicator
- Empty balance guidance with fund link

### Phase 3: Dual Currency Display — DONE

- 26 LATAM currencies supported via phone prefix → currency mapping
- Exchange rate service with 24h cache (open.er-api.com, no API key)
- All balance/transfer messages show USD + local equivalent
- Correct thousands separators per currency (period vs comma)
- USD-pegged countries (Ecuador, Panama, El Salvador) skip local display

### Phase 4: Security Hardening — Partially Done (90%)

- Done: rate limiting, spam protection, message deduplication, daily spending limits, amount validation, authenticated phone resolution, IP rate limiting, web send audit logging, custom auth (Twilio+JWT), email verification gates, email bypass fix, email squatting fix (partial unique index)
- Pending: transaction confirmation flow, webhook signature validation, velocity checks, self-send block, concurrent send protection, admin controls

### Phase 5: Privacy Controls + Email Recovery — Partially Done (90%)

- Done: sweep-to-EOA in export flow, webapp fallback wallet (/wallet), cross-nav between /settings and /wallet, email collection (setup + settings), email verification (6-digit code via Resend), gate tokens for sensitive ops, recovery design doc
- Pending: phone visibility toggle, language preference UI, WhatsApp privacy command

### Phase 6: Onramp — BLOCKED

- Waiting on Maash API docs and credentials
- Everything else ships independently

### Phase 8: Beta Launch Prep — Not Started

- End-to-end test matrix
- 50 tester onboarding
- Production environment hardening

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
| Backend tests | 437 passing (unit + functional) |

---

## Recent Changes

**Mar 12** — Dual-wallet web UI: WhatsApp EOA wallet + smart account shown as selectable cards, auto-selects funded wallet, `POST /api/send` for EOA sends via SpendPermission. CDP Portal configured (JWKS URL + issuer live). Dual currency COMPLETE (26 LATAM currencies, 24h cache). Email recovery infrastructure COMPLETE (collection, verification, gate tokens, Resend integration). Security fixes: email bypass vulnerability patched, email squatting blocked via partial unique index. 437 tests passing.
**Mar 11** — P4.6 Custom Auth COMPLETE: Twilio raw SMS OTP (trilingual) + RS256 JWT + JWKS endpoint. Backend: jwt_service, otp_service, jwt_auth_middleware replacing CDP auth. Frontend: all 3 pages migrated to `authenticateWithJWT()`. CDP Portal config pending (manual).
**Mar 6** — Doc cleanup: removed stale planning docs (ADONISJS-POC-PLAN, PONDER plans, loyalty-network). M1_PLAN.md updated with Carlos handoff priorities — custom auth (P4.6) is now #1.
**Mar 5** — Admin analytics fixes: Top Users now ranks by total volume (sent + received), daily volume chart renders with pixel-based bar heights. Users page shows real on-chain data from indexer.
**Mar 2** — Ponder on-chain indexer built (phases 7.6.1–7.6.8): 5 on-chain tables, 6 event handlers, 15+ Hono API routes, backend integration with fire-and-forget wallet registration. Repo now runs as a Turborepo/pnpm workspace with apps under `apps/backend`, `apps/web`, and `apps/indexer`. Admin dashboard COMPLETE (Inertia.js + React + Tailwind CSS v4, 6 pages).
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
| On-chain indexer | Ponder v0.15 + Railway | Deployed |
| SMS OTP | Twilio (raw SMS API) | Configured |
| Email delivery | Resend | Configured |
| Exchange rates | open.er-api.com (free) | Active |
| Onramp | Maash | Blocked (waiting on API) |
