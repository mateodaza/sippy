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
│  → LLM classifier for NL       │
│  → LLM normalizer for slang    │
│  → Regex always validates send  │
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
- Regex-first parsing -- 80%+ of messages resolved at zero cost, <1ms
- LLM classifier (Groq / Llama 4 Scout) for natural language questions
- LLM normalizer (llama-3.1-8b) for slang sends -- reformats to standard format, regex always validates, anti-injection checks amount + phone against original text
- Tiered fallback: Scout primary, Qwen3-32b fallback, 8B normalizer
- Zod-validated LLM outputs
- Language auto-detection with persistence (follows the user)
- Casual, friendly tone -- like a friend on WhatsApp

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
- Settings page: daily limit, private key export with sweep-to-EOA
- Wallet page: web fallback — balance, send USDC (to phone or 0x address), activity
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
| Framework | AdonisJS v7 |
| Wallets | Coinbase CDP Embedded Wallets (non-custodial) |
| LLM | Groq (Llama 4 Scout + Qwen3-32b + 8B, free tier) |
| Validation | Zod |
| Blockchain | Arbitrum One (USDC) |
| Smart Contract | GasRefuel.sol (gasless transfers) |
| Database | PostgreSQL (Railway) |
| Frontend | Next.js 16 + Tailwind CSS |
| Messaging | WhatsApp Business API (Meta) |

---

## Project Structure

```
sippy/
├── apps/
│   ├── backend/                           # AdonisJS v7 (WhatsApp bot + admin dashboard)
│   │   ├── app/
│   │   │   ├── controllers/               # Route handlers
│   │   │   ├── services/                  # CDP wallets, WhatsApp, LLM, refuel
│   │   │   ├── models/                    # Lucid ORM models
│   │   │   └── utils/                     # Regex parser, messages, phone
│   │   └── tests/                         # 850+ tests (unit + functional + live LLM)
│   │
│   ├── web/                               # Next.js 16 frontend
│   │   ├── app/
│   │   │   ├── setup/                     # Wallet setup flow
│   │   │   ├── settings/                  # User settings + key export + sweep
│   │   │   ├── wallet/                    # Web fallback wallet
│   │   │   ├── fund/                      # Add funds
│   │   │   ├── profile/[phone]/           # Public profile
│   │   │   └── receipt/[txHash]/          # Transaction receipts
│   │   └── components/                    # Shared UI components
│   │
│   └── indexer/                           # Ponder v0.15 on-chain indexer
│       ├── src/                           # Event handlers + API routes
│       └── abis/                          # Contract ABIs
│
├── packages/
│   └── shared/                            # @sippy/shared: constants, ABIs, types
│
├── contracts/
│   └── gas-refuel/                        # Hardhat (GasRefuel.sol on Arbitrum One)
│
├── archive/
│   └── express-backend/                   # Legacy Express backend (archived)
│
├── turbo.json                             # Turborepo build orchestration
├── pnpm-workspace.yaml                    # pnpm workspace config
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

### Install (from repo root)

```bash
pnpm install
```

### Backend

```bash
cd apps/backend
cp ENV-TEMPLATE.txt .env
# Fill in environment variables (see ENV-TEMPLATE.txt for details)
pnpm dev
```

### Frontend

```bash
cd apps/web
cp ENV-TEMPLATE.txt .env.local
# Fill in environment variables
pnpm dev
```

### All services (via Turborepo)

```bash
pnpm dev          # start all services
pnpm dev:backend  # backend only
pnpm dev:web      # frontend only
pnpm dev:indexer  # indexer only
```

---

## Usage

```
User: hola
Bot:  Hola! Soy Sippy. Puedes enviar dolares a cualquier numero de telefono desde aqui.
      Solo dime que necesitas — ver tu saldo, enviar dinero, o di "ayuda".

User: saldo
Bot:  Saldo
      Disponible: 25.00 USDC
      Billetera: 0x5Aa5...bcde4

User: enviar 10 a +573001234567
Bot:  Transferencia completada.
      Monto: 10.00 USDC
      Destinatario: +57***4567

User: pasale 10 lucas al 3116613414
Bot:  (normalizer rewrites to "enviar 10 a 3116613414" → regex validates → executes)

User: help
Bot:  Here's what you can do:
      Send money — just say "send 5 to +573001234567"
      Check your balance — "balance"
      See your history — "history"
      Manage limits — "settings"
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
- [Frontend Env](./apps/web/ENV-SETUP.md) — Frontend configuration

---

## Links

- [Arbitrum Explorer](https://arbiscan.io/)
- [USDC on Arbitrum](https://arbiscan.io/token/0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
- [Coinbase CDP Docs](https://docs.cdp.coinbase.com/)
- [GasRefuel Contract](https://arbiscan.io/address/0xE4e5474E97E89d990082505fC5708A6a11849936)
