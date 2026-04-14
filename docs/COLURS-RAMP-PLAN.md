# Colurs Onramp & Offramp — Implementation Plan

> **Status: PLANNING**
> Base URL (staging): `https://dev.backend.colurs.co`
> Base URL (production): `https://api.colurs.co` (swap, quote), `https://backend.colurs.co` (everything else)
>
> **Open questions — confirm with Colurs before implementation:**
>
> 1. **USDT settlement**: Colurs sending USDT to `SIPPY_ETH_DEPOSIT_ADDRESS` after R2P payment is a verbal commitment — no public API field documents destination wallet, asset, or chain. Treat as external promise until confirmed in writing.
> 2. **Webhook signature**: The exact header name, HMAC algorithm, and sample payload for `COLURS_WEBHOOK_SECRET` verification are not yet in the docs ("coming soon"). Ask Colurs.
> 3. **Base URL split**: The production split (`api.colurs.co` vs `backend.colurs.co`) is inconsistent across Colurs docs and OpenAPI JSON. Confirm which base URL applies to which endpoints before hardcoding.

---

## Overview

Two flows powered by Colurs fiat rails:

| Direction   | Path                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| **Onramp**  | COP (PSE/Nequi/Bancolombia) → Colurs → USDT (ETH mainnet) → LiFi → USDC (Arbitrum) |
| **Offramp** | USDC (Arbitrum) → Sippy spender → Colurs USD balance → FX → COP (bank)             |

### Offramp: pre-funded balance model

Offramp does **not** require a per-transaction bridge. Sippy maintains a pre-funded USD balance in Colurs. When a user cashes out, Sippy pays COP from that balance using Colurs FX rails. Sippy's treasury rebalances the Colurs USD balance periodically (sell USDC → wire USD to Colurs) — this is an ops concern, not inline transaction logic.

This eliminates bridge fees, latency, and failure points from the offramp path.

### Onramp: LiFi disable flag

Colurs confirmed they will add **direct USDC support** in the near future (no timeline). When that ships, the LiFi bridge step is removed from onramp — Colurs will send USDC directly to the user's Arbitrum wallet.

Onramp LiFi bridge calls are gated behind `COLURS_DIRECT_USDC=true` env flag:

- `false` (default): Colurs sends USDT to ETH mainnet → LiFi bridges to USDC on Arbitrum
- `true`: Colurs sends USDC directly to user's Arbitrum wallet — no LiFi step

---

## Authentication

### Overview

Every Colurs API call requires two headers:

```
Authorization: Bearer <access_token>
x-api-key: <api_key>
```

The `x-api-key` is a static key provisioned per integration (Sippy gets one key). The `access_token` is a short-lived JWT obtained by logging in with username/password.

### Token lifetimes

| Token         | Lifetime    | Notes                                                  |
| ------------- | ----------- | ------------------------------------------------------ |
| Access token  | 15 minutes  | JWT (HS256) — expiry readable from `exp` claim         |
| Refresh token | 10,000 days | Opaque — use to get new access tokens without re-login |

### Login

```
POST /token/
Headers: x-api-key, Content-Type: application/json
```

**Request:**

```json
{
  "username": "sippy@colurs.co",
  "password": "...",
  "platform": "API"
}
```

`platform` must be `"API"` for server-to-server integrations. Other values (`PANEL`, `IOS`, `ANDROID`) require an additional `code` field — not needed for us.

If the account has MFA enabled, an extra `otp` (6-digit TOTP) is required. **Sippy's account should have MFA disabled** to allow headless login.

**Response:**

```json
{
  "access": "<jwt>",
  "refresh": "<opaque>"
}
```

### Refresh

```
POST /token/refresh/
Headers: x-api-key, Content-Type: application/json
```

**Request:**

```json
{ "refresh": "<refresh_token>" }
```

**Response:**

```json
{ "access": "<new_jwt>" }
```

Only the access token is rotated. The refresh token stays the same until it expires (10,000 days) or is revoked.

### Logout

No server-side endpoint. Colurs is stateless — logout = discard tokens client-side. Tokens cannot be invalidated server-side.

### Token management strategy for `colurs_auth.service.ts`

```
On startup:
  → POST /token/ → store access + refresh tokens

On every API call (getAccessToken()):
  → If access token expires within 2 min → POST /token/refresh/
  → If refresh fails (revoked/network) → fall back to POST /token/
  → Return valid access token

Concurrency:
  → Multiple simultaneous calls during refresh wait on one shared promise
    (prevents thundering herd / duplicate login requests)

JWT decoding:
  → Read exp claim from token payload (base64url decode, no JWT library needed)
  → exp is Unix seconds → convert to ms for Date.now() comparison
```

### Error responses

| Status                     | Meaning                                             |
| -------------------------- | --------------------------------------------------- |
| 401                        | Token expired or invalid — trigger refresh/re-login |
| 400 `DataInvalidException` | Wrong credentials                                   |
| 400 `OTPRequiredException` | Account has MFA on — must pass `otp`                |
| 400 `InvalidOTPException`  | Wrong TOTP code                                     |
| 400 `CodeExpiredException` | TOTP code expired (30-second window)                |

---

## Onramp

### Flow

```
1. User requests onramp (WhatsApp or web)
         ↓
2. Backend: POST /api/onramp/initiate
   - Create Colurs payer (counterparty)
   - Initiate PSE / Nequi / Bancolombia payment
   - Store order in onramp_orders (status: pending)
   - PSE / Bancolombia: return payment_link to user
   - Nequi: return tracking_key (payment_link is null — user pays from Nequi app)
         ↓
3. User completes payment
   - PSE / Bancolombia: user follows payment_link to Colurs-hosted page
   - Nequi: user opens Nequi app → finds pending charge by tracking_key → approves
         ↓
4. POST /webhook/colurs fires (payment.completed)
   - Look up order by external_id
   - Update status → paid
         ↓
5a. If COLURS_DIRECT_USDC=false (default):
    - Colurs sends USDT to SIPPY_ETH_DEPOSIT_ADDRESS (ETH mainnet)
    - LiFi SDK: bridge USDT (chain 1) → USDC (chain 42161) to user's Sippy wallet
    - Update status → bridging → completed

5b. If COLURS_DIRECT_USDC=true (future):
    - Colurs sends USDC directly to user's Arbitrum wallet
    - No LiFi step
    - Update status → awaiting_onchain_usdc (do NOT mark completed here)
         ↓
6. Alchemy webhook detects USDC on Arbitrum → onchain_writer credits account (already works)
   - Update status → completed
         ↓
7. WhatsApp notification: "Recibiste X USDC"
```

### Onramp API endpoints used from Colurs

| Step         | Method | Path                            |
| ------------ | ------ | ------------------------------- |
| Auth         | POST   | `/token/`                       |
| Create payer | POST   | `/api/reload/r2p/counterparty/` |
| PSE          | POST   | `/api/reload/r2p/pse/`          |
| Nequi        | POST   | `/api/reload/r2p/nequi/`        |
| Bancolombia  | POST   | `/api/reload/r2p/bancolombia/`  |

**PSE request body:**

```json
{
  "counterparty_id": "string",
  "amount_cop": 150000,
  "external_id": "onramp_<uuid>",
  "description_to_payer": "Fondear Sippy",
  "description_to_payee": "Recarga usuario",
  "redirect_url": "https://app.sippy.lat/onramp/success",
  "financial_institution_code": "string",
  "fee_mode": "payer"
}
```

**PSE / Bancolombia response:**

```json
{
  "money_movement_id": "string",
  "payment_link": "https://...",
  "tracking_key": "string",
  "status": "pending",
  "fee_breakdown": {}
}
```

**Nequi response** — `payment_link` is always `null`; user pays from the Nequi app using `tracking_key`:

```json
{
  "money_movement_id": "string",
  "payment_link": null,
  "tracking_key": "string",
  "status": "pending",
  "fee_breakdown": {}
}
```

### What changes for onramp when COLURS_DIRECT_USDC=true

`onramp_bridge.service.ts` checks the flag at runtime:

```typescript
if (env.get('COLURS_DIRECT_USDC') === 'true') {
  // Colurs sends USDC to user.wallet_address on Arbitrum directly
  // Set awaiting_onchain_usdc — Alchemy webhook will mark completed when USDC lands
  await updateOnrampOrder(orderId, { status: 'awaiting_onchain_usdc' })
} else {
  // Bridge USDT (ETH mainnet) → USDC (Arbitrum)
  await bridgeUsdtToUsdc(amount, userWalletAddress)
}
```

---

## Offramp

### Flow

```
1. User requests offramp (WhatsApp: "retirar $50" / web)
         ↓
2. POST /api/offramp/quote
   - POST /v2/exchange/quotes/ (currency_pair: "usd/cop", source_amount)
   - Return: COP amount, exchange rate, fees, quote_id, expiry
         ↓
3. User confirms amount + selects registered bank account
         ↓
4. POST /api/offramp/initiate
   - Pull USDC from user's wallet via spend permission (already works)
   - POST /v2/exchange/initiate/ (quote_id + bank_account_id)
   - Store order in offramp_orders (status: pending_fx)
         ↓
5. Colurs executes FX + bank payout (1–3 business days)
         ↓
6. POST /webhook/colurs fires (withdrawal.completed)
   - Update status → completed
   - WhatsApp: "Tu retiro de $207,500 COP fue enviado a Bancolombia ****1234"
```

No LiFi. No bridge. No USDT conversion.

### Treasury rebalancing (ops, not code)

As users offramp, Sippy's Colurs USD balance depletes. Ops periodically:

1. Sell USDC on exchange (Coinbase, Binance)
2. Wire USD to Sippy's Colurs USD wallet via ACH/wire (`GET /usd/user/wallet` for details)
3. Monitor balance via `GET /balance/?currency=USD` — alert if below threshold

### Offramp API endpoints used from Colurs

| Step          | Method | Path                                  |
| ------------- | ------ | ------------------------------------- |
| FX quote      | POST   | `/v2/exchange/quotes/`                |
| Get quote     | GET    | `/v2/exchange/quotes/{uuid}/`         |
| Create intent | POST   | `/v2/exchange/initiate/`              |
| Get banks     | GET    | `/list_third_party_banks/?country=CO` |
| Get doc types | GET    | `/base/document_type/`                |
| Register bank | POST   | `/create_third_party_banks/`          |
| Balance check | GET    | `/balance/?currency=USD`              |

> `/v2/exchange/execute/` is for manual/special-case execution — not used in the standard auto-payout flow (`initiate/` handles it).
> `/create/third_party_withdraw/` is a separate direct bank withdrawal flow unrelated to the FX movement model — not used.

**FX quote request:**

```json
{
  "currency_pair": "usd/cop",
  "source_amount": 50.0,
  "type": "static_quote"
}
```

**FX quote response:**

```json
{
  "id": "uuid",
  "rate": 4150.0,
  "source_amount": 50.0,
  "destination_amount": 207500,
  "status": "valid",
  "expires_at": "2026-04-13T12:15:00Z"
}
```

**Create intent request:**

```json
{
  "quote_id": "uuid",
  "source_account_id": "sippy_colurs_usd_account",
  "destination_account_id": "sippy_colurs_cop_account",
  "bank_account_id": 1234,
  "external_id": "offramp_<uuid>"
}
```

---

## What to build

### 1. Database migrations

#### `onramp_orders`

```sql
CREATE TABLE onramp_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT NOT NULL,
  external_id     TEXT UNIQUE NOT NULL,       -- correlation key sent to Colurs
  colurs_payment_id TEXT,                     -- money_movement_id from Colurs
  method          TEXT NOT NULL,              -- pse | nequi | bancolombia
  amount_cop      DECIMAL(18,2) NOT NULL,
  amount_usdt     DECIMAL(18,8),              -- expected after exchange
  deposit_address TEXT NOT NULL,              -- SIPPY_ETH_DEPOSIT_ADDRESS
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending → paid → bridging → completed | failed          (COLURS_DIRECT_USDC=false)
  -- pending → paid → awaiting_onchain_usdc → completed | failed  (COLURS_DIRECT_USDC=true)
  lifi_tx_hash    TEXT,
  usdc_received   DECIMAL(18,6),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `offramp_orders`

```sql
CREATE TABLE offramp_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number      TEXT NOT NULL,
  external_id       TEXT UNIQUE NOT NULL,
  colurs_quote_id   TEXT,
  colurs_movement_id TEXT,
  bank_account_id   INTEGER NOT NULL,         -- FK → colurs_bank_accounts
  amount_usdc       DECIMAL(18,6) NOT NULL,
  amount_cop        DECIMAL(18,2),            -- from quote
  exchange_rate     DECIMAL(18,4),
  status            TEXT NOT NULL DEFAULT 'pending',
  -- pending → pulling_usdc → pending_fx → completed | failed
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `colurs_bank_accounts`

```sql
CREATE TABLE colurs_bank_accounts (
  id              SERIAL PRIMARY KEY,
  phone_number    TEXT NOT NULL,
  colurs_id       TEXT NOT NULL,              -- ID returned by Colurs
  holder_name     TEXT NOT NULL,
  document_type   TEXT NOT NULL,              -- CC | CE | NIT (display code; map to Colurs numeric ID at request time)
  document_number TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  account_type    TEXT NOT NULL,              -- savings | checking (required by Colurs Colombia API)
  bank_id         INTEGER NOT NULL,           -- numeric ID from Colurs /list_third_party_banks/
  bank_name       TEXT,
  country_code    TEXT NOT NULL DEFAULT 'CO',
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON colurs_bank_accounts (phone_number);
```

---

### 2. New services

#### `colurs_auth.service.ts`

Manages Colurs JWT — fetches on startup, auto-refreshes before 15-min expiry.

```
getAccessToken() → string   POST /token/
```

#### `colurs_payment.service.ts`

Onramp payment initiation.

```
createPayer(user)           POST /api/reload/r2p/counterparty/
initiatePSE(params)         POST /api/reload/r2p/pse/
initiateNequi(params)       POST /api/reload/r2p/nequi/
initiateBancolombia(params) POST /api/reload/r2p/bancolombia/
estimateReload(params)      POST /reload/estimate
```

#### `colurs_fx.service.ts`

FX quotes and exchange execution for offramp.

```
createQuote(pair, amount)         POST /v2/exchange/quotes/
getQuote(quoteId)                 GET  /v2/exchange/quotes/{uuid}/
initiateExchange(params)          POST /v2/exchange/initiate/
getBalance(currency)              GET  /balance/?currency=USD
```

#### `colurs_bank.service.ts`

Bank account management.

```
getBanks(country)                 GET  /list_third_party_banks/?country=CO
getDocumentTypes()                GET  /base/document_type/
registerBankAccount(params)       POST /create_third_party_banks/
getColursBalance(currency)        GET  /balance/?currency=USD  ← treasury monitoring
```

#### `onramp_bridge.service.ts`

LiFi backend bridge — USDT (ETH mainnet) → USDC (Arbitrum). Gated by `COLURS_DIRECT_USDC` flag.
**Onramp only. Offramp does not use LiFi.**

```
bridgeUsdtToUsdc(amount, toAddress)
  - if COLURS_DIRECT_USDC=true → no-op (Colurs sends USDC directly, Alchemy handles arrival)
  - if false → LiFi SDK with ethers.js backend signer
    fromChain: 1, fromToken: USDT_ETH, toChain: 42161, toToken: USDC_ARB
    signer: new ethers.Wallet(SIPPY_ETH_DEPOSIT_PRIVATE_KEY, ethProvider)
```

---

### 3. New controllers

#### `OnrampController`

```
POST /api/onramp/quote              → estimate COP amount → USDC
POST /api/onramp/initiate           → create order, return payment_link
GET  /api/onramp/status/:orderId    → poll order status
```

All routes require JWT auth.

#### `OfframpController`

```
POST /api/offramp/quote             → FX quote (USD/COP)
POST /api/offramp/initiate          → pull USDC via spend permission, create Colurs intent
GET  /api/offramp/status/:orderId   → poll order status
GET  /api/offramp/bank-accounts     → list user's registered banks
POST /api/offramp/bank-accounts     → register new bank account
GET  /api/offramp/banks             → get available banks list (from Colurs)
```

All routes require JWT auth.

#### Extend `WebhookController` (or new `WebhookColursController`)

```
POST /webhook/colurs
```

- Verify signature via `COLURS_WEBHOOK_SECRET`
- Route by event type:
  - `payment.completed` → trigger onramp bridge
  - `withdrawal.completed` → mark offramp completed, notify user
  - `payment.failed` → mark onramp failed, notify user
  - `withdrawal.failed` → mark offramp failed, notify user

---

### 4. Routes additions to `routes.ts`

```typescript
// Colurs webhook (signature-verified, no session auth)
router.post('/webhook/colurs', [WebhookColursController, 'handle'])

// Onramp (JWT-authenticated)
router
  .group(() => {
    router.post('/onramp/quote', [OnrampController, 'quote'])
    router.post('/onramp/initiate', [OnrampController, 'initiate'])
    router.get('/onramp/status/:orderId', [OnrampController, 'status'])
  })
  .prefix('/api')
  .use(middleware.jwtAuth())

// Offramp (JWT-authenticated)
router
  .group(() => {
    router.post('/offramp/quote', [OfframpController, 'quote'])
    router.post('/offramp/initiate', [OfframpController, 'initiate'])
    router.get('/offramp/status/:orderId', [OfframpController, 'status'])
    router.get('/offramp/bank-accounts', [OfframpController, 'listBankAccounts'])
    router.post('/offramp/bank-accounts', [OfframpController, 'addBankAccount'])
    router.get('/offramp/banks', [OfframpController, 'availableBanks'])
  })
  .prefix('/api')
  .use(middleware.jwtAuth())
```

---

### 5. Notifications

Reuse `notification.service.ts` — add two new WhatsApp templates:

| Template            | Trigger                               | Variables               |
| ------------------- | ------------------------------------- | ----------------------- |
| `onramp_completed`  | USDC lands on Arbitrum (after bridge) | amount_usdc, amount_cop |
| `offramp_completed` | `withdrawal.completed` webhook        | amount_cop, bank_name   |
| `onramp_failed`     | `payment.failed` webhook              | reason                  |
| `offramp_failed`    | `withdrawal.failed` webhook           | reason                  |

---

### 6. New env vars

```bash
# Colurs auth
COLURS_API_KEY=
COLURS_USERNAME=
COLURS_PASSWORD=

# Colurs webhook verification
COLURS_WEBHOOK_SECRET=

# Sippy ETH mainnet hot wallet (Colurs sends/receives USDT here)
SIPPY_ETH_DEPOSIT_ADDRESS=
SIPPY_ETH_DEPOSIT_PRIVATE_KEY=

# Colurs account identifiers (for FX exchange initiation)
COLURS_SOURCE_ACCOUNT_ID=        # Sippy's USD account ID in Colurs
COLURS_DESTINATION_ACCOUNT_ID=   # Sippy's COP account ID in Colurs

# Onramp: LiFi bridge disable flag — set to true when Colurs adds direct USDC support
# Offramp is unaffected: it never uses LiFi (pre-funded balance model)
COLURS_DIRECT_USDC=false
```

---

## What stays unchanged

| Component                       | Notes                                         |
| ------------------------------- | --------------------------------------------- |
| LiFi widget in `apps/fund`      | Crypto-native users unaffected                |
| `webhook_alchemy_controller.ts` | Already indexes USDC on Arbitrum — no changes |
| `onchain_writer.service.ts`     | Already credits user accounts — no changes    |
| `notification.service.ts`       | Reused, only new templates added              |
| Coinbase onramp                 | Still active for non-LATAM users              |
| Spend permission / CDP wallet   | Used as-is to pull USDC for offramp           |

---

## Token addresses

```
USDT Ethereum mainnet:  0xdAC17F958D2ee523a2206206994597C13D831ec7
USDC Arbitrum:          0xaf88d065e77c8cC2239327C5EDb3A432268e5831
```

---

## Build order

1. `0013_colurs_ramp_tables.ts` — three migrations
2. `colurs_auth.service.ts` + `colurs_payment.service.ts`
3. `onramp_bridge.service.ts` (LiFi backend signer + disable flag)
4. `OnrampController` + routes + `WebhookColursController`
5. `colurs_fx.service.ts` + `colurs_bank.service.ts`
6. `OfframpController` + routes
7. WhatsApp notification templates
