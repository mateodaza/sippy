# Project Status — Sippy

**Last Updated:** February 21, 2026
**Current Milestone:** M1 — Production Ready (deadline Mar 26, 2026)
**Detailed Plan:** [M1_PLAN.md](./M1_PLAN.md)

---

## M1 Deliverable Progress

| # | Deliverable | Status | Notes |
|---|------------|--------|-------|
| 1 | Onramp integration | Blocked | Waiting on Maash API response |
| 2 | Non-custodial wallet refinements | 90% | CDP Embedded Wallets working, onboarding polish needed |
| 3 | Security hardening | 70% | Rate limits + spam done, tx confirmation + velocity pending |
| 4 | Dual currency display (USD + local) | 0% | Phone prefix → currency mapping designed, not built |
| 5 | Privacy controls | 0% | Planned: phone visibility toggle |
| 6 | User settings | 80% | Settings page working, language via WhatsApp working |
| 7 | Monitoring infrastructure | 20% | Parse logging done, Sentry + structured logging pending |
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
- Settings page: daily limit management, session persistence
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
- Tables: `phone_registry`, `user_preferences`, `parse_log`
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

### Phase 4: Security Hardening — Partially Done (70%)

- Done: rate limiting, spam protection, message deduplication, daily spending limits, amount validation
- Pending: transaction confirmation flow, webhook signature validation, velocity checks, self-send block, concurrent send protection, admin controls

### Phase 5: Privacy Controls — Not Started

- Phone visibility toggle
- Language preference UI in settings
- WhatsApp privacy command

### Phase 6: Onramp — BLOCKED

- Waiting on Maash API docs and credentials
- Everything else ships independently

### Phase 7: Monitoring — Partially Done

- Parse logging done (parse_log table)
- Sentry, structured logging (pino), health endpoint pending

### Phase 8: Beta Launch Prep — Not Started

- End-to-end test matrix
- 50 tester onboarding
- Production environment hardening

---

## Architecture

```
┌──────────────┐
│   WhatsApp   │  message: "enviar 10 a +573001234567"
│   User       │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Backend (Node.js / TypeScript / Express) │
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

## Recent Changes (Feb 2026)

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
| Onramp | Maash | Blocked (waiting on API) |
