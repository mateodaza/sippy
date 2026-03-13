# Project Status — Sippy

**Last Updated:** March 12, 2026
**Current Milestone:** M1 — Production Ready (deadline Mar 26, 2026)
**Detailed Plan:** [M1_PLAN.md](./M1_PLAN.md)
**Task Queue:** [TASK_QUEUE.md](./TASK_QUEUE.md)

---

## M1 Deliverable Progress

| # | Deliverable | Status | Notes |
|---|------------|--------|-------|
| 1 | Onramp integration | Blocked | Waiting on Maash API response |
| 2 | Non-custodial wallet refinements | 98% | CDP Embedded Wallets, sweep-to-EOA, web wallet, dual-wallet UI, custom auth — all done |
| 3 | Security hardening | 70% | Done: rate limits, spam, auth, custom auth, email gates, email squatting fix. Pending: phone sanitization (SH), tx confirmation (TX), velocity checks, tiered limits (EL), backend audit (AU) |
| 4 | Dual currency display (USD + local) | 100% | 26 LATAM currencies, phone prefix mapping, 24h cache, all separators |
| 5 | Privacy controls + Email Recovery | 85% | Email collection, verification, gate tokens, recovery design done. Pending: phone visibility toggle (PV) |
| 6 | User settings | 85% | Settings page, email management, daily limits, key export done. Pending: language auto-detect (LN), tiered limit display (EL), privacy toggle (PV) |
| 7 | Monitoring infrastructure | 70% | Indexer deployed, admin analytics + users with real on-chain data. Pending: Sentry (MO), health endpoint, structured logging |
| 8 | Legal entity | External | In progress separately |
| 9 | WhatsApp production number | 100% | Active, approved |
| 10 | Closed beta: 50 testers | 0% | Depends on security + onramp completion |

---

## Current Focus: Backend Security (Week 4)

Priority tasks in [TASK_QUEUE.md](./TASK_QUEUE.md):

1. **SH — Phone Sanitization (P0):** Unify phone normalization to single canonical E.164 format, DB constraints to prevent duplicates
2. **TX — Transaction Security (P0):** Confirmation flow, self-send block, concurrent send protection, velocity limiter, amount hardening
3. **EL — Tiered Limits (P1):** $50/day default, $500/day for email-verified users
4. **LN — Language Auto-Detection (P1):** Phone prefix → website language (US→EN, BR→PT, else→ES)
5. **PV — Phone Visibility (P2):** Privacy toggle for phone number on public profile

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

## Known Issues

- **Phone format inconsistency:** Two normalization functions, phone stored without `+` in DB but with `+` in JWT. Fix: SH-001→003 in TASK_QUEUE.md
- **No tx confirmation flow:** Sends execute immediately without user confirmation. Fix: TX-001
- **Flat daily limit:** All users get $500/day regardless of verification status. Fix: EL-001→004
- **No phone visibility toggle:** Profile always shows full phone number. Fix: PV-001→004
- **No website language detection:** Website doesn't auto-detect language from phone. Fix: LN-001→003
- **Onramp blocked:** Waiting on Maash API. Fallback Path B documented in M1_PLAN.md

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

**Mar 12** — Task queue restructured: completed tasks archived to `COMPLETED_TASK_QUEUES.md`, new TASK_QUEUE.md with SH (phone sanitization), TX (tx security), EL (tiered limits), LN (language detection), PV (phone visibility), AU (audit), MO (monitoring), AC (admin controls), WS (session robustness), BP (beta prep). M1_PLAN timeline updated for weeks 4-5.
**Mar 12** — Dual-wallet web UI: WhatsApp EOA wallet + smart account shown as selectable cards, auto-selects funded wallet, `POST /api/send` for EOA sends via SpendPermission. CDP Portal configured (JWKS URL + issuer live). Dual currency COMPLETE (26 LATAM currencies, 24h cache). Email recovery infrastructure COMPLETE (collection, verification, gate tokens, Resend integration). Security fixes: email bypass vulnerability patched, email squatting blocked via partial unique index. 437 tests passing.
**Mar 11** — P4.6 Custom Auth COMPLETE: Twilio raw SMS OTP (trilingual) + RS256 JWT + JWKS endpoint. Backend: jwt_service, otp_service, jwt_auth_middleware replacing CDP auth. Frontend: all 3 pages migrated to `authenticateWithJWT()`. CDP Portal config pending (manual).
**Mar 6** — Doc cleanup: removed stale planning docs (ADONISJS-POC-PLAN, PONDER plans, loyalty-network). M1_PLAN.md updated with Carlos handoff priorities — custom auth (P4.6) is now #1.
**Mar 5** — Admin analytics fixes: Top Users now ranks by total volume (sent + received), daily volume chart renders with pixel-based bar heights. Users page shows real on-chain data from indexer.
**Mar 2** — Ponder on-chain indexer built (phases 7.6.1–7.6.8): 5 on-chain tables, 6 event handlers, 15+ Hono API routes, backend integration with fire-and-forget wallet registration. Repo now runs as a Turborepo/pnpm workspace with apps under `apps/backend`, `apps/web`, and `apps/indexer`. Admin dashboard COMPLETE (Inertia.js + React + Tailwind CSS v4, 6 pages).
**Feb 28** — AdonisJS migration COMPLETE: all 18 Express routes ported to AdonisJS v7, 103 tests passing (unit + functional), same JSON responses — frontend-compatible. Key fixes: `forceExit: true`, `$N→?` placeholder conversion for Lucid, phone length validation.

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
