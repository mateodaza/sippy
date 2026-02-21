# Sippy — WhatsApp Dollar Wallet for Latin America

Send and receive USDC via WhatsApp. No wallets, no gas, just your phone number.

Built on Arbitrum. Funded by a Questbook Arbitrum grant ($25K).

---

## What It Does

Anyone with a phone number can:

- **Send dollars** — `send 5 to +573001234567`
- **Check balance** — `balance` / `saldo`
- **Add funds** — fiat onramp (COP → USDC) or crypto top-up
- **View history** — transaction explorer with shareable receipts

No app to install. No seed phrases. No gas fees. Just WhatsApp.

---

## How It Works

```
WhatsApp message
       │
       ▼
┌─────────────────────────────────┐
│  Backend (Node.js / TypeScript) │
│                                 │
│  Message Parser (regex-first)   │
│  → Trilingual: EN / ES / PT    │
│  → LLM fallback for questions  │
│  → Send = regex only (no LLM)  │
│                                 │
│  Coinbase CDP Embedded Wallets  │
│  → Non-custodial (user-owned)  │
│  → Created per phone number    │
│                                 │
│  GasRefuel Contract             │
│  → Auto-covers gas for users   │
└─────────────────────────────────┘
       │
       ▼
   Arbitrum One
   (USDC transfers)
```

---

## Current Features

**WhatsApp Bot**
- Trilingual commands: English, Spanish, Portuguese
- Regex-first parsing — 80%+ of messages resolved at zero cost, <1ms
- LLM fallback (Groq / Llama 3.3 70B) for natural language questions
- Send commands are regex-only — LLM never triggers money movement
- Zod-validated LLM outputs
- Language auto-detection with persistence (follows the user)
- Professional tone, no emojis

**Wallets**
- Coinbase CDP Embedded Wallets (non-custodial)
- One wallet per phone number, created on first interaction
- Users never manage keys or seed phrases

**Transfers**
- USDC peer-to-peer on Arbitrum
- Gasless — GasRefuel contract auto-funds gas before each transfer
- Daily spending limits (configurable per user)
- Recipient notifications via WhatsApp

**Frontend**
- Setup page: phone verification → wallet creation → spending limit
- Settings page: daily limit, language preference
- Transaction receipts: shareable links
- Profile pages: balance + transaction history
- Fund page: add USDC to your wallet

**Observability**
- Structured parse logging (parse_log table with correlation keys)
- Regex vs LLM ratio tracking
- Per-message latency and token usage

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express.js |
| Wallets | Coinbase CDP Embedded Wallets (non-custodial) |
| LLM | Groq (Llama 3.3 70B, free tier) |
| Validation | Zod |
| Blockchain | Arbitrum One (USDC) |
| Smart Contract | GasRefuel.sol (gasless transfers) |
| Database | PostgreSQL (Railway) |
| Frontend | Next.js 15 + Tailwind CSS |
| Messaging | WhatsApp Business API (Meta) |

---

## Project Structure

```
sippy/
├── backend/
│   ├── server.ts                          # Express server + webhook handler
│   ├── src/
│   │   ├── commands/
│   │   │   ├── start.command.ts           # Wallet creation + onboarding
│   │   │   ├── balance.command.ts         # Balance queries
│   │   │   └── send.command.ts            # USDC transfers
│   │   ├── services/
│   │   │   ├── cdp-wallet.service.ts      # Coinbase CDP SDK
│   │   │   ├── embedded-wallet.service.ts # Embedded wallet management
│   │   │   ├── whatsapp.service.ts        # WhatsApp API client
│   │   │   ├── llm.service.ts             # Groq LLM (Zod-validated)
│   │   │   ├── refuel.service.ts          # Gas refueling
│   │   │   └── db.ts                      # PostgreSQL + parse_log
│   │   ├── utils/
│   │   │   ├── messageParser.ts           # Regex-first, LLM fallback
│   │   │   ├── messages.ts                # Trilingual message catalog
│   │   │   ├── errors.ts                  # Trilingual error messages
│   │   │   ├── language.ts                # Language detection + confidence
│   │   │   ├── sanitize.ts                # Output sanitizer
│   │   │   └── phone.ts                   # Phone normalization
│   │   ├── types/
│   │   │   ├── index.ts                   # Core types
│   │   │   └── schemas.ts                 # Zod schemas
│   │   └── routes/
│   │       └── embedded-wallet.routes.ts  # Setup API routes
│   └── tests/
│       └── unit/
│           └── message-parser.test.ts     # Parser tests
│
├── frontend/
│   ├── app/
│   │   ├── setup/                         # Wallet setup flow
│   │   ├── settings/                      # User settings
│   │   ├── fund/                          # Add funds
│   │   ├── profile/[phone]/              # Public profile
│   │   └── receipt/[txHash]/             # Transaction receipts
│   └── lib/
│       ├── blockscout.ts                  # Transaction data
│       └── phone.ts                       # Phone utilities
│
├── contracts/
│   └── gas-refuel/
│       └── contracts/
│           └── GasRefuel.sol              # Deployed on Arbitrum One
│
├── M1_PLAN.md                             # Milestone 1 implementation plan
├── PROJECT-STATUS.md                      # Current status + progress
└── README.md                              # This file
```

---

## Getting Started

### Prerequisites

- Node.js v20+
- pnpm
- Coinbase CDP API credentials
- WhatsApp Business API access
- PostgreSQL database

### Backend

```bash
cd backend
pnpm install
cp ENV-TEMPLATE.txt .env
# Fill in environment variables (see ENV-TEMPLATE.txt for details)
pnpm dev
```

### Frontend

```bash
cd frontend
pnpm install
cp ENV-TEMPLATE.txt .env.local
# Fill in environment variables
pnpm dev
```

---

## Usage

```
User: hola
Bot:  Hola, bienvenido a Sippy.
      Puedes enviar dolares a cualquier numero, consultar tu saldo o agregar fondos.
      Prueba "saldo", "ayuda" o "enviar 5 a +57..."

User: saldo
Bot:  Saldo
      Disponible: 25.00 USDC
      Billetera: 0x5Aa5...bcde4

User: enviar 10 a +573001234567
Bot:  Transferencia completada.
      Monto: 10.00 USDC
      Destinatario: +57***4567

User: help
Bot:  Available commands:
      balance — Check your balance
      send [amount] to [phone] — Send USDC
      history — View transactions
      settings — Manage your account
      about — Learn about Sippy
```

---

## Grant

**Questbook Arbitrum Grant** — $25,000 (approved Feb 2026)

| Milestone | Amount | Deadline | Focus |
|-----------|--------|----------|-------|
| M1 | $12,000 | Mar 26, 2026 | Production ready |
| M2 | $9,250 | Jun 5, 2026 | Public launch |
| M3 | $3,750 | Sep 5, 2026 | Final report |

See [M1_PLAN.md](./M1_PLAN.md) for detailed implementation plan.

---

## Documentation

- [M1 Plan](./M1_PLAN.md) — Implementation roadmap for Milestone 1
- [Project Status](./PROJECT-STATUS.md) — Current status and progress
- [Backend Setup](./backend/QUICK-START.md) — Deployment guide
- [Gas Refuel](./backend/REFUEL_SETUP.md) — Smart contract setup
- [Frontend Env](./frontend/ENV-SETUP.md) — Frontend configuration

---

## Links

- [Arbitrum Explorer](https://arbiscan.io/)
- [USDC on Arbitrum](https://arbiscan.io/token/0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
- [Coinbase CDP Docs](https://docs.cdp.coinbase.com/)
- [GasRefuel Contract](https://arbiscan.io/address/0xC8367a549e05D9184B8e320856cb9A10FDc1DE46)
